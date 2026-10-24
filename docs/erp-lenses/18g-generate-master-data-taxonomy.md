# 18g generate master data taxonomy

Output of the `gen:18:master-data-taxonomy` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Master data at ten thousand products

## File

docs/erp-lenses/18-master-data-taxonomy.md

## Lenses

### The propose-up path that never opens

**Question:** When BrandPolicy.allowBranchProductCreation is on for a RetailBrand, name the field on Product that records which tier owns a given row, and the concrete mechanism (table, event, or replication direction) that carries a branch-created product up to the brand for review, approval or merge.

**Grounding:** organization.prisma:70-79 (BrandPolicy.allowBranchProductCreation, doc comment 'enforced at both ends... never trusted from the branch alone'); catalog.prisma:89-147 (Product has no scopeLevel/originNodeId, unlike Location/Order); product-replication.listener.ts (ProductReplicationListener only replicates basePrice DOWN onto an existing product; comment states creating one from a policy record 'is not built yet')

### The exact-string gate

**Question:** Name the match rule that decides whether a new import row becomes a new Product or a new variant on an existing one, and state what happens when two rows describe the same garment with different capitalisation, spacing, or a typo.

**Grounding:** product-import.service.ts:316-324 (sibling match on kind + categoryId + exact case-sensitive single-locale translations.name equality); catalog.prisma:91,168,189 (Product.slug, ProductVariant.sku, .barcode all globally @unique with no near-duplicate check)

### One column, one unit, forever

**Question:** Name the field, table and unit that Product/ProductVariant hardcodes today, and where a second unit of measure (pieces, kilograms, litres) for a different vertical or edition would be stored without a migration and without a second 'meters'-shaped column.

**Grounding:** catalog.prisma:109 (Product.fabricMeters, a bare Float labelled 'UNSTITCHED only... metres'); absence of any UnitOfMeasure/conversion model across all 21 files in apps/api/prisma/schema/ (verified by search); StockMovement.quantity and PO line quantities are likewise unitless integers

## Absences

- No Product.scopeLevel or Product.originNodeId to mark brand-owned vs branch-proposed catalogue rows
- No near-duplicate or merge tooling for products, brands or categories anywhere in the codebase
- No UnitOfMeasure or attribute-conversion model; units exist only as part of column names (fabricMeters)
- No per-location reorderPoint/lowStockThreshold; both are single global values on ProductVariant, not per-Location
- No field-level provenance on any catalog model recording which tier (org/brand/branch) last wrote an attribute

