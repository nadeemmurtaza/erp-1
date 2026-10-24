# ADR-077 — Doc 208 (L1/L2/L3 caching): each tier attached to a found hot path, not applied blindly — permission resolution's uncached three-query call on every authenticated request as the real L1/L2 target, `VariantSalesStat`'s eager-materialization pattern generalized as the L3 strategy, a real cross-replica settings-staleness bug found and closed along the way

[← Decision log](../DECISIONS.md)


### Context

The owner asked to "implement L1, L2, L3 caching where needed." Investigated
before designing: `SettingsService` already hand-rolls an in-process TTL
cache (30s) with no reusable primitive; `PermissionsService.resolveForUser()`
runs three uncached queries on every authenticated request (called from
`jwt.strategy.ts`'s `validate()`); `VariantSalesStat` is already an eagerly-
maintained materialized aggregate, not a TTL cache. "Where needed" is
answered by what these traces actually show, not by applying three generic
cache layers uniformly.

### Options Considered

1. **A single generic Redis caching layer wrapping arbitrary endpoints**,
   labeled L1/L2/L3 by convention without each tier solving a distinct
   problem. Rejected — this is exactly the "cache added with no stated
   invalidation strategy is a defect" failure CLAUDE.md's own performance
   rule already names, and duplicates `SettingsService`'s existing pattern
   under a different name instead of generalizing it.
2. **Build a new in-process cache for permission resolution without
   extracting `SettingsService`'s existing one into a shared primitive.**
   Rejected on the same "duplicate implementation is a defect" ground — two
   independently hand-rolled TTL-map caches, one already existing.
3. **Real cross-replica L1 invalidation via a new Redis pub/sub broadcast**,
   so a permission revocation is instant on every replica, not TTL-bounded.
   Rejected for this pass — no pub/sub mechanism exists anywhere in this
   codebase today, and building one solely to shrink an already-short
   10-second worst case is speculative infrastructure for a marginal
   benefit; named as a real future option if instant propagation is ever
   actually required, not built speculatively now.
4. **Extract `InProcessCache` as a shared L1 primitive, apply it to the
   found permission-resolution hot path with an explicit, reasoned TTL and
   delete-on-write invalidation at the real write sites, add an L2 Redis
   tier for both permissions and general API responses (doc 206 §5) in a
   shared safe-to-evict keyspace, and state the L3 criterion from
   `VariantSalesStat`'s own already-working shape rather than inventing a
   fourth pattern.** Chosen.

### Decision

Doc 208, as written. L1: `InProcessCache<K,V>`, extracted from
`SettingsService`'s existing hand-rolled cache; permission resolution gets
a 10-second L1 (capped 10,000 entries, LRU) and a 60-second L2
(`permissions:{userId}`), both invalidated by explicit delete-on-write at
the two real revocation call sites (`users-admin.service.ts`,
`roles.service.ts`) rather than TTL alone. Settings gains an L2 tier
(300s, `settings:{key}`) closing a real, previously-silent cross-replica
staleness gap: `SettingsService.set()` today only clears the *writing*
replica's own L1, leaving every other replica stale for up to 30 seconds
per write with no correction. Doc 206 §5's general API-response cache is
reclassified as this architecture's L2, parameters unchanged. L3 is
`VariantSalesStat`'s existing eager-materialization pattern, generalized
as a named criterion for future candidates rather than a fourth cache
tier — no speculative L3 target is built in this pass.

### Reasoning

Every parameter traces to either an already-shipped constant
(`SettingsService`'s real 30s TTL, kept unchanged) or a stated, specific
reason (10s for permissions because a stale revocation is a live
over-permission window, shorter than a stale setting's merely cosmetic
delay). The decision not to build pub/sub invalidation is argued
explicitly rather than left as a silent gap — the accepted staleness
bound is written down, not assumed safe without reasoning, per this
repo's own "never hardcode an assumption... without writing down why."

### Consequences

Permission-resolution caching introduces a real, bounded security trade-
off (up to a 60-second window where a revoked permission could still be
honored on a replica that hasn't independently expired its entry) — stated
here as a standing, reviewable fact of this design, not hidden inside an
implementation detail. The settings cross-replica staleness fix is a
correction to already-shipped behavior, not new functionality — worth
noting in case anything downstream was silently relying on the old,
looser cross-replica settings consistency. Implementation is sequenced
after doc 206/WO-206.1's Redis module (same dependency doc 207 already
states), adding one keyspace (`cache: { db: 1 }`) rather than a third.

### Status
**Accepted.**

### Addendum — 2026-09-28: WO-208.1 to WO-208.5 as built

Every number decided above runs unchanged (permissions 10 s L1 capped at
10,000, 60 s L2 at `permissions:{userId}`; settings 30 s L1, 300 s L2 at
`settings:{key}`; `cache: { db: 1 }`). Building it against the real code
corrected four things the decision rested on; doc 208 §5 has the full
record and §6 the measured budget.

**Corrected while building.**
1. *No per-keyspace eviction policy exists.* Redis sets `maxmemory-policy`
   once per instance, so `allkeys-lru` on db 1 beside `noeviction` on db 0
   cannot be configured, and switching the instance would let a cache burst
   evict rate-limit counters (ADR-075's refused fail-open). The cache shares
   the instance's `noeviction`, as doc 206 §8.1 had already noted: a full
   instance refuses the cache write, read as a miss. The shared budget is
   the cost — at the ceiling rate-limit writes are refused too — measured
   and bounded in doc 208 §6; a separate `allkeys-lru` instance is the named
   answer if WO-206.8's response cache outgrows it.
2. *Eight write sites in three files, and role-level writes reach every
   holder.* `GrantService.issue()`/`.revoke()` (orgstructure) change the
   resolved set too. A change to a role's grants, name or existence changes
   every holder's set — the `Customer` role has every customer — so it
   replaces one namespace token instead of deleting a key per holder.
3. *Delete-on-write alone reopens the window it closes.* A replica that read
   Postgres just before the write committed would write the old set back for
   a full TTL. Entries carry the namespace and per-id version tokens they
   were read under and are served only while both still match; in-process,
   an epoch keeps a read that straddled an invalidation out of L1.
4. *The settings gap was bounded, and L2 cannot shorten it.* `set()` called
   `delete(key)`, and every L1 entry expired after 30 s, so another replica
   was stale for at most 30 s — not "unbounded". An L2 behind each replica's
   L1 cannot shorten that; it was built as specified (it never lengthens it
   with delete-on-write) and buys one Postgres read per key per 300 s
   fleet-wide.

**Scoped while building.** Only the two per-request authenticators
(`JwtStrategy`, `ApiKeyAuthService`) take the cached path
(`resolveForUserCached()`); `resolveForUser()` stays uncached for the five
one-off callers, one of which (`GrantService` judging a granter) would
otherwise let a just-demoted granter issue a grant that outlives the cache
window. A time-boxed OrgUnitGrant caps its set's lifetime at its `expiresAt`.
The Consequences above therefore tighten: with a write site, a revocation
is refused on the revoking replica's next request and within 10 s on the
others; without one (raw SQL, a seed run), within 60 s.

**Parameters added** (Parameter — exact value — why — where — degrades):

| Parameter | Value | Why | Where | Degrades |
|---|---|---|---|---|
| Settings L1 capacity | 1,000 entries | 79 `SettingKey`s, none built dynamically: never evicts a real key | `SETTINGS_L1_MAX_ENTRIES` | LRU: one more read |
| Version token lifetime | 2 × L2 TTL (120 s / 600 s) | outlives every entry stamped with the token it replaced | `TieredCache.invalidate()` | — |
| Write-back cutoff | a read ≥ 1 L2 TTL old is not written back | keeps the row above true for a stuck loader | `TieredCache.writeShared()` | that read is not shared |
| Namespace token | no expiry, one per namespace | O(1) role-level invalidation; never evicted | `TieredCache.invalidateAll()` | — |
