# 10h. Hardening record: Cost, margin and intercompany (docs/erp-lenses/costing-transfer-pricing/10-costing-transfer-pricing.md)

Adversarial review of [10-costing-transfer-pricing.md](./10-costing-transfer-pricing.md) by the `harden:10:costing-transfer-pricing` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### Transfer price fixed at cost  — strong

**Question:** Name the column that would hold an inter-brand markup on StockTransferLine or InterBranchInvoice, name the table it would be priced from, and say what SettlementMode.INTERNAL_PL is for if not that.

**Verified against:** transfers.prisma:132-137 (amountMinor doc comment), SettlementMode.INTERNAL_PL at line 37 / 'left buildable, not built' at line 34 — both verified verbatim

### Opt-in cost redaction  — strong

**Question:** List every controller action returning costPrice/unitCost/landedUnitCost and say whether it calls the cost-fields.ts strippers or relies only on coarse permission gating.

**Verified against:** permissions.ts:157-158 (inventory.view_cost), cost-fields.ts strippers, inventory.controller.ts:11 + inventory.service.ts:564 (confirmed real unaudited leak), reports.controller.ts:54 — all verified

### The ledger's five unfilled columns  — strong

**Question:** For each of JournalLine's five scope columns, name which of the seven posting rules sets it today, and for costCentreId specifically, name the model a real value could ever come from.

**Verified against:** accounting.prisma:185-197 (five columns), posting-rules.subscriber.ts 7 @OnDomainEvent rules (counted, exact match), lines 358-371 (only rule setting brand columns), confirmed zero CostCentre model in any .prisma file

## Killed (0)

_Nothing was killed._


## Citations corrected (0)

_Every citation checked out as written._

