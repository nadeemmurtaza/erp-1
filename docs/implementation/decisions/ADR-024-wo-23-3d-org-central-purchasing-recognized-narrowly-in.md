# ADR-024 — WO-23.3d: org-central purchasing recognized narrowly in `resolveTransferSettlement()`; landed cost snapshotted at dispatch but never re-fed into `ProductVariant.costPrice`

[← Decision log](../DECISIONS.md)


### Context
RETAIL-ERP.md R13's own words: "Organization (central) purchasing buys for
several brands, receives into an org warehouse `Location`, and pushes stock
down as transfers (R4) carrying landed cost." WO-23.3a–c/e built the
scopeLevel/BrandPolicy/replication side of tier-scoped purchasing; this is
the last slice — making a `StockTransfer` able to originate from an org
warehouse at all, and making the landed cost R13 asks for actually reach
the arriving side. Two decisions had to be made that the roadmap line
doesn't settle on its own, plus one gap ADR-021 had already named and
explicitly deferred to this WO ("`StockTransferLine.unitCost` is populated
only for INVOICED transfers and `receive()` never feeds it into
`InventoryService.move()`'s `unitCost`, so a received transfer does not
currently update the destination's weighted-average cost at all").

1. **Does an org warehouse get to dispatch a transfer at all?**
   `resolveTransferSettlement()` (transfers.service.ts) already rejects any
   transfer where either the source or destination `Location.retailBrandId`
   is null, UNLESS both are equal (same-brand, settles `NONE`) or both are
   set and differ (cross-brand, settles `INVOICED`) — a deliberate guard
   against a genuinely misconfigured, unbadged `Location`. An org warehouse
   is, by this codebase's own established convention (the in-transit-bucket
   logic and the cross-brand branch both already use it this way),
   `retailBrandId: null` — there is no `Location.organizationId` field in
   the schema. Left as-is, R13's own flow is unreachable: an org warehouse
   can never dispatch to a branded store, because "one side null" is
   exactly what the existing guard rejects.
2. **What does landed cost update on receive?** `InventoryService.move()`
   only ever stores `input.unitCost ?? null` onto the `StockMovement` row
   it creates — it does not itself touch `ProductVariant.costPrice`; every
   caller that wants `costPrice` recomputed calls
   `weightedAverageCost()` and writes it back itself (confirmed by reading
   `PurchasingService.receiveGoods()`, the one existing caller that does).
   The first implementation attempt here mirrored that pattern directly:
   recompute `costPrice` via `weightedAverageCost()` on every transfer
   receive, the same as a purchase. It was reverted before landing — see
   Options Considered — because `ProductVariant.costPrice` is ONE GLOBAL
   field per variant in the current schema, with no per-location or
   per-node cost tracking anywhere. A `StockTransfer`'s two ends already
   share that one global average (today's single shared-Postgres
   deployment has exactly one `ProductVariant` row per SKU, full stop); a
   transfer is a pure relocation of stock the average already counts, not
   new stock entering the pool the way a purchase or a production run is.
   Recomputing `costPrice` on receive would double-count those units.

### Options Considered
**On recognizing org-central dispatch:**
1. Loosen the existing one-side-null rejection broadly — allow either
   direction, any `Location.type`, whenever one side is brandless. Rejected:
   this also accepts a `STORE`-type `Location` that simply never got
   badged with a brand (a data-entry gap, not org-central intent) and a
   branded store shipping INTO a brandless bucket (not R13's flow — R13 is
   "receives into an org warehouse and pushes stock DOWN," one direction).
   Both would silently launder a misconfiguration into a settlement
   decision.
2. **Add one new, narrow branch to `resolveTransferSettlement()`:
   `source.type === 'WAREHOUSE' && !source.retailBrandId &&
   destination.retailBrandId` → `{ inTransitRetailBrandId: null,
   settlementMode: 'NONE' }`.** Chosen. Requires the source to be
   `WAREHOUSE`-typed (not just brandless), requires the destination to
   already carry a real brand, and only recognizes this one direction — the
   reverse (a branded source shipping to a brandless `WAREHOUSE`) still
   falls through to the pre-existing rejection, same as a brandless `STORE`
   on either side. `settlementMode: NONE` because R13 does not describe
   central purchasing as inter-brand billing — the group already owns the
   stock before and after the move, same reasoning as the existing
   same-brand `NONE` case just above it in the method.

**On landed cost and `costPrice`:**
1. Recompute `ProductVariant.costPrice` via `weightedAverageCost()` on
   every transfer receive, mirroring `PurchasingService.receiveGoods()`
   exactly. Rejected, after landing and reverting it: correct for a
   purchase (new stock entering the average) and wrong for a transfer
   (the same stock already inside the average, relocated). Applied here it
   would silently distort `costPrice` any time another cost-affecting
   event — a purchase, a production run — happened on that variant between
   a transfer's dispatch and its receive, in a way no test or reviewer
   would catch without re-deriving the weighted-average math by hand.
2. **Snapshot `unitCost` onto every `StockTransferLine` at dispatch time
   (previously written only when `settlementMode === 'INVOICED'`, now
   unconditional — a line is a cost-basis snapshot the moment stock leaves
   the source, independent of whether money changes hands for it), and
   pass that same value through into `InventoryService.move()`'s
   `unitCost` on the DESTINATION-crediting call inside `receive()`. Leave
   `ProductVariant.costPrice` untouched by `transfers` entirely.** Chosen.
   This is the literal, narrow fix for ADR-021's own complaint —
   `receive()` now does feed `unitCost` into `move()` — without the
   double-counting risk. The arriving `StockMovement` row carries a true
   landed-cost record (R13's "so a branch's margin reflects what the group
   actually paid" is satisfiable from that row today, by anyone reading
   the movement itself), even though the variant's own blended cost does
   not move.

### Reasoning
Both decisions follow the same shape: recognize exactly the case R13
describes, on the narrowest test the schema and existing conventions
already support, and refuse everything else exactly as before rather than
loosening a guard that exists for a real reason. The `costPrice` reversal
is the more important of the two — it is a genuine architectural fact
about this schema (no per-location cost tracking exists anywhere) that a
naive "copy the purchasing pattern" implementation would have gotten
wrong silently, since the test suite's own fixtures (a single shared
database, one `ProductVariant` row) cannot distinguish "correctly
unchanged" from "incorrectly should have changed" without this reasoning
written down.

### Consequences
- An org warehouse must be `Location.type === 'WAREHOUSE'` and carry
  `retailBrandId: null` to be recognized as org-central; a `STORE`-type
  brandless location is still just a data-entry gap and is still rejected,
  same as before this WO.
- `StockTransferLine.unitCost` is now populated on every transfer, not
  only `INVOICED` ones — a pre-existing test asserting it stayed `null` on
  a same-brand (`NONE`) transfer was rewritten to assert the value instead
  (`transfers.service.spec.ts`). No consumer previously read that column
  expecting `null` on a `NONE` transfer; the only two readers are the
  arriving `StockMovement.unitCost` write this WO adds and the
  `InterBranchInvoice` amount, which already only exists on `INVOICED`
  transfers.
- `ProductVariant.costPrice` remains a single global figure with no
  location or node dimension. The day a real multi-database chain
  deployment exists (`RETAIL-ERP.md`'s own node/replication model, not yet
  built), each node's own `ProductVariant` row becomes genuinely
  independent, and this decision will need to be revisited: at that point
  a `StockTransfer` crossing nodes IS new stock entering the receiving
  node's own local average, the same way a purchase is today, and
  `receive()` will need its own `weightedAverageCost()` call — this ADR's
  "leave `costPrice` untouched" is scoped to today's single-shared-database
  reality, not a permanent architectural stance.
- The minimum web UI to make this reachable (list, dispatch, receive) ships
  in the same change — `/admin/transfers`, `/admin/transfers/new`,
  `/admin/transfers/[id]` — gated by the existing `transfers.manage`
  permission (PRM-2: read-only explanation when absent, not a hidden
  action). No new permission key was needed; `transfers.manage` already
  covers dispatch/receive/cancel and `purchasing.manage` already covers PO
  scope selection, so neither WO-23.3d's backend nor its UI required a
  `ROLE_PERMISSION_SEED` change.

### Status
**Accepted.**
