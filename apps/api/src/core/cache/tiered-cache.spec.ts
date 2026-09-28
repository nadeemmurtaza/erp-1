import { Logger } from '@nestjs/common';
import type { RedisService } from '../redis/redis.service';
import { TieredCache, type Loaded } from './tiered-cache';

/**
 * The half of TieredCache that needs no Redis: L1 on its own, what happens
 * while Redis is not connected or failing, and the in-process race guard.
 * The shared half — L2 across replicas, the version/generation tokens, TTLs
 * on a real instance — is test/permissions-cache.e2e-spec.ts's and
 * test/settings-cache.e2e-spec.ts's (208-l1-l2-l3-caching-architecture.md).
 */
describe('TieredCache without a working Redis', () => {
  let now: number;
  let logged: { level: string; message: string }[];
  const logger = new Logger('TieredCacheSpec');

  beforeEach(() => {
    now = 2_000_000;
    logged = [];
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(logger, level).mockImplementation((...args: unknown[]) => {
        logged.push({ level, message: String(args[0]) });
      });
    }
  });

  afterEach(() => jest.restoreAllMocks());

  const disconnected = { isReady: () => false } as unknown as RedisService;

  function build(redis: RedisService = disconnected, l1TtlMs = 10_000) {
    return new TieredCache<{ n: number }>(redis, logger, {
      namespace: 'spec',
      l1: { maxEntries: 100, ttlMs: l1TtlMs },
      l2: { ttlMs: 60_000 },
      decode: (json) => json as { n: number },
      now: () => now,
    });
  }

  function loaderOf(values: Loaded<{ n: number }>[]) {
    let call = 0;
    return jest.fn(async () => values[Math.min(call++, values.length - 1)]!);
  }

  describe('Redis not connected', () => {
    it('loads once, serves from L1 until its TTL, then loads again', async () => {
      const cache = build();
      const load = loaderOf([{ value: { n: 1 } }, { value: { n: 2 } }]);

      expect(await cache.getOrLoad('a', load)).toEqual({ n: 1 });
      now += 9_999;
      expect(await cache.getOrLoad('a', load)).toEqual({ n: 1 });
      expect(load).toHaveBeenCalledTimes(1);

      now += 1;
      expect(await cache.getOrLoad('a', load)).toEqual({ n: 2 });
      expect(load).toHaveBeenCalledTimes(2);
    });

    it('never serves a value past the validUntil its loader gave, however long the TTL', async () => {
      const cache = build();
      const load = loaderOf([{ value: { n: 1 }, validUntil: now + 2_500 }, { value: { n: 2 } }]);

      await cache.getOrLoad('a', load);
      now += 2_499;
      expect(await cache.getOrLoad('a', load)).toEqual({ n: 1 });
      now += 1;
      expect(await cache.getOrLoad('a', load)).toEqual({ n: 2 });
    });

    it('caches nothing a loader says is already over', async () => {
      const cache = build();
      const load = loaderOf([{ value: { n: 1 }, validUntil: now }, { value: { n: 2 } }]);

      await cache.getOrLoad('a', load);
      expect(await cache.getOrLoad('a', load)).toEqual({ n: 2 });
    });

    it('invalidate(id) drops that id here at once — and says other replicas may lag, since Redis could not be told', async () => {
      const cache = build();
      const load = loaderOf([{ value: { n: 1 } }, { value: { n: 2 } }]);
      await cache.getOrLoad('a', load);
      await cache.getOrLoad('b', loaderOf([{ value: { n: 9 } }]));

      await cache.invalidate('a');

      expect(await cache.getOrLoad('a', load)).toEqual({ n: 2 });
      expect(await cache.getOrLoad('b', jest.fn())).toEqual({ n: 9 });
      expect(logged).toEqual([
        {
          level: 'error',
          message: expect.stringMatching(/Could not invalidate "a" in the shared cache: Redis is not connected — .*at most 60 s/),
        },
      ]);
    });

    it('invalidateAll() drops every id here at once', async () => {
      const cache = build();
      await cache.getOrLoad('a', loaderOf([{ value: { n: 1 } }]));
      await cache.getOrLoad('b', loaderOf([{ value: { n: 2 } }]));

      await cache.invalidateAll();

      const reload = loaderOf([{ value: { n: 3 } }]);
      expect(await cache.getOrLoad('a', reload)).toEqual({ n: 3 });
      expect(await cache.getOrLoad('b', reload)).toEqual({ n: 3 });
      expect(reload).toHaveBeenCalledTimes(2);
    });
  });

  describe('a read in flight when this process invalidates', () => {
    function gated() {
      let release!: (loaded: Loaded<{ n: number }>) => void;
      const loader = jest.fn(() => new Promise<Loaded<{ n: number }>>((resolve) => (release = resolve)));
      return { loader, release: (loaded: Loaded<{ n: number }>) => release(loaded) };
    }

    it('answers its own caller but never fills L1 — the value may predate the write', async () => {
      const cache = build();
      const slow = gated();

      const inFlight = cache.getOrLoad('a', slow.loader);
      await cache.invalidate('a');
      slow.release({ value: { n: 1 } });

      expect(await inFlight).toEqual({ n: 1 });
      const next = loaderOf([{ value: { n: 2 } }]);
      expect(await cache.getOrLoad('a', next)).toEqual({ n: 2 });
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('the same for invalidateAll()', async () => {
      const cache = build();
      const slow = gated();

      const inFlight = cache.getOrLoad('a', slow.loader);
      await cache.invalidateAll();
      slow.release({ value: { n: 1 } });
      await inFlight;

      const next = loaderOf([{ value: { n: 2 } }]);
      expect(await cache.getOrLoad('a', next)).toEqual({ n: 2 });
    });

    it('a read that began after the invalidation fills L1 as usual', async () => {
      const cache = build();
      await cache.invalidate('a');

      const load = loaderOf([{ value: { n: 1 } }]);
      await cache.getOrLoad('a', load);
      await cache.getOrLoad('a', load);
      expect(load).toHaveBeenCalledTimes(1);
    });
  });

  describe('Redis connected but failing', () => {
    function failing(pipelineResults: [Error | null, unknown][] = [[null, 'OK'], [null, 1]]) {
      const client = {
        mget: jest.fn().mockRejectedValue(new Error('Command timed out')),
        set: jest.fn().mockRejectedValue(new Error('Command timed out')),
        pipeline: jest.fn(() => {
          const pipeline: { set: jest.Mock; del: jest.Mock; exec: jest.Mock } = {
            set: jest.fn(() => pipeline),
            del: jest.fn(() => pipeline),
            exec: jest.fn().mockResolvedValue(pipelineResults),
          };
          return pipeline;
        }),
      };
      return { client, redis: { isReady: () => true, client: () => client } as unknown as RedisService };
    }

    it('answers from the loader, never throws, and warns once for the whole outage', async () => {
      const { client, redis } = failing();
      const cache = build(redis, 1_000);
      const load = loaderOf([{ value: { n: 1 } }]);

      for (let request = 0; request < 5; request += 1) {
        expect(await cache.getOrLoad('a', load)).toEqual({ n: 1 });
        now += 1_000;
      }

      expect(load).toHaveBeenCalledTimes(5);
      expect(client.mget).toHaveBeenCalledTimes(5);
      // No stamp was read, so nothing is written back.
      expect(client.set).not.toHaveBeenCalled();
      expect(logged.filter((line) => line.level === 'warn')).toEqual([
        { level: 'warn', message: expect.stringContaining('Shared "spec" cache read failed (Command timed out)') },
      ]);
    });

    it('logs the recovery once Redis answers again', async () => {
      const { client, redis } = failing();
      const cache = build(redis, 1_000);
      await cache.getOrLoad('a', loaderOf([{ value: { n: 1 } }]));

      client.mget.mockResolvedValue([null, null, null]);
      client.set.mockResolvedValue('OK');
      now += 7_000;
      await cache.getOrLoad('a', loaderOf([{ value: { n: 2 } }]));

      expect(logged.map((line) => line.level)).toEqual(['warn', 'log']);
      expect(logged[1]!.message).toContain('answering again after 7 s');
      expect(client.set).toHaveBeenCalledWith('spec:a', expect.any(String), 'PX', 60_000);
    });

    it('reports an invalidation Redis refused — a full instance refuses the version SET (noeviction)', async () => {
      const { redis } = failing([[new Error('OOM command not allowed when used memory > \'maxmemory\'.'), null], [null, 1]]);
      const cache = build(redis);

      await cache.invalidate('a');

      expect(logged).toEqual([
        { level: 'error', message: expect.stringMatching(/Could not invalidate "a" in the shared cache: OOM command not allowed/) },
      ]);
    });

    it('queues the version token before the delete, in one pipeline — not MULTI, whose abort would take the DEL with it', async () => {
      const { client, redis } = failing();
      const cache = build(redis);

      await cache.invalidate('a');

      const pipeline = client.pipeline.mock.results[0]!.value;
      expect(pipeline.set).toHaveBeenCalledWith('spec.version:a', expect.any(String), 'PX', 120_000);
      expect(pipeline.del).toHaveBeenCalledWith('spec:a');
      expect(pipeline.set.mock.invocationCallOrder[0]).toBeLessThan(pipeline.del.mock.invocationCallOrder[0]);
      expect(logged).toEqual([]);
    });
  });

  describe('options', () => {
    it.each(['', 'Permissions', 'perm:issions', 'perm.issions', '1st'])('refuses namespace %p — it could collide with another consumer\'s keys', (namespace) => {
      expect(
        () => new TieredCache(disconnected, logger, { namespace, l1: { maxEntries: 1, ttlMs: 1 }, l2: { ttlMs: 1 }, decode: () => undefined }),
      ).toThrow(RangeError);
    });

    it.each([0, -1, 1.5, Number.NaN])('refuses l2.ttlMs %p', (ttlMs) => {
      expect(
        () => new TieredCache(disconnected, logger, { namespace: 'spec', l1: { maxEntries: 1, ttlMs: 1 }, l2: { ttlMs }, decode: () => undefined }),
      ).toThrow(RangeError);
    });
  });
});
