# 153 — A fourth `PricingModel`: usage-based, anchored on a transaction fee, never a pile of per-unit meters

The owner's own starting proposal — a per-feature usage charge (per
product/month, per user/month, per email/month, "and so on for all other
features") plus 1% of every sale including COD and every payment method
— is a real, legitimate pricing shape (consumption-based SaaS pricing
with a GMV-percentage overlay, the same family Shopify and most modern
usage-billed platforms use) with three specific problems worth fixing
before it becomes doc 50's fourth `PricingModel`, and one direct
implementation dependency on doc 145 (this same batch) worth naming
explicitly rather than discovering later.

## What changed from the original proposal, and why

1. **Metering only *actions*, never *things stored at rest*.** Per-
   product/month punishes catalog size, not platform load or business
   value — a hardware store with 8,000 SKUs and modest revenue would pay
   far more than a boutique with 50 high-value SKUs and heavy revenue,
   exactly backwards from what a fair usage fee should track, and it
   creates a perverse incentive to under-catalogue. Products (and
   anything else that is a *count-at-rest* rather than a *consumed
   action*) sit behind a generous banded allowance instead of a strict
   per-unit multiplier. Emails, SMS, WhatsApp messages, and transactions
   — genuine consumed actions — remain metered per unit.
2. **One consolidated "messages sent" meter, not three.** A merchant
   cannot usually tell you, and does not care, whether a given
   notification left as email, SMS, or WhatsApp — billing them as three
   separate line items multiplies bill complexity for a distinction the
   merchant does not experience. Doc 33/101's own `NotificationChannel`
   registry already treats these as interchangeable channels for one
   message; billing follows the same shape.
3. **This is a fourth, optional tier alongside doc 50's existing three
   — never a replacement.** Doc 81 already commits this repository to a
   transparent, predictable flat-rate positioning specifically to
   differentiate from competitors who assemble bills from many small
   line items. A usage-based bill is real and useful for a merchant who
   wants zero/low upfront cost and accepts a variable total — it must
   never be the *only* option, or doc 81's own positioning becomes false
   for every merchant forced onto it.

## 1. `PlatformPlan` gains `USAGE_BASED`, alongside doc 50's existing three shapes

```prisma
// platform.prisma — additive, extending doc 50's own PricingModel enum
enum PricingModel { PER_SEAT  FLAT_MONTHLY  ONE_TIME_LICENSE  USAGE_BASED }

model PlatformPlan {
  // existing fields (doc 50) unchanged
  /// USAGE_BASED only. The anchor line item — a rate in basis points
  /// applied to every completed, non-reversed sale's grandTotal,
  /// regardless of tender (card, wallet, COD, cash) — the one figure
  /// most directly restating the owner's own "1% of each sale" input
  /// (100 bps = 1%; stored as bps so a future rate change, e.g. a
  /// graduated step-down at volume, is a data edit, never a new field).
  transactionFeeBps    Int?
  /// USAGE_BASED only. Per-unit rates for genuinely consumed actions.
  /// A JSON rate card — {"messages_sent": 100, "storage_gb": 500} in
  /// paisa-per-unit — never one column per metered dimension, so adding
  /// a new metered action later is a rate-card row, not a migration.
  usageRateCardMinor   Json?
  /// USAGE_BASED only. Banded allowances for count-at-rest dimensions
  /// (never metered per unit) — {"products": 1000} meaning the first
  /// 1,000 products are included free, with a flat step-up fee beyond it
  /// stored in the same rate card under a "_over_limit" key.
  includedAllowances   Json?
}
```

## 2. Metering is event-driven, reusing this repository's own transactional outbox — never a slow end-of-month aggregate scan

```ts
// A UsageMeter row per organization per metric per billing period,
// incremented by domain-event listeners exactly as every other
// event-driven side effect in this repository already works — never a
// nightly job that recomputes usage from scratch by scanning every
// Order/NotificationLog row at invoice time.
model UsageMeter {
  id             String   @id @default(cuid())
  organizationId String
  metric         String   // "transaction_fee_minor", "messages_sent", "products_count"
  periodStart    DateTime
  periodEnd      DateTime
  quantity       Int      @default(0)

  @@unique([organizationId, metric, periodStart])
}
```

```ts
@OnDomainEvent(DomainEvent.OrderStatusChanged)
async onOrderDelivered(payload: OrderStatusChangedPayload): Promise<void> {
  if (payload.toStatus !== 'DELIVERED') return;
  const feeMinor = Math.round(order.grandTotal * plan.transactionFeeBps / 10_000);
  await this.usageMeters.increment(order.organizationId, 'transaction_fee_minor', feeMinor);
}

@OnDomainEvent(DomainEvent.OrderStatusChanged)
async onOrderReturned(payload: OrderStatusChangedPayload): Promise<void> {
  if (payload.toStatus !== 'RETURNED') return;
  // Reverses the fee already metered for this order — the identical
  // "a return zeroes the revenue/cogs it originated" discipline
  // OrderEconomics (doc 68) already establishes, applied here to the
  // platform's own usage meter instead of a tenant's own P&L.
  await this.usageMeters.decrement(order.organizationId, 'transaction_fee_minor', originallyMeteredFeeMinor);
}
```

**This depends directly on doc 68's own finding, fixed in this same
document set: a POS sale is created straight at `DELIVERED` and, before
doc 68's own WO-68.1 fix, never publishes `OrderStatusChanged` at all.**
Without that fix already applied, every POS/till sale would silently
escape the 1% fee entirely while every e-commerce sale paid it — a real,
concrete revenue leak this pricing model would otherwise introduce
silently. This document treats doc 68's fix as a hard prerequisite, not
an unrelated nice-to-have.

## 3. Collection: COD and cash have no settlement to net against — this is doc 145's own mechanism, one level up

A card or wallet transaction fee could, in principle, be netted out of
the gateway's own settlement to this organization. A COD or cash sale has
no such settlement — the platform never touches that money, so the 1% fee
on it can only be **invoiced to the tenant and collected from them**,
identical in shape to how doc 145 already handles a tenant's own
customer who owes money with no automatic deduction path. **This pricing
model is, structurally, the platform's own accounts-receivable problem —
Newax's own AR from its tenants, rather than a tenant's AR from its
customers** — and should reuse doc 145's own `Invoice`/aging/dunning
design one level up (in `apps/platform`, doc 39's own control-plane
database, never mixed into a tenant's own isolated database, per doc
39's shared-infrastructure/isolated-data boundary) rather than inventing
a second billing/collections mechanism for the platform's own books.

```ts
// apps/platform — a monthly invoice, generated from the period's UsageMeter rows
async generateMonthlyInvoice(tenantId: string, period: BillingPeriod): Promise<PlatformInvoice> {
  const meters = await this.usageMeters.forPeriod(tenantId, period);
  const transactionFeeMinor = meters.get('transaction_fee_minor') ?? 0;
  const usageLines = computeUsageLines(meters, plan.usageRateCardMinor, plan.includedAllowances);
  // ... an ordinary invoice, dunned exactly as doc 145's own
  // DunningPolicy/ExpiringRecordSource registration already handles an
  // overdue Invoice — never a second collections mechanism.
}
```

## 4. A graduated rate, so growth is rewarded rather than punished forever

```ts
// transactionFeeBps as a single flat rate is the simplest starting
// shape; a real graduated table (e.g., 100 bps to Rs 5M/month GMV, 75
// bps beyond it) is a rate-card extension of the same JSON structure in
// §1 — a data change, never a schema change, once real volume data
// justifies tuning it. Not built speculatively here; named as the
// natural extension when a real merchant's volume makes it worth doing.
```

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: a billing mechanism over an existing
tenant relationship (doc 39's `PlatformTenant`), not a new actor.
**Whose rows, and which columns** — `UsageMeter`/`PlatformInvoice` live
in `apps/platform`'s own control-plane database, never inside a tenant's
own isolated database — the identical boundary doc 39 already draws for
every other platform-level concern.
**The threshold nobody approves alone** — changing a live tenant's own
`transactionFeeBps`/rate card is a real commercial change; gated by
`platform.billing.manage`, audited old/new value, distinct from ordinary
support access.
**The toxic pair** — n/a.
**Authority and blast radius** — a misconfigured rate card overcharging
every tenant on this plan is exactly the "worst value one can set before
anything notices" this repository's own "Authority and blast radius"
lens exists to force into the open — mitigated by requiring the same
create/approve split doc 145 already establishes for a credit-limit
change, applied here to a plan's own rate card.
**Audience is a capability, not an address** — a generated invoice
notifies the tenant's own billing contact through doc 39's existing
tenant-communication channel, never a hardcoded address.
**Request or record** — a `UsageMeter` increment is a RECORD (an
unconditional consequence of a real, already-happened sale, never
refusable); the resulting monthly `PlatformInvoice` is itself a REQUEST
for payment, refusable/disputable by the tenant before it is treated as
settled.
**The movement with no address** — n/a: no stock movement; every
`UsageMeter` row carries its own `organizationId` explicitly.
**Four hours down** — a metering-listener outage means some sales are
not immediately metered; the transactional outbox's own at-least-once
redelivery (doc 100) closes this gap on retry — never a permanently lost
usage record, since the underlying `OrderStatusChanged` event itself is
never lost.
**Click the number** — every invoice line item resolves to the exact
`UsageMeter` period and, for the transaction fee specifically, the exact
set of orders that produced it — a tenant disputing their bill can see
precisely which sales were counted, never an opaque total.
**The unwritten posting rule** — the transaction fee and usage charges
post to Newax's own revenue accounts in `apps/platform`'s own ledger
(if `apps/platform` runs one) or are tracked as accounts-receivable per
doc 145's own generalized mechanism — never posted into any tenant's own
chart of accounts, which this fee is not a part of.
**Every column or none / The period that already moved / The second
legal entity** — n/a beyond doc 39's own existing tenant-isolation
answer; Newax's own invoicing of a tenant is scoped to Newax's own legal
entity, never the tenant's.
**Dry run before live** — a "what would this tenant's bill look like this
month so far" preview reads the same `UsageMeter` rows the real invoice
generation reads, with no write — the identical pattern doc 133's own
`preview()`/`apply()` convention names.
**Three silhouettes** — this pricing model is meaningful only at doc 39's
own shared-hosting scale (many tenants, one control plane) — a
single-tenant Solo/Chain deployment has no "platform" billing anyone else
to meter usage-based fees for.
**The absent collaborator** — a tenant on `FLAT_MONTHLY`/`PER_SEAT`/
`ONE_TIME_LICENSE` never has `UsageMeter` rows created for them at all —
this mechanism is entirely additive to doc 50's own existing three
shapes, never a forced migration.
**The second copy of the write** — `@@unique([organizationId, metric,
periodStart])` makes a re-run of the metering listener (a redelivered
event) an increment on the same row, never a duplicate period; the
`onOrderReturned()` reversal is itself keyed to the specific order's own
already-metered amount, never a blind "subtract 1% of the return total"
that could double-reverse a partial return.
**The hundred-thousandth row** — one `UsageMeter` row per organization
per metric per period (a handful of rows per tenant per month), never
one row per event — the increment happens in place, bounded regardless
of transaction volume.
**The reversal document** — restated as §2's own central design: a
`RETURNED` order reverses its own already-metered transaction fee,
naming the specific order it corrects, never a blanket month-end
adjustment.
**The undo fan-out** — reversing a metered fee does not itself reverse
an already-issued invoice line if the invoice has already been sent;
doc 145's own `CreditNote` mechanism (this same batch) is the correct
tool for crediting an already-invoiced, later-reversed fee — reused, not
reinvented.
**The version stamp** — a `transactionFeeBps`/rate-card change applies to
usage metered after the change; an already-closed billing period's own
`UsageMeter` rows and the invoice generated from them are never
recalculated under a new rate.
**The erasure the ledger cannot obey** — n/a: usage meters and platform
invoices carry no personal data of the tenant's own end customers, only
aggregate counts and monetary totals.
**The failure path** — a metering-listener failure that cannot recover
(a malformed event payload) is logged and surfaced to Newax's own
operations queue, never silently under-billing a tenant with no record
that anything was missed.

## Work orders

**WO-153.1 (blocked on doc 68's own WO-68.1 shipping first)** — schema:
`PricingModel.USAGE_BASED`, `PlatformPlan.transactionFeeBps`/
`usageRateCardMinor`/`includedAllowances`, `UsageMeter`, forward-only
migration in `apps/platform`'s own schema.
**WO-153.2 — metering listeners**: transaction-fee increment/reversal on
`OrderStatusChanged` (`DELIVERED`/`RETURNED`), a consolidated
"messages_sent" increment on doc 33/101's own `NotificationChannel.send()`
call sites, a periodic snapshot of banded allowances (product count, seat
count via doc 50's own existing `countBillableSeats()`).
**WO-153.3 — `generateMonthlyInvoice()`**, reusing doc 145's own
`Invoice`/aging/dunning design pattern inside `apps/platform`'s own
database, never a second collections mechanism.
**WO-153.4 — permissions**: `platform.billing.manage` (create),
`platform.billing.approve` (rate-card changes above a threshold).
**WO-153.5 — UI**: a tenant-facing "this month so far" usage dashboard
(the dry-run preview from the scope lenses above), an admin rate-card
editor.

## Acceptance

- A tenant on `FLAT_MONTHLY`/`PER_SEAT`/`ONE_TIME_LICENSE` accrues zero
  `UsageMeter` rows.
- Every POS/till sale is metered identically to an e-commerce sale,
  proven by a spec — the direct test of doc 68's own fix being a real
  prerequisite, not an assumption.
- A `RETURNED` order's own previously-metered transaction fee is reversed
  by exactly its own original amount, never more, never less, proven by a
  spec.
- A tenant's own "this month so far" preview and their eventual invoice
  total agree exactly, proven by a spec reading both from the same
  `UsageMeter` rows.

## Out of scope

A graduated/volume-tiered rate table — named in §4 as the natural next
step, not built speculatively ahead of real tenant volume data to tune
it against. Netting the transaction fee directly out of a card/wallet
gateway's own settlement rather than invoicing it — a real future
optimization for the tenders where it's technically possible, not built
in this first pass, which invoices uniformly across every tender type
for one consistent collection path.
