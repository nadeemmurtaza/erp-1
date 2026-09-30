# ADR-076 — Doc 207 (checkout admission queue): "prevent overselling during rush hours" corrected — overselling is already structurally impossible via `InventoryService.applyMovement()`'s predicate-on-write; the real problem is checkout UX and lock contention on a hot SKU's two rows, addressed with a per-variant admission queue that fails open, never a second stock guard

[← Decision log](../DECISIONS.md)


### Context

The owner asked for "waiting room logic to prevent selling over the
inventory during rush hours." Investigated before designing anything:
`InventoryService.applyMovement()` (`inventory.service.ts:236`) already
guards every stock decrement with an atomic conditional `UPDATE ...
WHERE quantity >= $requiredQty` (House Rule 10) — this makes overselling
impossible at any concurrency level, today, with no new code. A waiting
room built to "prevent overselling" would duplicate a guarantee that
already exists unconditionally.

### Options Considered

1. **Build a waiting room framed as overselling prevention** (a queue that
   gates checkout and is described as the thing stopping oversold stock).
   Rejected — this misrepresents what the feature actually does and risks
   a future reader believing stock correctness depends on the queue being
   up, when it does not and must not.
2. **Do nothing, since overselling is already solved.** Rejected — a real,
   distinct problem remains: `applyMovement()` also updates the variant's
   aggregate `stock` column via a second raw-SQL statement in the same
   transaction, so a genuine spike on one SKU serializes through two hot
   rows; past a real concurrency threshold this produces growing lock-wait
   chains and connection-pool pressure (the per-replica pool is 5
   connections per doc 206/ADR-075), and every losing bidder currently
   discovers they lost only after attempting payment, not before.
3. **A per-variant checkout admission queue**, scoped explicitly as a
   contention-bounding, UX and fairness mechanism, that fails open (never
   blocks a purchase) if its own infrastructure (Redis) is unavailable,
   and that reuses doc 206/WO-206.1's Redis module rather than adding a
   second one. Chosen.

### Decision

Doc 207, as written. Rush mode per variant triggers automatically at 10+
concurrent in-flight checkout attempts within a 5-second window (or
manually via a new `HighDemandWindow` an admin sets ahead of a scheduled
drop), admits 5 concurrent checkout sessions at a time — sized to exactly
match the per-replica Prisma pool so this alone can never exhaust it — each
with a 90-second completion window, and deactivates automatically when
contention drops below 3 for 30 seconds or the variant's real stock hits
zero (at which point everyone still queued gets an immediate sold-out
message rather than a doomed admission). The existing predicate-on-write
guard remains the sole authority on whether any given sale actually
succeeds; admission grants an attempt, never a stock hold.

### Reasoning

Every number is tied to a real existing constant already decided in this
log (the 5-connection pool from ADR-075) or to the actual failure mode
being bounded (10 as the point past which pool contention becomes real,
not a round number picked for its own sake). The fail-open posture is a
deliberate departure from doc 206's rate limiter's fail-closed posture,
reasoned explicitly: an unreachable Redis here should degrade to today's
already-correct behavior, never to a blocked purchase, because nothing
about stock correctness depends on this feature working.

### Consequences

This document's implementation is sequenced after doc 206/WO-206.1's
Redis module lands, specifically to avoid standing up a second Redis
client for the same infrastructure — named here so it is not silently
duplicated by whoever picks up WO-207.1. No change to `InventoryService`,
`applyMovement()`, or the predicate-on-write guard itself; this is
additive admission control in front of checkout, not a change to how
stock is written.

### Status
**Accepted.**
