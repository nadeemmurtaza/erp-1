# 13. Procurement and the supplier lifecycle

A shop's "add a supplier, raise a PO, receive it, pay the bill" loop needs
almost none of what a corporate group needs: a supplier that is approved
once and never revisited, a bill nobody cross-checks against what actually
arrived, and a single permission that lets one person originate, receive
and pay the same purchase order. None of that breaks at three branches. All
of it breaks at 100+ suppliers, 10,000+ SKUs and a real audit.

## Lens: The bill nobody checked

**Question:** When a `SupplierBill` is raised against a `PurchaseOrder`, what
named tolerance (a percentage, an absolute paisa amount, or both) must the
bill's amount and quantity fall within, measured against the PO's committed
`unitCost` and the cumulative `GoodsReceiptItem` quantities and
`landedUnitCost` — and what status does a bill outside that tolerance get
instead of silently posting as `UNPAID`?

**Why:** `PurchasingService.createSupplierBill` (purchasing.service.ts:516-551)
checks exactly one thing — that `po.supplierId === dto.supplierId` — then
creates the bill and lets `supplier_bill.raised` post Dr 1200 Inventory / Cr
2200 AP unconditionally at `baseAmountMinor`. It never reads
`GoodsReceiptItem` or compares `dto.amount` to `po.total`. A tolerance concept
does exist — `purchasing.over_receipt_tolerance` (settings.defaults.ts) gates
receipt *quantity* against `poLine.quantityOrdered` inside `receiveGoods`
(purchasing.service.ts:301-313) — but nothing analogous gates a bill's amount
or quantity against the PO or the summed `GoodsReceiptItem` rows it is meant
to settle. This is sharper than the five house lenses' generic "policy
layer" — it names the specific bill-vs-receipt comparison the existing
setting does not cover.

**Worked example:** Narrow slice: a "raise bill" button that creates a
`SupplierBill` for whatever amount is typed. Complete capability: a
three-way match comparing the bill against the PO line and the summed
`GoodsReceiptItem` rows for it, a configured tolerance, auto-post within it,
and a named exception status (e.g. `PENDING_MATCH_REVIEW`) with its own
permission to release outside it.

**Done test:** `grep -n "GoodsReceiptItem\|po.total" apps/api/src/modules/supply-chain/purchasing/purchasing.service.ts`
inside `createSupplierBill` — today zero hits (the only tolerance hit in the
file is inside `receiveGoods`, a different method gating a different
comparison). The PR must add a match record or `MatchException`-shaped table
and a query that lists bills awaiting review.

**Breaks without:** At 10,000+ products across 100+ locations, one mistyped
or fraudulent bill amount posts straight to Accounts Payable with no gate,
and the deployment-wide, 13-account chart with no scope column means the
error is invisible until someone reads the whole ledger by hand.

## Lens: Five commitments, one key

**Question:** Of PO creation, PO send, goods receipt, bill creation and bill
payment, which of these five moments should the same `purchasing.manage`
holder be allowed to perform alone, which need a second, senior permission
above a named spend ceiling, and where would that ceiling be stored today?

**Why:** `purchasing.controller.ts` gates `create()` (:96), `markSent()`
(:103), `receiveGoods()` (:110), `createSupplierBill()` (:137) and
`recordPayment()` (:144) behind the identical
`@RequirePermission('purchasing.manage')` — one grant originates, receives,
bills and pays the same PO, with no amount ceiling anywhere, matching the
ground truth's note that `payments.approve` is a boolean with no ceiling.
This differs from the existing "authority and blast radius" lens: that one
asks for a distinct key in the abstract; this names the five concrete
moments this file has already collapsed into one key.

**Worked example:** Narrow slice: add a "requires approval" checkbox to the
PO form. Complete capability: a spend-ceiling field on `PurchaseOrder` or
`SupplierBill`, a second key (e.g. `purchasing.approve_high_value`) required
above it, and a maker-checker record naming who raised versus who approved
each step for one PO/bill pair.

**Done test:** `grep -c "RequirePermission('purchasing.manage')" apps/api/src/modules/supply-chain/purchasing/purchasing.controller.ts`
— today 9 (2 read endpoints per controller plus the 5 write moments at
:96, :103, :110, :137, :144), with no amount branch anywhere in the file. The
PR must add a per-step key or a threshold-gated second permission with a
test exercising both sides of it.

**Breaks without:** One purchasing.manage holder can create a PO for any
amount, receive fictitious goods, raise a matching bill and pay it out of
Accounts Payable in one session, across any of 100+ locations, with no
second signature and no audit trail distinguishing who ordered from who
paid — a segregation-of-duties gap the prior Generate pass produced nothing
for.

## Lens: A boolean is not a lifecycle

**Question:** Name the states a `Supplier` moves through from first contact
to being refused a new PO (e.g. `PENDING_APPROVAL`, `APPROVED`, `ON_HOLD`,
`BLOCKED`), the compliance documents each state requires with their expiry
dates, and the line in `PurchasingService.createPurchaseOrder` that would
refuse to create a PO against a supplier who is unapproved or
document-expired.

**Why:** `Supplier` (purchasing.prisma:1-40) carries only `isActive Boolean
@default(true)` — no status, no reason, no effective date, and no relation
to any document model. `IdentityVerification` (identity-verification.prisma:16)
is `userId String @unique`, KYC for a `User` only; nothing equivalent hangs
off `Party` or `Supplier`. `PurchasingService.createPurchaseOrder`
(purchasing.service.ts:242-276) never fetches the `Supplier` row at all
before writing the PO — not even an `isActive` check.

**Worked example:** Narrow slice: an `isActive` toggle a buyer can switch
off. Complete capability: a `SupplierStatus` lifecycle, a
`SupplierDocument` model with `expiresAt`, a scheduled sweep that flips a
supplier to `BLOCKED` on expiry, and a guard in `createPurchaseOrder` that
refuses a PO against a non-`APPROVED` or expired-document supplier.

**Done test:** `grep -n "status\|expiresAt" apps/api/prisma/schema/purchasing.prisma`
on the `Supplier` model — today neither exists. The PR must add one plus a
call site inside `createPurchaseOrder` that reads it before the `create`.

**Breaks without:** At 100+ suppliers across a corporate group, an expired
trade licence or insurance certificate goes unnoticed until an external
auditor asks for it, and `isActive = false` today only hides a supplier
from pickers — nothing in `createPurchaseOrder` stops a new PO from being
written against a blocked or never-approved one.

## Not modelled yet

- A bill-vs-receipt three-way match — `purchasing.over_receipt_tolerance`
  exists but only gates goods-receipt quantity against the PO's
  `quantityOrdered`; `createSupplierBill` compares only `supplierId`.
- A spend ceiling or maker-checker field on `PurchaseOrder` or
  `SupplierBill` — `purchasing.manage` is one flat key over five distinct
  financial-exposure moments (of 9 total grants in the controller).
- A supplier lifecycle status beyond `Supplier.isActive`, and a compliance
  document/certificate model with an expiry date attached to `Party` or
  `Supplier` — `IdentityVerification` exists but is `User`-only KYC.

## Hardening record

**Kept:**
- *The bill nobody checked* — demands a named tolerance and a match/exception
  table; `createSupplierBill` genuinely checks only `supplierId` today.
- *Five commitments, one key* — names the five concrete write moments this
  file collapses into `purchasing.manage`, distinct from the abstract
  "authority and blast radius" lens already in the deck.
- *A boolean is not a lifecycle* — `Supplier` genuinely has no status model
  and `createPurchaseOrder` never reads the row at all before writing a PO.

**Killed:** none — all three survived on re-verification against the current
source; see corrections below for what had to change to keep them accurate.

**Citations corrected:**
- Lens 1 ("The bill nobody checked") claimed `grep -ri tolerance` across
  `apps/api` returns nothing. False: `purchasing.over_receipt_tolerance`
  exists (settings.defaults.ts, used in `receiveGoods`,
  purchasing.service.ts:301-313) — but it gates receipt quantity against the
  PO, not bill amount/quantity against the PO or `GoodsReceiptItem`. Reworded
  to name that distinction instead of claiming the concept is absent.
- Lens 2 ("Five commitments, one key") doneTest claimed
  `grep -c "RequirePermission('purchasing.manage')"` on the controller
  returns 5. Actual count is 9 (4 read/list endpoints plus the 5 write
  moments at lines 96, 103, 110, 137, 144). Corrected to state 9 and name
  which lines are the write moments.
- Lens 3 ("A boolean is not a lifecycle") cited `Supplier` as living in
  `parties.prisma`. The `Supplier` model is actually defined in
  `purchasing.prisma:1`; `parties.prisma` defines the separate `Party` model
  that `Supplier.partyId` optionally links to. Both citations (Why and
  doneTest grep target) corrected to `purchasing.prisma`.
