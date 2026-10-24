# 00d. Ground: Operations: stock, orders, production, purchasing, till

Reconnaissance report from the `ground:operations` agent of workflow `wf_0cc0602e-66b`, recorded verbatim.
It is the raw input to [00-uagent.md](./00-uagent.md), which merges all six into one map. Read this one when you
want the unsummarised detail for this area.

## Facts

All paths are under `apps/api/src/modules/` unless noted; schema under `apps/api/prisma/schema/`.

## The single writer, and its one deliberate twin
`inventory/inventory.service.ts` — `InventoryService.move(input, tx)` (L198) and `InventoryService.postUnconditional(input, tx)` (L213) both delegate to the private `applyMovement(input, tx, {unconditional})` (L220). `moveMany(inputs, tx)` (L420) sorts by `` `${variantId}:${locationId}` `` then loops `move()`.

Per-location truth is `VariantLocationStock` (composite `@@id([variantId, locationId])`, `inventory.prisma:156`). `ProductVariant.stock` is a denormalized SUM recomputed inside the same transaction by a raw `UPDATE "ProductVariant" SET stock = (SELECT SUM(quantity) FROM "VariantLocationStock" …) RETURNING stock` (L296-304). The guard is predicate-on-write: `updateMany` with `quantity: { gte: -delta }` (L268-278); zero rows → `InsufficientStockError` (L37). `postUnconditional` omits the predicate (R5), and when the location goes negative the movement's reason is rewritten to `POS_OFFLINE_VARIANCE` and a `StockVariance` row + `DomainEvent.StockVarianceRecorded` are created (L309-357).

**Single writer holds for quantity.** Only `inventory.service.ts` touches `variantLocationStock`; grep across `apps/api/src` finds no other writer. **It does not hold for cost.** `purchasing/purchasing.service.ts:386` writes `tx.productVariant.update({ data: { costPrice: newCost, lastReceivedAt } })` using a local `weightedAverageCost(stockBefore, variant.costPrice, qty, landedUnitCost)`, where `stockBefore = movement.resultingStock - item.quantity` — i.e. the *global* sum, not the receiving location's. `purchasing.service.ts:209` and `:233` also write `preferredSupplierId` directly. `catalog/product-import.service.ts:292` does `productVariant.updateMany` (size/color only — but `purchasing.cron.ts:10` comments that bulk import "bypasses InventoryService.move()").

Reasons enum (`inventory.prisma:5-20`): PURCHASE_RECEIPT, SALE, CANCELLATION, RETURN, ADJUSTMENT, DAMAGE, COUNT, WRITE_OFF, PRODUCTION_CONSUMPTION, PRODUCTION_RECEIPT, POS_SALE, POS_OFFLINE_VARIANCE, TRANSFER_OUT, TRANSFER_IN.

## Writers per movement kind
- Web sale: `orders/orders.service.ts:284` `inventory.move(… reason 'SALE')` inside `place()`; catches `InsufficientStockError` → backorder park if `checkout.allow_backorder`, else 400.
- Till sale: `orders.service.ts:496` `inventory.postUnconditional(… 'POS_SALE')` inside `placeFromPos()` (R11 — POS is a channel of `orders`; Order gets `channel`, `locationId`, `terminalId`, `shiftId`, status straight to DELIVERED, Payment row created inline).
- Cancel/return: `orders.service.ts:701` `moveMany` with `CANCELLATION`/`RETURN` at `order.locationId ?? defaultLocationId(tx)`.
- Backorder release: `orders/backorder.listener.ts:40`.
- Goods receipt: `purchasing.service.ts` `receiveGoods` path — `moveMany(… 'PURCHASE_RECEIPT', unitCost: landedUnitCost)` at `defaultLocationId(tx)`, then per-item WAC update, `purchaseOrderItem.quantityReceived` increment, PO → `PARTIAL`/`RECEIVED`, `DomainEvent.GoodsReceived`.
- Production: `production/work-orders.service.ts` `release()` L161 `moveMany(PRODUCTION_CONSUMPTION, delta = -Math.ceil(line.quantityPerUnit * quantityOrdered))`; `complete()` L200 `move(PRODUCTION_RECEIPT, +quantityCompleted)`; `cancel()` L247 reverses with reason `ADJUSTMENT`, not a dedicated reason.
- Transfers: `transfers/transfers.service.ts` `dispatch()` L138, `receive()` L198/210/228, `cancel()` L305.
- Count: `inventory/stock-count.service.ts:220`.
- `stitching/` writes **no** stock movements; it enriches order items via `EntityEnrichmentRegistry` key `'orderItem.stitchingJob'`.

## POS shift
`pos/pos-shifts.service.ts`: `openShift(terminalId, openedByUserId, openingCashMinor)` requires terminal `status === 'ACTIVE'`, refuses a second OPEN shift on the terminal, creates `PosShift` + an `OPENING_FLOAT` `CashMovement`. `recordCashMovement(shiftId, type, amountMinor, reason, actorId)` for CASH_IN/CASH_OUT/DROP/PAID_OUT. `closeShift(shiftId, closedByUserId, closingCashMinor)` just flips status. `xReport` / `zReport` compute `expectedCashMinor = openingFloat + cashIn − cashOut − drop − paidOut`; `overShortMinor = closingCashMinor − expectedCashMinor`. The class doc states plainly that X/Z is **cash-movements only** — sales tender is a `Payment` row, not a `CashMovement`, so the report is not the whole picture. `pos/pos-sales.service.ts.sell()` gates on OPEN shift then calls `orders.placeFromPos()`; the receipt is best-effort outside the transaction.

## Stock count → variance
`StockCountService.create/start/scan/updateLine/complete`. `start()` snapshots **every active variant** (`expected: v.stock`, the global sum). `complete()` computes `delta = counted − currentStock` (again global) and posts `moveMany` with reason `COUNT` at `defaultLocationId(tx)`. **The `StockCount` model has no `locationId`** (`inventory.prisma:191-212`) — a count is deployment-wide and always writes to the default location. `StockVariance` is *not* produced by counting; it is produced only by `postUnconditional` oversell. `stock-variance.service.ts.resolve()` is an acknowledgement only — it moves no stock and reverses no journal.

## Transfer
`dispatch()` creates a per-transfer `Location` of `type: 'IN_TRANSIT'`, `isActive: false` (R4), then one `moveMany`: `−qty` at source + `+qty` at in-transit, both `TRANSFER_OUT`. `receive()`: `−received` from in-transit and `+received` at destination (`TRANSFER_IN`), shortfall explicitly `WRITE_OFF`; if `settlementMode === 'INVOICED'` it raises an `InterBranchInvoice` and publishes `InterBranchTransferInvoiced`. `cancel()` returns in-transit stock to source. `resolveTransferSettlement()` (L397) gates on `BrandPolicy.allowInterBranchTransfers` (same brand) or `Organization.allowInterBrandTransfers` (cross-brand); returns `NONE` or `INVOICED` only — `INTERNAL_PL` exists in the enum but is never returned.

## Work order → BOM
`production/bom.service.ts`: `BillOfMaterial` is keyed `@unique` on `variantId` — **one BOM per variant, no versioning, no revision, no effectivity date, no routing/operations/labour model**. Components are `BillOfMaterialLine.quantityPerUnit` (Float). `release()` requires `status === 'DRAFT'` and a non-empty BOM, consumes one level only (**no multi-level explosion** — a component that is itself `producedInHouse` is not exploded), rounds each line with `Math.ceil` (so no scrap/yield factor, and over-consumption on fractional BOMs).

## Where 10k products × 100 locations strains
1. `InventoryService.list()` (L109) has **no `take`/`skip`** — it returns every active variant with product + translations joined. Same for `getReorderSuggestions()` (L120) and `getSlowMovers()` (L147). `catalog/catalog.service.ts:73` and `catalog/product-admin.service.ts:66` do paginate; inventory does not.
2. `StockCountService.start()` creates one `StockCountLine` per *active variant* in one transaction — 10,000+ rows, and it cannot be scoped to a location, a category, a zone or a cycle. There is no cycle-count or partial-count concept.
3. `getChainStatus(variantId)` fans out to `variantLocationStock.findMany` with no location filter: 100 rows per SKU.
4. Every movement re-runs the `SUM(quantity)` subquery over that variant's `VariantLocationStock` rows; with 100 locations that is a 100-row aggregate per single-unit sale, and `VariantLocationStock` has no index beyond its composite PK.
5. `moveMany` is a **serial loop**, one round trip per line; a 200-line transfer or receipt is 200 sequential statements inside one 20s-timeout transaction (`transfers.service.ts:163,292`).
6. `defaultLocationId()` is `findFirstOrThrow({ where: { isDefault: true } })` — purchasing receipts, stock counts and web orders all land at the one default location regardless of where goods physically are.
7. `dispatch()` creates a **new `Location` row per transfer**; at corporate volume the `Location` table grows without bound, and `Location.code` is globally `@unique` (R6 names this as an unresolved merge risk; the schema comment at `inventory.prisma:87-96` says the `@@unique([originNodeId, code])` fix is deliberately not yet wired because Postgres NULLs would weaken it).
8. `pos-catalog.service.ts.searchVariants` uses `contains … mode: 'insensitive'` on sku and translated name with `take: 20` — an unindexed sequential scan at 10k+ variants; no trigram/full-text index.
9. Permission keys are flat and coarse: `inventory.manage`, `inventory.count`, `transfers.manage`, `pos.operate`, `production.manage`, `production.view_chain`. There is **no rank model and no per-location or per-department scoping on any of these controllers** — a `transfers.manage` holder can dispatch from any of the 100 locations. R10 names a "scope" but the controllers read none.
10. `Product.scopeLevel`/`originNodeId` from R8 are **not in `catalog.prisma`** — brand-level vs branch-level product ownership and the promotion/de-duplication gate do not exist yet.
11. `Supplier.leadTimeDays` is a scalar (R25 wants a distribution); `SupplierProduct.moq`/`leadTimeDays` exist but no OTIF/scorecard computation does.
12. R21's shock-propagation graph, R22's ranking objective and R24's liquidity schedule have no corresponding module, service or model anywhere in `apps/api/src/modules/`.

## Where a narrow build goes wrong here

- Treating InventoryService.move() as 'the single writer' without qualification: quantity has one writer, but costPrice is written directly by purchasing.service.ts:386 with a globally-derived weighted average, so cost and quantity already disagree in a multi-location deployment.
- Assuming a stock count can be scoped to a location: StockCount has no locationId, start() enumerates every active variant, and complete() posts all deltas at defaultLocationId. Any lens that says 'count a branch' is describing something that does not exist.
- Assuming BOM explosion is multi-level or versioned: it is one BOM per variant, one level deep, Math.ceil'd, with no routing, labour, scrap or effectivity.
- Assuming the POS Z-report reconciles a till: it is cash-movements only by the service's own admission — card/other tenders post as Payment rows and never reach the breakdown.
- Assuming permissions scope by location, department or rank: controllers carry flat keys (inventory.manage, transfers.manage, pos.operate) and no row scoping is read at these call sites. There is no rank model and no department model.
- Assuming R8's brand/branch product ownership exists: Product.scopeLevel and originNodeId are absent from catalog.prisma; the de-duplication/promotion gate is a ruling, not code.
- Assuming the intelligence rulings (R20-R25) are partially built: no dependency-graph, shock, propagation, lead-time-distribution or liquidity model or service exists in the codebase.
- Assuming inventory list endpoints paginate: they do not, while catalog endpoints do — a lens that generalises 'the admin lists paginate' will be wrong exactly where 10k SKUs hurt most.
- Assuming a transfer is cheap: each dispatch() creates a permanent IN_TRANSIT Location row and runs a serial per-line loop inside a 20-second transaction.
