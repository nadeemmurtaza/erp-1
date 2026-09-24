# 07g generate money integrity gl

Output of the `gen:07:money-integrity-gl` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Money integrity, double-entry and the closed period

## File

docs/erp-lenses/money-integrity-gl/07-money-integrity-gl.md

## Lenses

### The unwritten posting rule

**Question:** Before this feature ships, write the exact posting rule it triggers: the domain event, the Dr/Cr account codes, and the idempotency key AccountingService.findPostedEntry(source, sourceRef) will check. If the feature must never reach the ledger, say so explicitly and name what other report reconciles it instead.

**Grounding:** AccountingService.postEntry() (accounting.service.ts) is the only writer; PostingRulesSubscriber has exactly seven @OnDomainEvent handlers today; R15/accounting.prisma's own comment name five unbuilt journals (GRNI, BomProductionRunPosted, PayrollPosted, ShiftClosed, transfer in-transit); work-orders.service.ts complete() moves PRODUCTION_RECEIPT stock with no matching journal.

### Every column or none

**Question:** For every JournalLine this feature creates, name which of organizationId/retailBrandId/branchNodeId/costCentreId it sets and to what value - or state explicitly that the line is intentionally undimensioned and which report may therefore blend it across brands.

**Grounding:** JournalLine carries all four columns (accounting.prisma:185-188) but only onInterBranchTransferInvoiced (posting-rules.subscriber.ts) sets retailBrandId; the other six rules (sale, receipt, refund, supplier bill x2, shrinkage) set none; GlReportsService applies no scope narrowing.

### The period that already moved

**Question:** State what happens when this feature posts a fact whose own date falls inside a FiscalPeriod that is now CLOSED or LOCKED: does it silently land in today's open period the way every rule does now, and if so, what report lets someone later find that JournalEntry.date and the period it actually posted into disagree?

**Grounding:** AccountingService.resolveOpenPeriod() (accounting.service.ts:188) falls back to the most-recently-started OPEN period with no DB constraint tying JournalEntry.date to FiscalPeriod.startsOn/endsOn, and no prior-period-adjustment account or restatement trail exists in accounting.prisma.

## Absences

- No CostCentre model - JournalLine.costCentreId is a bare scalar with nowhere to originate a value from
- No draft/unposted journal state and no maker-checker - postEntry() creates a JournalEntry as POSTED the instant it runs
- No partial-refund model - Payment.refundAmount exists but nothing sets it to less than the full amount
- No prior-period-adjustment account, no restatement trail, and no DB constraint tying JournalEntry.date to its FiscalPeriod's range
- No FxRate table, no rate source, and no period-end revaluation for unrealised FX
- No GRNI clearing account, no BomProductionRunPosted, no PayrollPosted, no ShiftClosed journal - all unbuilt per R15

