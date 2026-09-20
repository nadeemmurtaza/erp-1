# 17. Assortment, category and space

At Solo scale, "the catalogue" and "what the shop sells" are the same list, so
nobody notices the schema never separated them. At Org scale they are not:
10,000+ products, several times that in variants, and 100+ locations of
different formats mean most (SKU, location) pairs should never carry stock at
all. A feature built against `Product`/`ProductVariant` alone — the only
models that exist today — silently assumes every SKU belongs everywhere,
which is true only for a single shop.

## Lens: Carried, not just in stock

**Question:** For a specific Location, name the field or table that states
this SKU is *meant* to be sold there — distinct from
`VariantLocationStock.quantity`, which only ever counts what physically
arrived. What does an engineer query to tell "never ranged here" apart from
"ranged here, currently at zero"?

**Why:** `VariantLocationStock` (`inventory.prisma:156`) is
`@@id([variantId, locationId])` with only `quantity` and `updatedAt` — no
`isRanged`/`assortmentStatus` column. A row is created only by a movement
(`InventoryService.applyMovement`), so the row's mere existence already
conflates "sold here once" with "authorized to sell here." Neither state is
recorded on purpose; both look identical to any query.

**Worked example:** Narrow slice: a "store availability" tab on the product
admin page that lists `VariantLocationStock` rows and their quantity per
location. Complete capability: an assortment table that positively states,
per Location or location-group, which SKUs are ranged there independent of
stock — so quantity 0 on a ranged SKU means "reorder" and no row at all means
"not carried, never alert."

**Done test:** `grep -n "isRanged\|assortmentStatus\|isCarried" apps/api/prisma/schema/*.prisma`
returns a hit on a location-scoped model, and the PR names the query a
merchandiser runs to list "SKUs ranged at Location X" without joining stock
movements to infer it.

**Breaks without:** Reorder alerts and stockout dashboards fire for every SKU
a store has simply never carried, because zero-quantity-because-never-ranged
and zero-quantity-because-sold-out read identically. At 100+ locations,
buyers get paged for products that were never meant to be on that floor, with
no field to silence it short of memorising the exclusion list by eye.

## Lens: No such thing as a store grade

**Question:** When a new Location is graded (flagship, standard, kiosk),
name the table that maps a grade to the SKU set or category depth that grade
is entitled to carry, and the query that lists every Location currently on
each grade.

**Why:** `Location` (`inventory.prisma:76`) carries `type`
(`STORE|WAREHOUSE|IN_TRANSIT`), `isDefault`, `isActive`, `retailBrandId` and
`originNodeId` — no grade, tier, format or cluster column, and
`grep -rni "cluster|zone|region|storeGroup" apps/api/prisma/schema` returns
nothing but an unrelated `Order.shippingZone` string. There is no
location-grouping model of any kind, so "every SKU everywhere" is the only
assortment the schema can express.

**Worked example:** Narrow slice: an admin toggle to set `isActive: false` on
a `ProductVariant` globally so a discontinued line disappears everywhere.
Complete capability: a grade dimension on locations (or a location-group join
table), an assortment plan keyed by grade x category, and a compliance report
showing which stores are over or under their grade's plan.

**Done test:** The PR contains a model or join table mapping a Location (or
location-group) to a bounded product or category set, and a query that
answers "how many of grade B's plan does Location LHR-04 actually carry" as a
number, not a manually maintained list.

**Breaks without:** A 12-SKU kiosk and a 9,000-SKU flagship are
indistinguishable to every screen and every replenishment job. Buying and
store-opening packs default to "give it everything," so a small-format branch
either drowns in stock it cannot shelve, or a planner manually excludes
thousands of rows by hand each season.

## Lens: The new store's first delivery

**Question:** When a new Location row is created, name the process and the
artifact that seeds its correct opening assortment and quantities before day
one — not "whatever purchasing happens to move there afterward."

**Why:** `InventoryService.defaultLocationId()` (`inventory.service.ts:166-168`)
is a single `findFirstOrThrow({ where: { isDefault: true } })`, and is the
resolution path for goods receipt, order fulfilment, product import and stock
counts. `StockCountService.start()` (`stock-count.service.ts:92-101`)
snapshots every `isActive: true` `ProductVariant` with no `locationId`
filter at all — a count, like a receipt, has no per-location shape. Nothing
represents "a store opening" as an event; the 101st branch gets no generated
line list and no distinct onboarding path from the one MAIN location every
deployment already assumes.

**Worked example:** Narrow slice: a "Create Location" form that inserts a
`Location` row and leaves staff to transfer stock to it by hand afterward.
Complete capability: a store-opening workflow that, from the branch's grade
and the brand's active assortment, generates an opening pack — target SKUs
and quantities as a named, auditable document — driving real
`StockTransfer`/`PURCHASE_RECEIPT` movements into that Location, not the
default one.

**Done test:** The PR names a model or document type, distinct from
`StockTransfer`/`GoodsReceipt`, whose destination `locationId` is the new
branch, plus a test that creates a second Location and asserts
`InventoryService.defaultLocationId()` is never invoked on its behalf.

**Breaks without:** Every "receive stock for the new branch" action silently
lands at MAIN — the one `isDefault` row — unless each call site remembers to
pass `locationId` explicitly. At 100+ locations, a new store opens with empty
shelves while its inventory sits, correctly recorded, at the original shop
several provinces away.

## Not modelled yet

- An assortment/ranging table: which (SKU, location) pairs are authorized to
  sell, independent of `VariantLocationStock.quantity`.
- A location grade, tier, format or cluster/zone dimension — `Location` has
  no such column and no grouping model exists.
- A seasonal collection/range with a lifecycle (buy window, sell-through
  target, markdown trigger) — `Product.season` is a free-text filter field,
  not an entity with dates or state.
- A store-opening workflow or document type that seeds a new Location's
  starting assortment and quantities as a distinct, auditable artifact.
- A shelf/fixture capacity or planogram concept of any kind — space is not
  represented anywhere in the schema.
