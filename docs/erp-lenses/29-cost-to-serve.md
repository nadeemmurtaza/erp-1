# 29. What the feature costs at corporate volume

A feature that is correct at Solo scale can still be unbuildable at Org
scale if nobody names what it costs there — not in engineering time, but in
rows written per movement, joins a report runs on every click, and
transaction size when a job has to touch every row at once. The same code
serves three editions; a feature's cost profile must be stated for the
100-location, 10,000-SKU one, not measured after it is already slow there.

## Lens: The cost that multiplies by location

**Question:** For a single-unit sale, name every location the posting
transaction reads or aggregates over besides the one that sold the unit, and
state whether that count grows with the SKU's location count or stays fixed.

**Why:** `applyMovement()` (`apps/api/src/modules/inventory/inventory.service.ts:220-304`,
confirmed by reading it) ends every `move()`/`postUnconditional()` call with
`UPDATE "ProductVariant" SET stock = (SELECT SUM(quantity) FROM
"VariantLocationStock" WHERE "variantId" = …)` — a synchronous, in-transaction
recompute over *every* location that variant is stocked at, not just the one
the movement touched. At Solo (one location) this is a one-row sum; at Org
(100+ locations: branches, warehouses, in-transit, consignment) a sale at one
branch pays an aggregate proportional to how many of those 100+ locations
carry the SKU, on every single unit sold, inside the same transaction that
must also satisfy the predicate-on-write stock guard. This is distinct from
lens 30 ("the busiest minute, and the lock you hold through it"), which asks
about lock duration under concurrent writers to one row; this lens asks
whether the *shape* of the work itself grows with the edition.

**Worked example:** Narrow slice: build a "sell from branch" feature and
verify it works with two test locations, where the recompute is invisible.
Complete capability: the feature's design doc states, for the 100-location
case, that this SUM still executes once per movement over all 100 rows, and
either accepts that cost explicitly (with a number: ~100-row aggregate per
unit sold) or proposes the per-location running counter that would remove it.

**Done test:** The PR (or design note) for any new stock-movement path names
the query at `inventory.service.ts:296-304` and states, in rows, what it
costs when the moved variant is stocked at 100 locations versus one — not
just that "stock updates work."

**Breaks without:** At 10,000+ variants each stocked across a meaningful
subset of 100+ locations, every sale, transfer receipt, production
completion and count line pays a location-count-sized aggregate inline in
its transaction; a feature that assumes this is O(1) because it tested at
Solo scale will silently push transaction latency up in lockstep with how
many locations Org onboards, with no metric anywhere named to catch it.

## Lens: The report that recomputes from scratch

**Question:** For a figure a user can click to refresh (a trial balance, a
P&L, a balance sheet), name the columns its underlying query filters or
groups on, and state which of those columns has a database index today.

**Why:** All three of `trialBalance`, `balanceSheet` and the retained-earnings
figure (`gl-reports.service.ts:74,146`) read from `balancesAsOf()`
(`gl-reports.service.ts:37`), which is `journalLine.groupBy({ by:
['accountId'], where: { entry: { status: 'POSTED', date: { lte: asOf } } }
})`. `JournalLine` carries `@@index([accountId])` (`accounting.prisma:203`),
but the filter is on `JournalEntry.status` and `JournalEntry.date`
(accounting.prisma:120-149): `status` is indexed, `date` is not, and nearly
every entry is POSTED (reversal is the rare case), so the status index barely
narrows anything. At Solo — a few thousand entries a year — this is free.
At Org, with 100+ locations posting daily for years toward a "hundred
million rows" ledger, every trial balance or balance sheet click forces a
join back to an unindexed date column across the (near-total) POSTED set,
with no report cache anywhere — `SettingsService`'s 30-second cache
(`settings.service.ts:6`) covers only the `Setting` table, nothing here.

**Worked example:** Narrow slice: ship the P&L using `balancesAsOf()`
unchanged, verified against the seeded chart of accounts (13 rows, a
handful of entries). Complete capability: the PR adds
`@@index([date, status])` (or equivalent) to `JournalEntry`, and states the
report's expected row-scan count at Org's ledger size, not just that
"it returns the right number" against test data.

**Done test:** `grep -n "@@index" apps/api/prisma/schema/accounting.prisma`
shows an index whose leading column is `JournalEntry.date` (or the migration
adding one accompanies the PR); absent that, the PR states in writing why
the report's cost at 100M+ `JournalLine` rows is acceptable.

**Breaks without:** A report that is a sub-second query at Solo becomes a
full scan of years of postings at Org every time someone opens the finance
dashboard — and because nothing caches or paginates it, five users opening
the same P&L in the same minute run the same unindexed scan five times.

## Lens: The write that doesn't chunk

**Question:** For a background job that must touch every row of a
corporate-scale table (a stock count, a bulk re-price, a mass re-tag), name
the number of rows it inserts or updates in its single database transaction,
and state whether that number is bounded by anything other than "how many
rows currently match."

**Why:** `StockCountService.start()` (`stock-count.service.ts:92-118`,
confirmed by reading it) runs inside one `this.prisma.$transaction(...)`
that `findMany`s every `isActive` `ProductVariant` and `createMany`s one
`StockCountLine` per row — and `StockCount` has no `locationId` column at
all (ground survey confirms it: the model has none), so this is not "count
this branch's 200 SKUs," it is "count all 10,000+ variants in the whole
deployment," always, in one transaction, with no chunking and no cycle/partial
option. At Solo (a few hundred SKUs) this is instant. At Org (10,000+ active
variants) it is a single transaction inserting five figures of rows before
it can commit — the same shape of risk `transfers.service.ts`'s per-line
loop already carries inside its 20-second transaction budget (ground survey),
just for a job with no upper bound on row count at all.

**Worked example:** Narrow slice: build "start a stock count" and test it
against the seed catalogue, where 40-odd `createMany` rows commit instantly.
Complete capability: the count is scoped to a location or category (a new
`locationId`/filter the design doc names explicitly), chunked into batches
sized to a stated budget, and resumable if a batch fails — not one
unbounded transaction sized by however many variants exist that day.

**Done test:** The PR states, in a number, the row count `StockCountService.start()`
would insert at Org's 10,000+ variant catalogue, and either that number is
below an explicitly stated chunk size or the PR adds chunking/scoping code
the reviewer can point to.

**Breaks without:** At 10,000+ active variants, every stock count — not a
rare event, a routine one — is a single all-or-nothing transaction inserting
five-figure row counts; a timeout or lock conflict mid-transaction loses the
entire count with no partial progress, and there is no way to count "just
this branch" even when that is the only thing an operator wanted to check.

## Not modelled yet

- No per-location or per-category scope on `StockCount` — a cycle count of
  one branch or one category has nowhere to attach; the model has no
  `locationId` and `start()` cannot be narrowed without a schema change.
- No report cache or materialized balance for `GlReportsService` — every
  trial balance, balance sheet or P&L recomputes `balancesAsOf()` from raw
  `JournalLine` rows on every request; `SettingsService`'s cache exists but
  covers only the `Setting` table.
- No per-location running stock counter — `ProductVariant.stock` is
  recomputed by summing `VariantLocationStock` inline on every movement
  rather than maintained incrementally, so its cost is tied to how many
  locations a SKU is stocked at, not to the size of the movement itself.

## Hardening record

**Kept (3 of 3):**

- **The cost that multiplies by location** — verified against
  `inventory.service.ts:220-304` (the `applyMovement` private method both
  `move()` and `postUnconditional()` call) and its recompute query at
  `inventory.service.ts:296-304`, an unconditional `UPDATE "ProductVariant"
  SET stock = (SELECT SUM(quantity) FROM "VariantLocationStock" ...)`. This
  is genuinely a scope question (does the design account for the aggregate
  growing with location count) and is explicitly distinguished in the file
  from lens 30's lock-duration question, which it does not restate.
- **The report that recomputes from scratch** — verified `gl-reports.service.ts:37`
  (`balancesAsOf`), `:74` (`trialBalance`) and `:146` (`balanceSheet`) all
  read the same `journalLine.groupBy({ where: { entry: { status: 'POSTED',
  date: { lte: asOf } } } })`. Verified in `accounting.prisma`:
  `JournalLine` has `@@index([accountId])` at line 203 exactly as cited;
  `JournalEntry` (lines 120-150) indexes `periodId`, `[source, sourceRef]`
  and `status` (lines 147-149) but has no index touching `date`. Verified
  `settings.service.ts:6` (`CACHE_TTL_MS = 30_000`) covers only
  `SettingsService.get()`/the `Setting` table, nothing in `GlReportsService`.
  All citations accurate as written.
- **The write that doesn't chunk** — verified `stock-count.service.ts:92-120`
  (`StockCountService.start()`): one `$transaction` that `findMany`s every
  `isActive` `ProductVariant` and `createMany`s one `StockCountLine` per row,
  with no batching. Verified `StockCount` (`inventory.prisma:191-212`) has
  no `locationId` field anywhere in the model, confirming the "cannot be
  narrowed" claim. Verified `transfers.service.ts` uses `{ timeout: 20_000 }`
  (20-second transaction budget) at lines 163, 292 and 335, supporting the
  "same shape of risk ... already carries" comparison. All citations
  accurate as written.

**Killed:** none. All three lenses cite real, currently-true code; each asks
a scope question (what must the design state about behavior at Org volume)
rather than a coding-standard question; each is distinguished by name from
lens 30 and from each other (aggregate shape vs. missing index vs. unbounded
transaction — three different failure mechanisms, not three phrasings of
one); and none is true of an arbitrary codebase — each names a specific
query, a specific missing index, and a specific missing column in this repo.

**Citations corrected:** none. Every path, line range, model field and
service method cited in the file was opened and confirmed to match, including
the two narrowest claims (`JournalLine`'s index at exactly line 203, and
`StockCount` having zero `locationId` columns) which were the ones most
likely to have drifted.
