import { Logger } from '@nestjs/common';
import { PrismaClient } from '../src/core/prisma/client';
import type { PrismaService } from '../src/core/prisma/prisma.service';
import { RedisService } from '../src/core/redis/redis.service';
import { SETTINGS_L1_TTL_MS, SETTINGS_L2_TTL_MS, SettingsService } from '../src/core/settings/settings.service';

/**
 * WO-208.3 on the real Postgres and Redis, with two SettingsService replicas
 * sharing both — what the settings L2 actually changes, measured:
 *
 *  - a write is read at once on the replica that made it, and on another
 *    replica once that replica's own 30 s L1 entry lapses — never later,
 *    because set() deletes the shared copy. (Doc 208 expected the L2 to shrink
 *    that 30 s; an L2 behind each replica's L1 cannot: only a push could.)
 *  - one Postgres read per key per 300 s across the fleet, where each replica
 *    used to read every 30 s;
 *  - a write that bypasses set() is the one case the 300 s bounds.
 *
 * Replicas are independent service graphs in one process; reads are counted
 * by Prisma's own query events; time is a frozen clock moved by hand.
 */
/** A client that reports every SQL statement it sends — how queries are counted here. */
const queryLoggingClient = () => new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });

describe('Settings shared across replicas (doc 208 WO-208.3, e2e)', () => {
  const run = Date.now();
  const key = `e2e.settings-cache.${run}`;
  const realNow = Date.now.bind(Date);
  const config = { get: () => process.env.REDIS_URL ?? 'redis://localhost:6379' } as any;
  /** Every SELECT on Setting for this suite's own key. */
  const reads: string[] = [];
  let prisma: ReturnType<typeof queryLoggingClient>;
  let base: number;
  let offset: number;

  interface Replica {
    redis: RedisService;
    settings: SettingsService;
  }
  let A: Replica;
  let B: Replica;

  function replica(): Replica {
    const redis = new RedisService(config);
    return { redis, settings: new SettingsService(prisma as unknown as PrismaService, redis) };
  }

  beforeAll(async () => {
    prisma = queryLoggingClient();
    prisma.$on('query', (event) => {
      if (event.query.startsWith('SELECT') && event.query.includes('"Setting"') && event.params.includes(key)) reads.push(event.query);
    });
    await prisma.$connect();
    A = replica();
    B = replica();
    await Promise.all([A.redis.onModuleInit(), B.redis.onModuleInit()]);
  });

  beforeEach(async () => {
    base = realNow();
    offset = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => base + offset);
    // Nothing cached for the key anywhere, then the counter from zero.
    await A.settings.set(key, 'initial');
    await B.settings.invalidate();
    reads.length = 0;
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { key } });
    await A.redis.client('cache').del(`settings:${key}`, `settings.version:${key}`);
    await Promise.all([A.redis.onApplicationShutdown(), B.redis.onApplicationShutdown()]);
    await prisma.$disconnect();
  });

  it('reads a write at once on the writing replica, and on another once its own 30 s L1 lapses — never from a stale shared copy', async () => {
    expect(await A.settings.get(key)).toBe('initial');
    expect(await B.settings.get(key)).toBe('initial');

    await A.settings.set(key, 'changed');

    expect(await A.redis.client('cache').exists(`settings:${key}`)).toBe(0);
    expect(await A.settings.get(key)).toBe('changed');
    expect(await B.settings.get(key)).toBe('initial');
    offset = SETTINGS_L1_TTL_MS - 1;
    expect(await B.settings.get(key)).toBe('initial');
    offset = SETTINGS_L1_TTL_MS;
    expect(await B.settings.get(key)).toBe('changed');
  });

  it('answers replica B\'s first read of a key A has read from Redis, not Postgres — and keeps it in db 1 for 300 s', async () => {
    expect(await A.settings.get(key)).toBe('initial');
    expect(reads).toHaveLength(1);

    expect(await B.settings.get(key)).toBe('initial');
    expect(reads).toHaveLength(1);

    const ttl = await A.redis.client('cache').pttl(`settings:${key}`);
    expect(ttl).toBeGreaterThan(SETTINGS_L2_TTL_MS - 5_000);
    expect(ttl).toBeLessThanOrEqual(SETTINGS_L2_TTL_MS);
    expect(await A.redis.client('rateLimit').exists(`settings:${key}`)).toBe(0);
  });

  it('reads Postgres once per key per 300 s across both replicas, where each used to read it every 30 s', async () => {
    for (offset = 0; offset < 2 * SETTINGS_L2_TTL_MS; offset += 5_000) {
      expect(await A.settings.get(key)).toBe('initial');
      expect(await B.settings.get(key)).toBe('initial');
    }

    // At 0 s and at 300 s, when the shared entry expired. The per-replica
    // 30 s cache alone read it 2 replicas × 20 times over the same 10 minutes.
    expect(reads).toHaveLength(2);
  });

  it('bounds a write that bypassed set() by the shared entry\'s 300 s — the one case L2 can make older than L1', async () => {
    expect(await A.settings.get(key)).toBe('initial');
    await prisma.setting.update({ where: { key }, data: { value: 'written around set()' } });

    expect(await B.settings.get(key)).toBe('initial');
    offset = SETTINGS_L2_TTL_MS - 1;
    expect(await B.settings.get(key)).toBe('initial');
    offset = SETTINGS_L2_TTL_MS;
    expect(await B.settings.get(key)).toBe('written around set()');
  });

  it('keeps answering while its Redis connection is down, and says a write there could not reach the others', async () => {
    const errors = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    B.redis.client('cache').disconnect();

    try {
      expect(await B.settings.get(key)).toBe('initial');
      await B.settings.set(key, 'written while disconnected');
      expect(await B.settings.get(key)).toBe('written while disconnected');
      expect(errors).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`Could not invalidate "${key.replace(/\./g, '\\.')}" in the shared cache: Redis is not connected .*at most 300 s`)),
      );
    } finally {
      await B.redis.client('cache').connect();
    }
  });
});
