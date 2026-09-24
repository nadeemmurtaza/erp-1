# 29g generate cost to serve

Output of the `gen:29:cost-to-serve` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

What the feature costs at corporate volume

## File

docs/erp-lenses/cost-to-serve/29-cost-to-serve.md

## Lenses

### The cost that multiplies by location

**Question:** For a single-unit sale, name every location the posting transaction reads or aggregates over besides the one that sold the unit, and state whether that count grows with the SKU's location count or stays fixed.

**Grounding:** apps/api/src/modules/inventory/inventory.service.ts:220-304 (applyMovement's UPDATE ... SET stock = (SELECT SUM(quantity) FROM VariantLocationStock WHERE variantId = ...) recompute on every move()/postUnconditional() call)

### The report that recomputes from scratch

**Question:** For a figure a user can click to refresh (a trial balance, a P&L, a balance sheet), name the columns its underlying query filters or groups on, and state which of those columns has a database index today.

**Grounding:** apps/api/src/modules/accounting/gl-reports.service.ts:37,74,146 (balancesAsOf groupBy on JournalLine filtered via JournalEntry.status/date); apps/api/prisma/schema/accounting.prisma:120-149,203 (JournalEntry has @@index([status]) but no index on date; JournalLine has @@index([accountId])); apps/api/src/core/settings/settings.service.ts:6 (30s cache covers only the Setting table)

### The write that doesn't chunk

**Question:** For a background job that must touch every row of a corporate-scale table (a stock count, a bulk re-price, a mass re-tag), name the number of rows it inserts or updates in its single database transaction, and state whether that number is bounded by anything other than 'how many rows currently match'.

**Grounding:** apps/api/src/modules/inventory/stock-count.service.ts:92-118 (StockCountService.start() findMany's every active ProductVariant and createMany's one StockCountLine per row inside one $transaction; StockCount model has no locationId column)

## Absences

- No per-location or per-category scope on StockCount, so a cycle count of one branch cannot be built without a schema change
- No report cache or materialized balance for GlReportsService's five reports; every click recomputes balancesAsOf() from raw JournalLine rows
- No per-location running stock counter; ProductVariant.stock is recomputed by summing VariantLocationStock inline on every movement instead of maintained incrementally

