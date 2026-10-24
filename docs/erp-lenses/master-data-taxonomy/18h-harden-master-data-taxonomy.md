# 18h. Hardening record: Master data at ten thousand products

Adversarial review of [18-master-data-taxonomy.md](./18-master-data-taxonomy.md) by the `harden:18:master-data-taxonomy` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The propose-up path that never opens  — strong

**Question:** Names the Product ownership field and the replication mechanism carrying a branch-created product up to the brand.

**Verified against:** BrandPolicy.allowBranchProductCreation (organization.prisma:70-79), Product model (catalog.prisma:89-147), ProductReplicationListener DOWN-only basePrice update (product-replication.listener.ts:28,70) — all verified verbatim.

### The exact-string gate  — strong

**Question:** Names the dedup match rule in import and what happens to near-duplicate garment names.

**Verified against:** ProductImportService.importRow (product-import.service.ts:316-324) and the @unique constraints on slug/sku/barcode (catalog.prisma:91,168,189) — verified verbatim.

### One column, one unit, forever  — solid

**Question:** Names the hardcoded unit column and where a second unit of measure would be stored without a migration.

**Verified against:** Product.fabricMeters (catalog.prisma:109), GarmentType.baseFabricGaz (measurements.prisma:30), MeasurementUnit enum (measurements.prisma:9) scoped to body measurements only, StockMovement.delta (inventory.prisma:26) and PurchaseOrderLine.quantityOrdered (purchasing.prisma:132), R14 (RETAIL-ERP.md:348) — all verified after corrections.

## Killed (0)

_Nothing was killed._


## Citations corrected (3)

- Lens 3 said "the 21 files in apps/api/prisma/schema/" — actual count is 22 files (verified by ls | wc -l).
- Lens 3 cited "StockMovement.quantity" as a unitless integer field — StockMovement has no quantity field; the real fields are delta and resultingStock (inventory.prisma:26,28). Corrected to StockMovement.delta and named the actual PO field PurchaseOrderLine.quantityOrdered instead of the vague "PO line quantities."
- Lens 3's doneTest claimed `grep -rn "Unit\b" apps/api/prisma/schema/*.prisma` returns nothing today — false as written; it matches enum MeasurementUnit (measurements.prisma:9), MeasurementField.unit (measurements.prisma:56), and unrelated identifiers (stitchingFeeUnit, discountUnit, quantityPerUnit). The underlying claim (no unit-of-measure model for product/stock quantities) survives because MeasurementUnit is scoped only to body-measurement fields for stitching, but the doneTest was rewritten to `grep -rn "model UnitOfMeasure" apps/api/prisma/schema/*.prisma`, which does return nothing, and the why-section now names MeasurementUnit explicitly to close the ambiguity.
