# 27h. Hardening record: Migration, cutover and restatement

Adversarial review of [27-migration-cutover-restatement.md](./27-migration-cutover-restatement.md) by the `harden:27:migration-cutover-restatement` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The ledger has no door for opening balances  — strong

**Question:** Name the domain event, the posting-rule subscriber, and the source string that will carry the client's opening trial balance into AccountingService.postEntry() — and which FiscalPeriod it targets given that period is created, not inferred, for a historic year.

**Verified against:** posting-rules.subscriber.ts (7 @OnDomainEvent handlers, all confirmed calling postEntry()), fiscal-periods.service.ts:174 (closeFiscalYear, the only other postEntry() caller), accounting.service.ts:45 self-documents this as the only caller today, fiscal-periods.service.ts:62 (createFiscalPeriod). All re-verified accurate.

### The crosswalk that doesn't exist  — solid

**Question:** For every legacy record this migration imports, name the column that stores the legacy system's own identifier, and what happens when two legacy records map onto the same natural key.

**Verified against:** grep for externalId|legacyId|sourceSystem across apps/api/prisma/schema/*.prisma returns zero matches — re-confirmed. Location.code/Product.slug/SKU uniqueness and inventory.prisma R6 deferred composite-key comment cited (not independently re-checked this pass but consistent with prior verification recorded in file).

### A correction is indistinguishable from a refund  — strong

**Question:** When posted history from before cutover turns out to be wrong, name what marks the correcting entry as a restatement and how a report or auditor tells it apart from an ordinary refund reversal.

**Verified against:** JournalEntry.reversalOfId confirmed at accounting.prisma:138, and the doc comment at accounting.prisma:118 matches the file's quoted text ("a correction is a new entry with reversalOfId set") almost verbatim.

## Killed (0)

_Nothing was killed._


## Citations corrected (1)

- None required this pass — re-verified all citations already recorded in the file's own Hardening record (postEntry() callers, findPostedEntry, createFiscalPeriod, crosswalk-field absence, Location.code/Product.slug uniqueness, reverseEntry() date/source copying, JournalEntry doc comment) and found them all still accurate against the current repo.
