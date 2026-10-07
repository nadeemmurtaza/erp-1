# 13g generate procurement supplier lifecycle

Output of the `gen:13:procurement-supplier-lifecycle` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Procurement and the supplier lifecycle

## File

docs/erp-lenses/procurement-supplier-lifecycle/13-procurement-supplier-lifecycle.md

## Lenses

### The bill nobody checked

**Question:** When a SupplierBill is raised against a PurchaseOrder, what named tolerance (percentage, absolute paisa, or both) must the bill's amount and quantity fall within versus the PO's committed unitCost and the cumulative GoodsReceiptItem quantities/landedUnitCost, and what status does a bill outside that tolerance get instead of silently posting as UNPAID?

**Grounding:** PurchasingService.createSupplierBill (apps/api/src/modules/supply-chain/purchasing/purchasing.service.ts:516-551) checks only supplierId match; supplier_bill.raised posts Dr 1200/Cr 2200 unconditionally at baseAmountMinor; grep for 'tolerance' across the repo returns nothing.

### Five commitments, one key

**Question:** Of PO creation, PO send, goods receipt, bill creation and bill payment, which should the same purchasing.manage holder perform alone, which need a second senior permission above a named spend ceiling, and where would that ceiling be stored today?

**Grounding:** purchasing.controller.ts gates create() (:96), markSent() (:103), receiveGoods() (:110), createSupplierBill() (:137) and recordPayment() (:144) all behind the identical @RequirePermission('purchasing.manage'); no amount ceiling exists anywhere, matching the ground truth's payments.approve absence.

### A boolean is not a lifecycle

**Question:** Name the states a Supplier moves through from first contact to being refused a new PO, the compliance documents each state requires with expiry dates, and the line in PurchasingService.createPurchaseOrder that would refuse a PO against an unapproved or document-expired supplier.

**Grounding:** Supplier (parties.prisma) has only isActive Boolean, no status/document relation; IdentityVerification (identity-verification.prisma:16) is userId-unique, User-only KYC; PurchasingService.createPurchaseOrder (purchasing.service.ts:242-276) never fetches the Supplier row at all before writing the PO.

## Absences

- A tolerance/three-way-match concept of any kind between SupplierBill, PurchaseOrder and GoodsReceiptItem
- A spend ceiling or maker-checker field on PurchaseOrder or SupplierBill; purchasing.manage is one flat permission over five distinct financial-exposure moments
- A supplier lifecycle status beyond Supplier.isActive, and a compliance document/certificate model with an expiry date attached to Party or Supplier

