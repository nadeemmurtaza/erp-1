# 15. Warehouse, logistics, fleet and proof of delivery

At Solo, "the warehouse" is the till counter and a delivery is a Careem
receipt. At Org scale, a Location is a building with racking, a transfer
crosses a driver's van, and a dispute lands on someone's desk months later
needing a name and a signature, not a timestamp. The same code has to carry
that evidence even when nobody at Solo will ever look for it.

## Lens: Bins are not built, locations are the floor

**Question:** When a picker is told to fulfil a line, what field on what
table tells them which rack, shelf or bin inside the location to walk to —
and if none exists, what is the largest single location's SKU count the
feature must still work at without one?

**Why:** `VariantLocationStock` is `@@id([variantId, locationId])`
(`apps/api/prisma/schema/inventory.prisma:156`) — the location is the finest
storage grain the schema has. Grepping every `.prisma` file for a bin, zone,
aisle or shelf model returns nothing (confirmed by the ground brief's own
`^model ` grep). A feature that says "pick the item" today can only ever say
"go to Warehouse-3" — never where inside it — because there is nowhere on
any row to put a bin id.

**Worked example:** Narrow slice: a pick-list screen that lists
`variantId, quantity, locationId` for a stock transfer's source location.
Complete capability: the same screen states, in its own spec, that with no
bin model it cannot sub-sort a 10,000-SKU warehouse by aisle, and either
scopes itself to small locations only or names the bin/zone model as a
prerequisite it is not silently assuming exists.

**Done test:** `grep -riE "model (Bin|Zone|Aisle|Shelf|Rack)" apps/api/prisma/schema/*.prisma` returns nothing today; the PR states explicitly whether it introduces one of these or explains why picking still works without it at the location's real SKU count.

**Breaks without:** A picker sent only a `locationId` walks the entire
building for every line; at 10,000+ SKUs in one warehouse location, pick time
scales with building size, not order size, and nothing in the data model can
ever compute a walk-optimised route.

## Lens: The handoff that has no signer

**Question:** For this movement of physical goods, name the row and column
that will still exist in twelve months recording who physically had custody
at each step — driver, vehicle, or recipient by name — and whose signature or
photograph is attached to it; if none, say so.

**Why:** `StockTransfer` (`apps/api/prisma/schema/transfers.prisma:41`) records
only `createdByUserId` and `receivedByUserId` — the staff accounts that
clicked dispatch/receive, not who was holding the goods between those clicks.
`Shipment` (`apps/api/prisma/schema/orders.prisma:213`) is the only other
delivery record in the repo and carries `courier` (a string like `"manual"`),
`trackingNumber`, `trackingUrl` and `deliveredAt` — no driver, no vehicle, no
signature, no photo, no recipient name. `orders.manage`
(`packages/shared/src/permissions.ts:69`, labelled "Manage orders and
shipments") is one flat key covering both. This is distinct from the
reversal-document lens (WO-22's Lifecycle-reversal set, in
`docs/implementation/WO-22-lens-workflow-results.md`): that lens is about
undoing a movement after the fact; this one is about whether the movement
itself left evidence at all.

**Worked example:** Narrow slice: `transfers.service.ts`'s `receive()` flips
`StockTransfer.status` to RECEIVED and stamps `receivedByUserId`. Complete
capability: the same action requires (or the PR explicitly declines and
states why) a recipient identity distinct from the receiving staff login, a
timestamp for the handover itself versus the app-click, and a place for a
signature or photo — because "he clicked receive" and "she signed for it" are
not the same fact when a driver claims he never delivered ninety boxes.

**Done test:** `grep -n "signature\|photoUrl\|driverId\|vehicleId\|recipientName" apps/api/prisma/schema/transfers.prisma apps/api/prisma/schema/orders.prisma` — today prints nothing; the PR states which of these it adds, or names the ruling that defers proof-of-delivery to a later work order.

**Breaks without:** A dispute over a missing inter-branch transfer or a
customer "never delivered" claim has nothing to point to but a
`receivedByUserId` foreign key and a `deliveredAt` timestamp — no name, no
mark, no photo — so it resolves on whoever's manager shouts louder, not on a
record.

## Lens: Shortage with no reason, no evidence

**Question:** When less arrives than was dispatched, what value distinguishes
damage from theft from a miscount, and what evidence field holds the proof —
not just the quantity delta that gets written off?

**Why:** `StockTransferLine` (`apps/api/prisma/schema/transfers.prisma:82`)
has exactly `quantityDispatched`, `quantityReceived` and `unitCost` — no
reason, no evidence column. `receive()`
(`apps/api/src/modules/transfers/transfers.service.ts:166`, shortfall handled
at line 233) hardcodes `reason: 'WRITE_OFF'` for every short receipt.
`StockMovementReason` (`inventory.prisma:5-20`) already distinguishes
`DAMAGE`, `COUNT` and `WRITE_OFF` as separate values elsewhere in the ledger —
so the gap is not that the schema has no vocabulary for the difference, it is
that transfer shortage never gets asked which of them applies; every short
receipt is coded `WRITE_OFF` regardless of cause. `StockVariance`
(`inventory.prisma:127`, R5) exists for `postUnconditional()` oversells, not
for transfer shortage, so there is nowhere to attach a damage photo, a claim
number or a carrier reference even if the right reason were picked.

**Worked example:** Narrow slice: `receive()` accepts a lower
`quantityReceived` and silently write-offs the gap, exactly as it does today.
Complete capability: the receiving screen forces a reason (damaged in
transit, short-shipped, miscounted) and an evidence reference before the
write-off posts, because a corporate warehouse team files an insurance claim
against a carrier using exactly that distinction, and "WRITE_OFF" alone
cannot tell finance which brand or which driver to charge back.

**Done test:** `grep -n "reason: 'WRITE_OFF'" apps/api/src/modules/transfers/transfers.service.ts` matches today (line 233, unconditionally); the PR either makes that reason a parameter sourced from a new column on `StockTransferLine` (with an evidence reference alongside it) or states, in writing, that all in-transit shortage is treated as one undifferentiated write-off for this release.

**Breaks without:** At 100+ locations moving stock between each other daily,
every damaged, stolen and miscounted shipment lands in the same 5100
Shrinkage account with the same `WRITE_OFF` reason — nobody can charge a
careless driver, dispute a carrier's damage claim, or even tell finance
whether shrinkage is rising because of theft or bad counting.

## Not modelled yet

- No bin, zone, aisle or shelf model — `Location` is the finest storage grain
  in the schema.
- No driver, vehicle or fleet model anywhere — custody in transit is
  represented only by `StockTransfer.inTransitLocationId`, a place, never a
  person or a vehicle.
- No proof-of-delivery artifact (signature, photograph, recipient name) on
  either `StockTransfer` or `Shipment`.
- No pick-list or pick-wave concept spanning multiple orders or transfers —
  fulfilment and dispatch are both single-document actions with no shared
  walk-the-warehouse batching.
- No damage/shortage sub-reason or evidence field on `StockTransferLine` —
  `StockMovementReason` already has `DAMAGE` and `COUNT` as distinct values,
  but `transfers.service.ts`'s `receive()` never selects between them and
  posts every short receipt as `WRITE_OFF`.

## Hardening record

**Kept (3):**
- *Bins are not built, locations are the floor* — verified against
  `VariantLocationStock` (`inventory.prisma:156`, `@@id([variantId,
  locationId])`) and a full-repo grep for a bin/zone/aisle/shelf model, which
  returns nothing. Sharpened doneTest wording only.
- *The handoff that has no signer* — verified against `StockTransfer`
  (`transfers.prisma:41`), `Shipment` (`orders.prisma:213`) and the
  `orders.manage` permission (`permissions.ts:69`). Corrected a broken
  cross-reference (see below).
- *Shortage with no reason, no evidence* — verified against
  `StockTransferLine` (`transfers.prisma:82`), `receive()`
  (`transfers.service.ts:166`, shortfall branch at line 233) and
  `StockMovementReason` (`inventory.prisma:5-20`). Sharpened the "why" and
  doneTest (see corrections below) because the original understated the
  finding.

**Killed:** none. All three lenses cite verifiable, currently-true facts in
this repository, are scope questions (they change what the PR must contain,
not just what it documents), and are not restatements of the five CLAUDE.md
lenses or the thirty WO-22 lenses — none of those addresses bin-level
location grain, in-transit custody evidence, or transfer-shortage reason
codes.

**Corrections:**
- Lens 2 ("The handoff that has no signer") cited "lens 25" as the
  reversal-document lens. File `docs/erp-lenses/privacy-retention-residency/25-privacy-retention-residency.md`
  exists but has nothing to do with reversals — the actual reversal-document
  lens is in the WO-22 "Lifecycle reversal" set
  (`docs/implementation/WO-22-lens-workflow-results.md`), not in a numbered
  file 25. Corrected the cross-reference to point at that document instead of
  a fabricated file number.
- Lens 3 ("Shortage with no reason, no evidence") claimed `WRITE_OFF` is "the
  same enum value ... used for every other kind of write-off in the system,
  with no sub-reason" — this understates what is actually true.
  `StockMovementReason` (`inventory.prisma:5-20`) already defines `DAMAGE` and
  `COUNT` as separate, more specific reasons used elsewhere in the ledger; the
  real defect is that `receive()`'s shortfall branch
  (`transfers.service.ts:233`) never chooses between them and hardcodes
  `reason: 'WRITE_OFF'` regardless of cause. Rewrote the "why" and doneTest to
  state this precisely instead of implying the vocabulary itself is missing.
