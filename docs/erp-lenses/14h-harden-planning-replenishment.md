# 14h. Hardening record: Planning and replenishment across a hundred locations

Adversarial review of [14-planning-replenishment.md](14-planning-replenishment.md) by the `harden:14:planning-replenishment` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The reorder point has no address  — strong

**Question:** Which table/column holds a per-(variant, location) reorder threshold, and what fires when one location is empty while the aggregate sits above threshold?

**Verified against:** catalog.prisma:184 (ProductVariant.reorderPoint, nullable Int, one per variant); inventory.service.ts:373-391 (crossing check against resultingStock, the cross-location SUM) - both verified to exist exactly as claimed

### Not enough to go around  — strong

**Question:** When one GoodsReceipt is smaller than the sum of what every requesting location needs, what rule and table records the per-location split?

**Verified against:** purchasing.service.ts:358-360 (moveMany posts entirely at defaultLocationId); grep -in allocat confirms only allocateLandedCost (cost, not units) exists; grep -n locationId on purchasing.prisma confirms no allocation column exists; R26 in docs/implementation/RETAIL-ERP.md confirmed distinct (allotment-to-online vs receipt-split)

### A forecast is not a commitment  — strong

**Question:** What status value separates a projected need from a committed PO, and is the projection a point estimate or a lead-time distribution?

**Verified against:** reorder.listener.ts:38 (quantity = reorderQuantity ?? reorderPoint - stock, no lead-time window); purchasing.prisma:31,78,88-94 (Supplier.leadTimeDays, SupplierProduct.leadTimeDays, moq, PurchaseOrderStatus enum) all confirmed; R25 in docs/implementation/RETAIL-ERP.md confirmed (mean+variance derivable from GoodsReceipt vs PurchaseOrder, not yet built)

## Killed (0)

_Nothing was killed._


## Citations corrected (2)

- RETAIL-ERP.md is cited in the lens bodies as a bare filename ('RETAIL-ERP.md:695-705', 'RETAIL-ERP.md:711-724'); the actual repo path is docs/implementation/RETAIL-ERP.md. Section numbers R25/R26 and quoted text are correct and line ranges are close (R25 heading at ~695, R26 heading at ~712) - this is a path-precision note only, added to the Hardening record, not a collapsed claim.
- All other citations (catalog.prisma:184; inventory.service.ts reorder-crossing block; inventory.controller.ts:24 getReorderSuggestions(); purchasing.service.ts defaultLocationId/moveMany/allocateLandedCost; purchasing.prisma leadTimeDays x2/moq/PurchaseOrderStatus; reorder.listener.ts:38; transfers.service.ts serial per-line loop in a 20s transaction) were verified exact, no correction needed.
