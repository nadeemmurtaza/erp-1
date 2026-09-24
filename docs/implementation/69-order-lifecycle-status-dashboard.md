# 69 — A status-count tile: the one dashboard `Order.status` never got

`Order.status` already carries the full lifecycle
(`PENDING`/`CONFIRMED`/`PROCESSING`/`READY_TO_SHIP`/`SHIPPED`/`DELIVERED`/
`CANCELLED`/`RETURNED`, `orders.service.ts` lines 58-66) and every
transition is already logged to `OrderStatusEvent` — the raw material for
"Pending, Completed, Voided" tracking exists in full. What does not exist
is the aggregate: a search across `AnalyticsService` for a `statusBreakdown`
or `byStatus` grouping over orders found none (the one hit,
`CustomersOverview.byStatus` at line 221, groups *customers*, not orders —
a false positive). No dashboard tile today answers "how many orders are in
each state, right now." This document is that one small, genuine gap.

## 1. A status breakdown is a single `GROUP BY`, mapped to the promotional list's own three buckets

```ts
interface OrderLifecycleBreakdown {
  counts: Record<OrderStatus, number>;
  // The promotional list's own three named buckets, mapped from the real
  // enum rather than introduced as a second status field:
  pending: number;      // PENDING + CONFIRMED + PROCESSING + READY_TO_SHIP + SHIPPED
  completed: number;    // DELIVERED
  voided: number;       // CANCELLED + RETURNED
}

async orderLifecycleBreakdown(locationId?: string): Promise<OrderLifecycleBreakdown> {
  // COUNT(*) GROUP BY status, scoped to locationId and a caller-supplied
  // window (today, or all open orders regardless of window for the
  // "pending" bucket, since an open order doesn't age out of relevance the
  // way a closed one does) — never a second status column, only a
  // read-time grouping of the one that already exists.
}
```

The three-bucket mapping is a **display grouping**, not a new column —
`Order.status` remains the single source of truth; "Pending" /
"Completed" / "Voided" are how the tile labels existing states, matching
the promotional list's own simpler vocabulary without fragmenting the
underlying lifecycle doc 23's own `ALLOWED_TRANSITIONS` already governs.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: a read over existing `Order` rows.
**Whose rows, and which columns** — scoped by `locationId` exactly as
every other order-based analytics read in this repository already is; no
new visibility rule.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: a read, no write.
**Audience is a capability, not an address** — n/a: a dashboard tile, not
a notification.
**Request or record** — n/a: a pure aggregation over already-recorded
`Order.status` facts; this document performs no write of its own.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a: no money or stock fact of its own; this reads a status
field, not a financial one.
**Dry run before live** — the function above is already the entire
computation, pure, over already-loaded rows.
**Three silhouettes** — Solo: a handful of open orders, mostly a novelty
tile. Chain: a real per-branch fulfilment-queue signal — "Pending" count
spiking at one branch is an operational alert. Organization: cross-brand
comparison, where the bounded query (next lens) matters at real volume.
**The absent collaborator** — n/a: `orders` is a core, always-on module;
no optional dependency to degrade against.
**The second copy of the write** — n/a: no write.
**The hundred-thousandth row** — a `GROUP BY status` with a `locationId`
filter, scoped further by an "open orders" or "today" window for the
non-terminal statuses — `Order.status` and `Order.locationId` are already
indexed for other status-scoped reads in this repository; no new index
required, verified by `EXPLAIN ANALYZE` before shipping if a genuinely new
composite access pattern emerges.
**The reversal document / The undo fan-out / The version stamp** — n/a:
this reads status transitions doc 23's own `ALLOWED_TRANSITIONS` already
governs; no new reversal concept.
**The erasure the ledger cannot obey** — n/a: an aggregate count, never a
customer-identified record.
**The failure path** — n/a beyond an ordinary query failure, surfaced as
the tile's own error state.

## Work orders

**WO-69.1 — `orderLifecycleBreakdown(locationId)`** read, a single
`GROUP BY status` mapped to the three display buckets.
**WO-69.2 — UI**: a status-breakdown tile (three big numbers, or a small
donut/bar per the dataviz skill's own categorical-count heuristic) on the
orders/fulfilment analytics screen (`WO-D.1`'s existing home), each
segment clicking through to the existing order list pre-filtered by its
real underlying statuses — the "click the number" rule applied to a status
count instead of a revenue figure.

## Acceptance

- `pending + completed + voided` accounts for every order in scope, proven
  by a spec summing all three buckets against a direct total count.
- Clicking the "Voided" segment opens the order list pre-filtered to
  exactly `CANCELLED` + `RETURNED`, never a dead-end summary number.
- The tile respects `locationId` scoping identically to every other
  order-based analytics read.

## Out of scope

A Kanban-style drag-to-transition board — this tile is read-only
visibility; status transitions already have their own governed path
(`OrdersService.updateStatus()`, `ALLOWED_TRANSITIONS`) and this document
does not add a second way to change one.
