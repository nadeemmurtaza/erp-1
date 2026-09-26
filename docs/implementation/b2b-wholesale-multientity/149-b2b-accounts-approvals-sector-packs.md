# 149 — The `accounts`/`approvals` sector packs `MULTI-SECTOR.md` already names, never scoped as their own work order

> **Status (2026-09-26): built.** `B2BAccount`/`B2BPurchaseApprovalPolicy`/
> `B2BOrderRequest` (new `accounts.prisma`, no `organizationId` column —
> same deviation doc 146's own `pricing.prisma` already documents), plus
> `ApprovalSubjectType.B2B_ORDER` and two new additive `ApprovalStep`
> columns (`approverContactIds String[]`, `decidedByContactId`) on doc 63's
> existing `ApprovalChain`/`ApprovalStep` — never a second approval-chain
> implementation, and both existing callers (`PURCHASE_REQUISITION`,
> `WALLET_ADJUSTMENT`) untouched. `AccountProvider` (new `payments`
> provider, key `account`, off the `PAYMENT_PROVIDERS` allowlist by
> default) is the checkout integration: it reuses doc 145's own
> `CreditTermsService.checkCreditAvailable()` unchanged (`payments ->
> receivables` in `KNOWN_MODULE_COUPLINGS`, hard-imported the same way
> `tax`/`pricing`/`fulfilment` already are) and refuses outright, with no
> side effect, an order at or above the account's own threshold — the
> generic `POST /orders` endpoint never completes one. A new `accounts`
> module (off by default in `MODULES`, same tier as `wallet`/`settlements`)
> owns the buyer-side workflow: `AccountsService.submitOrderRequest()`
> creates a `B2BOrderRequest` (a REQUEST, never an Order, never a stock or
> ledger write) and starts a single-tier chain naming every listed
> approver contact; `.decide()` enforces the toxic-pair refusal explicitly
> at the calling layer exactly as `RequisitionService.decide()` already
> does (`ApprovalService` itself deliberately does not — this document's
> own earlier claim that `ApprovalService.start()` "already enforces" self-
> approval refusal was wrong against the real code and is corrected here);
> an APPROVE that closes the chain calls `.convertToOrder()`, which claims
> the request via a race-safe `updateMany` (mirroring
> `RequisitionService.convertToPurchaseOrder()`) and replays the stored
> payload through the identical, unmodified `OrdersService.place()`.
> Settlement reuses `PaymentsService.approve()` unchanged — no bespoke
> settlement path exists. `OrdersService.validatePlaceOrderDto()` is the
> one new public method on `orders`: the accounts module never imports
> `PlaceOrderDto` directly (`scripts/check-module-boundaries.mjs` only
> allows a cross-module import of a `.module`/`.service`, never a DTO
> file), so it validates the buyer's raw submission through this instead.
> `PaymentContext` gained two additive, optional fields
> (`contactId`, `purchaseOrderReference`) every other provider ignores.
> `CUSTOMER_SCOPE_CATALOG` gained `b2b-account:read` only — no `:write`:
> submitting or deciding a request can end in a real Order, the same
> reasoning `163-personal-api-keys.md` §4 already gives for leaving
> checkout out of that catalogue entirely, so both actions stay session-
> only by the absence of a write scope, reachable only by
> `@AuthenticatedOnly()`. Staff admin (`finance.credit-terms.manage`,
> reused unchanged) and buyer-portal API + a minimal admin/portal UI
> ship together (WO-149.4). 27 new tests across
> `approval.service.spec.ts` (additive), `account.provider.spec.ts`, and
> `accounts.service.spec.ts`, including both acceptance-criteria specs
> (threshold refusal, self-approval refusal). Full `apps/api` suite
> passing with no regression.

`MULTI-SECTOR.md`'s own `MODULES` example line lists a full B2B-capable
deployment: `catalog,cart,orders,payments,inventory,purchasing,crm,
analytics,reports,tracking,finance,serials,warranty,fitment,dimensions,
tax,pricing,accounts,quotes,receivables,approvals`. Six of those twenty
already exist as real modules; `pricing` is doc 146 (this batch);
`receivables` is doc 145 (this batch); `quotes` already has a real
schema foundation (`invoicing.prisma`'s `Quote`/`QuoteLine`). Two named
packs have never been scoped anywhere: **`accounts`** (a B2B buyer
placing orders against a standing account rather than paying per order)
and **`approvals`** (a buyer-side purchase-approval requirement before an
order commits). This document scopes both, deliberately kept small since
each is a thin layer over mechanisms this repository already has in
full.

## 1. `accounts` — an order settles against credit terms instead of an immediate tender

```prisma
// additive — parties.prisma or a new accounts.prisma
model B2BAccount {
  id             String  @id @default(cuid())
  organizationId String
  customerId     String  @unique
  isActive       Boolean @default(true)
  requiresPurchaseOrder Boolean @default(false) // the buyer's own PO number becomes a required reference
}
```

Placing an order against a `B2BAccount` is not a new payment mechanism —
it is the *absence* of one at order time: `doc 145`'s own
`checkCreditAvailable()` gates the order, the order posts as an
outstanding receivable exactly like any other on-account sale, and
settlement happens later through the identical `Payment`/`Invoice` flow
this repository already has. `accounts` is the sector-pack toggle that
*exposes* "pay on account" as a checkout option at all — with the pack
off, every buyer pays immediately, exactly today's behavior.

## 2. `approvals` — a buyer-side purchase-approval gate before an order commits

```prisma
model B2BPurchaseApprovalPolicy {
  id             String @id @default(cuid())
  b2bAccountId   String @unique
  thresholdMinor Int    // orders at or above this amount require approval before submission
  approverContactIds String[] // which of the buyer's OWN contacts may approve — never one of this org's own staff
}
```

This registers a `B2BAccount`'s own order-submission path against doc
63's existing `ApprovalChain`/`ApprovalStep` mechanism, with
`ApprovalSubjectType` gaining one more value (`B2B_ORDER`) — **never a
second approval-chain implementation.** The critical distinction from
every other use of `ApprovalChain` in this document set: the approver is
the *buyer's own* staff (`approverContactIds`, a `Contact`, not a `User`
of this deployment), because this is the buyer's own internal purchasing
control, not this organization's — the seller merely holds and enforces
the buyer's stated policy, the way a corporate card program enforces a
cardholder's own spend limit without deciding it.

## Scope lenses

**The actor with three tables** — `B2BAccount.customerId` and
`approverContactIds` are both `Party`/`Contact`, never `User` — restated
because this is the second document this batch (after doc 148) where the
counterparty is explicitly not this deployment's own staff.
**The principal with no permission key** — n/a: every write is by an
authenticated `User` (staff configuring the account) or an authenticated
`Contact` (the buyer placing/approving an order via the portal).
**The grant that ends itself** — `B2BAccount.isActive = false` stops new
orders on account immediately; a `B2BPurchaseApprovalPolicy`'s own
`approverContactIds` list is edited by the buyer's own admin contact
(where the portal exposes that), never by this organization's own staff
choosing the buyer's approvers for them.
**Whose rows, and which columns** — `B2BAccount`/`B2BPurchaseApprovalPolicy`
are `organizationId`-scoped; a buyer's own contacts see only their own
account's policy, never another buyer's.
**The threshold nobody approves alone** — restated as this document's own
entire purpose: `thresholdMinor` is the buyer's own configured line; an
order at or above it cannot be submitted until a listed approver contact
approves it through doc 63's own chain mechanism, generalized here.
**The toxic pair** — the contact who *placed* the order is never
automatically also its approver, even if listed in
`approverContactIds` — the identical self-approval refusal doc 63's own
`ApprovalService.start()` already enforces, unchanged.
**Authority and blast radius** — who may create a `B2BAccount` or edit
its credit terms (doc 145) is this organization's own staff, gated by
`finance.credit-terms.manage`; who may edit the *approval policy itself*
is the buyer's own contact, gated by a portal-side permission distinct
from this deployment's own `PERMISSION_CATALOG`, since it governs the
buyer's own internal control, not this organization's.
**Audience is a capability, not an address** — a pending B2B-order
approval notifies the listed `approverContactIds`, resolved from the
policy row, never a hardcoded email.
**Request or record** — an order placed against a `B2BAccount` under an
active `B2BPurchaseApprovalPolicy` is a REQUEST until approved (refusable
by the buyer's own approver); once approved, it proceeds through the
identical order-placement path every other order already uses, at which
point it is classified exactly as that path already classifies it.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a beyond what doc 145's own receivables posting already
answers; `accounts` changes only the settlement timing, not the posting
rule itself.
**Dry run before live** — `checkCreditAvailable()` (doc 145) already
serves as the dry run for whether an on-account order can proceed at all,
reused unchanged.
**Three silhouettes** — Solo: neither pack is ever turned on. Chain: a
handful of real wholesale accounts. Organization: many B2B accounts,
each with its own approval policy, at real volume.
**The absent collaborator** — with `accounts`/`approvals` off, every
buyer pays immediately with no approval gate — today's exact behavior,
unchanged, per `MULTI-SECTOR.md`'s own module-independence guarantee.
**The second copy of the write** — `B2BAccount.customerId @unique`
prevents two accounts for one buyer; the approval chain's own existing
idempotency (doc 63) is reused unchanged.
**The hundred-thousandth row** — both tables are small, admin/buyer-
configured rows, never high-volume.
**The reversal document / The undo fan-out** — a rejected B2B-order
approval is a terminal chain state, per doc 63's own existing answer;
re-submission starts a new chain, never resets the rejected one.
**The version stamp** — a policy's own `thresholdMinor` change applies to
orders submitted after the change; an order already mid-approval finishes
under the threshold it started under.
**The erasure the ledger cannot obey** — `approverContactIds` holds
people; on a contact's deletion, follows the same basis every other
contact-referencing row in this document set already states.
**The failure path** — an order submitted with no listed approver
contacts (a misconfigured policy) is refused at submission with a clear
error, never silently stuck in an unapprovable state.

## Work orders

**WO-149.1 — schema**: `B2BAccount`, `B2BPurchaseApprovalPolicy`,
`ApprovalSubjectType.B2B_ORDER` added to doc 63's own enum.
**WO-149.2 — checkout integration**: an on-account payment option gated
by an active `B2BAccount`, routed through doc 145's own
`checkCreditAvailable()`.
**WO-149.3 — approval-chain registration**: a `B2BPurchaseApprovalPolicy`
registers its own `ApprovalChainDefinition` against doc 63's existing
`ApprovalService`, resolving `approverContactIds` instead of a role.
**WO-149.4 — UI**: a B2B-account admin screen (staff side), a purchase-
approval-policy screen (buyer-portal side), a pending-approval indicator
on the buyer's own order-in-progress screen.

## Acceptance

- With `accounts`/`approvals` off, checkout behaves byte-identically to
  today.
- An order at or above `thresholdMinor` cannot complete without an
  approval from a listed `approverContactId`, proven by a spec.
- The order's own placer is never accepted as its own approver, even if
  listed, proven by a spec.

## Out of scope

Multi-tier buyer-side approval chains (a purchase requiring two levels of
the buyer's own sign-off) — doc 63's own generic tier-count mechanism
already supports this if a real buyer needs it; this document's own
schema (`approverContactIds` as a flat list) covers the single-tier case
that satisfies the named requirement, extended to multi-tier only once a
real buyer asks.
