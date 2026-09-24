# 151 — Layby and installment sales: a real gap in this market, a variant of a pattern this repository already has twice

Checked against `orders.prisma`/`payments.prisma`: no model exists for a
sale where the customer pays in scheduled parts before (layby) or after
(installment/BNPL-style) receiving goods. This is a genuinely common
pattern in this market specifically — a layby ("book" a garment, pay in
instalments, collect once paid in full) is a routine transaction type
this repository's own POS has no way to represent today. This document
scopes it as a variant of two mechanisms this repository already has:
doc 63's payment-schedule shape (from doc 145's own `paymentTermDays`)
generalized to multiple instalments, and the existing `Payment` model's
own multi-tender-per-order capability.

## 1. A layby/instalment plan is a schedule of expected payments against one order, fulfilment gated on completion

```prisma
enum InstalmentPlanType { LAYBY  INSTALMENT }  // LAYBY: goods held until paid in full. INSTALMENT: goods released now, paid off over time.
enum InstalmentPlanStatus { ACTIVE  COMPLETED  DEFAULTED  CANCELLED }

model InstalmentPlan {
  id           String   @id @default(cuid())
  orderId      String   @unique
  type         InstalmentPlanType
  totalMinor   Int      // snapshotted from the order's own grandTotal
  depositMinor Int      @default(0)
  status       InstalmentPlanStatus @default(ACTIVE)
  createdAt    DateTime @default(now())

  schedule InstalmentScheduleLine[]
  payments InstalmentPayment[]
}

model InstalmentScheduleLine {
  id           String   @id @default(cuid())
  planId       String
  dueDate      DateTime
  amountMinor  Int

  plan InstalmentPlan @relation(fields: [planId], references: [id])

  @@index([planId, dueDate])
}

/// One row per actual payment received — never assumed to match the
/// schedule exactly; a customer paying early, late, or a different
/// amount than scheduled is normal, and the schedule is a plan, not a
/// constraint on what Payment rows can exist.
model InstalmentPayment {
  id        String   @id @default(cuid())
  planId    String
  paymentId String   // the existing Payment row this instalment created
  receivedAt DateTime @default(now())

  plan    InstalmentPlan @relation(fields: [planId], references: [id])
  payment Payment        @relation(fields: [paymentId], references: [id])
}
```

## 2. Fulfilment gating is the one real difference between LAYBY and INSTALMENT, and the one place this touches the order lifecycle

```ts
async recordInstalmentPayment(planId: string, amountMinor: number, tender: PaymentMethod): Promise<void> {
  // Creates an ordinary Payment row through the EXISTING payment path —
  // never a second payment-recording mechanism — then an
  // InstalmentPayment linking row.
  // When cumulative payments === plan.totalMinor: status -> COMPLETED,
  // and for type = LAYBY specifically, this is the FIRST moment
  // OrdersService's own existing ALLOWED_TRANSITIONS may move the order
  // past PENDING toward fulfilment — a layby order is deliberately held
  // at a pre-fulfilment status until paid in full, doc 106's own
  // transition-table discipline applied to a new, real gating condition
  // rather than a new state machine.
}
```

An `INSTALMENT` plan places no such gate — goods release immediately
(the order proceeds through its own ordinary status transitions
unaffected), and the schedule exists purely to track what is still owed,
feeding doc 145's own AR aging exactly as any other on-account balance
would.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: no new actor; every payment is
recorded by an authenticated `User` (a cashier) or the customer's own
portal session, identical to any ordinary `Payment`.
**Whose rows, and which columns** — `InstalmentPlan` inherits its own
`Order`'s existing `organizationId`/`locationId` scoping.
**The threshold nobody approves alone** — cancelling a `LAYBY` plan after
a deposit has been paid (does the customer forfeit the deposit, per this
client's own stated policy?) requires `pos.instalments.cancel`, distinct
from ordinary payment recording — a real, client-configurable policy
(a `Setting`, per this repository's own rows-over-constants discipline),
never a hardcoded forfeiture rule.
**The toxic pair** — n/a.
**Authority and blast radius** — who may mark a plan `DEFAULTED` (writing
off an unpaid balance, or triggering a restocking of held `LAYBY` goods)
is gated by `pos.instalments.default`, audited old/new status.
**Audience is a capability, not an address** — an upcoming or overdue
instalment due date registers against doc 54's own `ExpiringRecordSource`
watcher (the identical mechanism doc 145's own dunning already reuses),
notifying the customer through their own configured channel — never a
new reminder scheduler.
**Request or record** — recording an instalment payment is a REQUEST
(refusable — a payment cannot exceed the remaining balance without an
explicit overpayment/change-due path, per this repository's own existing
cash-tender handling); once recorded, the `Payment`/`InstalmentPayment`
pair is a RECORD, identical to any other completed tender.
**The movement with no address** — a `LAYBY` order's own stock is
reserved (not decremented) until paid in full — reservation itself is
this document's own real design question, answered deliberately: stock
is decremented through the ordinary `InventoryService.move()` call only
at the moment the plan reaches `COMPLETED` and fulfilment actually
proceeds, never held as a separate "reserved" ledger duplicating
`VariantLocationStock` — an unpaid layby simply leaves stock available
for another sale, matching how a real till operator would actually treat
unpaid held goods (a real, deliberate trade-off named here rather than
silently assumed).
**Four hours down** — a layby deposit taken during an outage is recorded
on paper and entered once systems return, the identical manual-fallback-
then-reconciliation answer every other physical-event document in this
repository already gives.
**Click the number** — a plan's own detail screen shows every scheduled
line and every actual payment against it, side by side, never a single
opaque "40% paid" figure with no drill-down.
**The unwritten posting rule** — an instalment payment posts exactly as
an ordinary `Payment` already does (Dr Cash/Bank, Cr the order's own
existing revenue/AR recognition) — no new posting rule; `INSTALMENT`
type's remaining balance is simply an ordinary AR balance, feeding doc
145's own aging unchanged.
**Every column or none / The period that already moved / The second
legal entity** — n/a beyond what `Payment`'s own existing posting answer
already states.
**Dry run before live** — a "what would this instalment schedule look
like" preview (e.g., splitting a total into N equal parts by date) is a
pure function with no write, called before a plan is actually created.
**Three silhouettes** — Solo: a real, common pattern even at this scale
(a boutique doing layby on wedding orders). Chain: consistent policy
(deposit %, default handling) across branches via the `Setting` named
above. Organization: cross-brand instalment volume, `organizationId`-
scoped exactly as everything else.
**The absent collaborator** — with this module off, every sale is
immediate-tender-in-full, today's exact behavior.
**The second copy of the write** — a retried instalment-payment call is
subject to the identical idempotency the underlying `Payment` creation
path already guarantees; this document introduces no second mechanism.
**The hundred-thousandth row** — `InstalmentScheduleLine`/`Payment` are
bounded per plan (a handful of lines each), never unbounded.
**The reversal document** — a refunded instalment payment reverses
through the identical `Payment` refund path already built (doc 24's own
observed partial-refund gap, if still open, applies identically here —
not reopened by this document, only inherited).
**The undo fan-out** — marking a `LAYBY` plan `DEFAULTED` does not
automatically restock anything, since stock was never separately reserved
(per "The movement with no address" above) — there is nothing to undo on
the inventory side, only the plan's own status.
**The version stamp** — a plan's own schedule is fixed at creation;
renegotiating a payment plan creates a new schedule (or explicitly edits
future, unpaid lines only) — past `InstalmentPayment` rows are never
rewritten.
**The erasure the ledger cannot obey** — n/a beyond what `Order`/`Payment`
already state for the customer they belong to.
**The failure path** — an instalment payment that would overpay the
remaining balance is refused (or explicitly recorded as an overpayment
with change due, per the till's own existing cash-tender rule) — never
silently accepted as a mismatched, unreconciled amount.

## Work orders

**WO-151.1 — schema**: `InstalmentPlan`, `InstalmentScheduleLine`,
`InstalmentPayment`, enums, forward-only migration.
**WO-151.2 — `InstalmentPlanService`**: `create()`, `recordInstalmentPayment()`,
`cancel()`, `markDefaulted()` — every payment routed through the existing
`Payment`-creation path, never a parallel one.
**WO-151.3 — fulfilment gate**: `LAYBY`'s own `COMPLETED` transition as
the trigger for the order's own first real status advance, per doc 106's
own transition-table discipline.
**WO-151.4 — the deposit-forfeiture `Setting`**, and permissions:
`pos.instalments.cancel`, `pos.instalments.default`.
**WO-151.5 — UI**: a layby/instalment entry on the POS till, a plan
detail/schedule screen, doc 54-registered due-date reminders.

## Acceptance

- A `LAYBY` order never advances past its held pre-fulfilment status
  until its plan reaches `COMPLETED`, proven by a spec.
- An `INSTALMENT` order fulfils immediately regardless of plan status.
- A plan's remaining balance always equals `totalMinor` minus the sum of
  its own `InstalmentPayment`-linked `Payment.amount`, proven by a spec.
- An overpaying instalment call is refused or explicitly recorded as
  change due, never silently mismatched.

## Out of scope

Interest or late-fee calculation on overdue instalments — a real,
client/jurisdiction-specific policy this document does not invent; if a
client needs it, it is a `Setting`-driven fee schedule scoped separately,
following the identical rows-over-constants discipline this document
already applies to deposit forfeiture.
