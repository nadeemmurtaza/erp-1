/**
 * The logical databases this API uses on its one dedicated Redis instance
 * (206-rate-limiting-caching-compression-hardening.md §1.2, §5;
 * 208-l1-l2-l3-caching-architecture.md).
 *
 * `REDIS_URL` names the instance; which logical database a caller lands in is
 * decided here, per keyspace, and never by the URL — env.validation.ts refuses
 * a `REDIS_URL` that names a database, because ioredis lets the URL's `/N`
 * silently override an explicit `db` option, and two keyspaces quietly sharing
 * one database is exactly what this table exists to prevent.
 *
 * One keyspace per logical database, never two on the same index: a `FLUSHDB`
 * run to clear one (a cache, say) must never be able to clear another's state
 * (rate-limit counters).
 *
 * What a database does NOT separate: memory and eviction. `maxmemory` and
 * `maxmemory-policy` are set once for the whole instance (the `redis` service
 * in docker-compose*.yml and the swarm stacks: 64 MB, `noeviction`) and there
 * is no per-database equivalent — not in Redis, not in ioredis. Every keyspace
 * here lives under that one policy; each entry says what it means for it.
 *
 * `whenDown` is what the API does while the keyspace is unreachable, logged
 * by RedisService when boot carries on without it.
 */
export const REDIS_KEYSPACES = {
  /**
   * Rate-limit state: `@nestjs/throttler`'s per-IP counters (WO-206.1, stored
   * by `@nest-lab/throttler-storage-redis`) and the per-account login token
   * bucket (WO-206.2, `LoginThrottleService`). Nothing here is a fact — losing
   * it only resets counters — but evicting it early is a silent fail-open,
   * which is why the provisioned instance runs `maxmemory-policy noeviction`.
   */
  rateLimit: {
    db: 0,
    whenDown:
      'Sign-in and routes with their own rate limit answer 503 until it connects; ' +
      'the global rate limit counts per process meanwhile.',
  },
  /**
   * Performance caches — doc 208's L2: TieredCache entries for permission
   * resolution (`permissions:{userId}`, 60 s) and settings
   * (`settings:{key}`, 300 s), and later WO-206.8's API-response cache
   * (doc 206 §5). Everything here is a copy of a Postgres fact, so losing any
   * key costs one extra read, never a wrong answer.
   *
   * Eviction: the instance's `noeviction`, the same as rateLimit's. Doc 208
   * asked for `allkeys-lru` here, but that can only be set for the whole
   * instance — where it would let a cache burst evict rate-limit counters,
   * the fail-open ADR-075 refused. So, as doc 206 §8.1 already decided for
   * this cache: when the instance is full a cache write is refused and the
   * next read is a miss. Every entry carries a TTL, so the cache cannot grow
   * past what one TTL of traffic writes, and a full instance drains itself as
   * entries expire; the budget against the 64 MB is doc 208 §6.
   */
  cache: {
    db: 1,
    whenDown: 'Cached reads (permissions, settings) are served from Postgres and this process until it connects.',
  },
} as const satisfies Record<string, { readonly db: number; readonly whenDown: string }>;

export type RedisKeyspace = keyof typeof REDIS_KEYSPACES;
