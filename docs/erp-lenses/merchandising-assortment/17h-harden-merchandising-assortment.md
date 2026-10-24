# 17h. Hardening record: Assortment, category and space

Adversarial review of [17-merchandising-assortment.md](./17-merchandising-assortment.md) by the `harden:17:merchandising-assortment` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### Carried, not just in stock  — strong

**Question:** For a specific Location, name the field or table that states this SKU is meant to be sold there, distinct from VariantLocationStock.quantity.

**Verified against:** VariantLocationStock (inventory.prisma:156) verified: @@id([variantId, locationId]), only quantity/updatedAt columns, no isRanged/assortmentStatus field anywhere in the schema.

### No such thing as a store grade  — strong

**Question:** Name the table mapping a Location grade to the SKU set/category depth it is entitled to carry, and the query listing every Location on each grade.

**Verified against:** Location (inventory.prisma:76) verified: type/isDefault/isActive/retailBrandId/originNodeId only, no grade column; grep for cluster/zone/region/storeGroup returns only the unrelated Order.shippingZone (orders.prisma:65).

### The new store's first delivery  — strong

**Question:** Name the process and artifact that seeds a new Location's opening assortment and quantities before day one.

**Verified against:** InventoryService.defaultLocationId() (inventory.service.ts:166-168) and StockCountService.start() (stock-count.service.ts:92-101) both verified verbatim: no location-scoped seeding path exists.

## Killed (0)

_Nothing was killed._


## Citations corrected (1)

- None required — all citations (VariantLocationStock, Location, Product.season, InventoryService.defaultLocationId, StockCountService.start, StockTransfer, GoodsReceipt, PURCHASE_RECEIPT) checked against the actual repository and found accurate as stated, including line numbers.

## Not modelled in this repo today

- No corrections were needed; all citations verified on first read.
