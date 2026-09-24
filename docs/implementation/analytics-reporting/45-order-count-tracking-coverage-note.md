# 45 — Order count tracking: already built, not a gap

Unlike the other documents in this set, this one exists to say plainly
that the promotional claim it answers — "dedicated metrics tracking total
order volume alongside gross revenue and total item volume" — **already
has real, working coverage**, and to name exactly where, so nobody
duplicates it under a new module thinking it is missing.

## Where it already lives

- **`AnalyticsService.summary(days)`** (`analytics.service.ts:325`) — the
  admin dashboard's own home-screen figures. `today`/`month`/`allTime`
  each carry an order count alongside revenue, computed from the same
  `countsAsSale` filter (`status: { notIn: VOID_STATUSES }`) so the two
  numbers are never counting a different population of orders by accident
  — exactly the "revenue four ways" trap `CLAUDE.md`'s money lens warns
  against, already avoided here by construction.
- **`AnalyticsService.ordersOverview()`** (`analytics.service.ts:895`) —
  ageing buckets and the open-order worklist, itself a count-based view of
  order volume by status and age, not merely a revenue figure.
- **`Contact.orderCount`** (`crm.prisma`) — per-customer order volume,
  read throughout the CRM analytics (`customersRetention()`,
  `customersTop()`, `customersOverview()` — `analytics.service.ts:403,
  463, 1659, 1731, 1761`) for repeat-rate and lifetime-value figures that
  are themselves built on order *counts*, not only revenue sums.
- **`OrdersFulfilment()`** (`analytics.service.ts:992`) — fulfilment-stage
  order volume over a trailing window.

"Total item volume" (units, as distinct from order count or revenue) is
the one sub-claim worth a narrower note: `productsTopSellers()`/
`productsSlowSellers()` (doc 26's own citation of this file) already
report `units` per product/variant (`row!.units` — see
`analytics.products.spec.ts`), so unit volume is tracked at the product
level; a single "total units sold, store-wide" tile alongside `summary()`'s
existing order-count and revenue figures does not exist as one number
today. That is a one-line addition to an existing, already-correct
aggregation query, not a missing capability — named here rather than
silently left implicit, per the same "an n/a with no reason, or an
unnamed gap, fails the scope map" rule this whole document set already
holds itself to.

## The one real gap, scoped narrowly

**WO-45.1** — add `totalUnits` to `DashboardSummary`'s `today`/`month`/
`allTime` shape, summed from `OrderItem.quantity` under the same
`countsAsSale` filter `summary()` already uses for its order-count and
revenue figures — one query addition to an existing method, not a new
service, table, or screen.

## Acceptance

- `DashboardSummary.today.totalUnits` (and `month`/`allTime`) sums
  `OrderItem.quantity` under the identical order population `orderCount`
  and `revenue` already use for that same window — proven by a spec
  asserting all three figures are computed from one shared `WHERE` clause,
  never three independently-filtered queries that could silently drift
  apart.

## Out of scope

Everything else this document's title names is already built and cited
above; there is no further work order here beyond WO-45.1.
