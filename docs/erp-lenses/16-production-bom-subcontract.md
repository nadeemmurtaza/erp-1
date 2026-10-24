# 16. Production, bill of materials and subcontract

Making a thing is the one flow where the stock ledger, the general ledger and
a third party's shelf all disagree while the work is unfinished. A shop with
one tailor absorbs the gap by memory. A group with a subcontracted workshop,
a fiscal auditor and a `JournalEntry` per fact cannot: half-made goods are
real money sitting somewhere the schema has no column for.

## Lens: The cloth that leaves the building

**Question:** When a `WorkOrder`'s components are issued to a subcontracted
tailor instead of consumed on our own floor, which `Location` row or `Party`
row holds that stock while it is out, and which permission key lets someone
list everything currently outside our four walls?

**Why:** `WorkOrder.locationId` (`production.prisma:72`) is a bare scalar
into `Location`, whose `LocationType` enum (`inventory.prisma`) is only
`STORE | WAREHOUSE | IN_TRANSIT` — no subcontractor site. `StitchingJob.
assignedTailorId` (`stitching.prisma:132`) points at `User.id`, not a `Party`,
and stitching "writes no stock movements" (ground truth, confirmed: no
`inventory.move()` call anywhere under `modules/stitching/`). `PartyRoleName`
(`parties.prisma:8`) is `SUPPLIER | MANUFACTURER | DISTRIBUTOR | RETAILER` —
no subcontractor role exists either. Cloth handed to an outside tailor is
consumed from our stock (`PRODUCTION_CONSUMPTION`) and then simply gone from
every table until it returns as a finished garment.

**Worked example:** Narrow slice: mark the variant `producedInHouse`, write a
`BillOfMaterial`, release a `WorkOrder` that debits fabric at the default
location. Complete capability: an `IN_TRANSIT`-shaped location type or a
`Party`-scoped stock bucket for "fabric at Ahmed Tailoring," a movement
reason for issue-to-subcontractor distinct from `PRODUCTION_CONSUMPTION`, and
a report answering "how many meters of our cloth are outside our buildings
right now, and at which of the 100+ subcontractors."

**Done test:** `grep -n "SUBCONTRACT" apps/api/prisma/schema/*.prisma` and
`grep -n "SUBCONTRACT" packages/shared/src/permissions.ts` — the PR that
claims subcontract support must add a row to one of these, not just a UI
label. Reviewer confirms a `VariantLocationStock` row can exist at a location
that is not our own store or warehouse.

**Breaks without:** At 100+ locations including tailor shops, the balance
sheet's Inventory account either double-counts (component debited from our
warehouse, finished good never explicitly credited "at subcontractor" so it
reads as ours-on-hand when it is not) or silently zeroes fabric that a
dishonest or bankrupt subcontractor never returns — with no row anywhere that
ever said it was theirs to hold.

## Lens: The scrap that has no reason code

**Question:** When a released `WorkOrder` consumes more fabric than the BOM
predicts — cutting waste, a spoiled panel, a subcontractor's honest shortfall
on return — which `StockMovementReason` records it, and which account
absorbs the cost, as distinct from the `WRITE_OFF`/`ADJUSTMENT` a stock count
already uses for something else?

**Why:** `BillOfMaterialLine.quantityPerUnit` (`production.prisma:30`) is the
only quantity field — no yield, wastage or scrap-factor column. `release()`
computes `delta = -Math.ceil(line.quantityPerUnit * quantityOrdered)`
(`work-orders.service.ts:165`) — a fixed, rounded-up debit assumed to be
exactly right every time. `StockMovementReason` (`inventory.prisma:5-19`) has
`PRODUCTION_CONSUMPTION`/`PRODUCTION_RECEIPT` but no scrap-specific value;
the only two accounting-visible loss paths are `stock_variance.recorded`
(Dr 5100 Shrinkage) and manual `ADJUSTMENT`, neither tagged to a `WorkOrder`.

**Worked example:** Narrow slice: `release()` debits exactly
`ceil(qty*ordered)` meters and `complete()` credits the garments — a perfect
world with no waste. Complete capability: a scrap quantity recorded per
`WorkOrder` component (over-consumption beyond the BOM line), a
`PRODUCTION_SCRAP` reason distinct from shrinkage, and a posting rule that
routes it to a production-variance account so cutting-floor loss is visible
by SKU and by subcontractor, not blended into the shop's generic Shrinkage
line.

**Done test:** `grep -n "PRODUCTION_SCRAP\|scrapQuantity" apps/api/prisma/
schema/*.prisma` — a PR claiming scrap tracking must add one of these.
Reviewer confirms a `WorkOrder` can record consumption above the BOM line's
`ceil()` value without falling back to a generic `ADJUSTMENT` reason.

**Breaks without:** At corporate volume, a merchandiser or planner
(named actor types in the enterprise brief) cannot distinguish "this SKU's
BOM is wrong" from "this subcontractor wastes fabric" from "a stock count
found a hole" — all three currently post through the same 5100 Shrinkage
account or the same generic `ADJUSTMENT` reason, so nobody can act on the
actual cause.

## Not modelled yet

- A subcontractor/tailor-workshop location or party role — `LocationType`
  and `PartyRoleName` both lack one, so stock held outside our own buildings
  cannot be represented at all, only "consumed" or "on hand."
- Any accounting posting for production (`BomProductionRunPosted` per R15) —
  `WorkOrderReleased`/`WorkOrderCompleted` reach no posting rule today.
- A scrap/yield factor on `BillOfMaterialLine` or a dedicated scrap
  `StockMovementReason` — over-consumption has no distinct home from
  shrinkage or manual adjustment.
- Multi-level BOM explosion, routing/labour/operations, and BOM versioning
  or effectivity dates — `BillOfMaterial` is one flat, unversioned recipe
  per variant (ground truth, confirmed in `bom.service.ts`).

## Hardening record

**Kept**

- *The cloth that leaves the building* — subcontractor stock has no
  representable home (`LocationType` lacks a subcontractor value,
  `PartyRoleName` lacks one, `StitchingJob.assignedTailorId` points at
  `User` not `Party`). Distinct from any WO-22 or CLAUDE.md lens: those
  cover intercompany netting and transfer topology between our own nodes,
  not stock held by a third party who is not a node in the org tree at all.
- *The scrap that has no reason code* — `release()`'s
  `-Math.ceil(line.quantityPerUnit * quantityOrdered)` is a fixed debit with
  no yield/wastage column on `BillOfMaterialLine`, and `StockMovementReason`
  has no scrap-specific value, so over-consumption has no distinct home from
  `WRITE_OFF`/`ADJUSTMENT`. Distinct from *The cloth that leaves the
  building*: that lens is about representing WHERE stock sits while out;
  this one is about representing WHY inventory value left the count at all.

**Killed**

- *The posting that never fires* — restates
  `docs/erp-lenses/07-money-integrity-gl.md`'s "The unwritten posting rule"
  lens verbatim in substance, not just in domain. That lens's own "Why" and
  "Worked example" already cite this exact gap — `work-orders.service.ts`'s
  `complete()` moving `PRODUCTION_RECEIPT` stock with no matching journal,
  the same missing `WorkOrderReleased`/`WorkOrderCompleted` handlers in
  `posting-rules.subscriber.ts`, and the same `BomProductionRunPosted`
  citation from R15 — down to the identical worked example (release a work
  order, watch stock move, no journal fires). A second lens that asks the
  same question of the same object with the same fix is not a sharper cut,
  it is the landfill failure the review exists to stop. Killing it leaves
  two lenses, which meets the floor, so no replacement was written.

**Citations corrected**

- None. Every path, model, enum and service method cited in the surviving
  lenses was opened and verified against the current schema and source:
  `WorkOrder.locationId` (`production.prisma:72`, scalar `String?`),
  `LocationType` (`inventory.prisma:68-71`, `STORE | WAREHOUSE | IN_TRANSIT`),
  `StitchingJob.assignedTailorId` (`stitching.prisma:132`),
  `PartyRoleName` (`parties.prisma:8-13`, no subcontractor role),
  `BillOfMaterialLine.quantityPerUnit` (`production.prisma:30`, the only
  quantity column), `WorkOrdersService.release()`'s
  `delta = -Math.ceil(...)` (`work-orders.service.ts:165`), and
  `StockMovementReason` (`inventory.prisma:5-19`, no scrap-specific value)
  all matched the claimed text and line numbers exactly. `SUBCONTRACT` and
  `PRODUCTION_SCRAP`/`scrapQuantity` were confirmed absent from
  `apps/api/prisma/schema/*.prisma` and `packages/shared/src/permissions.ts`,
  which is what makes both `doneTest`s falsifiable rather than already-true.
