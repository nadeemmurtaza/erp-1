# 16g generate production bom subcontract

Output of the `gen:16:production-bom-subcontract` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Production, bill of materials and subcontract

## File

docs/erp-lenses/16-production-bom-subcontract.md

## Lenses

### The cloth that leaves the building

**Question:** When a WorkOrder's components are issued to a subcontracted tailor instead of consumed on our own floor, which Location row or Party row holds that stock while it is out, and which permission key lets someone list everything currently outside our four walls?

**Grounding:** WorkOrder.locationId (production.prisma:72) -> Location, whose LocationType enum is only STORE|WAREHOUSE|IN_TRANSIT; StitchingJob.assignedTailorId (stitching.prisma:132) points at User, not Party; PartyRoleName (parties.prisma:8) is SUPPLIER|MANUFACTURER|DISTRIBUTOR|RETAILER with no subcontractor role; confirmed no inventory.move() call exists under modules/stitching/

### The posting that never fires

**Question:** Name the DomainEvent and the posting rule that debits a WIP or Inventory account when a WorkOrder consumes raw material, and credits it when the finished good is completed, then say what account balance is wrong between release() and complete() today.

**Grounding:** work-orders.service.ts:143,190 (release/complete) call only InventoryService.moveMany/.move(), never EventBusService.publish toward accounting; posting-rules.subscriber.ts has exactly 7 @OnDomainEvent handlers (grep-confirmed: OrderPlaced, PaymentSucceeded, PaymentRefunded, SupplierBillRaised, SupplierBillPaid, StockVarianceRecorded, InterBranchTransferInvoiced), none for WorkOrder; R15 lists BomProductionRunPosted as not built

### The scrap that has no reason code

**Question:** When a released WorkOrder consumes more fabric than the BOM predicts, which StockMovementReason records it and which account absorbs the cost, as distinct from the WRITE_OFF/ADJUSTMENT a stock count already uses for something else?

**Grounding:** BillOfMaterialLine.quantityPerUnit (production.prisma:30) has no yield/wastage field; release() computes delta = -Math.ceil(quantityPerUnit*quantityOrdered) (work-orders.service.ts:165); StockMovementReason enum (inventory.prisma:5-19) has no PRODUCTION_SCRAP value, only generic ADJUSTMENT/WRITE_OFF and the unrelated stock_variance.recorded -> 5100 Shrinkage posting rule

## Absences

- A subcontractor/tailor-workshop location or party role: LocationType and PartyRoleName both lack one
- Any accounting posting rule for production work orders (R15's BomProductionRunPosted is unbuilt)
- A scrap/yield factor on BillOfMaterialLine, or a dedicated PRODUCTION_SCRAP movement reason
- Multi-level BOM explosion, routing/labour/operations model, and BOM versioning/effectivity dates

