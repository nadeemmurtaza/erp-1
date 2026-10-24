# 15h. Hardening record: Warehouse, logistics, fleet and proof of delivery

Adversarial review of [15-warehouse-logistics-fleet.md](./15-warehouse-logistics-fleet.md) by the `harden:15:warehouse-logistics-fleet` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### Bins are not built, locations are the floor  — strong

**Question:** What field on what table tells a picker which rack/shelf/bin to walk to, and what SKU count must the feature still work at without one?

**Verified against:** VariantLocationStock @@id([variantId, locationId]) at apps/api/prisma/schema/inventory.prisma:156; repo-wide grep for bin/zone/aisle/shelf models returns nothing

### The handoff that has no signer  — strong

**Question:** Name the row/column that survives 12 months recording who had physical custody at each step (driver, vehicle, recipient) and whose signature/photo is attached.

**Verified against:** StockTransfer (transfers.prisma:41, only createdByUserId/receivedByUserId); Shipment (orders.prisma:213, courier/trackingNumber/trackingUrl/deliveredAt, no driver/signature); orders.manage permission (permissions.ts:69)

### Shortage with no reason, no evidence  — strong

**Question:** When less arrives than dispatched, what value distinguishes damage/theft/miscount and what evidence field holds proof, not just the write-off delta?

**Verified against:** StockTransferLine (transfers.prisma:82); receive() shortfall branch hardcoding reason: 'WRITE_OFF' (transfers.service.ts:233); StockMovementReason enum already has DAMAGE/COUNT/WRITE_OFF as distinct values (inventory.prisma:5-20) that receive() never chooses between; StockVariance (inventory.prisma:127) is for postUnconditional() oversells, not transfer shortage

## Killed (0)

_Nothing was killed._


## Citations corrected (2)

- Lens 2 cited a nonexistent cross-reference "lens 25" for the reversal-document lens; file 25 in this series is privacy-retention-residency, unrelated. Corrected to point at the WO-22 'Lifecycle reversal' set in docs/implementation/WO-22-lens-workflow-results.md.
- Lens 3's "why" claimed WRITE_OFF is used for every kind of write-off with no sub-reason vocabulary in the schema. Verified this understates the actual defect: StockMovementReason (inventory.prisma:5-20) already defines separate DAMAGE and COUNT values used elsewhere in the ledger; the real gap is that transfers.service.ts's receive() shortfall branch (line 233) never selects among them and hardcodes reason: 'WRITE_OFF' regardless of cause. Rewrote the why/doneTest to state this precisely.
