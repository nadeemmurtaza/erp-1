# 152 — Purchase requisition: an internal "I need to buy X" step, distinct from approving the PO itself

Checked against `purchasing.prisma`: no `Requisition`/`PurchaseRequisition`
model exists (the one `Requisition` hit anywhere in this schema is doc
28's own `JobRequisition`, an unrelated HR concept). Today, a
`PurchaseOrder` is the first record of an internal buying decision — there
is no earlier "someone other than the buyer asked for this to be
purchased" step. A real procurement control at Chain/Organization scale
needs that earlier step: a requester who is not authorized to commit
spend raises a requisition; a purchasing role reviews it and, if
approved, turns it into a real `PurchaseOrder` — two different decisions
(*should we buy this at all* vs. *is this specific PO's price/supplier
right*) that this repository currently conflates into one.

## 1. A requisition is a request to buy; a PO is the resulting commitment — never the same row wearing two hats

```prisma
model PurchaseRequisition {
  id             String   @id @default(cuid())
  organizationId String
  requestedById  String   // User — any staff member, not necessarily one with purchasing.orders.create
  locationId     String   // named explicitly, never defaulted, per this repository's own standing rule
  justification  String
  status         RequisitionApprovalStatus @default(PENDING)
  convertedPurchaseOrderId String?  // set once approved and turned into a real PO — the one link, written once

  lines RequisitionLine[]

  @@index([organizationId, status])
}

model RequisitionLine {
  id             String @id @default(cuid())
  requisitionId  String
  variantId      String  // may be a RawMaterial's own variant (bom) or an ordinary product variant
  quantity       Int
  estimatedUnitCostMinor Int?  // a requester's own estimate — never a real cost until an actual PO line snapshots one

  requisition PurchaseRequisition @relation(fields: [requisitionId], references: [id])
}

enum RequisitionApprovalStatus { PENDING  APPROVED  REJECTED  CONVERTED }
```

## 2. Approval reuses doc 63's own generic chain, never a bespoke requisition-approval mechanism

```ts
// ApprovalSubjectType gains PURCHASE_REQUISITION alongside doc 149's own
// B2B_ORDER — the identical registered-subject-type pattern, never a
// third bespoke approval implementation in this document set.
async approveRequisition(requisitionId: string): Promise<void> {
  // On the chain's own final APPROVED step (doc 63), status -> APPROVED.
  // Conversion to a real PurchaseOrder is a SEPARATE, explicit action
  // (never automatic) — approving a requisition means "yes, buy this,"
  // not "here is the exact supplier/price," which a purchasing role
  // still decides when actually raising the PO.
}

async convertToPurchaseOrder(requisitionId: string, supplierId: string, priceOverrides?: Record<string, number>): Promise<PurchaseOrder> {
  // Creates an ordinary PurchaseOrder through the EXISTING purchasing
  // path, copying RequisitionLine quantities as a starting point —
  // never a bypass of PurchaseOrder's own existing creation/approval
  // rules. Sets convertedPurchaseOrderId and status -> CONVERTED.
}
```

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: every requester and approver is an
existing `User`; no new actor kind.
**Whose rows, and which columns** — `PurchaseRequisition` is
`organizationId`/`locationId`-scoped; a requester sees their own
requisitions, a purchasing role with `purchasing.requisitions.review`
sees their own branch/node's queue, never an org-wide dump without the
broader permission.
**The threshold nobody approves alone** — restated as this document's
own entire purpose: a requisition above a configurable value threshold
requires `purchasing.requisitions.approve`, distinct from
`purchasing.requisitions.create` (any staff member can request) and
distinct again from `purchasing.orders.create` (converting an approved
requisition into a real PO is its own, separately-permissioned act) —
three genuinely different authorities this repository previously
conflated into one.
**The toxic pair** — the requester of a `PurchaseRequisition` is never
its own approver, enforced identically to every other self-approval
refusal in this document set (doc 63, doc 145, doc 149).
**Authority and blast radius** — who may convert an approved requisition
into a real PO is `purchasing.orders.create`, unchanged from today — this
document adds an earlier gate, never removes or weakens the existing one.
**Audience is a capability, not an address** — a pending requisition
notifies whoever holds `purchasing.requisitions.approve` scoped to the
requisition's own `locationId`/brand, reusing doc 24's own audience
resolution.
**Request or record** — a requisition is, by definition, a REQUEST — it
can be rejected outright, and even once `APPROVED` it is not yet a
commitment (no supplier, no price) until `convertToPurchaseOrder()` runs;
the resulting `PurchaseOrder` is classified exactly as it already is
today, unchanged by this document.
**The movement with no address** — `locationId` is required and never
defaulted, the identical discipline every other location-aware write in
this repository already follows — a requisition raised with no stated
location is refused, never silently assigned to
`InventoryService.defaultLocationId()`.
**Four hours down** — a requisition raised on paper during an outage is
entered once systems return; nothing about ordinary purchasing is blocked
by this mechanism's own unavailability, since an urgent buy can still go
straight through the existing `PurchaseOrder` path if a client's own
policy allows bypassing requisition for genuine emergencies (a
`Setting`-driven policy, not hardcoded).
**Click the number** — a `PurchaseOrder`'s own detail screen, where it
originated from an approved requisition, links back to that requisition
and its own original justification/estimate — never losing the "why was
this bought" trail once converted.
**The unwritten posting rule / Every column or none / The period that
already moved / The second legal entity** — n/a: a requisition itself
posts nothing; only the resulting `PurchaseOrder`/`GoodsReceipt`/
`SupplierBill` post, entirely unchanged from today.
**Dry run before live** — n/a beyond what doc 63's own `stepsFor()` already
provides as a pure preview of a requisition's own required approval
chain before submission.
**Three silhouettes** — Solo: rarely used — the owner buys directly.
Chain: a real control at this scale (a branch manager requests, a central
purchasing role reviews before committing spend). Organization: real
procurement governance across many requesters and branches, where the
approval-threshold-by-scope (next lens) matters.
**The absent collaborator** — with this mechanism off (or simply unused
by policy), any staff member with `purchasing.orders.create` raises a PO
directly, exactly today's behavior — this document adds an optional
earlier gate, never a mandatory replacement of the existing path.
**The second copy of the write** — `convertedPurchaseOrderId` set once,
never twice — converting an already-`CONVERTED` requisition is refused,
preventing one requisition from silently producing two real POs.
**The hundred-thousandth row** — `PurchaseRequisition`/`RequisitionLine`
indexed by `[organizationId, status]`; volume bounded by real requisition
frequency, never unbounded.
**The reversal document** — a `REJECTED` requisition is terminal; a
requester who still needs the item raises a new requisition, never
reopens the rejected one, per the identical "rejected is terminal, re-
submission is a new row" discipline doc 63 already establishes.
**The undo fan-out** — cancelling an already-`CONVERTED` requisition's
own resulting `PurchaseOrder` is that PO's own existing cancellation
path; the requisition's own record of having been converted is never
erased, only the PO it produced is cancelled through its own mechanism.
**The version stamp** — an approval-threshold policy change applies to
requisitions submitted after the change; one already mid-approval
finishes under the threshold it started under, identical to doc 63's own
answer.
**The erasure the ledger cannot obey** — `requestedById` holds a person;
on user deletion, follows doc 20's own stated basis, the requisition's
own record retained as a procurement-audit fact.
**The failure path** — a requisition approved with a
`convertToPurchaseOrder()` call that fails (a bad supplier reference) is
never left silently `APPROVED`-but-broken — the failure surfaces to the
purchasing role's own queue for retry, never a lost requisition.

## Work orders

**WO-152.1 — schema**: `PurchaseRequisition`, `RequisitionLine`,
`RequisitionApprovalStatus`, `ApprovalSubjectType.PURCHASE_REQUISITION`
added to doc 63's own enum, forward-only migration.
**WO-152.2 — `RequisitionService`**: `create()`, registers against doc
63's `ApprovalService`, `convertToPurchaseOrder()`.
**WO-152.3 — permissions**: `purchasing.requisitions.create`
(broad — most staff), `.approve`, seeded distinct from
`purchasing.orders.create`.
**WO-152.4 — UI**: a "request a purchase" form (any staff member), a
requisition-review queue (purchasing role), a "convert to PO" action that
opens the existing PO-creation screen pre-filled from the requisition's
own lines.

## Acceptance

- A requisition's requester can never approve their own requisition,
  proven by a spec.
- An already-`CONVERTED` requisition cannot be converted a second time,
  proven by a spec.
- A `PurchaseOrder` created from an approved requisition links back to it,
  and the requisition's own status reads `CONVERTED`.
- A requisition raised with no `locationId` is refused, never defaulted.

## Out of scope

Automatic requisition generation from a reorder-point breach (doc 01's
own existing reorder-suggestion mechanism could, in principle, raise a
requisition instead of a direct PO) — a real, plausible future
integration named here but not built, since it changes doc 01's own
existing reorder flow and deserves its own scoping pass rather than being
folded in as a side effect of this document.
