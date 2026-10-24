# 14g generate planning replenishment

Output of the `gen:14:planning-replenishment` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Planning and replenishment across a hundred locations

## File

docs/erp-lenses/planning-replenishment/14-planning-replenishment.md

## Lenses

### The reorder point has no address

**Question:** For a variant carried at 100 different locations, which table and column holds the threshold that should trigger a reorder for Warehouse A specifically, independent of Store B's stock — and what fires when Store B is empty while Warehouse A sits comfortably above its own threshold?

**Grounding:** ProductVariant.reorderPoint (catalog.prisma:184, one nullable Int per variant, deployment-wide); DomainEvent.ProductReorderPointReached fired in inventory.service.ts:374-376 off resultingStock, the SUM across all VariantLocationStock rows for that variant; reorder.listener.ts is the sole consumer of that event.

### Not enough to go around

**Question:** When a single GoodsReceipt quantity is smaller than the sum of what every location that crossed its reorder point needs, name the rule that decides how many units each location gets, and the table or event where that split is recorded.

**Grounding:** purchasing.service.ts goods-receipt path posts via moveMany at InventoryService.defaultLocationId(tx) (inventory.service.ts:166) — a single default location; grep for 'allocat' in purchasing.service.ts finds only allocateLandedCost (cost-splitting, not physical units); R26 (RETAIL-ERP.md:711-731) on branch allotment describes a different, later question (distributing existing branch stock to online demand).

### A forecast is not a commitment

**Question:** Name the exact status value that separates 'the system projects we'll need more' from 'we have committed to a supplier for more,' and what the projection is actually computed from — a point estimate or a distribution over historical lead time.

**Grounding:** reorder.listener.ts:38 computes quantity = reorderQuantity ?? (reorderPoint - stock) with no lead-time window; PurchaseOrderStatus DRAFT/SENT (purchasing.prisma:88-94); Supplier.leadTimeDays (purchasing.prisma:31, default 7) and SupplierProduct.leadTimeDays (line 78) are bare scalars; R25 (RETAIL-ERP.md:695-705) names the mean-vs-variance gap explicitly as unbuilt, derivable from GoodsReceipt vs PurchaseOrder history.

## Absences

- Per-location reorder thresholds — only a single global ProductVariant.reorderPoint exists (catalog.prisma:184)
- Any allocation rule for splitting scarce incoming supply across multiple requesting locations — no table, column or function does this in purchasing/ or inventory/
- Lead-time variance/distribution — Supplier.leadTimeDays and SupplierProduct.leadTimeDays are bare scalars; nothing derives mean/variance from GoodsReceipt vs PurchaseOrder history (R25 names this unbuilt)
- Seasonality of any kind — no model, column, service or scheduled job references a season, calendar profile or demand curve
- A demand forecast distinct from a point stock figure — reorder logic is a flat point-in-time gap-fill, never a projected demand-during-lead-time figure

