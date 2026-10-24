# 50h harden gap

Output of the `harden:gap:50` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Landed cost apportionment and its timing

## File

docs/erp-lenses/gap-50/50-gap-landed-cost-apportionment-and-its-timing.md

## Kept

### The apportionment basis nobody chose

**Question:** For this receipt, is extra freight/duty apportioned by declared value, weight, volume, or evenly per unit — and which field on GoodsReceiptItem or the receive-goods request records that choice?

**Citations:** packages/shared/src/pricing.ts:205-246 (allocateLandedCost, value-only), apps/api/prisma/schema/purchasing.prisma:165-180 (GoodsReceiptItem, no weight/volume column) — both verified by reading the files

**Strength:** strong

### The bill that never reaches the shelf

**Question:** When a SupplierBill against a GoodsReceipt's PO carries a different freight/duty figure than receiveGoods already used, which posting rule restates ProductVariant.costPrice, and by what key does it find the GoodsReceiptItem rows?

**Citations:** apps/api/src/modules/supply-chain/purchasing/purchasing.service.ts:516 (createSupplierBill, no goodsReceiptId field, verified by reading the full create payload), apps/api/src/modules/money/accounting/posting-rules.subscriber.ts:173-206 (onSupplierBillRaised, no weightedAverageCost call, verified by grep), apps/api/src/modules/supply-chain/purchasing/purchasing.service.ts:384-389 (receiveGoods, sole costPrice writer)

**Strength:** strong

### Inventory debited against stock that is already gone

**Question:** When SupplierBillRaised posts its Dr Inventory line, how much of the receipt's quantity is still on hand in VariantLocationStock, and what determines the split between debiting Inventory (on hand) vs COGS (already sold)?

**Citations:** apps/api/src/modules/money/accounting/posting-rules.subscriber.ts:165-171 (subscriber's own comment admitting no GRNI account), docs/implementation/RETAIL-ERP.md R15 event table (~line 429, documents Dr GRNI/Cr AP as the intended design) — verified the code posts Dr Inventory/Cr AP directly, contradicting the document of record, and that no GoodsReceived @OnDomainEvent handler exists in the subscriber at all (8 handlers checked)

**Strength:** strong

## Killed

## Corrections

- allocateLandedCost cited as pricing.ts:200-249; the function itself spans 205-246 (200-204 is the preceding ReceiptLineInput interface) — tightened for precision, the interior 209-210 citation was already correct
- onSupplierBillRaised's module path was ambiguous (bare filename); confirmed actual path is apps/api/src/modules/money/accounting/posting-rules.subscriber.ts — there is no 'finance' module directory in this repo, and made that explicit in the file so a future reader does not grep the wrong path; function body runs to line 206 not 205
- added a citation the original file omitted: RETAIL-ERP.md's R15 event table documents GoodsReceived as Dr Inventory/Cr GRNI and SupplierBillRaised as Dr GRNI/Cr AP, and posting-rules.subscriber.ts has no GoodsReceived handler among its 8 @OnDomainEvent handlers at all — the live code's direct Dr Inventory/Cr AP posting therefore contradicts the documented design, not merely omits an unbuilt nicety; this materially strengthens lens 3's breaksWithout

