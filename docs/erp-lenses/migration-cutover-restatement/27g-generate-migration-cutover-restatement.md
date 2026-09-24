# 27g generate migration cutover restatement

Output of the `gen:27:migration-cutover-restatement` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Migration, cutover and restatement

## File

docs/erp-lenses/migration-cutover-restatement/27-migration-cutover-restatement.md

## Lenses

### The ledger has no door for opening balances

**Question:** Name the domain event, the posting-rule subscriber, and the `source` string that will carry the client's opening trial balance into `AccountingService.postEntry()` — and which `FiscalPeriod` it targets given that period is created, not inferred, for a historic year.

**Grounding:** apps/api/src/modules/accounting/accounting.service.ts (postEntry, reverseEntry, resolveOpenPeriod), posting-rules.subscriber.ts (only production caller besides FiscalPeriodsService.closeFiscalYear), fiscal-periods.service.ts (createFiscalPeriod)

### The crosswalk that doesn't exist

**Question:** For every legacy record this migration imports — customer, supplier, product, location, open invoice — name the column that stores the legacy system's own identifier, and what happens the moment two legacy records map onto the same natural key (Location.code, Product.slug, SKU).

**Grounding:** grep across apps/api/prisma/schema/*.prisma for externalId|legacyId|sourceSystem returns zero hits; inventory.prisma's comment on Location.code @unique deferring @@unique([originNodeId, code]) (R6)

### A correction is indistinguishable from a refund

**Question:** When posted history from before cutover turns out to be wrong, name what marks the correcting entry as a restatement, and how a report or auditor tells it apart from an ordinary payment.refunded reversal filed the same week.

**Grounding:** apps/api/src/modules/accounting/accounting.service.ts:102-156 (reverseEntry copies source/sourceRef verbatim, dates to now, posts via resolveOpenPeriod(now)); JournalEntry model comment in accounting.prisma:115-119

## Absences

- A posting path for non-event-driven facts (opening balances / manual journal) — postEntry()'s only callers are the seven PostingRulesSubscriber handlers and closeFiscalYear()
- Any legacy-identifier column or crosswalk table (externalId/legacyId/sourceSystem) anywhere in the prisma schema
- A reason/classification field on a journal reversal distinguishing a restatement from an ordinary business reversal — JournalEntry has only reversalOfId and a free-text memo

