# 07. Money integrity, double-entry and the closed period

At corporate scale a feature that moves value is not "done" when stock or
status changes — it is done when `AccountingService.postEntry()` has a named
Dr/Cr rule for it, that rule's lines say which brand/branch/cost-centre they
belong to, and someone has stated what happens when the fact's own date lands
in a period that has since closed. Today only seven such rules exist, only
one of them dimensions its lines by brand, and a closed period is not
enforced — it is silently rerouted around. A narrow build repeats all three
gaps by default.

## Lens: The unwritten posting rule

**Question:** Before this feature ships, write the exact posting rule it
triggers: the domain event, the Dr/Cr account codes, and the idempotency key
`AccountingService.findPostedEntry(source, sourceRef)` will check. If the
feature must never reach the ledger, say so explicitly and name what other
report reconciles it instead.

**Why:** `AccountingService.postEntry()` (accounting.service.ts) is the only
writer, and its only caller is `PostingRulesSubscriber` — exactly seven
`@OnDomainEvent` handlers exist today (order.placed, payment.succeeded,
payment.refunded, supplier_bill.raised, supplier_bill.paid,
stock_variance.recorded, transfers.inter_branch_transfer_invoiced). The
module's own schema comment (accounting.prisma) and R15 name five journals
that are NOT built: GRNI, `BomProductionRunPosted`, `PayrollPosted`,
`ShiftClosed`, and transfer dispatch/receipt in-transit. `work-orders.service
.ts`'s `complete()` already moves `PRODUCTION_RECEIPT` stock with no matching
journal — a real gap, not a hypothetical one.

**Worked example:** Narrow slice: a "finish a production run" feature calls
`work-orders.service.ts complete()`, which moves stock into finished goods
and marks the work order DONE. Complete capability: completion also fires a
`production.work_order_completed` event consumed by a new posting rule that
debits Finished Goods and credits WIP/Raw Materials at the BOM's costed
value, idempotent on `(source, workOrderId)`, matching the shape of the six
existing rules including the missing-account guard log.

**Done test:** The PR adds an `@OnDomainEvent` handler in
`posting-rules.subscriber.ts` that calls `findPostedEntry` before
`postEntry`, and a spec (alongside `posting-rules.subscriber.spec.ts`)
asserting the lines it builds balance and post exactly once under
redelivery.

**Breaks without:** Physical stock quantity moves (visible in
`VariantLocationStock`) while its value never reaches `JournalLine` — the
balance sheet's Inventory total and the actual stock valuation diverge
permanently, and the gap widens every period until someone reconstructs it
by hand outside the ledger.

## Lens: Every column or none

**Question:** For every `JournalLine` this feature creates, name which of
`organizationId` / `retailBrandId` / `branchNodeId` / `costCentreId` it sets
and to what value — or state explicitly that the line is intentionally
undimensioned and which report may therefore blend it across brands.

**Why:** `JournalLine` already carries all four columns
(accounting.prisma:185-188), but of the seven posting rules only
`onInterBranchTransferInvoiced` sets `retailBrandId`
(posting-rules.subscriber.ts) — the sale, receipt, refund, supplier-bill and
shrinkage rules set none. This is not the intercompany-elimination question
(that is `counterpartyBrandId` and consolidation netting, already its own
lens); it is that ordinary, single-brand postings carry no brand or branch
dimension at all, so `GlReportsService`'s five reports apply no scope
narrowing today.

**Worked example:** Narrow slice: a "branch daily sales summary" report
queries `JournalLine` filtered by `retailBrandId` on the Sales Revenue
account. Complete capability: `onOrderPlaced` is changed to set
`retailBrandId` (and `branchNodeId`, when the order carries a `locationId`)
on every line it creates, so the filtered query returns the branch's real
total instead of zero rows or the whole deployment's total.

**Done test:** `grep -n "retailBrandId" apps/api/src/modules/money/accounting/posting-rules.subscriber.ts`
shows the new rule setting it; a query summing `baseAmountMinor` on the
Sales Revenue account `WHERE "retailBrandId" = X` is nonzero for brand X and
strictly less than the deployment-wide sum once a second brand has posted.

**Breaks without:** A brand-scoped or branch-scoped P&L returns either zero
(nothing sets the column, `scopeFilterFor()` matches nothing) or the whole
database's total (no filter applied) — R15's own promise that "org / brand /
branch P&L is the same query three times" stays unmet, and nobody can trust
a single brand's reported profit at Org tier.

## Lens: The period that already moved

**Question:** State what happens when this feature posts a fact whose own
date falls inside a `FiscalPeriod` that is now CLOSED or LOCKED: does it
silently land in today's open period the way every rule does now, and if
so, what report lets someone later find that `JournalEntry.date` and the
period it actually posted into disagree?

**Why:** `AccountingService.resolveOpenPeriod()` (accounting.service.ts:188)
finds the OPEN period containing the date, and when none does, falls back to
"the most-recently-started OPEN period" — not the nearest one, not a flagged
exception, just whichever is open. There is no DB constraint tying
`JournalEntry.date` to `FiscalPeriod.startsOn/endsOn`, and no
prior-period-adjustment account or restatement trail exists anywhere in the
schema.

**Worked example:** Narrow slice: a "record a backdated stock count
variance" feature lets a warehouse manager post a discrepancy discovered
today for a count that happened last month, whose period is already CLOSED.
Complete capability: the posting rule (or a companion report) records the
mismatch — the fact's own date versus the period it actually posted into —
on a screen listing every `JournalEntry` whose `date` falls outside its
own `FiscalPeriod`'s range, so month-end close can see and disclose the
restatement instead of it being invisible in the trial balance.

**Done test:** The PR ships a report backed by exactly this query —
`SELECT je.id FROM "JournalEntry" je JOIN "FiscalPeriod" fp ON je."periodId" = fp.id
WHERE je.date < fp."startsOn" OR je.date >= fp."endsOn"` — not merely a fix
at the one call site that triggered the investigation.

**Breaks without:** At 100+ locations across timezones with a monthly close
cadence, backdated corrections land in whatever period happens to be open
when the fact is processed, not the period the business believes it closed.
An auditor comparing last month's signed-off trial balance to today's ledger
finds it has silently changed, with no report naming which entries moved or
why.

## Not modelled yet

- No `CostCentre` model — `JournalLine.costCentreId` is a bare scalar with
  nowhere to originate a value from.
- No draft or unposted journal state and no maker-checker: `postEntry()`
  creates a `JournalEntry` as `POSTED` the instant it runs; there is no
  approval step before a fact becomes permanent.
- No partial-refund model: `Payment.refundAmount` exists but nothing sets it
  to less than the full amount, so `onPaymentRefunded` can only ever reverse
  in full.
- No prior-period-adjustment account, no restatement trail, and no DB
  constraint tying `JournalEntry.date` to its `FiscalPeriod`'s range.
- No `FxRate` table, no rate source, and no period-end revaluation —
  unrealised FX is a ruling (R16), not code.
- No GRNI clearing account, no `BomProductionRunPosted`, no
  `PayrollPosted`, no `ShiftClosed` journal — R15 names all five as unbuilt.

## Hardening record

**Kept (3):**

- **The unwritten posting rule** — demands a named domain event, Dr/Cr
  account codes and the `findPostedEntry` idempotency key before a feature
  ships; verified against a real gap (`work-orders.service.ts complete()`
  moves `PRODUCTION_RECEIPT` stock via `inventory.move` with no posting
  rule). Distinct from the five CLAUDE.md lenses: it is not "the transaction
  start to finish" (that's the workflow), it is the specific ledger artifact
  that workflow must produce.
- **Every column or none** — demands naming which of the four `JournalLine`
  dimension columns a new rule sets, verified against the real fact that 6 of
  7 posting rules set none. Distinct from "the policy and rules layer" lens
  and from the intercompany/`counterpartyBrandId` lens (WO-20.6 R17): this is
  ordinary single-brand postings carrying no scope dimension at all, not
  consolidation netting.
- **The period that already moved** — demands a stated answer for a fact
  dated inside a CLOSED/LOCKED period, verified against
  `resolveOpenPeriod()`'s actual fallback (most-recently-started OPEN
  period, not the nearest one) and the absence of any DB constraint or
  restatement trail. Distinct from "day two operations"/backdating lenses
  elsewhere: this one is scoped to the GL specifically — the period a
  `JournalEntry` posts into versus the period its own date belongs to.

**Killed:** none — all three lenses cite real, currently-true gaps
(confirmed by reading `accounting.service.ts`, `posting-rules.subscriber.ts`,
`accounting.prisma`, and `work-orders.service.ts`), demand a specific
artifact rather than a yes/no, and are not restatements of the five CLAUDE.md
lenses or the thirty WO-22 lenses.

**Corrections:** none. Every citation verified as written:
- `AccountingService.postEntry()` / `findPostedEntry()` / `resolveOpenPeriod()`
  — all three methods exist in `accounting.service.ts` at the cited behavior.
- Seven `@OnDomainEvent` handlers in `posting-rules.subscriber.ts`
  (OrderPlaced, PaymentSucceeded, PaymentRefunded, SupplierBillRaised,
  SupplierBillPaid, StockVarianceRecorded, InterBranchTransferInvoiced) —
  count and names match; only `onInterBranchTransferInvoiced` sets
  `retailBrandId`, confirmed.
- `JournalLine`'s `organizationId`/`retailBrandId`/`branchNodeId`/
  `costCentreId` columns — present at accounting.prisma:185-188, exactly as
  cited.
- `work-orders.service.ts complete()` — exists in
  `apps/api/src/modules/supply-chain/production/work-orders.service.ts` (the doc cites it
  by filename only, no directory, so no path correction needed); it calls
  `this.inventory.move(..., reason: 'PRODUCTION_RECEIPT')` inside a
  transaction with no accompanying journal call, confirming the gap.
- `FiscalPeriod.startsOn`/`endsOn` and `FiscalPeriodStatus` — present in
  accounting.prisma as cited, supporting the "period that already moved"
  done-test query.
