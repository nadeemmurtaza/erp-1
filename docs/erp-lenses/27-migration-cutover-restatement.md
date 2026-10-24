# 27. Migration, cutover and restatement

A migrated client does not start at zero — a decade of balances, codes and
disputes has to land inside a ledger built to never be edited and identifiers
built to be globally unique. At corporate scale that decade multiplies across
many legacy branch systems importing into one shared namespace, and a mistake
found two years after cutover must be corrected without rewriting what an
auditor already signed off on. A narrow build treats migration as a one-time
script; the whole capability treats it as a permanent, auditable seam.

## Lens: The ledger has no door for opening balances

**Question:** Name the domain event, the posting-rule subscriber, and the `source` string that will carry the client's opening trial balance into `AccountingService.postEntry()` — and which `FiscalPeriod` it targets given that period is created, not inferred, for a historic year.

**Why:** `postEntry()`'s only production callers today are `PostingRulesSubscriber`'s seven `@OnDomainEvent` handlers (`posting-rules.subscriber.ts`) and `FiscalPeriodsService.closeFiscalYear()` — confirmed by grep, nothing else calls it. There is no manual-journal endpoint: `fiscal-periods.controller.ts`, `gl-reports.controller.ts` and `consolidation.controller.ts` are the only accounting controllers and none posts an entry. An opening balance is exactly the one-off, backdated, non-event-driven fact this writer was never built to accept.

**Worked example:** Narrow slice: a script that inserts `JournalEntry`/`JournalLine` rows directly for the client's opening balances. Complete capability: an eighth posting rule beside the seven, `source: 'migration.opening_balance'`, `sourceRef` set to the client's cutover batch id, dated into a `FiscalPeriod` created via `FiscalPeriodsService.createFiscalPeriod()` for the year before go-live, idempotent through the same `findPostedEntry(source, sourceRef)` guard as every other rule.

**Done test:** `grep -n "migration" apps/api/src/modules/accounting/posting-rules.subscriber.ts` finds a handler; the PR shows a `FiscalPeriod` created for a pre-go-live year and the opening entry's `date` falls inside it, not `now`.

**Breaks without:** A direct-SQL or one-off script skips `findPostedEntry`, `JournalEntryNumberCounter` and the source/sourceRef convention every report and audit query relies on — re-running the same import after a partial failure double-posts every opening balance with nothing to catch it.

## Lens: The crosswalk that doesn't exist

**Question:** For every legacy record this migration imports — customer, supplier, product, location, open invoice — name the column that stores the legacy system's own identifier, and what happens the moment two legacy records map onto the same natural key (`Location.code`, `Product.slug`, SKU).

**Why:** `grep -rn "externalId\|legacyId\|sourceSystem" apps/api/prisma/schema/*.prisma` returns nothing — there is no field anywhere to record "this row came from the old system's record 4521." Meanwhile `Location.code`, `Product.slug`, SKU and barcode are all globally `@unique`, and `inventory.prisma`'s own comment names the composite `@@unique([originNodeId, code])` fix as deliberately deferred (R6). A client migrating several legacy branches independently will collide with each other's codes and this deployment's own generated ones, with no field recording which side won or why.

**Worked example:** Narrow slice: an import script that `createMany`s `Location`/`Product` rows straight from the client's export. Complete capability: a legacy-identifier pair (`legacySystem`, `legacyId`) written before the natural-key insert, so a support ticket citing "invoice #4521 from the old system," or a re-run of a failed import, resolves to the same row twice instead of creating it twice.

**Done test:** the migration's own schema change adds a `legacyId`/`sourceSystem` column pair (or an equivalent crosswalk table) on every imported model; the import path rejects, and names, a natural-key collision rather than silently overwriting it.

**Breaks without:** The second legacy branch imported silently overwrites or fails against the first's `Location.code`, and no query can trace a customer's decade-old invoice number back to the row it became — every "what was this before cutover" question becomes a manual CSV search once the migration is closed.

## Lens: A correction is indistinguishable from a refund

**Question:** When posted history from before cutover turns out to be wrong — a migrated opening balance was entered incorrectly two years ago — name what marks the correcting entry as a restatement, and how a report or auditor tells it apart from an ordinary `payment.refunded` reversal filed the same week.

**Why:** `AccountingService.reverseEntry()` always dates the reversal `now`, always posts it via `resolveOpenPeriod(now)`, and copies the original entry's `source`/`sourceRef` onto it verbatim (`accounting.service.ts:123-124`). `JournalEntry`'s own doc comment states the entire mechanism as "a correction is a new entry with `reversalOfId` set" — it names how, not why. A restatement found at audit and a same-day refund take the identical code path and leave identical evidence.

**Worked example:** Narrow slice: call `reverseEntry(entryId)` on the wrongly-migrated entry and post a fresh correct one, exactly like any refund. Complete capability: a reason/classification carried on the reversal (or a distinct `source: 'migration.restatement'` on the correcting pair) so `GlReportsService` and an auditor's trail can total "reversed because returned" separately from "reversed because the migration was wrong."

**Done test:** a reason or classification field exists on the reversal path (new column, or a documented `source` convention); a query or report can filter entries whose original predates go-live and whose reversal is tagged a restatement.

**Breaks without:** A statutory audit asks for every correction made to balances carried over from the legacy system, and the only available query returns every reversal ever posted for any reason — refunds, cancellations and the migration's own admitted mistakes land in one indistinguishable bucket.

## Not modelled yet

- A posting path for facts that are not event-driven — `postEntry()`'s only callers are the seven `PostingRulesSubscriber` handlers and `closeFiscalYear()`; there is no manual-journal or opening-balance entry point.
- Any legacy-identifier column or crosswalk table — `externalId`, `legacyId` and `sourceSystem` return zero matches across every `.prisma` schema file.
- A reason or classification on a journal reversal — `JournalEntry` carries only `reversalOfId` and a free-text `memo`, with no field distinguishing a restatement from an ordinary business reversal.

## Hardening record

**Kept (3 of 3):**

- **The ledger has no door for opening balances** — scoped to a real gap: `postEntry()`'s only production callers are `PostingRulesSubscriber`'s seven handlers and `FiscalPeriodsService.closeFiscalYear()` (confirmed by grep across `apps/api/src/modules/accounting`; the three controllers in that module — `fiscal-periods.controller.ts`, `gl-reports.controller.ts`, `consolidation.controller.ts` — post nothing). Not a restatement of "the transaction start to finish" (CLAUDE.md) because the lens is about a writer with no entry point at all, not about following an existing one end to end.
- **The crosswalk that doesn't exist** — `grep -rn "externalId\|legacyId\|sourceSystem" apps/api/prisma/schema/*.prisma` returns zero matches, and `Location.code`, `Product.slug` and SKU/barcode are all `@unique` today, with `inventory.prisma`'s own R6 comment naming the composite-key fix as deliberately deferred. Distinct from "the other end and what nets it out" (WO-22 multi-entity) because this is about identity collision on import, not about a counterpart record.
- **A correction is indistinguishable from a refund** — `reverseEntry()` verified to always date `now`, resolve `resolveOpenPeriod(now)`, and copy `source`/`sourceRef` verbatim (`accounting.service.ts:112-124`); `JournalEntry`'s schema comment confirmed at `accounting.prisma:118` ("a correction is a new entry with `reversalOfId` set"). Distinct from "the reversal document, not the reversal flag" (WO-22 lifecycle reversal) because that lens is about the reversal existing as its own row at all, while this one is about two kinds of reversal that already share one row shape being unable to be told apart afterward.

**Killed:** none — all three lenses are grounded, each names a citation that does not appear in the other 35 existing lenses, and each demands a specific artifact (a posting-rule subscriber entry, a schema column, a classification field) rather than a restated principle.

**Citations corrected:** none. Every citation checked against the repository matched exactly:
- `postEntry()` callers: confirmed `posting-rules.subscriber.ts` (7 `@OnDomainEvent` handlers) and `fiscal-periods.service.ts:174` (`closeFiscalYear`), no others.
- `findPostedEntry(source, sourceRef)`: confirmed at `accounting.service.ts:176`.
- `FiscalPeriodsService.createFiscalPeriod()`: confirmed at `fiscal-periods.service.ts:62`.
- `externalId|legacyId|sourceSystem` across `apps/api/prisma/schema/*.prisma`: confirmed zero matches.
- `Location.code` and `Product.slug` as globally `@unique`: confirmed at `inventory.prisma:79` and `catalog.prisma:25/48/91`.
- Inventory R6 deferred composite-key comment: confirmed at `inventory.prisma:88-91`.
- `reverseEntry()` dating `now` and copying `source`/`sourceRef` verbatim: confirmed at `accounting.service.ts:112-124`.
- `JournalEntry`'s "a correction is a new entry with `reversalOfId` set" comment: confirmed at `accounting.prisma:118`.
