# 04. Approval chains, escalation and delegation

At Solo scale one person approves everything by owning `payments.approve`,
so the boolean-permission model never shows a seam. At Org scale approval
is a ladder — amount decides who, absence decides who stands in, and
departure decides what happens to what they hadn't decided yet. None of
that has anywhere to live today: there is no threshold, no delegation, no
pending-decision row, only a flat capability and `createdAt`.

## Lens: The threshold nobody approves alone

**Question:** For each document type that commits money or stock at a
value — PurchaseOrder, SupplierBill, an INVOICED inter-branch transfer,
a StockVariance write-off, a manual JournalEntry — name the amount bands,
which role or rank each band requires, how many distinct approvers the
top band needs (quorum), and the service method where that check runs
before the row can leave its draft state.

**Why:** `payments.approve` (`packages/shared/src/permissions.ts:83`) is
the only approval-shaped key in the 50-entry catalogue, and it is a flat
boolean — `PermissionsGuard.canActivate` is a pure OR over held keys, so
holding it approves a 500 and a 5,000,000 transaction identically.
`PurchaseOrderStatus` (`purchasing.prisma:88-94`) is
`DRAFT|SENT|PARTIAL|RECEIVED|CANCELLED` — no `PENDING_APPROVAL` value, no
approval gate between DRAFT and SENT at all. This differs from CLAUDE.md's
existing "Authority and blast radius" lens, which asks for one sensitive
action's own permission key and a second signature; this lens asks for the
ladder of bands across ordinary documents, not one elevated action.

**Worked example:** Narrow slice: add a "manager must approve POs over
100,000" checkbox to the purchase-order create form. Complete capability:
an `ApprovalThreshold` table keyed by document type and band, a step
recorded before `PurchaseOrder.status` can leave DRAFT, and a quorum count
on the top band — two of three regional finance leads — enforced inside
`purchasing.service.ts`, not by disabling a Send button in the browser.

**Done test:** The PR names the table holding a threshold row and the
amount column it compares against, and a grep of `purchasing.service.ts`
(or the equivalent write path for each document type above) shows the
approval check inside the method that flips status, not only in a
frontend disabled-state.

**Breaks without:** A branch manager splits one 2,000,000 purchase order
into four 500,000 lines, each under a single-approver band on its own, and
no chain step ever evaluates the total — the ceiling exists on paper and
nowhere in the write path.

## Lens: Acting cover has no clock

**Question:** Name the table that records "user B may act with user A's
approval authority from date X to date Y," and what removes that
authority at the start of day Y+1 if nobody remembers to.

**Why:** `RoleGrant`, `UserRoleAssignment`, `UserPermission`
(`core.prisma:278-346`) and `AdminScope` (`organization.prisma:106`) each
carry only `createdAt` — confirmed by grep: `expiresAt` exists in this
schema only on `Cart`, `RefreshToken`, `PasswordResetToken` and
`EmailVerificationToken`, never on a permission or scope grant. A manager
going on leave has exactly one lever today: an admin manually creates a
`UserRoleAssignment` for the deputy and must remember to delete it later.
Nothing self-expires.

**Worked example:** Narrow slice: let an admin add the "Assistant Manager"
role to a deputy before a trip and remove it after. Complete capability: a
`Delegation` row (`delegatorId`, `delegateId`, `permissionKeys` or
`roleId`, `startsAt`, `endsAt`, scope) that
`PermissionsResolverService.resolveForUser()` unions in only while
`now()` falls inside the window, so the grant lapses with no follow-up
task.

**Done test:** A table with `startsAt`/`endsAt` exists, and a spec proves
a delegate's resolved permission set drops the delegated key the instant
`now() > endsAt`, with no code path requiring a human to remember to
revoke it.

**Breaks without:** Acting cover becomes a standing permanent grant; six
months after covering one two-week leave, an ex-deputy still silently
holds `payments.approve` and nobody notices because nothing is scheduled
to check.

## Lens: The approval orphaned by a leaver

**Question:** Name the query that lists every not-yet-decided approval
currently sitting with a given user, and the call site — inside whatever
flips that user's `isActive` to false — that reassigns or escalates them.

**Why:** `auth.service.ts:135/158` and `jwt.strategy.ts:35` all gate on
`user.isActive`, so deactivating a user blocks their login instantly. But
nothing reassigns work already sitting with them, because nothing tracks
a pending decision at all: no `Approval` or `ApprovalStep` model exists in
any `.prisma` file, and `PurchaseOrderStatus` has no `PENDING_APPROVAL`
state to be stuck in. A user leaving mid-chain today just means whatever
they hadn't approved stays exactly where it was, with no visible owner.

**Worked example:** Narrow slice: ship the threshold ladder from the first
lens above without also handling `isActive: false`. Complete capability:
an approval step carries `assignedToUserId`, a "my pending approvals"
listing scoped to it, and a rule — checked at the same place
`users-admin.service.ts` sets `isActive: false` — that reassigns every
step still owned by that user to the next level up their `AdminScope`.

**Done test:** A test deactivates a user holding an open approval step and
asserts the step now has a different active owner or an explicit
escalation record, not the same `userId` with no session able to act on
it.

**Breaks without:** A high-value transfer's approval sits assigned to a
departed employee's `userId` forever; no query filters by `isActive`, so
nobody sees it in a queue and the shipment or payment never proceeds —
a silent, permanent stall with no error and no alert.

## Not modelled yet

- No `Approval` or `ApprovalStep` model, and no `PENDING_APPROVAL`-shaped
  status on any document (`PurchaseOrder`, `SupplierBill`,
  `InterBranchInvoice`, `StockTransfer`) — approval today is a single
  boolean permission (`payments.approve`), not a recorded decision.
- No amount-band or threshold table anywhere — no ceiling, tier or
  quorum concept attaches to any permission key or document.
- No delegation table and no `expiresAt`/`grantedBy` column on
  `RoleGrant`, `UserRoleAssignment`, `UserPermission` or `AdminScope` —
  acting cover has no start, no end and no record of who granted it.
- No reassignment-on-deactivation path: `isActive: false` blocks login
  (`jwt.strategy.ts:35`) but nothing reads it to move work off a user.
- No rank or manager/reports-to model (confirmed absent in the ground
  brief) — "escalate to the next level up" has no ladder to climb yet
  beyond the three-value `AdminScopeLevel` (ORG/BRAND/BRANCH).
