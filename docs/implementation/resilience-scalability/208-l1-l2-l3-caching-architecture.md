# 208 — L1/L2/L3 caching, applied where the code actually shows a hot path

> **Status: proposed (2026-09-28), not yet built**, except where this
> document names something already real. "Where needed" is not a phrase to
> skip past: every tier below is attached to a specific, measured read path
> found by reading the actual code, not a generic caching layer bolted on
> everywhere. Two things already exist and are generalized here, not
> duplicated: `SettingsService`'s own in-process TTL cache
> (`settings.service.ts:16`, 30-second TTL) and `VariantSalesStat`, an
> eagerly-maintained materialized aggregate (`inventory.listener.ts`,
> upserted on the triggering sale event, never a periodic recompute). This
> document also supersedes doc 206 §5's single-tier sketch ("a Redis
> cache-aside layer, 5-minute TTL") with the fuller design below — doc 206's
> own exact numbers for that one layer are carried forward unchanged, now
> placed correctly as this document's L2.

## 0. What the three tiers are actually for — not three arbitrary layers

- **L1 — in-process memory, per API replica.** For data read on nearly every
  request, small enough to hold entirely in memory, where even a Redis round
  trip (sub-millisecond, but still a network hop and a serialization cost)
  is overhead worth avoiding. Only correct for data whose staleness window is
  explicitly reasoned about, never for anything where a stale read is a
  security or money defect without that reasoning written down next to it.
- **L2 — Redis, shared across every replica.** For anything expensive enough
  in the database to be worth caching, where correctness must be consistent
  across replicas (a write on replica A must be visible to replica B), and
  for general read-heavy API responses per doc 206 §5's own criteria
  (non-personalized, has a stated invalidation strategy, never session-scoped
  data).
- **L3 — not a slower cache tier. A different strategy: eager materialization.**
  `VariantSalesStat` is the existing, working model: instead of caching an
  expensive read with a TTL and accepting staleness, the aggregate is
  recomputed at write time, on the specific domain event that could have
  changed it, and stored as a real row — always correct, never stale between
  writes, because there is no "between": every write updates it. This is the
  right tool for expensive aggregations with a clean, small set of triggering
  events (a sale, a stock movement) and the wrong tool for anything with too
  many possible triggers to enumerate safely — see §4 for the boundary.

## 1. The reusable L1 primitive — extracted from `SettingsService`, not duplicated

**Found:** `SettingsService` already hand-rolls exactly this (`private cache =
new Map<string, { value: unknown; expiresAt: number }>()`, `CACHE_TTL_MS =
30_000`, a `.get()`/`.set()`/`.invalidate()` shape). Building a second,
differently-shaped in-process cache for permission resolution (§2) would be
the "three copies of the same idiom" this repo's own rules already warn
against.

**What's added:** `InProcessCache<K, V>` at `apps/api/src/core/cache/` — a
small, generic class with the identical `.get()`/`.set()`/`.invalidate(key?)`
shape `SettingsService` already proved out, parameterized by `maxEntries`
(LRU-evicted beyond that) and `ttlMs`. `SettingsService` is refactored to use
it (same 30-second TTL, unchanged behavior) rather than keeping its own
hand-rolled copy; `PermissionsService` (§2) becomes its second real consumer.

## 2. Permission resolution — the actual hottest read path in this codebase

**Found, not assumed:** `PermissionsService.resolveForUser(userId)`
(`permissions.service.ts:42`) runs **three** separate `findMany` queries
(`userRoleAssignment`, `orgUnitGrant`, `userPermission`) with zero caching,
and is called from `jwt.strategy.ts:39` — Passport's `validate()`, which runs
on **every single authenticated request** that carries a JWT. This is the
single hottest, least-cached read in the entire API, found by tracing the
real call graph, not guessed at.

### Exact parameters

**Parameter: L1 TTL for a resolved permission set.**
**Exact value: 10 seconds.**
**Applies to:** `PermissionsService.resolveForUser()`'s result, keyed by
`userId`, via `InProcessCache` (§1), capacity capped at **10,000 entries**
per process (LRU-evicted beyond that — at roughly 200 bytes per resolved set,
10,000 entries is ~2MB, a rounding error against the container memory ceiling
doc 206/ADR-075 already sets).
**Why 10 seconds, not `SettingsService`'s 30:** this data is security-
sensitive in a way a setting is not — a permission *revocation* cached stale
is a live over-permission window, not a cosmetic delay. 10 seconds bounds
that window tightly while still eliminating the three-query cost for the
overwhelming majority of a user's requests (most users issue far more than
one request per 10 seconds while active).
**How it degrades / fails:** an `InProcessCache` failure (there isn't one to
fail — it's a `Map`) is not a real failure mode; the honest risk here is
process-restart cold cache (first request after a deploy pays full cost
again, same as today, since there is no cache today).

**Parameter: L2 TTL, same data, Redis-shared.**
**Exact value: 60 seconds**, keyed `permissions:{userId}`, in the same
`cache` Redis keyspace as §3's API-response cache (`REDIS_KEYSPACES.cache =
{ db: 1 }`, added to `redis.keyspaces.ts` alongside the rate-limiter's own
`db: 0` — both this and §3 are pure, safe-to-evict performance caches, unlike
rate-limit state, so they share a keyspace with `maxmemory-policy
allkeys-lru`, explicitly the opposite eviction policy from rate-limiting's
`noeviction`, because losing a cache entry early here just costs one extra
DB read, never a silent fail-open the way losing a rate-limit counter would).
**Why L2 exists at all when L1 already covers the hot path:** L1 is
per-process — replica B has never seen replica A's L1 entry. Without L2,
every replica independently pays the full three-query cost on its own first
sight of each user, and after any deploy/restart every replica starts cold
simultaneously. L2 gives a warm fallback shared across the fleet.

**Parameter: L1/L2 invalidation on an actual permission change.**
**Exact value:** the two real write sites that change a user's roles/grants —
`users-admin.service.ts` and `roles.service.ts` (found by grep, not assumed)
— each call a new `PermissionsCacheInvalidationService.invalidate(userId)`
immediately after the write commits, which deletes the L2 Redis key
(`permissions:{userId}`) synchronously. **This is deliberately not
propagated to every replica's L1 in real time** — no Redis pub/sub
invalidation broadcast is built for this, on purpose: this codebase has no
existing cross-replica push mechanism (checked — no pub/sub pattern exists
anywhere in `apps/api/src/core` today), and building one solely to shave an
already-short 10-second L1 window down further is exactly the speculative
infrastructure this repo's own rules warn against for a benefit this
marginal. **The stated, accepted trade-off:** a revoked permission is
refused everywhere within 60 seconds (L2, corrected immediately on the
replica that served the revoking request, and within 60s elsewhere via TTL
expiry) and within 10 seconds on any replica that hasn't independently
cached it; a *granted* permission becomes usable within the same bounds —
never a security exposure, only a short-lived denial that self-corrects.
Written down here, not left implicit, per this repo's own "never hardcode an
assumption... without writing down why it's safe" rule.

**A real, pre-existing gap this work also closes:** `SettingsService.set()`
today calls `this.cache.clear()` — which only clears the *writing* replica's
own L1. Every *other* replica keeps serving a stale setting for up to its own
30-second TTL after a write it never saw. This is a real, silent
cross-replica staleness bug in already-shipped code, found while designing
this document, not invented for it. Fix, same shape as permissions: add an
L2 Redis entry per setting key (`settings:{key}`, 300-second TTL, matching
the existing 30s L1 unchanged), and `SettingsService.set()` deletes the L2
key on write, giving every replica a consistent, promptly-corrected value
instead of relying on each one's independent 30-second clock.

## 3. General API response caching — this is doc 206 §5, reclassified as L2, unchanged

Doc 206 §5's parameters stand exactly as written: Redis cache-aside, 5-minute
TTL, cache-aside with explicit `del()` on write, never for session/user-
scoped data, same `cache: { db: 1 }` keyspace as §2 above (same eviction
policy reasoning applies identically). This document does not change any
number from doc 206 §5 — it places that layer correctly in the three-tier
picture and gives it a sibling (§2) in the same keyspace.

## 4. L3 — where eager materialization applies, and where it doesn't

**Applies when:** the computation is expensive, the set of writes that could
invalidate it is small and enumerable (one or two domain events), and
"always correct, updated at write time" is achievable without the update
itself becoming the new bottleneck. `VariantSalesStat` (one write path: a
sale) is the proof this works today.

**Does not apply when:** the computation depends on a large, hard-to-enumerate
set of inputs (a report joining many unrelated tables where "which write
could have changed this" has no small answer), where L2 with a stated TTL and
explicit invalidation is the honest tool instead — accepting bounded
staleness rather than pretending eager correctness is achievable cheaply.

**No new L3 target is built in this pass.** Searched for one honestly
(dashboard/analytics aggregates were the candidate) and found none that
clearly clears the bar above without deeper investigation this document's own
scope doesn't cover — naming a speculative L3 target here would be exactly
the "unused abstraction with no documented reason" this repo's rules forbid.
The criterion above is written down so the next real candidate is evaluated
against it, not invented ad hoc.

## Work orders

**WO-208.1** — `InProcessCache<K,V>` primitive; refactor `SettingsService`
onto it (no behavior change, same 30s TTL).
**WO-208.2** — Permission-resolution L1 (10s, capped 10,000 entries) + L2
(60s, `permissions:{userId}`) + `PermissionsCacheInvalidationService` wired
into the two real write sites.
**WO-208.3** — Settings L2 (300s, `settings:{key}`), closing the cross-
replica staleness gap in already-shipped `SettingsService.set()`.
**WO-208.4** — `cache: { db: 1 }` added to `redis.keyspaces.ts` with
`allkeys-lru`, shared by §2 and doc 206 §5's general response cache (doc
206/WO-206.8, unchanged parameters, now filed under this document's L2).
**WO-208.5** — tests: L1/L2 hit/miss/expiry for permission resolution, an
actual revocation observably taking effect within the stated 60s/10s bounds,
the settings cross-replica staleness fix provable with a two-instance test.

## Acceptance

- `resolveForUser()` for a previously-seen user, called twice within 10
  seconds, issues zero additional DB queries on the second call (L1 hit),
  provable by test.
- A permission revoked via `roles.service.ts` is refused on the revoking
  replica's very next request (L2 deleted synchronously) and on every other
  replica within 60 seconds, provable by a simulated multi-replica test.
- A setting changed on one simulated replica is visible to a second
  simulated replica within 300 seconds (L2) rather than up to today's
  unbounded-until-restart staleness on that second replica.
- `InProcessCache` enforces its `maxEntries` cap under a synthetic load test
  exceeding it — no unbounded memory growth.

## Out of scope

A Redis pub/sub cross-replica L1 invalidation broadcast (named and
deliberately not built, §2). Any new L3 target (§4 — none identified that
clears the stated bar in this pass). Caching for session-scoped or
per-customer-personalized data anywhere (explicitly excluded, matching doc
206 §5's own rule). A generic "cache everything" sweep — every entry in this
document is attached to a specific, found read path, not a blanket policy.
