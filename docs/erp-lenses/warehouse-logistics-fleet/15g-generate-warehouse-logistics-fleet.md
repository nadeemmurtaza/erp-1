# 15g generate warehouse logistics fleet

Output of the `gen:15:warehouse-logistics-fleet` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Warehouse, logistics, fleet and proof of delivery

## File

docs/erp-lenses/warehouse-logistics-fleet/15-warehouse-logistics-fleet.md

## Lenses

### Bins are not built, locations are the floor

**Question:** When a picker is told to fulfil a line, what field on what table tells them which rack, shelf or bin inside the location to walk to — and if none exists, what is the largest single location's SKU count the feature must still work at without one?

**Grounding:** VariantLocationStock @@id([variantId, locationId]) at apps/api/prisma/schema/inventory.prisma:156; confirmed no Bin/Zone/Aisle/Shelf model exists anywhere in apps/api/prisma/schema/*.prisma

### The handoff that has no signer

**Question:** For this movement of physical goods, name the row and column that will still exist in twelve months recording who physically had custody at each step — driver, vehicle, or recipient by name — and whose signature or photograph is attached to it; if none, say so.

**Grounding:** StockTransfer (transfers.prisma:41) has only createdByUserId/receivedByUserId; Shipment (orders.prisma:213) has courier/trackingNumber/deliveredAt with no signature/photo/driver/vehicle; orders.manage (permissions.ts:69) is one flat key labelled 'Manage orders and shipments'

### Shortage with no reason, no evidence

**Question:** When less arrives than was dispatched, what value distinguishes damage from theft from a miscount, and what evidence field holds the proof — not just the quantity delta that gets written off?

**Grounding:** StockTransferLine (transfers.prisma:82) has only quantityDispatched/quantityReceived/unitCost; transfers.service.ts:233 posts any shortfall with the generic reason WRITE_OFF (inventory.prisma:5-20), with no sub-reason or evidence column

## Absences

- No bin, zone, aisle or shelf model — Location is the finest storage grain in the schema
- No driver, vehicle or fleet model anywhere — in-transit custody is represented only by a Location (StockTransfer.inTransitLocationId), never a person or vehicle
- No proof-of-delivery artifact (signature, photograph, recipient name) on either StockTransfer or Shipment
- No pick-list or pick-wave concept spanning multiple orders or transfers — fulfilment and dispatch are both single-document actions with no shared batching
- No damage/shortage sub-reason or evidence field distinct from the generic WRITE_OFF stock-movement reason

