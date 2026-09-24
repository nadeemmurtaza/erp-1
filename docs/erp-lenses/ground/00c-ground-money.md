# 00c. Ground: Money, documents and the ledger

Reconnaissance report from the `ground:money` agent of workflow `wf_0cc0602e-66b`, recorded verbatim.
It is the raw input to [00-uagent.md](./00-uagent.md), which merges all six into one map. Read this one when you
want the unsummarised detail for this area.

## Facts

HOW A JOURNAL ENTRY COMES INTO EXISTENCE
Only one writer: `AccountingService.postEntry()` in `apps/api/src/modules/accounting/accounting.service.ts`. Its only production caller is `PostingRulesSubscriber` (`posting-rules.subscriber.ts`) plus `FiscalPeriodsService.closeFiscalYear()`. There is no manual-journal endpoint — `fiscal-periods.controller.ts`, `gl-reports.controller.ts` and `consolidation.controller.ts` are the only accounting controllers, and none posts an entry.

Exactly seven posting rules exist, all `@OnDomainEvent` subscribers (at-least-once outbox delivery via `apps/api/src/core/events/outbox.dispatcher.ts`, `MAX_ATTEMPTS = 8`), each idempotent via `AccountingService.findPostedEntry(source, sourceRef)`:
- `order.placed` → Dr 1100 AR · Cr 4000 Revenue · Cr 2100 Tax Payable · Dr 5000 COGS · Cr 1200 Inventory
- `payment.succeeded` → Dr 1000 Cash & Bank · Cr 1100 AR
- `payment.refunded` → `reverseEntry()` on both the receipt and the sale (full reversal only; no partial-refund path)
- `supplier_bill.raised` → Dr 1200 Inventory · Cr 2200 AP at `baseAmountMinor`
- `supplier_bill.paid` → Dr AP at booked rate · Cr Bank at settlement rate · 4900/5900 realised FX gain/loss
- `stock_variance.recorded` → Dr 5100 Shrinkage · Cr 1200 Inventory
- `transfers.inter_branch_transfer_invoiced` → Dr AR(source brand) · Cr 4100 Intercompany Revenue · Dr 5050 Intercompany COGS · Cr AP(dest brand)
Plus `source: 'accounting.year_end_close'` from `closeFiscalYear()`.
R15's table names five more journals that are NOT built: `GoodsReceived`/GRNI (the subscriber's own comment says "No Goods-Received-Not-Invoiced clearing account yet"), `BomProductionRunPosted`, `PayrollPosted`, `ShiftClosed` (no shift-closed domain event exists at all), and transfer dispatch/receipt in-transit journals.

Three invariants are DB triggers in `apps/api/prisma/schema/migrations/20260917070552_add_accounting_ledger/migration.sql`: `journal_line_balance_check` (DEFERRABLE INITIALLY DEFERRED constraint trigger, `check_journal_entry_balanced()`), `journal_line_immutable` (`forbid_journal_line_mutation()` — no UPDATE or DELETE ever), and `forbid_journal_entry_mutation()` (only POSTED→REVERSED, every other column compared unchanged).

The `accounting` module is behind the `MODULES` env allowlist (`apps/api/src/modules/modules.registry.ts` line 72, `FEATURE_MODULES`) — off unless listed. Permissions: `accounting.view`, `accounting.manage_periods` in `packages/shared/src/permissions.ts`.

FISCALPERIOD AND PERIOD ENFORCEMENT
`FiscalPeriod` (`accounting.prisma`) has `status OPEN|CLOSED|LOCKED`. Nothing rejects a posting dated into a closed period. `AccountingService.resolveOpenPeriod(at)` finds the OPEN period containing `at`, else falls back to the most-recently-started OPEN period, else throws `'No open fiscal period to post into.'`. So a CLOSED/LOCKED period is unreachable only because it is never selected — the entry silently reroutes to today's open period while keeping `JournalEntry.date` at the original fact time. There is no DB constraint tying `JournalEntry.date` to `FiscalPeriod.startsOn/endsOn`.
`FiscalPeriodsService` (`fiscal-periods.service.ts`): `closePeriod` (OPEN→CLOSED), `reopenPeriod` (CLOSED→OPEN only), `lockPeriod` (requires CLOSED; permanent), `closeFiscalYear` (requires no period still OPEN; sweeps INCOME/EXPENSE to 3000 Retained Earnings and sets `FiscalYear.closedAt` in one transaction). `prisma/seed.ts` seeds `CHART_OF_ACCOUNTS` but NO FiscalYear and NO FiscalPeriod, and nothing auto-creates them.

NUMBER SERIES AND GAP PREVENTION
Two mechanisms. (a) Counter row, `INSERT … ON CONFLICT DO UPDATE … RETURNING`, inside the same transaction: `JournalEntryNumberCounter` (keyed by `fiscalYearId`, `nextJournalNumber()`), `OrderNumberCounter`, `StitchingOrderNumberCounter`, `StitchingJobNumberCounter`, `WorkOrderNumberCounter`, `TransferNumberCounter`, `InterBranchInvoiceNumberCounter` — all keyed by calendar `year` except the journal one. (b) `pg_advisory_xact_lock` + MAX scan: PurchaseOrder, GoodsReceipt (`purchasing.service.ts` lines 38, 58), StockCount (`stock-count.service.ts:22`), Invoice and Quote (`tradingpartners/invoice.service.ts:28`, `quote.service.ts:24`).
Only `JournalEntry.number` is claimed genuinely gapless (counter increments in the posting transaction). Every other series accepts gaps on rollback — `orders.service.ts`'s own comment and R6. Prefixes come from `documentPrefix()` (`apps/api/src/core/settings/document-prefix.ts`, keys: order, purchaseOrder, goodsReceipt, stitchingOrder, stitchingJob, stockCount, journalEntry, invoice, quote, stockTransfer, interBranchInvoice). Node-prefixing via `documentNumber()` (`document-number.ts`) applies to all except `JournalEntry.number`, which is deliberately never node-prefixed.

COST CAPTURE
`ProductVariant.costPrice` (`catalog.prisma:183`) is a running weighted average, updated only in `purchasing.service.ts:384` via `weightedAverageCost(stockBefore, variant.costPrice, item.quantity, item.landedUnitCost)` on goods receipt. `GoodsReceiptItem.landedUnitCost` absorbs `GoodsReceipt.freightCost/dutyCost/otherCost`. `OrderItem.unitCost` snapshots `costPrice` at placement (`orders.service.ts:477, 504`); COGS in the sale journal is `sum(unitCost * quantity)`. `StockMovement.unitCost` (`inventory.prisma:45`) records it per movement. `StockTransferLine.unitCost` snapshots at dispatch. There is no FIFO, LIFO, standard-cost or per-location costing — one global weighted average per variant, no location or brand dimension.

MULTI-CURRENCY
The R16 triple exists on `SupplierBill` (`amount`, `currency`, `fxRateScaled`, `baseAmountMinor`) and on `JournalLine` (`currency`, `fxRateScaled` default 1000000, `baseAmountMinor`). `convertToBase(amountMinor, fxRateScaled)` in `packages/shared/src/pricing.ts:260` is the single rounding rule. Realised FX posts to 4900/5900 on `supplier_bill.paid`. Base currency is `BRAND.locale.currency` (`@newax/shared`), a single compile-time constant. `debitMinor`/`creditMinor` are ALWAYS base currency. `Order.currency`, `Payment.currency`, `SupplierBill.currency` all default to the literal `"PKR"` in the schema. There is no FxRate table, no rate source, no period-end revaluation, no unrealised FX — R16 asks for it; nothing implements it. `Invoice`/`Quote` (`invoicing.prisma`) carry `currency` but no fxRateScaled and post nothing to the ledger.

CONSOLIDATION
`ConsolidationService` (`consolidation.service.ts`) nets `JournalLine` rows where `account.isIntercompany` and both `retailBrandId` and `counterpartyBrandId` are set, eliminating `min(|forward|,|reverse|)` from group P&L; `unmatchedIntercompany()` is R17's exception report. It explicitly does not adjust the balance sheet for unrealised intercompany profit. Only `order.placed`'s AR line carries `contactId`; sale Revenue/COGS/Inventory/Tax lines carry NO `retailBrandId`, `branchNodeId`, `organizationId` or `costCentreId` at all. There is no CostCentre model anywhere.

REPORTS
`GlReportsService`: `trialBalance`, `profitAndLoss`, `balanceSheet`, `cashFlow`, `agedReceivables`, `agedPayables` (FIFO match in `aging.ts`).

## Where a narrow build goes wrong here

- Brand/branch dimensions are written on almost nothing. Only the inter-brand transfer rule sets `retailBrandId`; the sale, receipt, supplier-bill and shrinkage rules set none. R15's promise that "org / brand / branch P&L is the same query three times" is not achievable today — a narrow build that adds a dimension filter to `GlReportsService` will return empty or whole-database numbers, not per-brand ones. `organizationId`, `branchNodeId` and `costCentreId` are never populated by any posting rule, and there is no CostCentre model.
- There is one chart of accounts, globally unique on `Account.code`, with thirteen seeded accounts and no scope column. A group with several brands cannot give a brand its own account, its own numbering convention, or a separate legal-entity ledger. `JournalEntry.number` is a single sequence per FiscalYear across the whole database and is deliberately never node-prefixed — several brands' statutory journals would interleave in one series.
- Nothing auto-creates a FiscalYear or FiscalPeriod (`prisma/seed.ts` seeds only accounts). On a fresh deployment with `accounting` enabled, every posting rule throws `'No open fiscal period to post into.'`, the outbox retries eight times and gives up — facts are lost silently with only a log line. Same failure mode any time the last OPEN period is closed.
- A closed period does not reject a posting; it reroutes it. `resolveOpenPeriod()` falls back to the most-recently-started OPEN period regardless of how far the fact's `date` is from it, so a backdated entry lands in an unrelated period with no flag, no prior-period-adjustment account and no restatement trail. A narrow build that adds a "post into period X" UI will find no enforcement layer to hook into.
- Cost is a single global weighted average on `ProductVariant.costPrice`, updated only by goods receipt, with no location, brand or lot dimension and no FIFO/standard-cost option. `StockTransfer` moving stock between brands at that average is the only transfer price available (R12 fixes it at cost, `SettlementMode.INTERNAL_PL` is declared but derived nowhere), so any markup, transfer-pricing policy or unrealised-profit elimination has no field to hang on.
- Multi-currency is half-built in one direction only. There is no FxRate table or rate source; `fxRateScaled` is supplied by the caller. Only supplier bills carry a rate. Sales, `Invoice`, `Quote`, `InterBranchInvoice` and `Payment` are base-currency-only (schema defaults are the literal `"PKR"`), base currency itself is a compile-time `BRAND.locale.currency` constant so one deployment cannot serve two functional currencies, and period-end revaluation / unrealised FX does not exist.
- Several documents a statutory audit needs do not exist: no CreditNote or DebitNote, no payment terms, no credit limits, no customer statements or dunning, no AP payment run, no per-payment row against a SupplierBill (idempotency keys on `${billId}:${paidAt}`), and no GRNI account — so goods received but not invoiced sit unrecorded until the bill arrives. `Invoice`/`Quote` in `invoicing.prisma` are a trading-partner MVP that posts nothing to the ledger; the R18 `invoicing` module is unbuilt.
- No audit dimension on the entry itself: `JournalEntry` has no `postedByUserId` or actor field, and no approval/draft state — an entry is POSTED the instant it is created. There is no unposted/draft journal, no maker-checker, and no accrual, prepayment, depreciation, payroll or period-end adjustment mechanism of any kind.
