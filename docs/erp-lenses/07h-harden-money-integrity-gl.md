# 07h. Hardening record: Money integrity, double-entry and the closed period

Adversarial review of [07-money-integrity-gl.md](07-money-integrity-gl.md) by the `harden:07:money-integrity-gl` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The unwritten posting rule  — strong

**Question:** Write the exact posting rule a feature triggers (domain event, Dr/Cr codes, idempotency key), or state the feature never reaches the ledger.

**Verified against:** AccountingService.postEntry()/findPostedEntry() in accounting.service.ts; PostingRulesSubscriber's 7 @OnDomainEvent handlers; work-orders.service.ts complete() moving PRODUCTION_RECEIPT stock via inventory.move() with no matching journal rule -- verified as a real, current gap.

### Every column or none  — strong

**Question:** For every JournalLine a feature creates, name which of organizationId/retailBrandId/branchNodeId/costCentreId it sets, or declare the line intentionally undimensioned.

**Verified against:** JournalLine's 4 dimension columns at accounting.prisma:185-188; only onInterBranchTransferInvoiced (of 7 posting rules) sets retailBrandId, in posting-rules.subscriber.ts -- verified.

### The period that already moved  — strong

**Question:** State what happens when a fact's own date falls inside a CLOSED/LOCKED FiscalPeriod -- does it silently reroute to today's open period, and what report surfaces the mismatch.

**Verified against:** AccountingService.resolveOpenPeriod() at accounting.service.ts:188 (falls back to most-recently-started OPEN period, not nearest); FiscalPeriod.startsOn/endsOn in accounting.prisma; no DB constraint or restatement trail exists -- verified.

## Killed (0)

_Nothing was killed._


## Citations corrected (1)

- None needed -- all citations verified accurate as written: AccountingService.postEntry/findPostedEntry/resolveOpenPeriod exist as described; the 7 @OnDomainEvent handler names and count match posting-rules.subscriber.ts exactly; JournalLine's 4 dimension columns are at accounting.prisma:185-188 exactly as cited; work-orders.service.ts complete() (found at apps/api/src/modules/production/work-orders.service.ts) calls inventory.move() with reason PRODUCTION_RECEIPT and no journal call, confirming the cited gap; FiscalPeriod.startsOn/endsOn exist as cited.
