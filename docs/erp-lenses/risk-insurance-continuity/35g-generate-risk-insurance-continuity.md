# 35g generate risk insurance continuity

Output of the `gen:35:risk-insurance-continuity` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Risk, insurance and business continuity

## File

docs/erp-lenses/risk-insurance-continuity/35-risk-insurance-continuity.md

## Lenses

### The insured value nobody can total

**Question:** For a single Location, what is today's query — name the tables and the join — that returns the value of stock at risk there, and where would a per-location valuation basis (replacement cost vs retail vs landed cost) live if it must differ from the costing figure used for COGS?

**Grounding:** ProductVariant.costPrice (global weighted average, purchasing.service.ts); VariantLocationStock @@id([variantId, locationId]) at inventory.prisma:156; Location model inventory.prisma:76-113 has no value/insuredValue field; no CostCentre model anywhere

### The claim's evidence pack, not just the claim

**Question:** When a DAMAGE/WRITE_OFF StockMovement or an oversell StockVariance becomes an insurance or shrinkage claim, what table holds the claim — insurer name, claim reference, amount claimed, amount recovered — and how does today's code attach a photo or a police report reference to it?

**Grounding:** StockVariance model inventory.prisma:127-150 (resolutionNote, resolvedByUserId, resolvedAt only); AuditLog.data Json? core.prisma:220-235; grep confirmed no Attachment/Document/fileUrl/s3Key model in apps/api/prisma/schema

### The branch that cannot trade tomorrow

**Question:** When a Location must stop trading from tomorrow (fire, flood, forced closure), which field gets flipped, and does that single change stop InventoryService.defaultLocationId() from routing a receipt there, stop TransfersService from dispatching a new transfer to it, and stop its PosTerminal rows from opening a shift?

**Grounding:** Location.isActive inventory.prisma:101; InventoryService.defaultLocationId() resolves by isDefault only (per ground brief inventory.service.ts:166); NodeStatus ACTIVE|SUSPENDED organization.prisma:127-130 with Node carrying no locationId; PosTerminal.status pos.prisma:27-41 as an independent enum

### The risk register with no register

**Question:** Where does a risk entry live — one row naming the risk, its owner, a likelihood/impact rating, the Location or RetailBrand it threatens, and the date it is next due for review — and what query lists every risk overdue for review today?

**Grounding:** grep 'model Risk' over apps/api/prisma/schema returns nothing across 115 models; AdminScope organization.prisma:106-120 and RoleGrant/UserRoleAssignment/UserPermission each carry only createdAt, no expiry/review date; explicitly differentiated from existing lens 10

## Absences

- No insurance-claim or file/evidence-attachment model anywhere in the 115-model schema (Attachment, Document, fileUrl, s3Key all grep to nothing)
- No per-location or per-policy valuation field distinct from the single global weighted-average ProductVariant.costPrice
- No Risk/RiskRegister model, and no owner-plus-review-date shape on any existing grant or scope table
- No single switch that stops a Location from trading across inventory, transfers and POS at once — Location.isActive, NodeStatus and PosTerminalStatus are three unlinked flags today
- No business-interruption or continuity-plan model (alternate location, failover roster, resumption target) anywhere in the schema

