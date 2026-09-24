# 10g generate costing transfer pricing

Output of the `gen:10:costing-transfer-pricing` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Cost, margin and intercompany

## File

docs/erp-lenses/costing-transfer-pricing/10-costing-transfer-pricing.md

## Lenses

### Transfer price fixed at cost

**Question:** Name the column that would hold an inter-brand markup on StockTransferLine or InterBranchInvoice, name the table it would be priced from (a brand-pair policy, a price list, a per-category margin), and say what SettlementMode.INTERNAL_PL is for if not that.

**Grounding:** transfers.prisma:132-137 (InterBranchInvoice.amountMinor doc comment: 'never carries a markup... always nets to zero group-wide'); SettlementMode enum comment ('left buildable, not built')

### Opt-in cost redaction

**Question:** List every controller action that returns costPrice, unitCost or landedUnitCost, and for each, say whether it calls stripProductCost/stripOrderCost/stripProductListCost/stripOrderListCost (apps/api/src/core/common/cost-fields.ts) or relies only on the coarser permission gating the whole endpoint.

**Grounding:** packages/shared/src/permissions.ts:157-158 (inventory.view_cost); apps/api/src/core/common/cost-fields.ts (opt-in stripper, used in catalog-admin.controller.ts and orders.controller.ts only); apps/api/src/modules/inventory/inventory.controller.ts:11 and inventory.service.ts toVariantView() (costPrice leaks unconditionally under inventory.manage)

### The ledger's five unfilled columns

**Question:** For each of JournalLine's five scope columns (organizationId, retailBrandId, branchNodeId, costCentreId, counterpartyBrandId - accounting.prisma:185-197), name which of the seven posting rules in posting-rules.subscriber.ts populates it today, and for costCentreId specifically, name the model a value could ever come from.

**Grounding:** accounting.prisma:185-197 (JournalLine columns); posting-rules.subscriber.ts:358-371 (only the transfer-invoice rule sets retailBrandId/counterpartyBrandId); grep '^model CostCentre' across all .prisma files returns nothing

## Absences

- A transfer-pricing/markup model or policy table (no column anywhere lets an inter-brand transfer price above weighted-average cost)
- A CostCentre model backing JournalLine.costCentreId
- Unrealized intercompany profit elimination on the balance sheet (ConsolidationService's own comment: 'not attempted here')
- Per-location or per-brand costing (ProductVariant.costPrice is one global weighted average)
- FIFO or standard costing alongside the single weighted average

