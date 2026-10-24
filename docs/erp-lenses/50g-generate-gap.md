# 50g generate gap

Output of the `gen:gap:50` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Landed cost apportionment and its timing

## File

docs/erp-lenses/50-gap-landed-cost-apportionment-and-its-timing.md

## Lenses

### The apportionment basis nobody chose

**Question:** For this receipt, is the extra freight/duty apportioned by declared value, by weight, by volume, or evenly per unit — and which field on GoodsReceiptItem or the receive-goods request records that choice, so a reviewer can see it was picked rather than defaulted?

**Grounding:** allocateLandedCost (packages/shared/src/pricing.ts:200-249) allocates strictly by quantity*unitCost with no basis parameter; GoodsReceiptItem (purchasing.prisma:165-180) has no weight/volume column.

### The bill that never reaches the shelf

**Question:** When a SupplierBill raised against a GoodsReceipt's purchase order carries a freight/duty figure different from what receiveGoods already used to compute landedUnitCost, which posting rule restates ProductVariant.costPrice, and by what key does it find the GoodsReceiptItem rows the correction belongs to?

**Grounding:** PurchasingService.createSupplierBill (purchasing.service.ts:516) stores only supplierId/purchaseOrderId/amount, no goodsReceiptId or line detail; onSupplierBillRaised (posting-rules.subscriber.ts:173-205) posts one lump Dr Inventory/Cr AP and never calls weightedAverageCost; costPrice is written only once, at receiveGoods (purchasing.service.ts:384).

### Inventory debited against stock that is already gone

**Question:** When SupplierBillRaised posts its Dr 1200 Inventory line, how much of the originating receipt's quantity is still on hand in VariantLocationStock, and what determines the split between debiting 1200 Inventory (on hand) and 5000 COGS (already sold)?

**Grounding:** onSupplierBillRaised's own comment (posting-rules.subscriber.ts:169-171) states no GRNI clearing account exists yet and posts the whole baseAmountMinor to Inventory regardless of remaining stock, reading no VariantLocationStock or GoodsReceiptItem row.

## Absences

- No apportionment-basis field (value/weight/volume/unit) on a receipt or its lines — only value-based allocateLandedCost exists
- No GRNI clearing account or goods-received-side journal (R15's own documented gap)
- No cost-adjustment/landed-cost-restatement model linking a later SupplierBill back to specific GoodsReceiptItem rows or a costPrice history
- No per-lot/per-receipt cost tracking — ProductVariant.costPrice is one global weighted average with no memory of which receipt a unit came from

