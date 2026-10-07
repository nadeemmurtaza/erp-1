# 207 — Checkout admission queue for hot-SKU contention ("waiting room")

> **Status: proposed (2026-09-28), not yet built.** The request was framed as
> "prevent overselling during rush hours." Investigated first: overselling is
> **already structurally impossible** in this codebase, at any traffic volume,
> via the predicate-on-write idiom already in `InventoryService.applyMovement()`
> (`apps/api/src/modules/supply-chain/inventory/inventory.service.ts:236`, House Rule 10).
> This document does not touch that guarantee and does not duplicate it. What
> a real traffic rush on one hot SKU actually threatens is different: checkout
> **UX** (most bidders lose at the payment step instead of before it) and
> **database lock contention** on that one SKU's rows. This document specifies
> the mechanism that actually addresses those two things.

## 1. Why overselling is not the real problem — read the guard first

`applyMovement()`'s guarded write:

```sql
UPDATE "VariantLocationStock"
SET quantity = quantity + $delta
WHERE "variantId" = $variantId AND "locationId" = $locationId
  AND quantity >= $requiredQty   -- only when delta is negative
```

This is a single atomic conditional `UPDATE`. Postgres serializes concurrent
writers to the same row via its own row-level lock — there is no window in
which two concurrent requests can both read "3 in stock" and both succeed in
decrementing by 3, because the second writer's `UPDATE` blocks until the
first commits, then re-evaluates `quantity >= $requiredQty` against the
now-current value. `updated.count === 0` is the deterministic, race-free
signal that the guard failed. No amount of concurrent traffic changes this.
**A waiting room adds zero correctness value on top of a guarantee that is
already unconditional.**

A second, real finding from reading the same function: `applyMovement()`
**also** issues a raw-SQL `UPDATE "ProductVariant" SET stock = (SELECT
SUM(...) FROM "VariantLocationStock" WHERE "variantId" = ...)` inside the
same transaction, to keep the variant's aggregate `stock` column correct
across all its locations. This means every sale of a given variant — at
any location — contends for a lock on **two** rows: that location's
`VariantLocationStock` row, and the variant's own `ProductVariant` row. A
genuine flash-sale spike on one SKU therefore serializes through the same
two rows regardless of how many different branches are selling it, which is
the actual bottleneck a real rush produces — not incorrect stock, but a
growing chain of transactions each waiting on the previous one's lock,
which (if left unbounded) extends request latency and can exhaust a
replica's connection pool (`connection_limit=5` per doc 206/ADR-075) well
before any single sale is actually lost to a race.

## 2. What this document actually builds

A **per-variant checkout admission queue** — real value in three places
none of which is "prevent overselling," because that part is already done:

1. **Bounded lock contention.** Cap how many checkout attempts for one hot
   variant are ever concurrently mid-transaction, so the lock-wait chain on
   that variant's two rows never grows past a size this system's own
   connection pool can absorb.
2. **Honest early rejection.** Once a variant's real stock hits zero, every
   still-queued person is told "sold out" immediately, before they enter
   payment details for a purchase that is already structurally certain to
   fail the guard above — never after.
3. **Fairness under contention.** Admission is FIFO by arrival, not by
   whichever request's TCP packet or retry happened to land first.

This is scoped to checkout **admission control**, not a second stock model,
not a cart-level reservation system (none exists today — confirmed: no
`reserveStock`/`StockReservation` anywhere in `apps/api/src/modules` — stock
is decremented at order placement via `orders.service.ts`'s own call into
`move()`, unchanged by this document).

## 3. Exact parameters

**Parameter: rush-mode trigger (automatic).**
**Exact value:** a variant enters rush mode when **10 or more** checkout
attempts referencing that `variantId` are concurrently in flight (between
"order placement started" and "order placement finished or failed") within
a rolling **5-second** window.
**Why 10:** the per-replica Prisma pool is 5 connections (doc 206/ADR-075).
At 10 concurrent contenders for the same two rows, at least half are
already queuing on the connection pool before the database row lock is
even reached — this is the point past which contention stops being
"Postgres handles it in microseconds" and starts being a real latency and
pool-exhaustion risk. Below 10, no queue activates; ordinary concurrent
checkout on a normal SKU is unaffected.
**Where enforced:** a counter incremented/decremented around the existing
`orders.service.ts` order-placement call, keyed by `variantId`, backed by
Redis (the same shared Redis module doc 206/WO-206.1 is adding for rate
limiting — this document does not stand up a second Redis client; it
reuses that module once it exists).

**Parameter: rush-mode trigger (manual).**
**Exact value:** a new `HighDemandWindow` row (`variantId`, `startsAt`,
`endsAt`, `createdByUserId`) an admin can set ahead of a known scheduled
drop or restock, activating the queue proactively rather than waiting for
the automatic threshold to be crossed reactively (which by definition means
some contention already happened before protection kicked in).
**Where enforced:** a real admin screen (per "a feature ships whole, not
backend-only" — this needs a UI, not just a table), permission
`inventory.manage` (the same key that already gates related inventory
actions — checked against the real catalogue before assuming this name,
per this repo's own "search before creating" rule).

**Parameter: rush-mode deactivation.**
**Exact value:** rush mode for a variant clears when concurrent in-flight
attempts drop below **3** for a sustained **30 seconds**, OR immediately
and unconditionally when the variant's real current stock (read fresh, not
cached) reaches **0** — in the zero-stock case, deactivation means "drain
the queue with an honest sold-out message," not "let admission continue."
**Why 3, not 0:** waiting for the count to hit exactly 0 before clearing
would flap the queue on/off around the boundary; 3 with a 30-second hold
gives hysteresis so the queue doesn't toggle every time contention briefly
dips.

**Parameter: concurrent admission cap while rush mode is active.**
**Exact value:** **5** concurrently admitted checkout sessions per variant.
**Why 5, not 10 or 20:** chosen to exactly match the per-replica Prisma
`connection_limit=5` (doc 206/ADR-075) — 5 concurrently admitted attempts
for one hot variant can, at worst, occupy an entire replica's connection
pool, but never demand more connections than the pool actually has, and
never alone starve other, unrelated traffic hitting the same replica for a
different variant, because every admitted session still competes for the
same shared pool on equal terms once inside.

**Parameter: per-admission checkout window.**
**Exact value:** **90 seconds** from admission to completed order
placement. An admitted session that hasn't placed the order within 90
seconds forfeits its slot; the next queued person is admitted immediately.
**Why 90 seconds:** long enough for a returning customer with saved payment
details to review and confirm (real checkout completion times for a
non-first-time buyer are typically well under a minute); short enough that
one distracted or abandoned session doesn't hold a scarce slot for minutes
while others wait with nothing happening.

**Parameter: queue position and estimated wait shown to the user.**
**Exact value:** position = the user's rank in the Redis sorted set
(score = admission-request timestamp); estimated wait =
`ceil(position / 5) × 90` seconds — a direct arithmetic consequence of the
two parameters above, never a separately-guessed number.

**Parameter: queue storage.**
**Exact value:** one Redis sorted set per variant (`queue:variant:{id}`,
score = enqueue timestamp) plus a small hash for each active admission's
expiry (`admission:variant:{id}:{sessionId}` with a 90-second TTL) — the
TTL itself is what reclaims a forfeited slot; no separate cron/sweep is
needed for the common case, though a periodic reconciliation is specified
in §5 for the case where a TTL expiry event is missed (Redis
keyspace-notification delivery is not guaranteed, matching this repo's own
"never assume a webhook/event fires exactly once" posture elsewhere).

## 4. What the user actually sees

- Below the automatic threshold and with no active `HighDemandWindow`:
  checkout behaves exactly as it does today — this document changes nothing
  for the overwhelming majority of purchases.
- Once rush mode is active for the variant they're buying: a checkout
  initiation request that would exceed the 5-concurrent-admission cap gets
  a queue position and estimated wait instead of proceeding straight to
  payment. The page polls or holds an SSE/WebSocket connection (implementer's
  choice — this repo has no existing WebSocket infrastructure for customer
  clients, checked before assuming one; short-poll every 3 seconds is the
  simpler, lower-risk default) until admitted.
- On admission: normal checkout, 90-second window, normal `move()` call at
  order placement — the existing predicate-on-write guard is still the
  actual authority on whether the sale succeeds. Admission is not a
  reservation and carries no guarantee of stock; it only guarantees a
  fair, bounded-contention attempt.
- If the variant's stock reaches 0 while the person is queued: they are
  told "sold out" immediately, not admitted to a doomed attempt.

## 5. Failure modes

- **Redis unreachable:** rush-mode detection and admission control both
  degrade to **fail open** here — deliberately the opposite posture from
  doc 206's rate limiter (which fails closed because an unlimited login
  endpoint is dangerous). An inability to queue is not dangerous the same
  way: worst case, checkout behaves as it does today, with the existing
  database-level guard still fully protecting stock correctness. A
  waiting room that itself becomes unavailable must never block anyone
  from buying — it is a UX and load-shedding layer on top of a system that
  is already correct without it.
- **A missed TTL-expiry reconciliation:** a periodic sweep (every 30
  seconds) re-checks each active admission's real elapsed time against the
  90-second window and force-expires any that Redis's own TTL eviction
  missed, admitting the next queued person.
- **A variant's queue never drains because rush mode never deactivates:**
  the automatic deactivation condition (§3) already covers the ordinary
  case; an admin override to manually clear a `HighDemandWindow` early is
  part of the same admin screen from §3's manual trigger.

## Work orders

**WO-207.1** — the in-flight-attempt counter and automatic rush-mode
trigger/deactivation, reusing doc 206/WO-206.1's Redis module.
**WO-207.2** — `HighDemandWindow` schema + admin screen + permission check
(manual trigger).
**WO-207.3** — the admission queue itself (sorted set, admission TTL,
position/wait calculation, the reconciliation sweep).
**WO-207.4** — the customer-facing queue UI (position, estimated wait,
polling, admitted → normal checkout handoff, sold-out message).
**WO-207.5** — tests: contention above/below the threshold, admission cap
enforcement, TTL expiry and slot handoff, sold-out mid-queue, Redis-down
fail-open behavior.

## Acceptance

- 20 simulated concurrent checkout attempts against one variant with rush
  mode active never admit more than 5 concurrently, provable by test.
- A queued user whose target variant hits zero stock while they wait
  receives a sold-out response within one poll interval, never an
  admission.
- An admitted session that doesn't complete within 90 seconds frees its
  slot for the next queued person, provable by test with a simulated
  timeout.
- With Redis unreachable, checkout for a rush-mode variant still succeeds
  for a normal request volume — the feature degrades to today's behavior,
  never to a blocked purchase.
- Ordinary (non-hot) SKUs see no behavior change at any traffic level below
  the automatic trigger threshold.

## Out of scope

Cart-level stock reservation (none exists today; this document does not
add one — admission to checkout is not a stock hold). A second stock
model or a shadow "queue-reserved" quantity. Cross-variant/cross-SKU global
site-wide queueing (this is per-variant, scoped to the actual hot row, not
a general DDoS/traffic-spike product — that's `.claude/rules/performance.md`'s
own CDN/caching territory, separately). Payment pre-authorization changes.
