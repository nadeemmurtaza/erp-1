# 63 — One approval-chain mechanism, generalized from `TimesheetApproval`

Doc 42 already built a real, working multi-step approval chain —
`TimesheetApproval`, a supervisor review sequence for timesheet sign-off.
`LeaveRequest` (`apps/api/prisma/schema/payroll.prisma`, lines 106-126),
by contrast, has only `decidedById String?` / `decidedAt DateTime?` — a
single approver, no chain at all. "Multi-tier approval hierarchies... for
sign-offs on timesheets, document updates, and leave quotas" is a request
to have **one** chain mechanism serving all three, not a second
timesheet-shaped chain built from scratch for leave and a third for
documents. This document generalizes doc 42's own model into a reusable
mechanism and upgrades `LeaveRequest` to use it.

## 1. The chain, extracted once, referenced by subject type

```prisma
model ApprovalChain {
  id           String   @id @default(cuid())
  subjectType  ApprovalSubjectType  // TIMESHEET | LEAVE_REQUEST | DOCUMENT_UPDATE
  subjectId    String               // the Timesheet.id / LeaveRequest.id / etc.
  currentStep  Int      @default(1)
  status       ApprovalChainStatus  // PENDING | APPROVED | REJECTED
  createdAt    DateTime @default(now())

  steps ApprovalStep[]

  @@unique([subjectType, subjectId])
  @@index([subjectType, status])
}

model ApprovalStep {
  id            String   @id @default(cuid())
  chainId       String
  stepOrder     Int
  approverRoleId String?  // resolved to a specific approver at runtime,
  approverUserId String?  // OR a specific person — never both null
  status        ApprovalStepStatus  // PENDING | APPROVED | REJECTED | SKIPPED
  decidedAt     DateTime?
  comment       String?

  chain ApprovalChain @relation(fields: [chainId], references: [id])

  @@unique([chainId, stepOrder])
}

enum ApprovalSubjectType { TIMESHEET  LEAVE_REQUEST  DOCUMENT_UPDATE }
enum ApprovalChainStatus { PENDING  APPROVED  REJECTED }
enum ApprovalStepStatus  { PENDING  APPROVED  REJECTED  SKIPPED }
```

This is exactly doc 42's own `TimesheetApproval` shape (chain + ordered
steps, a step naming either a role or a specific person, an
approve/reject/comment per step) with `subjectType`/`subjectId` replacing
the hardcoded `timesheetId` foreign key — the same "one registered
mechanism, keyed by a discriminator" pattern this repository already uses
for `ExpiringRecordSource` (doc 54) and `ActionHubSource` (doc 44), applied
to an approval chain instead of a queue entry.

## 2. `ApprovalService` is the one writer; each subject module calls it, never re-implements it

```ts
interface ApprovalChainDefinition {
  subjectType: ApprovalSubjectType;
  stepsFor(subjectId: string): Promise<Array<{ approverRoleId?: string; approverUserId?: string }>>;
  onApproved(subjectId: string): Promise<void>;   // e.g., LeaveRequest -> APPROVED, deduct LeaveBalance
  onRejected(subjectId: string): Promise<void>;
}

class ApprovalService {
  async start(subjectType: ApprovalSubjectType, subjectId: string): Promise<ApprovalChain> { /* ... */ }
  async decide(chainId: string, stepId: string, decision: 'APPROVE' | 'REJECT', actorId: string, comment?: string): Promise<void> {
    // advances currentStep on APPROVE; on the last step's APPROVE, calls the
    // registered definition's onApproved(); on any REJECT, calls onRejected()
    // and marks the chain REJECTED — never re-implemented per subject type.
  }
}
```

`LeaveRequest`'s own approval upgrade is then: register an
`ApprovalChainDefinition` for `LEAVE_REQUEST` whose `stepsFor()` reads the
requesting employee's own reporting chain (the same org-tree walk doc 20's
own hierarchy already supports) and whose `onApproved()` performs the
existing `LeaveBalance` deduction `LeaveRequest.decidedById` used to
trigger directly — the balance-deduction side effect moves behind the
generic chain's `onApproved()` hook, never duplicated.

`LeaveRequest.decidedById`/`decidedAt` are kept as a denormalized "who
made the *final* decision, and when" convenience for existing screens that
read them directly, populated from the chain's own final step — never a
second, independently-writable approval record competing with the chain.

## Scope lenses

**The actor with three tables** — every `approverUserId`/`approverRoleId`
resolves to doc 20's existing `User`/`Role`; no new actor kind.
**The principal with no permission key** — n/a: every approver is an
authenticated `User` acting under an existing permission
(`hr.timesheets.approve`, `hr.leave.approve`, a new `hr.documents.approve`
for the document-update chain).
**The grant that ends itself** — an `ApprovalStep.approverUserId` naming a
specific person who leaves the company or changes role mid-chain: the step
resolves to the *role* at decision time where possible
(`approverRoleId`, "the requester's current supervisor"), not a frozen
person, so a chain never stalls on someone no longer in that seat; where a
specific named person truly must decide (an exception, an override), a
stalled step is surfaced to doc 44's own action hub for reassignment, never
silently stuck forever.
**Whose rows, and which columns** — a chain and its steps are visible only
to the subject's own owner, the named/role-resolved approvers at each
step, and anyone with the subject's own view permission scoped to its
`organizationId`/`branchId` — reusing the subject's own existing visibility
rule, never a separate approval-visibility rule invented per subject type.
**The threshold nobody approves alone** — restated as this document's own
entire purpose: `stepOrder` count is the number of tiers a given subject
type and value requires (a `LeaveRequest` under N days: one tier; over N
days: two, per a client's own configurable policy row, not a hardcoded
constant); a chain's `currentStep` only advances on an actual `APPROVED`
step, never skippable except via the explicit `SKIPPED` status (used only
for a documented delegation, itself audit-logged).
**The toxic pair** — the requester of a `LeaveRequest`/`DOCUMENT_UPDATE`
is never eligible as one of their own chain's approvers — enforced in
`ApprovalService.start()` by excluding `subjectId`'s own owning user from
any resolved `approverUserId`/role-resolved candidate, the same
`closeShift()`-style same-actor guard this repository already applies
elsewhere, generalized here as a chain-wide invariant rather than
re-derived per subject type.
**Authority and blast radius** — who may configure how many tiers a
subject type requires, and at what threshold, is an organization-scoped
policy row (not this document's own schema, but the same rows-over-enums
principle applied to policy: a `LeaveType`-shaped configuration, seeded per
client); the audit row is `ApprovalStep`'s own `decidedAt`/`comment` plus
`AuditService`'s existing state-change log, carrying old status → new
status, not just "decided."
**Audience is a capability, not an address** — a pending step notifies its
resolved approver(s) through doc 24's own `NotificationsService`, resolved
from `approverRoleId`/`approverUserId` exactly as doc 24's audience query
already resolves a role to its current holders — never a literal address.
**Request or record** — the chain itself is a REQUEST (each step can be
rejected); once `APPROVED` end-to-end, the *subject's own* resulting state
change (`LeaveBalance` deducted, `Timesheet` locked) is a RECORD exactly as
each subject type's own document already classifies it — this mechanism
does not change that classification, only who signs off before it happens.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a directly; a `LEAVE_REQUEST` chain's `onApproved()` still
posts through `LeaveBalance`'s own existing rule, unchanged by this
document.
**Dry run before live** — `stepsFor(subjectId)` is itself a pure function
(given a subject, return the required approvers) with no write — a
"preview my approval chain before submitting" screen calls it directly,
read-only, satisfying this lens by construction.
**Three silhouettes** — Solo: one-tier chains almost everywhere (a single
owner approves their own leave requests informally, or a single supervisor
suffices) — the mechanism still applies, just with `stepOrder` length 1.
Chain: real two/three-tier chains (branch supervisor → area manager) become
possible without new code. Organization: chains spanning brands
(cross-brand document-update sign-off) are the reason `subjectType`/
`subjectId` is generic rather than FK'd directly to one table.
**The absent collaborator** — a `DOCUMENT_UPDATE` chain with `hr` off
never starts (no subject to attach to); `TIMESHEET`/`LEAVE_REQUEST` chains
degrade exactly as their own owning modules already do when disabled.
**The second copy of the write** — `@@unique([subjectType, subjectId])` on
`ApprovalChain` makes calling `start()` twice for the same subject a
conflict, not a duplicate chain — the same idempotency discipline this
repository applies to every "could be retried" write.
**The hundred-thousandth row** — `ApprovalChain`/`ApprovalStep` are
indexed by `(subjectType, status)` for "chains pending my decision" queries,
bounded per approver's own pending count, never an unbounded historical
scan.
**The reversal document** — a `REJECTED` chain is terminal; re-submission
(e.g., a corrected leave request) starts a brand-new `ApprovalChain` row,
never resets the rejected one in place — the rejected chain's own history
stays intact as the record of what was actually decided and when.
**The undo fan-out** — reversing an `APPROVED` `LEAVE_REQUEST` chain's
effect (restoring the deducted `LeaveBalance`) is the subject module's own
existing reversal path (if `LeaveRequest` has one) or a documented gap
named at the subject level, not invented by this generic mechanism.
**The version stamp** — a policy change to "how many tiers required" only
applies to chains started after the change; an in-flight chain finishes
under the tier count it started with, read from its own already-created
`ApprovalStep` rows, never recalculated mid-flight.
**The erasure the ledger cannot obey** — `ApprovalStep.approverUserId` and
`ApprovalChain`'s implicit requester (via `subjectId`'s own owner) both
hold a person; on user deletion, follows doc 20's own stated basis exactly
as `TimesheetApproval` already does today.
**The failure path** — a chain that fails to advance (a resolved approver
role has zero current holders) surfaces to doc 44's own action hub as a
stalled item, with `hr.approvals.reassign` permission opening the fix,
never a silently-stuck request the requester has no way to escalate.

## Work orders

**WO-63.1 — schema**: `ApprovalChain`, `ApprovalStep`,
`ApprovalSubjectType`, `ApprovalChainStatus`, `ApprovalStepStatus`,
forward-only migration; a data migration mapping doc 42's existing
`TimesheetApproval` rows into the new generic shape (never a parallel
table left running alongside the new one).
**WO-63.2 — `ApprovalService`**: `start()`, `decide()`, the
`ApprovalChainDefinition` registry, the toxic-pair (self-approval) guard.
**WO-63.3 — upgrade `LeaveRequest`**: register its
`ApprovalChainDefinition`, move the `LeaveBalance` deduction into
`onApproved()`, keep `decidedById`/`decidedAt` as the read-only final-step
convenience fields.
**WO-63.4 — `DOCUMENT_UPDATE` chain**: register a definition for doc 28's
own document-update flow, where a required tier exists (e.g., an HR
manager sign-off on a changed contract record).
**WO-63.5 — UI**: a shared "pending my approval" list (doc 44's action hub
integration), a chain-progress indicator on the timesheet, leave-request,
and document-update detail screens.

## Acceptance

- Doc 42's existing timesheet-approval tests continue to pass against the
  generalized schema (migrated data, unchanged behavior).
- A `LeaveRequest` requiring two tiers is not approved until both
  `ApprovalStep` rows reach `APPROVED`, proven by a spec.
- A requester can never appear as their own chain's resolved approver,
  proven by a spec attempting exactly that.
- A rejected chain never auto-restarts; re-submission creates a new chain
  with a fresh `id`.

## Out of scope

A visual chain-designer UI for org admins to build arbitrary chains — the
number of tiers and their resolution rule ships as a small, documented
policy configuration per subject type in this pass; a general-purpose
workflow-builder is a distinct, much larger capability not requested here.
