import { Logger } from '@nestjs/common';
import { TieredCache, type Loaded } from '../src/core/cache/tiered-cache';
import { RedisService } from '../src/core/redis/redis.service';

/**
 * 208-l1-l2-l3-caching-architecture.md's L2 on the real Redis (REDIS_URL) —
 * the parts a stub cannot prove: one replica's entry answering another, the
 * version and generation tokens closing the stale write-back race, TTLs as
 * Redis applies them, and what a full `noeviction` instance does to a cache
 * write, an invalidation, and the rate limiter sharing the instance.
 *
 * Replicas are independent RedisService + TieredCache pairs in one process:
 * separate connections and separate L1s, as two API processes have. Time is
 * a frozen clock moved by hand — every TTL here is checked against it —
 * never a wait.
 */
describe('TieredCache on a real Redis (doc 208, e2e)', () => {
  const run = Date.now();
  const namespace = `e2e-tiered-${run}`;
  const config = { get: () => process.env.REDIS_URL ?? 'redis://localhost:6379' } as any;
  const realNow = Date.now.bind(Date);
  const logger = new Logger('TieredCacheE2E');
  const connections: RedisService[] = [];
  let base: number;
  let offset: number;

  interface Replica {
    redis: RedisService;
    cache: TieredCache<{ v: string }>;
  }

  async function replica(): Promise<Replica> {
    const redis = new RedisService(config);
    connections.push(redis);
    await redis.onModuleInit();
    const cache = new TieredCache<{ v: string }>(redis, logger, {
      namespace,
      l1: { maxEntries: 100, ttlMs: 10_000 },
      l2: { ttlMs: 60_000 },
      decode: (json) =>
        typeof json === 'object' && json !== null && typeof (json as { v?: unknown }).v === 'string'
          ? { v: (json as { v: string }).v }
          : undefined,
    });
    return { redis, cache };
  }

  const value = (v: string, validUntil?: number) => jest.fn(async (): Promise<Loaded<{ v: string }>> => ({ value: { v }, validUntil }));
  const never = () =>
    jest.fn(async (): Promise<Loaded<{ v: string }>> => {
      throw new Error('the loader should not have been asked');
    });
  const raw = (r: Replica, key: string) => r.redis.client('cache').get(`${namespace}${key}`);

  beforeEach(() => {
    base = realNow();
    offset = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => base + offset);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    const client = connections[0]!.client('cache');
    const keys = await client.keys(`${namespace}*`);
    if (keys.length > 0) await client.del(...keys);
    await Promise.all(connections.map((redis) => redis.onApplicationShutdown()));
  });

  it('keeps what one replica loaded where every other replica reads it — in db 1, never beside the rate-limit counters in db 0', async () => {
    const [a, b] = [await replica(), await replica()];

    expect(await a.cache.getOrLoad('x1', value('one'))).toEqual({ v: 'one' });
    expect(await b.cache.getOrLoad('x1', never())).toEqual({ v: 'one' });

    const ttl = await a.redis.client('cache').pttl(`${namespace}:x1`);
    expect(ttl).toBeGreaterThan(55_000);
    expect(ttl).toBeLessThanOrEqual(60_000);
    expect(await a.redis.client('rateLimit').exists(`${namespace}:x1`)).toBe(0);
    expect(JSON.parse((await raw(a, ':x1'))!)).toEqual({ g: null, v: null, exp: base + 60_000, value: { v: 'one' } });
  });

  it('invalidate(id) deletes the entry for every replica and replaces its version token, which outlives any entry stamped before it', async () => {
    const [a, b, c] = [await replica(), await replica(), await replica()];
    await a.cache.getOrLoad('x2', value('old'));
    await b.cache.getOrLoad('x2', never());

    await a.cache.invalidate('x2');

    expect(await a.redis.client('cache').exists(`${namespace}:x2`)).toBe(0);
    const versionTtl = await a.redis.client('cache').pttl(`${namespace}.version:x2`);
    expect(versionTtl).toBeGreaterThan(115_000);
    expect(versionTtl).toBeLessThanOrEqual(120_000);
    // A replica with nothing of its own reads the new value; B keeps its L1 copy until its own TTL.
    expect(await c.cache.getOrLoad('x2', value('new'))).toEqual({ v: 'new' });
    expect(await b.cache.getOrLoad('x2', never())).toEqual({ v: 'old' });
    offset = 10_000;
    expect(await b.cache.getOrLoad('x2', never())).toEqual({ v: 'new' });
  });

  it('closes the stale write-back race: a replica that read before the write committed cannot put the old value back', async () => {
    const [writer, slow, fresh] = [await replica(), await replica(), await replica()];

    // `slow` has looked in Redis (a miss) and is reading the database when the write lands.
    let databaseRead!: () => void;
    let finishRead!: () => void;
    const reading = new Promise<void>((resolve) => (databaseRead = resolve));
    const released = new Promise<void>((resolve) => (finishRead = resolve));
    const staleLoad = jest.fn(async (): Promise<Loaded<{ v: string }>> => {
      databaseRead();
      await released;
      return { value: { v: 'before the write' } };
    });
    const inFlight = slow.cache.getOrLoad('race', staleLoad);
    await reading;

    await writer.cache.invalidate('race');
    finishRead();
    expect(await inFlight).toEqual({ v: 'before the write' });

    // It did write its value back — after the invalidation, as the race goes...
    expect(JSON.parse((await raw(writer, ':race'))!).value).toEqual({ v: 'before the write' });
    // ...stamped with the version it read before, so no replica ever serves it.
    const current = await writer.redis.client('cache').get(`${namespace}.version:race`);
    expect(JSON.parse((await raw(writer, ':race'))!).v).not.toBe(current);
    expect(await fresh.cache.getOrLoad('race', value('after the write'))).toEqual({ v: 'after the write' });
    expect(await writer.cache.getOrLoad('race', never())).toEqual({ v: 'after the write' });
  });

  it('invalidateAll() drops every entry with one write — nothing is looked up, and the entries are simply no longer valid', async () => {
    const [a, b] = [await replica(), await replica()];
    await a.cache.getOrLoad('all-1', value('old-1'));
    await a.cache.getOrLoad('all-2', value('old-2'));

    await a.cache.invalidateAll();

    expect(await a.redis.client('cache').exists(`${namespace}:all-1`, `${namespace}:all-2`)).toBe(2);
    expect(await b.cache.getOrLoad('all-1', value('new-1'))).toEqual({ v: 'new-1' });
    expect(await b.cache.getOrLoad('all-2', value('new-2'))).toEqual({ v: 'new-2' });
    expect(await a.cache.getOrLoad('all-1', never())).toEqual({ v: 'new-1' });
  });

  it('never keeps an entry past its loader\'s validUntil — PX is the shorter of the TTL and what is left', async () => {
    const a = await replica();

    await a.cache.getOrLoad('short', value('brief', base + 5_000));

    const ttl = await a.redis.client('cache').pttl(`${namespace}:short`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5_000);
  });

  it('an L1 copy taken from L2 lives no longer than the L2 entry has left', async () => {
    const [a, b] = [await replica(), await replica()];
    await a.cache.getOrLoad('cap', value('first'));

    offset = 55_000;
    expect(await b.cache.getOrLoad('cap', never())).toEqual({ v: 'first' });
    offset = 59_999;
    expect(await b.cache.getOrLoad('cap', never())).toEqual({ v: 'first' });
    // 60 s after the database read, not 55 + 10.
    offset = 60_000;
    expect(await b.cache.getOrLoad('cap', value('second'))).toEqual({ v: 'second' });
  });

  it('reads an entry in a shape this code does not know as a miss, never an error', async () => {
    const a = await replica();
    const client = a.redis.client('cache');
    // Stamped with the current tokens, so the shape is the only thing wrong with it.
    const g = await client.get(`${namespace}.generation`);
    await client.set(`${namespace}:odd`, JSON.stringify({ g, v: null, exp: base + 60_000, value: { other: 1 } }), 'PX', 60_000);
    await client.set(`${namespace}:well`, JSON.stringify({ g, v: null, exp: base + 60_000, value: { v: 'stored' } }), 'PX', 60_000);
    await client.set(`${namespace}:junk`, 'not json', 'PX', 60_000);

    expect(await a.cache.getOrLoad('well', never())).toEqual({ v: 'stored' });
    expect(await a.cache.getOrLoad('odd', value('read'))).toEqual({ v: 'read' });
    expect(await a.cache.getOrLoad('junk', value('read'))).toEqual({ v: 'read' });
  });

  describe('a full instance — the provisioned noeviction, at its maxmemory', () => {
    let saved: { maxmemory: string; policy: string } | undefined;

    async function fill(r: Replica): Promise<void> {
      const client = r.redis.client('cache');
      const [, maxmemory] = (await client.config('GET', 'maxmemory')) as string[];
      const [, policy] = (await client.config('GET', 'maxmemory-policy')) as string[];
      saved = { maxmemory: maxmemory!, policy: policy! };
      await client.config('SET', 'maxmemory-policy', 'noeviction');
      await client.config('SET', 'maxmemory', '1');
    }

    afterEach(async () => {
      if (!saved) return;
      const client = connections[0]!.client('cache');
      await client.config('SET', 'maxmemory', saved.maxmemory);
      await client.config('SET', 'maxmemory-policy', saved.policy);
      saved = undefined;
    });

    it('refuses the cache write, which reads as a miss; the invalidation\'s DEL still lands; and the rate limiter\'s writes are refused too — one instance, one memory budget', async () => {
      const a = await replica();
      await a.cache.getOrLoad('pre', value('cached before the ceiling'));

      await fill(a);

      // A read still answers — from the loader — and nothing new is stored.
      expect(await a.cache.getOrLoad('full', value('from the database'))).toEqual({ v: 'from the database' });
      expect(await a.redis.client('cache').exists(`${namespace}:full`)).toBe(0);

      // The version SET is refused, the DEL is not: the old entry is gone for every replica.
      await a.cache.invalidate('pre');
      expect(await a.redis.client('cache').exists(`${namespace}:pre`)).toBe(0);

      // Why the budget matters (doc 208 §6): the same ceiling refuses a rate-limit counter.
      await expect(a.redis.client('rateLimit').incr(`${namespace}:counter`)).rejects.toThrow(/OOM/);
    });
  });
});
