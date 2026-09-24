# 35h. Hardening record: Risk, insurance and business continuity

Adversarial review of [35-risk-insurance-continuity.md](./35-risk-insurance-continuity.md) by the `harden:35:risk-insurance-continuity` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (4)

### The insured value nobody can total  — strong

**Question:** For a single Location, what is today's query (tables + join) that returns value of stock at risk, and where would a per-location valuation basis live if it must differ from the COGS costing figure?

**Verified against:** ProductVariant.costPrice (catalog.prisma:183, global, no location dimension); VariantLocationStock (inventory.prisma:156, @@id at 165); Location (inventory.prisma:76-113, no value/valuation field) — all verified by direct read.

### The claim's evidence pack, not just the claim  — strong

**Question:** When a DAMAGE/WRITE_OFF StockMovement or oversell StockVariance becomes a claim, what table holds insurer name/claim ref/amounts, and how is a photo or police report attached today?

**Verified against:** StockVariance (inventory.prisma:127-150); resolve() in stock-variance.service.ts:24-37 moves no stock, reverses no journal (matches file's own comment); AuditLog (core.prisma:220-235); zero Attachment/Document/fileUrl/s3Key models in schema — all verified.

### The branch that cannot trade tomorrow  — solid

**Question:** When a Location must stop trading tomorrow, which field is flipped, and does that alone stop InventoryService.defaultLocationId() routing, TransfersService dispatch, and PosTerminal shift opens?

**Verified against:** Location.isActive (inventory.prisma:101); defaultLocationId() (inventory.service.ts:166), 8 call sites with no caller-supplied locationId; NodeStatus (organization.prisma:127-130), Node has no locationId; PosTerminal.status is its own unrelated enum (pos.prisma:41) — all verified; doneTest grep corrected (see corrections).

### The risk register with no register  — solid

**Question:** Where does a risk entry live (owner, likelihood/impact, threatened Location/RetailBrand, next review date), and what query lists risks overdue for review today?

**Verified against:** No model Risk anywhere in schema (grep confirmed); RoleGrant/UserRoleAssignment/UserPermission (core.prisma:321,336,278) have only createdAt; AdminScope (organization.prisma:106-120) is closest owner-shaped row but grants access, not a risk register. Differentiated in-file from lens 10.

## Killed (0)

_Nothing was killed._


## Citations corrected (1)

- Lens 3 ('The branch that cannot trade tomorrow') doneTest originally implied grep -rn "isActive" apps/api/src/modules/{inventory,pos,transfers} would find nothing consuming Location.isActive. Verified this is wrong: the grep returns real hits, but they are all ProductVariant.isActive filters plus transfers.service.ts:105-109, which sets the IN_TRANSIT scratch location's own isActive:false only to hide it from listLocations() — not a guard on a destination Location.isActive before dispatch/receipt/shift-open. Rewrote the doneTest to state what the grep actually returns and require a new consuming read as the pass condition.

## Not modelled in this repo today

- Confirmed via grep: no model Risk in apps/api/prisma/schema (all 22 files).
- Confirmed via grep: no Attachment, Document, fileUrl, or s3Key model/field anywhere in apps/api/prisma/schema.
- Confirmed: Node model (organization.prisma:142 onward) has no locationId field.
- Confirmed: Location model (inventory.prisma:76-113) has no insuredValue/replacementValue/valuationBasis field.
