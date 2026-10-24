# 34h. Hardening record: Provenance, recall and statutory reporting (docs/erp-lenses/provenance-esg-statutory/34-provenance-esg-statutory.md)

Adversarial review of [34-provenance-esg-statutory.md](./34-provenance-esg-statutory.md) by the `harden:34:provenance-esg-statutory` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### Every unit, not the whole SKU  — strong

**Question:** Given a defined bad batch, what column/table names it and what query returns every location, shipment, order and customer that received a unit from it?

**Verified against:** StockMovement (inventory.prisma:22-59, no lotId/batchNumber), GoodsReceiptItem (purchasing.prisma:165-180), VariantLocationStock (inventory.prisma:156-166) — all verified exact

### The claim, not the supplier  — strong

**Question:** For an origin/compliance claim, which row does it attach to — a shipment or a standing Supplier field — and what happens when sourcing country changes?

**Verified against:** Supplier.country (purchasing.prisma:9-11), Product/ProductVariant (catalog.prisma:89-229) — verified exact

### The regulator's own boxes  — strong

**Question:** What is the literal mapping from GL accounts to the regulator's/parent's named line items, and where does it live?

**Verified against:** GlReportsService (gl-reports.service.ts, six report methods at lines 74/94/146/191/228/256), no Filing/ReportTemplate model anywhere in schema — verified exact

## Killed (0)

_Nothing was killed._


## Citations corrected (1)

- None needed — all citations (file paths, line ranges, field names, model constraints, method names) were opened and verified accurate against the current repo state.
