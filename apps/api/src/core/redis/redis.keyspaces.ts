/**
 * The logical databases this API uses on its one dedicated Redis instance
 * (206-rate-limiting-caching-compression-hardening.md §1.2, §5).
 *
 * `REDIS_URL` names the instance; which logical database a caller lands in is
 * decided here, per keyspace, and never by the URL — env.validation.ts refuses
 * a `REDIS_URL` that names a database, because ioredis lets the URL's `/N`
 * silently override an explicit `db` option, and two keyspaces quietly sharing
 * one database is exactly what this table exists to prevent.
 *
 * One keyspace per logical database, never two on the same index: a `FLUSHDB`
 * run to clear one (a cache, say) must never be able to clear another's state
 * (rate-limit counters). WO-206.8's response cache is planned as
 * `cache: { db: 1 }` — add it here when it is built, not before.
 */
export const REDIS_KEYSPACES = {
  /**
   * Rate-limit state: `@nestjs/throttler`'s per-IP counters (WO-206.1, stored
   * by `@nest-lab/throttler-storage-redis`) and the per-account login token
   * bucket (WO-206.2, `LoginThrottleService`). Nothing here is a fact — losing
   * it only resets counters — but evicting it early is a silent fail-open,
   * which is why the provisioned instance runs `maxmemory-policy noeviction`.
   */
  rateLimit: { db: 0 },
} as const satisfies Record<string, { readonly db: number }>;

export type RedisKeyspace = keyof typeof REDIS_KEYSPACES;
