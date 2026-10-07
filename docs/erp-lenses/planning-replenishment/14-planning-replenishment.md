# 14. Planning and replenishment across a hundred locations

A single-shop build can treat stock as one number and a threshold as one
column, because there is only one place stock can be. At 100+ locations the
same feature has to answer per location, not once: whose need triggered the
signal, who gets the units when a shipment can't cover every request, and
whether a number on screen is a guess or a promise. A narrow build keeps the
single-shop shape and calls it done; the gaps only show up at corporate scale.

## Lens: The reorder point has no address

**Question:** For a variant carried at 100 different locations, which table
and column holds the threshold that should trigger a reorder for Warehouse A
specifically, independent of Store B's stock — and what fires when Store B is
empty while Warehouse A sits comfortably above its own threshold?

**Why:** `ProductVariant.reorderPoint` (`catalog.prisma:184`) is one nullable
`Int` per variant for the whole deployment, not per `(variant, location)`.
`InventoryService`'s `applyMovement` compares the post-movement figure against
that single column and fires `DomainEvent.ProductReorderPointReached`
(`inventory.service.ts:374-376`) off `resultingStock` — the recomputed SUM
across every `VariantLocationStock` row for that variant (the same SUM the
service writes back to `ProductVariant.stock`). The signal is a deployment-wide
aggregate; it cannot see which of the 100 rows is actually empty. This differs
from lens 10 ("name the owner, name the reader it refuses"), which is about
who may *read* a scoped row — this is about the *write-time signal itself*
being computed over an aggregate that erases location entirely.

**Worked example:** Narrow slice: a reorder-suggestions page (already
`inventory.controller.ts`'s `getReorderSuggestions()`) lists variants where
the global stock sum crosses the global `reorderPoint`. Complete capability:
a threshold recorded per `(variantId, locationId)`, a crossing event that
carries the `locationId` that actually went short, and a drafted PO or
transfer line that names which location it is meant to replenish.

**Done test:** `grep -n "reorderPoint" apps/api/prisma/schema/*.prisma` today
returns only `catalog.prisma:184`, one column on `ProductVariant`. The PR
must add a threshold scoped to `(variantId, locationId)` — e.g. a column on
`VariantLocationStock` or a new join model — and `ProductReorderPointReachedPayload`
must carry that `locationId`, not just `variantId`/`stock`.

**Breaks without:** With a central warehouse and 99 branches, the warehouse's
healthy stock permanently masks every branch stockout: `stock` (the SUM) never
drops to the global `reorderPoint` because the warehouse is carrying it, so
`ProductReorderPointReached` — the sole trigger `reorder.listener.ts` acts
on — never fires, and no draft PO or transfer is ever raised for the branches
that are actually out.

## Lens: Not enough to go around

**Question:** When a single `GoodsReceipt` quantity is smaller than the sum
of what every location that crossed its reorder point needs, name the rule
that decides how many units each location gets, and the table or event where
that split is recorded — not just which one location the receipt was posted
to.

**Why:** `purchasing.service.ts`'s goods-receipt path posts the entire
received quantity through `moveMany` at `defaultLocationId(tx)`
(`inventory.service.ts:166`, one row `findFirstOrThrow({ where: { isDefault:
true } })`) — the single default location, regardless of how many of the 100
locations independently need it. `grep -in allocat apps/api/src/modules/supply-chain/purchasing/purchasing.service.ts`
returns only `allocateLandedCost`, which splits freight/duty *cost* across PO
lines, not physical units across locations. No table, function or event in
the repo divides one incoming quantity among competing locations. R26
(`RETAIL-ERP.md:711-724`) describes allotment as a distribution of *stock
already sitting at a branch* to online demand — a different, later question
from how one incoming shipment gets split among branches that all asked for
it in the first place.

**Worked example:** Narrow slice: `receiveGoods()` posts the full received
quantity to the one default location because that is the only location the
code is wired to write to. Complete capability: a receipt carries per-line
`{locationId, quantity}` splits, `moveMany` posts a `PURCHASE_RECEIPT`
movement at each named location in one receipt, and a shortfall (received
less than requested-sum) is recorded against a stated priority rule
(proportional to each location's shortfall, or a location rank) rather than
silently landing wherever the code's single default happens to be.

**Done test:** The PR names the allocation input shape (e.g. a
`GoodsReceiptItem`-level `locationId`) and a `receiveGoods()` call in a test
posts `moveMany` at more than one distinct `locationId` from a single
`GoodsReceipt`. `grep -n locationId apps/api/prisma/schema/purchasing.prisma`
returns nothing today — that absence is the failing case.

**Breaks without:** A shipment meant to restock 12 empty branches lands
entirely at head-office; the branches stay empty until someone manually runs
a `StockTransfer` (itself a serial per-line loop inside a 20-second
transaction per `transfers.service.ts`), and the gap between "we received the
stock" and "a customer can buy it at their branch" — the exact distinction
R26 draws for online fulfilment — is never closed for the till.

## Lens: A forecast is not a commitment

**Question:** Name the exact status value that separates "the system
projects we'll need more" from "we have committed to a supplier for more,"
and what the projection is actually computed from — a point estimate or a
distribution over historical lead time.

**Why:** `reorder.listener.ts`'s `onReorderPointReached` auto-creates a
`DRAFT` PO line (`upsertReorderDraftLine`, guarded only by the
`PurchasingAutoDraftReorder` setting) the instant the aggregate signal from
the previous lens fires, computing `quantity = reorderQuantity ??
(reorderPoint - stock)` (line 38) — a point-in-time gap-fill with no lead-time
window in it at all. `PurchaseOrderStatus` (`purchasing.prisma:88-94`) puts
`DRAFT` below `SENT`; `SENT` is where a real supplier obligation attaches
(`SupplierProduct.moq`, `purchasing.prisma:77`). But the lead time feeding
that gap-fill, `Supplier.leadTimeDays` (`purchasing.prisma:31`, default `7`,
its own comment says "feeds reorder suggestions") and
`SupplierProduct.leadTimeDays` (line 78) are bare scalars. R25
(`RETAIL-ERP.md:695-705`) names this exactly: "Real planning needs mean **and
variance**... with a scalar you can only ever guess one of them," and states
both are derivable from existing `GoodsReceipt` vs `PurchaseOrder` history —
work not yet done.

**Worked example:** Narrow slice: crossing `reorderPoint` auto-drafts a PO
line sized at `reorderPoint - stock`, treating `Supplier.leadTimeDays` as
exact. Complete capability: the draft line records what it assumed —
mean daily sell-through, and mean *and variance* of this supplier's lead
time computed from its `GoodsReceipt`-vs-`PurchaseOrder` history — with a
safety-stock margin derived from that variance, and `DRAFT`→`SENT` stays the
one transition where an actual supplier commitment (MOQ, price) is locked in.

**Done test:** `grep -n "leadTimeDays" apps/api/prisma/schema/purchasing.prisma`
today returns only the two scalar columns above, no variance/stddev column
and no service reading historical `GoodsReceipt` timestamps to derive one.
The PR must add both and show `reorder.listener.ts`'s quantity calculation
consuming them, not the raw scalar.

**Breaks without:** With 10,000+ products sourced from suppliers whose real
lead time swings between, say, 5 and 45 days, a point estimate either
overstocks slow movers across all 100 locations or stocks out fast movers
right before a seasonal peak, and a planner reviewing hundreds of
auto-drafted `DRAFT` lines a day has no way to tell a near-certain reorder
from a guess built on a lead time that has never once matched reality —
every draft looks equally confident because none of them records what it
assumed.

## Not modelled yet

- Per-location reorder thresholds — only a single global `reorderPoint` on
  `ProductVariant` exists (`catalog.prisma:184`).
- Any allocation rule for splitting scarce incoming supply across multiple
  requesting locations — no table, column or function does this anywhere in
  `apps/api/src/modules/supply-chain/purchasing/` or `inventory/`.
- Lead-time variance/distribution — `Supplier.leadTimeDays` and
  `SupplierProduct.leadTimeDays` are bare scalars; nothing computes a mean or
  variance from `GoodsReceipt` vs `PurchaseOrder` history (R25 names this as
  unbuilt).
- Seasonality of any kind — no model, column, service or scheduled job in
  `apps/api` references a season, calendar profile or demand curve; reorder
  math is a flat point-in-time gap-fill.
- A demand forecast distinct from a point stock figure — `getReorderSuggestions()`
  and the auto-draft path both work off current stock and a static threshold,
  never a projected demand-during-lead-time figure.

## Hardening record

**Kept (3/3):**

- **The reorder point has no address** — verified: `ProductVariant.reorderPoint`
  is one nullable `Int` (`catalog.prisma:184`); the crossing check at
  `inventory.service.ts:373-391` (condition begins line 373, event publishes
  379) compares against `resultingStock`, the cross-location SUM, so a healthy
  central warehouse structurally masks every branch stockout. Distinct from
  lens 10 (read-scoping of a row) — this is about the write-time signal itself
  being computed over an aggregate that erases location. Kept as written.
- **Not enough to go around** — verified: `purchasing.service.ts:358-360`
  posts the entire `moveMany` at the single `defaultLocationId(tx)`
  (`inventory.service.ts:166`); `grep -in allocat` on
  `purchasing.service.ts` returns only `allocateLandedCost` (cost splitting,
  not units); `grep -n locationId purchasing.prisma` returns nothing —
  confirmed no allocation table/column/function exists anywhere in
  `purchasing/` or `inventory/`. R26 confirmed at
  `docs/implementation/RETAIL-ERP.md` (section starts ~line 712): it covers
  splitting stock already at a branch to online demand, a distinct, later
  question from splitting one incoming receipt among branches that all
  requested it. Kept as written.
- **A forecast is not a commitment** — verified: `reorder.listener.ts:38`
  computes `quantity = payload.reorderQuantity ?? payload.reorderPoint -
  payload.stock`, no lead-time window; `Supplier.leadTimeDays`
  (`purchasing.prisma:31`, default `7`) and `SupplierProduct.leadTimeDays`
  (line 78) are bare scalars, `moq` at line 77; `PurchaseOrderStatus`
  (`purchasing.prisma:88-94`) confirmed `DRAFT` below `SENT`. R25 confirmed
  at `docs/implementation/RETAIL-ERP.md` (section starts ~line 695), stating
  mean-and-variance are both derivable from existing `GoodsReceipt` vs
  `PurchaseOrder` history and not yet computed. Kept as written.

**Killed:** none — all three lenses survived verification with their claims
intact; no lens here restates an existing one without a stated difference, no
lens is generic advice, and each demands a concrete, checkable artifact (a
`(variantId, locationId)` threshold column, a per-line allocation shape, a
variance/stddev column).

**Corrections:**

- `RETAIL-ERP.md` is cited in the lens bodies as a bare filename; the actual
  path in this repo is `docs/implementation/RETAIL-ERP.md`. Section numbers
  (R25, R26) and quoted text are correct and unchanged — this is a path
  precision note, not a collapsed claim.
- All other citations checked (`catalog.prisma:184`;
  `inventory.service.ts` reorder-crossing block and `resultingStock` SUM;
  `inventory.controller.ts:24` `getReorderSuggestions()`;
  `purchasing.service.ts` `defaultLocationId`/`moveMany`/`allocateLandedCost`;
  `purchasing.prisma` `leadTimeDays` ×2, `moq`, `PurchaseOrderStatus` enum;
  `reorder.listener.ts:38`; `transfers.service.ts` serial per-line loop
  inside a `{ timeout: 20_000 }` transaction) matched the repository exactly
  — no further corrections needed.
