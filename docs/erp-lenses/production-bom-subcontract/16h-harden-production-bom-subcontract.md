# 16h. Hardening record: Production, bill of materials and subcontract

Adversarial review of [16-production-bom-subcontract.md](./16-production-bom-subcontract.md) by the `harden:16:production-bom-subcontract` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (2)

### The cloth that leaves the building  — strong

**Question:** Which Location or Party row holds subcontracted stock while it is out, and which permission key lists everything outside our four walls?

**Verified against:** WorkOrder.locationId (production.prisma:72) scalar into Location; LocationType (inventory.prisma:68-71) is STORE|WAREHOUSE|IN_TRANSIT only; StitchingJob.assignedTailorId (stitching.prisma:132) points at User not Party; PartyRoleName (parties.prisma:8-13) has no subcontractor role — all verified present and accurate.

### The scrap that has no reason code  — solid

**Question:** Which StockMovementReason records over-consumption beyond the BOM line, and which account absorbs it, distinct from WRITE_OFF/ADJUSTMENT?

**Verified against:** BillOfMaterialLine.quantityPerUnit (production.prisma:30) is the only quantity field; release()'s delta=-Math.ceil(...) (work-orders.service.ts:165); StockMovementReason enum (inventory.prisma:5-19) has no scrap value — all verified.

## Killed (1)

- **The posting that never fires** — Restates docs/erp-lenses/money-integrity-gl/07-money-integrity-gl.md's "The unwritten posting rule" lens in substance: same missing WorkOrderReleased/WorkOrderCompleted handlers, same BomProductionRunPosted citation, same worked example (release a work order, stock moves, no journal fires). A second lens asking the same question of the same object with the same fix is duplication, not a sharper cut. Killing it leaves 2 lenses, which meets the floor, so no replacement was added.

## Citations corrected (1)

- None found — all citations (WorkOrder.locationId at production.prisma:72, LocationType enum at inventory.prisma:68-71, StitchingJob.assignedTailorId at stitching.prisma:132, PartyRoleName at parties.prisma:8-13, BillOfMaterialLine.quantityPerUnit at production.prisma:30, WorkOrdersService.release()'s delta calc at work-orders.service.ts:165, StockMovementReason enum at inventory.prisma:5-19, the seven posting-rules.subscriber.ts @OnDomainEvent handlers, and the absence of SUBCONTRACT/PRODUCTION_SCRAP/scrapQuantity in schema and permissions.ts) were verified exact against the current repo.

## Not modelled in this repo today

- No absences to report — the deleted 'posting that never fires' lens's underlying claims (about work-orders.service.ts and posting-rules.subscriber.ts) were verified accurate before being removed for duplication with 07-money-integrity-gl.md, not for factual error.
