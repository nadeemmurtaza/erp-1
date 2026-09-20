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
`GoodsReceiptItem` or compares `dto.amount` to `po.total`. `grep -ri
tolerance` across `apps/api` and `docs/implementation` returns nothing: the
concept does not exist. This is sharper than the five house lenses' generic
"policy layer" — it names the specific comparison that is missing, not that
policy should exist.

**Worked example:** Narrow slice: a "raise bill" button that creates a
`SupplierBill` for whatever amount is typed. Complete capability: a
three-way match comparing the bill against the PO line and the summed
`GoodsReceiptItem` rows for it, a configured tolerance, auto-post within it,
and a named exception status (e.g. `PENDING_MATCH_REVIEW`) with its own
permission to release outside it.

**Done test:** `grep -n "GoodsReceiptItem\|po.total" apps/api/src/modules/purchasing/purchasing.service.ts`
inside `createSupplierBill` — today zero hits. The PR must add a match
record or `MatchException`-shaped table and a query that lists bills
awaiting review.

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

**Done test:** `grep -c "RequirePermission('purchasing.manage')" apps/api/src/modules/purchasing/purchasing.controller.ts`
— today 5, with no amount branch anywhere in the file. The PR must add a
per-step key or a threshold-gated second permission with a test exercising
both sides of it.

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

**Why:** `Supplier` (parties.prisma) carries only `isActive Boolean
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

**Done test:** `grep -n "status\|expiresAt" apps/api/prisma/schema/parties.prisma`
on the `Supplier` model — today neither exists. The PR must add one plus a
call site inside `createPurchaseOrder` that reads it before the `create`.

**Breaks without:** At 100+ suppliers across a corporate group, an expired
trade licence or insurance certificate goes unnoticed until an external
auditor asks for it, and `isActive = false` today only hides a supplier
from pickers — nothing in `createPurchaseOrder` stops a new PO from being
written against a blocked or never-approved one.

## Not modelled yet

- A tolerance/three-way-match concept of any kind (bill vs PO vs goods
  receipt) — `createSupplierBill` compares only `supplierId`.
- A spend ceiling or maker-checker field on `PurchaseOrder` or
  `SupplierBill` — `purchasing.manage` is one flat key over five distinct
  financial-exposure moments.
- A supplier lifecycle status beyond `Supplier.isActive`, and a compliance
  document/certificate model with an expiry date attached to `Party` or
  `Supplier` — `IdentityVerification` exists but is `User`-only KYC.
