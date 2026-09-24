# 17g generate merchandising assortment

Output of the `gen:17:merchandising-assortment` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Assortment, category and space

## File

docs/erp-lenses/merchandising-assortment/17-merchandising-assortment.md

## Lenses

### Carried, not just in stock

**Question:** For a specific Location, name the field or table that states this SKU is meant to be sold there — distinct from VariantLocationStock.quantity, which only ever counts what physically arrived. What tells 'never ranged here' apart from 'ranged here, currently at zero'?

**Grounding:** VariantLocationStock (inventory.prisma:156, @@id([variantId, locationId])) has only quantity and updatedAt; a row is created only by InventoryService.applyMovement, so a row's existence already conflates 'sold here once' with 'authorized to sell here'.

### No such thing as a store grade

**Question:** When a new Location is graded (flagship, standard, kiosk), name the table mapping grade to the SKU set or category depth that grade may carry, and the query listing every Location on each grade.

**Grounding:** Location (inventory.prisma:76) has type/isDefault/isActive/retailBrandId/originNodeId only — no grade/tier/cluster column, and grep -rni "cluster|zone|region|storeGroup" apps/api/prisma/schema returns nothing but an unrelated Order.shippingZone string.

### The new store's first delivery

**Question:** When a new Location row is created, name the process and artifact that seeds its correct opening assortment and quantities before day one, not whatever purchasing happens to move there afterward.

**Grounding:** InventoryService.defaultLocationId() (inventory.service.ts:166-168) is findFirstOrThrow({where:{isDefault:true}}), the resolution path for receipt/fulfilment/import/counts; StockCountService.start() (stock-count.service.ts:92-101) snapshots every isActive ProductVariant with no locationId filter.

## Absences

- An assortment/ranging table stating which (SKU, location) pairs are authorized to sell, independent of stock quantity
- A location grade/tier/format/cluster dimension or any location-grouping model
- A seasonal collection/range entity with a lifecycle (buy window, sell-through target, markdown trigger) — Product.season is a free-text filter field only
- A store-opening workflow or document type that seeds a new Location's starting assortment as a distinct auditable artifact
- Any shelf/fixture capacity or planogram (space) representation

