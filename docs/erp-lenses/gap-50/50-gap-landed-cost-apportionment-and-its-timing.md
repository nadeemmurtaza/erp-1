# 50. Landed cost apportionment and its timing

`allocateLandedCost` is real, invoked once at receipt time, and never
revisited — but freight and duty bills routinely arrive late, especially
from the international suppliers this repo already models. At 10,000+ SKUs
across warehouses and stores, a corporate deployment cannot skip which basis
apportions extra cost across a receipt's lines, or what happens to a cost
decision already baked into stock and already-posted COGS once a later bill
says that decision was wrong.

## Lens: The apportionment basis nobody chose

**Question:** For this receipt, is the extra freight/duty apportioned by
declared value, by weight, by volume, or evenly per unit — and which field
on `GoodsReceiptItem` or the receive-goods request records that choice, so
a reviewer can see it was picked rather than defaulted?

**Why:** `allocateLandedCost` (`packages/shared/src/pricing.ts:205-246`)
takes only `{quantity, unitCost}` per line and allocates strictly by
`quantity * unitCost` (lines 209-210) — there is no basis parameter, and
`GoodsReceiptItem` (`apps/api/prisma/schema/purchasing.prisma:165-180`) has
only `quantity`, `unitCost` and `landedUnitCost` — no weight or volume
column to allocate by even if a caller wanted to. Every receipt, forever,
apportions by value, silently, with no way to choose otherwise.

**Worked example:** Narrow slice: a receipt of 500 units of a light PKR 200
accessory and 20 units of a bulky PKR 8,000 appliance, freight = PKR
100,000, air-freighted by chargeable weight where the accessories are 80%
of the weight. Complete capability: the receipt request carries a declared
apportionment basis per shipment (value/weight/volume/unit), a weight or
volume field on the line, and the allocator apportions against that
declared basis instead of always against `quantity * unitCost`.

**Done test:** `grep -n "apportionBasis\|allocationBasis" apps/api/prisma/schema/purchasing.prisma apps/api/src/modules/supply-chain/purchasing` finds a stored
basis field and an allocator keyed off it, or the PR states in writing why
every receipt in this deployment is fairly apportioned by value alone.

**Breaks without:** At 10k+ SKUs spanning categories (garments vs hardware
vs bulky furniture, per `MULTI-SECTOR.md`), value-based apportionment
overcosts high-value/low-weight lines and undercosts low-value/high-weight
ones on every international receipt, so per-SKU margin — the figure lens 8
("Click the number") demands be visible — is wrong by construction on the
categories the business actually ships in volume.

## Lens: The bill that never reaches the shelf

**Question:** When a `SupplierBill` raised against a `GoodsReceipt`'s
purchase order carries a freight/duty figure different from what
`receiveGoods` already used to compute `landedUnitCost`, which posting
rule restates `ProductVariant.costPrice`, and by what key does it find the
`GoodsReceiptItem` rows the correction belongs to?

**Why:** `PurchasingService.createSupplierBill`
(`apps/api/src/modules/supply-chain/purchasing/purchasing.service.ts:516-546`) records
only `supplierId`, `purchaseOrderId` and a lump `amount` — no
`goodsReceiptId`, no per-variant line, confirmed by reading its full
`tx.supplierBill.create` payload. `onSupplierBillRaised`
(`apps/api/src/modules/money/accounting/posting-rules.subscriber.ts:173-206`, not
`finance/`) posts one Dr 1200 Inventory / Cr 2200 AP for `baseAmountMinor`
and calls neither `weightedAverageCost` nor anything touching
`ProductVariant` — confirmed by grep, zero hits for
`weightedAverageCost` in that file. The only writer of `costPrice` in the
whole codebase is `receiveGoods`
(`apps/api/src/modules/supply-chain/purchasing/purchasing.service.ts:384-389`), run once
at receipt time off the PO line's estimate, never re-run by a later bill.

**Worked example:** Narrow slice: goods receipt posts at the PO's quoted
freight estimate, `SupplierBillRaised` fires a journal entry, and the
feature is called done. Complete capability: a bill differing from the
receipt's estimate creates a named cost-adjustment record referencing the
original `GoodsReceiptItem`(s), restating `costPrice` for units still in
stock and posting a distinguishable adjustment entry for units already
sold.

**Done test:** For a `SupplierBill` whose `purchaseOrderId` also has a
`GoodsReceipt`, check whether `ProductVariant.costPrice` (or an equivalent
adjustment log) for that variant moves after the bill's `issuedAt` — today
it never does (no code path from `onSupplierBillRaised` reaches
`ProductVariant` at all), so the PR must add the mechanism or name, in
writing, the ledger-only stance it chooses instead.

**Breaks without:** Freight/duty billed after delivery is the ordinary
case for the `Supplier.isInternational`/`incoterms` suppliers already
modelled (`apps/api/prisma/schema/purchasing.prisma:23,27`), not an edge
case. Margin on every unit sold between receipt and bill is permanently
misstated, `costPrice` for remaining stock never reflects true landed
cost, and no mechanism ever flags the discrepancy to the accountant who
owns the chart of accounts.

## Lens: Inventory debited against stock that is already gone

**Question:** When `SupplierBillRaised` posts its Dr 1200 Inventory line,
how much of the originating receipt's quantity is still on hand in
`VariantLocationStock`, and what determines the split between debiting
1200 Inventory (units on hand) and 5000 COGS (units already sold)?

**Why:** `onSupplierBillRaised`'s own comment
(`apps/api/src/modules/money/accounting/posting-rules.subscriber.ts:165-171`)
admits "No Goods-Received-Not-Invoiced clearing account yet: nothing posts
a matching GRNI entry for `GoodsReceived` today," and posts the whole
`baseAmountMinor` to Inventory regardless — it reads no
`VariantLocationStock` row and no `GoodsReceiptItem` at all. This is not
merely an unbuilt nicety: `RETAIL-ERP.md`'s own R15 event table
(line ~429) documents the *intended* rule as Dr GRNI / Cr Accounts Payable
for `SupplierBillRaised`, fed by a `GoodsReceived` handler posting Dr
Inventory / Cr GRNI — and neither half exists. `posting-rules.subscriber.ts`
has exactly seven `@OnDomainEvent` handlers today (`OrderPlaced`,
`PaymentSucceeded`, `PaymentRefunded`, `SupplierBillRaised`,
`SupplierBillPaid`, `StockVarianceRecorded`, `InterBranchTransferInvoiced`)
and none of them is `GoodsReceived`; the code contradicts the document of
record, not just an absent nice-to-have.

**Worked example:** Narrow slice: bill raised, one lump Dr Inventory / Cr
AP entry, ledger balances on paper. Complete capability: the posting rule
apportions the bill across the receipt's `GoodsReceiptItem` lines, checks
each variant's remaining quantity from that receipt, and posts the
sold-through portion to 5000 COGS as a distinct adjustment instead of
inflating an Inventory balance no stock supports.

**Done test:** Compare `SUM(debitMinor)` on `JournalLine` for the
Inventory account against `SUM(VariantLocationStock.quantity *
ProductVariant.costPrice)` on a deployment with several late bills — today
nothing keeps these reconciled, so the PR must close the gap or the plan
must name it as a stated, reviewed exception pointing at the GRNI account
R15 already specifies but `posting-rules.subscriber.ts` does not build.

**Breaks without:** At corporate volume (100+ locations, thousands of
receipts), a chronic Inventory-vs-stock-valuation drift accumulates every
fiscal period; an auditor's first stock reconciliation finds a balance
sheet Inventory figure the physical count cannot explain, and R15's
documented GRNI design graduates from a stated absence into an
unrecorded, unbounded write-off that the codebase's own architecture
document already predicted and nobody built against.

## Not modelled yet

- No apportionment-basis field (value/weight/volume/unit) on a receipt or
  its lines — only value-based `allocateLandedCost` exists.
- No GRNI clearing account or `GoodsReceived` posting handler —
  `posting-rules.subscriber.ts` has no `@OnDomainEvent(DomainEvent.GoodsReceived)`
  handler at all, despite `RETAIL-ERP.md` R15 documenting one (Dr Inventory
  / Cr GRNI, then `SupplierBillRaised` as Dr GRNI / Cr AP). The live code
  instead posts `SupplierBillRaised` straight to Dr Inventory / Cr AP,
  which is a divergence from the document of record, not merely an
  unbuilt feature.
- No cost-adjustment/landed-cost-restatement model linking a later
  `SupplierBill` back to specific `GoodsReceiptItem` rows or a
  `costPrice` history.
- No per-lot/per-receipt cost tracking — `ProductVariant.costPrice` is one
  global weighted average with no memory of which receipt a unit of stock
  came from, so even a corrected apportionment has no receipt-level bucket
  to restate for units still in stock.

## Hardening record

**Kept (3, all sharpened):**
- *The apportionment basis nobody chose* — verified `allocateLandedCost`
  (`packages/shared/src/pricing.ts:205-246`) and `GoodsReceiptItem`
  (`purchasing.prisma:165-180`) as cited; tightened the function's line
  range and confirmed the schema has no weight/volume column.
- *The bill that never reaches the shelf* — verified
  `createSupplierBill` (`purchasing.service.ts:516`) has no
  `goodsReceiptId` field by reading its full `tx.supplierBill.create`
  payload, and that `weightedAverageCost` is called nowhere in
  `posting-rules.subscriber.ts` (zero grep hits). Distinct from the third
  lens: this one is about `ProductVariant.costPrice` (inventory
  valuation for remaining stock), the third is about the `JournalLine`
  split (GL account correctness) — a narrow build could satisfy one
  without the other.
- *Inventory debited against stock that is already gone* — strengthened
  materially: confirmed via `RETAIL-ERP.md`'s own R15 event table that the
  live code's Dr Inventory / Cr AP posting contradicts this repository's
  documented design (Dr GRNI / Cr AP fed by a `GoodsReceived` handler that
  does not exist), turning "an unbuilt clearing account" into "the code
  disagrees with the document of record."

**Killed:** none — all three survived verification and are distinct scope
questions with different artifacts (a schema field; a `costPrice`
restatement mechanism; a GL account split), none restating any of the five
original lenses or the thirty from WO-22.

**Citations corrected:**
- Claimed `onSupplierBillRaised` at `posting-rules.subscriber.ts:173-205`
  with the file left ambiguous about its module directory; actual path is
  `apps/api/src/modules/money/accounting/posting-rules.subscriber.ts` (not a
  `finance` module — no such directory exists in this repo), and the
  function body actually runs to line 206, not 205.
- Claimed `allocateLandedCost` at `pricing.ts:200-249`; the function itself
  spans 205-246 (200-204 is the preceding `ReceiptLineInput` interface).
  Corrected to `205-246` for precision; the previously-cited internal lines
  209-210 were already correct.
- Claimed `posting-rules.subscriber.ts` has "exactly eight `@OnDomainEvent`
  handlers today". Actual count is **seven** (`grep -c "@OnDomainEvent"`
  returns 7): `OrderPlaced`, `PaymentSucceeded`, `PaymentRefunded`,
  `SupplierBillRaised`, `SupplierBillPaid`, `StockVarianceRecorded`,
  `InterBranchTransferInvoiced`. Corrected at integration time, and the
  seven are now named so the count cannot silently drift again. The
  load-bearing half of the claim — that none of them is `GoodsReceived` —
  is unaffected and was re-verified; file 48 independently cites "the seven
  existing posting rules", which is the correct figure.
- Added a citation the original file lacked: `RETAIL-ERP.md`'s R15 event
  table (`GoodsReceived` → Dr Inventory/Cr GRNI, `SupplierBillRaised` → Dr
  GRNI/Cr AP) as the documented design the live posting rule contradicts —
  this is new grounding, not a correction of an existing wrong claim, and
  it makes lens 3 considerably harder to wave away as "just unbuilt."
