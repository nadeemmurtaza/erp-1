# 68 — Instant gross profit: OrderEconomics exists, but never fires for POS

> **Status: shipped (2026-09-25), WO-68.1.** `placeFromPos()`
> (`apps/api/src/modules/sales/orders/orders.service.ts`) now publishes
> `DomainEvent.OrderStatusChanged` with `fromStatus: null, toStatus:
> 'DELIVERED'` inside the same transaction as order creation, immediately
> after `OrderPlaced`. `fromStatus` is `null` rather than a prior status
> since the order never existed at any other status — every subscriber
> (`FinanceListener`, `loyalty-order.listener.ts`,
> `orders/notification.subscriber.ts`) already keys off `toStatus` alone,
> confirmed by reading all four subscribers before writing the fix. Proven
> by a spec asserting the exact `OutboxEvent` row
> (`orders-pos.service.spec.ts`). This was the explicit, named prerequisite
> for doc 153's transaction-fee metering.
>
> **Status (2026-09-25): WO-68.2–68.4 also shipped.**
> `OrderEconomicsService.grossProfitToday(locationId?)` reads today's
> `OrderEconomics` rows joined to `Order`, reusing `shopDayExpr`'s
> `startOfShopDay()` and the identical `VOID_ORDER_STATUSES` filter
> `AnalyticsService.summary()` already uses — served at `GET
> /admin/finance/gross-profit-today`, gated by `inventory.view_cost`
> (the whole endpoint, not a per-field redaction — a gross-profit figure
> with the cost half hidden is not a smaller version of the feature, it is
> a meaningless one). **One deviation**: this doc's own WO-68.3 named "the
> existing POS shift/sales-history screen" as the per-transaction UI's
> home — verified by search, no such screen exists anywhere in
> `apps/pos` or the admin app (the POS app has only shift open/close and a
> cash Z-report, neither of which lists individual transactions). Rather
> than inventing that screen speculatively, the per-transaction list ships
> where a real, already-built surface exists: `GrossProfitTodayWidget`
> (`apps/web/src/components/admin/dashboard/`), a new card on the existing
> admin dashboard, each row linking through to its own order — the
> identical "click the number" pattern `ActionHubWidget` already
> establishes. WO-68.4's reconciliation is proven by a spec comparing
> `grossProfitToday()`'s revenue against an independent `Order.aggregate()`
> over the same rows (`order-economics.service.spec.ts`).

`OrderEconomics` (`apps/api/prisma/schema/finance.prisma`, lines 102-132)
already stores exactly what "instant gross margin and net profit
calculation per transaction" needs — `revenue`, `cogs`, `contribution` —
computed by `OrderEconomicsService` and fired from `FinanceListener`
(`apps/api/src/modules/money/finance/finance.listener.ts`). But that listener
subscribes to exactly one event: `DomainEvent.OrderStatusChanged`, firing
`computeForOrder()` only `if (payload.toStatus === 'DELIVERED')`. A POS
till sale never publishes that event for its own delivery — confirmed at
`apps/api/src/modules/sales/orders/orders.service.ts` lines 445-484: a POS sale
is `tx.order.create({ data: { status: 'DELIVERED', channel: 'POS', ... },
statusEvents: { create: { toStatus: 'DELIVERED', ... } } })`, created
**directly** at `DELIVERED`, never transitioned into it through
`updateStatus()` — and the only events that same code path publishes are
`PaymentSucceeded` and `OrderPlaced` (lines 529-554), never
`OrderStatusChanged`. **The result: every POS sale — precisely the
transaction type "instant gross profit... per transaction" is asking
about — gets no `OrderEconomics` row at all, today.** E-commerce orders
that are later marked `DELIVERED` through the normal fulfilment flow do
get one; till sales, which complete and deliver in the same instant, do
not. This is the one real, precise, previously-undiscovered gap this
document exists to close — not a new profit-calculation engine, a missing
event subscription.

## 1. The fix is one more publish, at the point POS already knows it happened

```ts
// orders.service.ts, inside createFromPos()'s existing transaction, right
// alongside the existing PaymentSucceeded / OrderPlaced publishes:
await this.events.publish(
  DomainEvent.OrderStatusChanged,
  { orderId: created.id, fromStatus: null, toStatus: 'DELIVERED' },
  tx,
);
```

This makes `FinanceListener.onOrderStatusChanged()` fire for every POS
sale through the exact same, already-correct, already-idempotent
(`OrderEconomicsService`'s own upsert-by-`orderId` semantics —
"writes exactly one row on DELIVERED; replaying the event writes no
second row," per `order-economics.service.spec.ts` line 121) path
e-commerce orders already use. No second computation engine, no
POS-specific margin formula — the same `revenue`/`cogs`/`contribution`
fields, the same zeroing-on-RETURNED rule, populated for a sale channel
that today silently skips them.

## 2. "Per transaction and per day" is then a read over rows that now exist

```ts
async grossProfitToday(locationId?: string): Promise<{
  transactions: Array<{ orderId: string; orderNumber: string; revenue: number; cogs: number; contribution: number; marginBps: number }>;
  dayTotal: { revenue: number; cogs: number; contribution: number; marginBps: number };
}> {
  // A read over today's OrderEconomics rows, joined to Order for the
  // shop-day boundary (core/time/shop-time.ts's shopDayExpr — the identical
  // timezone-correct day boundary AnalyticsService.summary() already uses,
  // never a UTC-midnight mismatch reinvented here) and filtered to
  // completed (non-VOID_STATUSES) orders, reusing AnalyticsService's own
  // countsAsSale discipline rather than a third filter definition.
}
```

`dayTotal` reconciles against `AnalyticsService.summary()`'s own daily
gross-sales figure by construction — both read the same `Order` rows
through the same shop-day boundary and the same void-status filter; the
only difference is this read also joins `OrderEconomics` for the
cost/margin side `summary()` does not carry.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: a read over existing rows, populated
by an existing, unchanged write path.
**Whose rows, and which columns** — scoped by `locationId` exactly as
`OrderEconomics`'s own order already is; margin/cost figures are gated
behind `inventory.view_cost` exactly as `AnalyticsService`'s own
`marginBps` field already requires (line 145/1346) — this document reuses
that gate rather than inventing a second cost-visibility permission.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: a read, no write of its own beyond the one missing
event-publish fix.
**Audience is a capability, not an address** — n/a: a dashboard tile, not
a notification.
**Request or record** — the underlying `OrderEconomics` write is already
correctly classified as a RECORD (a computed snapshot of a fact that
already happened, per finance.prisma's own header); this document adds no
new write classification, only a missing trigger for an existing one.
**The movement with no address** — n/a: no stock movement of its own;
reads `OrderEconomics.cogs`, itself already sourced from
`OrderItem.unitCost` snapshots.
**The unwritten posting rule** — restated as this document's own central
finding: the "posting rule" (compute `OrderEconomics` on delivery) already
exists and is already correct; the gap was purely which events reach it.
**Every column or none / The period that already moved / The second legal
entity** — n/a: `OrderEconomics` is a reporting snapshot, not a GL posting
(finance.prisma's own stated distinction), so fiscal-period and
multi-entity concerns belong to the actual GL posting this snapshot never
touches.
**Dry run before live** — `computeForOrder()` is already a pure function
of an order's own line items; nothing new to preview.
**Three silhouettes** — Solo: every sale is POS, so today's gap means
**zero** POS sellers currently get gross-profit reporting at all — the
most severe silhouette for this exact bug. Chain: mixed online + till
sales, where the gap silently under-reports total contribution by exactly
the till-channel share. Organization: cross-brand reconciliation between
`Order`, `JournalEntry`, and `OrderEconomics` (the three ways this
repository already knows revenue, per `CLAUDE.md`'s own "click the number"
lens) would show a real, explainable discrepancy today, caused by this bug
— naming it here rather than leaving it to be found in a meeting.
**The absent collaborator** — with `finance` off, `OrderEconomics` is
never computed for any channel (already true, unchanged); with `pos` off,
there are no POS sales to miss in the first place.
**The second copy of the write** — restated as the reason this fix is
safe: `OrderEconomicsService`'s own upsert-by-`orderId` primary key already
makes a second `OrderStatusChanged` publish for the same order a no-op —
adding the missing publish call cannot double-count a sale that later also
transitions through `updateStatus()` for any reason, since there is only
one row per `orderId` regardless of how many times the event fires.
**The hundred-thousandth row** — `grossProfitToday()`'s read is bounded to
one shop-day, indexed on `Order.placedAt`/`locationId` exactly as
`AnalyticsService.summary()` already is; no new unbounded query.
**The reversal document** — unchanged: `OrderEconomics` already zeros
`revenue`/`cogs` on `RETURNED`, recomputed by the same
`FinanceListener`/`OrderEconomicsService` path this document extends to
POS, never a second reversal rule.
**The undo fan-out / The version stamp** — n/a: no new side effect chain.
**The erasure the ledger cannot obey** — n/a: `OrderEconomics` carries no
personal data beyond `orderId`, unchanged.
**The failure path** — a failed `computeForOrder()` call (e.g., a missing
`OrderItem.unitCost`) already logs and skips per `OrderEconomicsService`'s
own existing behavior; this document changes only which sales reach that
already-correct path, not the failure handling itself.

## Work orders

**WO-68.1 — the fix**: publish `DomainEvent.OrderStatusChanged` (or a
narrower, POS-specific signal `FinanceListener` also subscribes to, if the
team prefers not to imply POS sales "transition" into `DELIVERED`) from
`OrdersService.createFromPos()`'s existing transaction, so
`OrderEconomics` is computed for every POS sale exactly as it already is
for every delivered e-commerce order.
**WO-68.2 — `grossProfitToday(locationId)`** read, joining `Order` +
`OrderEconomics` for the shop-day, reusing `shopDayExpr` and the
`VOID_STATUSES` filter exactly as `AnalyticsService` already does.
**WO-68.3 — UI**: a per-transaction gross-profit column on the existing
POS shift/sales-history screen (gated by `inventory.view_cost`), plus a
day-total gross-profit tile on the admin dashboard, linking through to the
underlying `OrderEconomics` rows per the "click the number" rule.
**WO-68.4 — reconciliation test**: a spec proving `grossProfitToday()`'s
`dayTotal.revenue` matches `AnalyticsService.summary()`'s own daily
gross-sales figure for an identical set of orders — the concrete
enforcement of the "three ways this repository knows revenue must agree"
lens.

## Acceptance

- A completed POS sale produces exactly one `OrderEconomics` row, proven
  by a spec that currently fails against `main` (demonstrating the bug)
  and passes once WO-68.1 ships.
- `grossProfitToday()`'s day total, summed over all channels, matches
  `AnalyticsService.summary()`'s own gross-sales figure for the same
  orders and window.
- A returned POS sale zeroes its `OrderEconomics` row through the same
  existing `RETURNED` path, unchanged.
- The per-transaction cost/margin figures remain invisible to a caller
  lacking `inventory.view_cost`.

## Out of scope

Real-time (sub-poll) push delivery of the day-total tile — doc 58's own
`Out of scope` already names platform-wide push/WebSocket delivery as a
`DECISIONS.md`-level call this document does not make either; the tile
refreshes on the same short-interval poll pattern doc 58 already
establishes. A GL-level real-time P&L — `finance`'s own period-end
posting and close process is unchanged; this tile is a reporting
convenience over `OrderEconomics`, never a substitute for the ledger.
