# 208 — L1/L2/L3 caching, applied where the code actually shows a hot path

> **Status: built (2026-09-28), WO-208.1–208.5.** §5 records what the code
> does, the parameters it needed that §1–§4 did not decide, and the places
> §1–§4 were wrong once the real code was in view; where they differ, §5 is
> what runs. §6 is the memory budget, measured. Written before that as:
> **proposed (2026-09-28), not yet built**, except where this
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

## 5. As built — WO-208.1 to WO-208.5 (2026-09-28)

Every number §1–§2 decided runs unchanged: permissions L1 10 s capped at
10,000 entries, L2 60 s at `permissions:{userId}`; settings L1 30 s, L2 300 s
at `settings:{key}`; both in `cache: { db: 1 }`. What follows is what the
code needed that the text did not decide, and the places the text was wrong.

**Where it lives.** `apps/api/src/core/cache/` — `InProcessCache` (L1: a
bounded, expiring, least-recently-used map; the extraction of
`SettingsService`'s hand-rolled `Map`) and `TieredCache` (L1 in front of a
Redis entry every replica shares, in front of the loader). `TieredCache` is
a second shared primitive on purpose: both consumers need the identical,
race-free L2 logic below, and two copies of it would be the duplication §1
exists to prevent. Consumers: `PermissionsResolverService`
(`core/auth/permissions.service.ts`) and `SettingsService`.

**Parameters §1–§2 did not decide.**

| Parameter | Exact value | Why this number | Enforced in | Degrades |
|---|---|---|---|---|
| Settings L1 capacity | 1,000 entries | The key set is closed — `SettingKey` names 79 keys, no caller builds one — so this never evicts a real key (~12× headroom); it exists so a future caller that did build keys could not grow the map without bound | `SETTINGS_L1_MAX_ENTRIES` | LRU eviction: one more L2/Postgres read |
| Version token lifetime | 2 × the L2 TTL (120 s permissions, 600 s settings) | Must outlive every entry stamped with the token it replaced; an entry is written at most one TTL after its tokens were read (next row), so 2× always covers it | `TieredCache.invalidate()` | — |
| Write-back cutoff | a read older than one L2 TTL is not written back | Keeps the row above true even for a loader stuck longer than the TTL | `TieredCache.writeShared()` | That one read is not shared |
| Namespace generation token | no expiry, one key per namespace | Replaced by `invalidateAll()`; never evicted (noeviction) | `TieredCache.invalidateAll()` | — |

**Departure 1 — the cache keyspace runs `noeviction`, not `allkeys-lru`.**
§2 put `allkeys-lru` on db 1 and `noeviction` on db 0. Redis sets
`maxmemory-policy` (and `maxmemory`) once per instance; there is no
per-database or per-connection policy, in Redis or in ioredis. The instance
is provisioned `noeviction` (the `redis` service in every compose file and
swarm stack), and switching it to `allkeys-lru` would let a cache burst evict
rate-limit counters — the silent fail-open ADR-075 refused. So the cache
shares `noeviction`, as doc 206 §8.1's WO-206.8 note had already decided: at
the ceiling a cache write is refused and the next read is a miss. Every key
carries a TTL, so the cache cannot grow past one TTL of traffic, and a full
instance drains as entries expire. The cost of sharing, proven in
`test/tiered-cache.e2e-spec.ts`: at the ceiling the rate limiter's writes are
refused too — hence the budget in §6. A separate cache instance is the
answer if that budget ever stops holding (see §6's trigger).

**Departure 2 — eight write sites in three files, not two.** Found by
searching for every write to `UserRoleAssignment`, `RoleGrant`, `Role`,
`UserPermission` and `OrgUnitGrant`: `RolesService.assign()`, `.unassign()`,
`.update()` (grants or name), `.delete()`; `UsersAdminService
.updatePermissions()`; and `GrantService.issue()`, `.revoke()` in
`modules/people/orgstructure/org-unit-grant.service.ts`, which §2 did not name. Each
invalidates after its commit, never inside it (a concurrent read would
re-cache the pre-write set as current). `assign()` inside a caller's own
transaction leaves invalidation to that caller; its one such caller,
`SsoService.provision()`, assigns to a user it creates in the same
transaction, so nothing can have cached it. `GrantService.sweepExpired()`
needs none (Departure 7). Out of reach by design: raw SQL and a seed run —
bounded by the 60 s L2.

**Departure 3 — a role-level change drops every entry at once.** A role's
grants, name or existence are part of *every holder's* set, and a role can
have any number of holders — the `Customer` role has every customer. Deleting
`permissions:{userId}` per holder would read every holder in the admin's
request. Instead `invalidateAll()` replaces one namespace token (one Redis
write); every entry stamped with the old token stops being served.

**Departure 4 — `invalidate()` lives on the resolver.** §2 named a
`PermissionsCacheInvalidationService`; the L1 it must drop is the resolver's
own per-process instance, so a separate service would only have to share
it. `PermissionsResolverService.invalidate(userId)` / `.invalidateAll()`.

**Departure 5 — only the per-request path is cached.** `resolveForUser()` had
seven callers. The two that run on every request — `JwtStrategy.validate()`
and `ApiKeyAuthService.authenticate()` — call the new
`resolveForUserCached()`. `resolveForUser()` stays uncached for the other
five, each a one-off where a cache buys nothing and a stale answer can
outlive the window: `GrantService` judging a granter (a just-demoted
granter could issue a grant that runs for weeks), `ApiKeysService` minting a
key, `AttendanceService` letting someone adjust another person's record,
`AuthService` issuing a session, and `UsersAdminService.get()` showing an
admin the effective set right after an edit. A new caller gets the uncached
read unless it opts in by name.

**Departure 6 — DEL alone is not enough: the stale write-back race.** A
replica that read Postgres just before a revocation committed would, with
DEL alone, write the old set back just after the writer deleted it — and
every replica would serve it for the full 60 s, on the revoking replica too.
Each entry therefore records the namespace token and its own id's version
token, read in the same `MGET` that looked for the entry and before the
database read; `invalidate()` replaces the version token (and deletes the
entry) in one pipeline — not `MULTI`, whose abort under a full instance
would take the DEL with it. A late write-back is born stale and never
served. Inside one process the same race is closed by an epoch: a read that
was in flight when this process invalidated never fills L1.

**Departure 7 — a time-boxed grant stops at its `expiresAt`.** No write
marks a grant's expiry, so a set that includes one is cached only until the
earliest such `expiresAt`, in both tiers — never up to a TTL past it.

**Departure 8 — the real bounds.** With a write site: refused on the next
request the revoking replica serves, and within **10 s** on every other
replica (their own L1 — nothing pushes to them; a pub/sub push stays out of
scope, §2) — not "within 60 s". Without one (raw SQL, a seed run): within
**60 s**, because an L1 entry filled from L2 is capped at what that L2 entry
has left (otherwise 60 + 10). Proven in `test/permissions-cache.e2e-spec.ts`.

**Departure 9 — the settings "cross-replica staleness bug" was already
bounded, and L2 cannot shorten it.** §2 says `set()` "calls
`this.cache.clear()`" and the acceptance says a second replica was stale
"unbounded-until-restart". The code read `this.cache.delete(key)` (`clear()`
was `invalidate()`), and every entry expired 30 s after it was set, so a
second replica was already stale for at most 30 s. An L2 behind each
replica's 30 s L1 cannot shorten that: the other replica serves its own L1
entry until it lapses, whatever happens in Redis. Built as specified anyway —
with delete-on-write it never makes that bound worse — and measured in
`test/settings-cache.e2e-spec.ts`: the other replica reads a write at exactly
30 s. What the L2 does buy is load: one Postgres read per key per 300 s for
the whole fleet (2 reads in a simulated 10 minutes across two replicas,
against 40 before). What it can make worse: a write that bypasses `set()`
(none does today) or an invalidation that cannot reach Redis — up to 300 s,
logged as an error when it happens.

**Departure 10 — sizes.** §2's "~200 bytes per resolved set" holds for a
customer only; a staff member's set is several times that. Measured in §6.

**Failure modes.**

| Condition | Reads | Invalidation | Logged |
|---|---|---|---|
| Redis not connected | L1, then Postgres; nothing written back | L1 dropped here; other replicas keep a shared copy until it expires (≤ 60 s / 300 s) | error, per invalidation, naming the id and the bound |
| Redis slow | a read waits at most `commandTimeout` (500 ms, doc 206 §8.1), then Postgres | same as down | warn once per outage, and on recovery |
| Instance full (noeviction) | reads work; write-backs refused — a miss | the DEL lands; the version SET is refused (no write-back can land either) | warn once; error for the refused SET |

**Tests.** `in-process-cache.spec.ts` (TTL, LRU, and a load of 100,000 keys
through a 10,000 cap), `tiered-cache.spec.ts` (no Redis, failing Redis, the
epoch), `settings.service.spec.ts`, `permissions.service.spec.ts` (an L1 hit
issues zero queries), `jwt.strategy.spec.ts`, the write-site specs
(`roles.service`, `users-admin.service`, `org-unit-grant.service`); against a
real Redis and Postgres, `test/tiered-cache.e2e-spec.ts`,
`test/permissions-cache.e2e-spec.ts`, `test/settings-cache.e2e-spec.ts`.
`test/api-keys.e2e-spec.ts` now demotes a key's owner through
`PATCH /admin/roles/:id` rather than a raw `RoleGrant` delete — a raw write
is exactly what the cache's TTL, not its invalidation, bounds.

## 6. Memory budget, measured (2026-09-28)

Measured with `MEMORY USAGE` on Redis 7 and V8 heap deltas on Node 22, for
the permission catalogue as it stands (153 keys):

| Resolved set | Redis L2 entry | L1, per entry | L1 at the 10,000 cap |
|---|---|---|---|
| Customer (`Customer`, no keys) | 216 B | 348 B | 3.3 MB |
| Staff holding 20 keys | 728 B | 1,302 B | 12.4 MB |
| Holding all 153 keys | 3,672 B | 6,822 B | 65.1 MB |

A version token costs 152 B for 2 × the TTL; all 80 settings rows hold 1,044
bytes of JSON between them. **L1:** the cap bounds a process at 65 MB only
if 10,000 distinct users each holding every key are active within one
10-second window — a realistic mix (customers plus a few hundred staff) is
single-digit MB against the API container's 768 MB. **L2**, against the
shared 64 MB: doc 206 §8.1 sized the instance at ~3× a busy single-brand
minute of rate-limit keys, i.e. ~20 MB for that minute, leaving ~44 MB —
about 200,000 distinct customers authenticating within one minute before
the permission entries alone fill it. If they did, cache writes
would be refused and the rate limiter's with them (Departure 1) until the
entries expire, 60 s at most.

**Trigger for revisiting:** WO-206.8's API-response cache is the first
consumer whose key space is not bounded by users per minute. It either
budgets itself into this table, or it takes its own Redis instance with
`allkeys-lru` — the configuration §2 wanted, and the only place it can exist.

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
