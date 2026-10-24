# 34g generate provenance esg statutory

Output of the `gen:34:provenance-esg-statutory` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Provenance, recall and statutory reporting

## File

docs/erp-lenses/34-provenance-esg-statutory.md

## Lenses

### Every unit, not the whole SKU

**Question:** Given a defined bad batch (contaminated dye lot, unsafe component), what column or table names that batch, and what query returns every location, in-transit shipment, order and customer that received a unit from it — not "every StockMovement for this variantId"?

**Grounding:** StockMovement (inventory.prisma:22-59, no lotId/batchNumber column, refId on SALE points at Order not GoodsReceipt); GoodsReceiptItem (purchasing.prisma:165-180, no lot field); VariantLocationStock (inventory.prisma:156-166, @@id([variantId, locationId]) — fungible per location, no batch dimension)

### The claim, not the supplier

**Question:** For an origin or compliance claim shown to a customer or filed with a regulator, which row does the claim attach to — a specific shipment, or a standing Supplier field — and what happens when the same SKU is later sourced from a different country?

**Grounding:** Supplier.country (purchasing.prisma:9-11, ISO alpha-2, nullable, a standing counterparty fact); GoodsReceiptItem (purchasing.prisma:165-180, no country-of-origin/certificate field); Product/ProductVariant (catalog.prisma:89-229, fabric/season/tags but no origin field)

### The regulator's own boxes

**Question:** For a periodic statutory or parent-mandated report, what is the literal mapping from this system's GL accounts to the regulator's or parent's named line items, and where does that mapping live so a chart-of-accounts change does not silently break a quarter already filed?

**Grounding:** GlReportsService (gl-reports.service.ts:15-26, trialBalance/profitAndLoss/balanceSheet/cashFlow/aged reports shaped around this deployment's own seeded Account.code); no Filing/ReportTemplate/account-mapping model exists in apps/api/prisma/schema/*.prisma; distinguished from the existing "Click the number"/"The file outlives the app" lenses (drill-down and provenance metadata, not external field-layout mapping)

## Absences

- No lot/batch/serial model or column anywhere in the schema — stock is fungible per variantId+locationId, so a recall cannot chain from a GoodsReceipt to the specific units it produced
- No per-shipment origin or certification field — Supplier.country is the only origin-shaped data and it describes the counterparty, not a receipt
- No Filing/ReportTemplate model and no account-to-external-line mapping — GlReportsService's five reports are internal-shaped only, with no versioned mapping to a regulator's or parent's mandated line items

