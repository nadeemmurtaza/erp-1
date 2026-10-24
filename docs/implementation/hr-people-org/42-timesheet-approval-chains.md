# 42 — Timesheet submission and multi-level approval

`19-payroll.md` names this gap in its own words: an hourly worker with no
compensation-attribution signal gets a deliberate `$0` line on the pay-run
preview rather than a "plausible-looking wrong one silently computed from
an incomplete signal," and the document says plainly — "a real timesheet or
sales-attribution capability is future work, named here so it is not
mistaken for done." This document is that future work, for the timesheet
half.

**A timesheet is not `AttendanceEvent`.** Doc 22's punches are an
unconditional record of a physical event — a door badge at 08:58, never
refused. A timesheet is the opposite kind of write: **a claim an employee
submits and a manager reviews before it becomes anything payroll can
trust**, exactly the REQUEST/RECORD distinction `CLAUDE.md`'s own lens
draws. Where doc 22's attendance module is enabled, a timesheet's entries
are pre-populated from `AttendanceEvent` punches (so an employee is
confirming a record, not re-typing it) — but the submission and the
approval are this document's own act, never doc 22's.

## 1. A timesheet is a document with entries, a status, and a chain

```prisma
// new: timesheets.prisma

enum TimesheetStatus { DRAFT SUBMITTED APPROVED REJECTED }

model Timesheet {
  id         String   @id @default(cuid())
  employeeId String
  periodStart DateTime
  periodEnd   DateTime
  status      TimesheetStatus @default(DRAFT)
  submittedAt DateTime?
  totalHours  Float    @default(0)

  employee Employee          @relation(fields: [employeeId], references: [id])
  entries  TimesheetEntry[]
  approvals TimesheetApproval[]

  @@unique([employeeId, periodStart, periodEnd])
  @@index([employeeId, status])
}

/// One row per day in the period. `sourceEventIds` is populated when doc
/// 22 is enabled and this row was pre-filled from real punches — never a
/// foreign key into AttendanceEvent (module independence: timesheets must
/// not import attendance's schema), a plain array of ids resolved through
/// a registry read at render time only.
model TimesheetEntry {
  id          String  @id @default(cuid())
  timesheetId String
  workDate    DateTime
  hours       Float
  note        String?
  sourceEventIds String[]

  timesheet Timesheet @relation(fields: [timesheetId], references: [id], onDelete: Cascade)

  @@unique([timesheetId, workDate])
}

enum ApprovalDecision { PENDING APPROVED REJECTED }

/// The chain, one row per level — a single-level shop and a three-level
/// group both fall out of the same table, per doc 20's own Posting/rank
/// composition rule: authority composes, this document just records who
/// actually signed, in what order, and what they decided.
model TimesheetApproval {
  id           String   @id @default(cuid())
  timesheetId  String
  level        Int
  approverPositionId String
  decision     ApprovalDecision @default(PENDING)
  decidedByUserId String?
  decidedAt    DateTime?
  note         String?

  timesheet Timesheet @relation(fields: [timesheetId], references: [id], onDelete: Cascade)
  approverPosition Position @relation(fields: [approverPositionId], references: [id])

  @@unique([timesheetId, level])
  @@index([approverPositionId, decision])
}
```

`approverPositionId` (doc 20's `Position`, never a `User`) is what makes
the chain survive a leaver exactly the way doc 20's own reasoning already
established for every other approval chain in this set: the post approves,
whoever currently holds it acts.

## 2. The chain length is policy, not a hardcoded number of levels

`Position.rank`'s level (doc 20) decides how many approvals a timesheet
needs before it can feed payroll — a policy row (`TimesheetApprovalPolicy`,
per `organizationId`, naming "N levels" or "escalates above rank X"), never
a fixed 1-or-2-level assumption. A `Solo` shop's one manager is a
one-level chain; an `Organization` edition's multi-office structure can
require sign-off at each level the policy names, walking `Position.reportsTo`
exactly as doc 23's task-escalation and doc 24's own audience-over-the-org-tree
already do — this document introduces no second way to walk that chain.

## 3. Approval feeds payroll as a signal, never a silent override

An `APPROVED` timesheet's `totalHours` is exactly the "real timesheet...
capability" signal doc 19 named — `PayrollService`'s hourly calculation
reads it where one exists for the period, and falls back to doc 19's
existing, deliberate `$0`/visible-gap behavior where it does not. A
`REJECTED` or still-`PENDING` timesheet at pay-run time is the same visible
gap, not a guess: payroll never invents hours a manager has not signed off.

## Scope lenses

**The actor with three tables** — n/a: employees and positions from doc
20, no new actor.
**The principal with no permission key** — n/a.
**The grant that ends itself** — approval authority is the post's, not the
person's (§1); a posting ending (doc 20) mid-chain hands the pending
approval to whoever holds the post next, never stalls it.
**Whose rows, and which columns** — a timesheet is visible to its own
employee and to every `approverPositionId` in its chain (current and
already-decided); `note` on a rejection is visible to the same audience,
never broadcast.
**The threshold nobody approves alone** — n/a: no money or stock committed
directly by a timesheet; its downstream effect on pay is doc 19's own
threshold, unchanged.
**The toxic pair** — an employee cannot hold the `approverPositionId` for
their own timesheet's chain — refused at submission, the same self-
approval refusal every other chain in this document set already enforces.
**Authority and blast radius** — who may set the approval-chain policy (HR
admin, org-wide); the worst value is a policy naming zero levels, which
the admin screen refuses to save (a timesheet with no approval step is not
an approved one).
**Audience is a capability, not an address** — a pending approval notifies
the current level's `approverPositionId` through doc 24's existing
audience-resolution, never a stored address; a rejected timesheet notifies
the submitting employee the same way.
**Request or record** — the whole document's central classification,
restated: submission and approval are REQUESTS (refused: submitting past
the period's own close, approving your own, approving out of order); once
`APPROVED`, the timesheet is a RECORD payroll reads and never re-litigates
for that period.
**The movement with no address** — n/a.
**Four hours down** — a branch offline still lets an employee draft and
submit a timesheet locally (queued in the existing offline-outbox pattern);
approval itself needs the chain's live rank data and queues until
connectivity returns, the same bound doc 25 already states for advance
approval.
**Click the number** — a payroll run's hourly line for an employee links
back to the exact `Timesheet`/`TimesheetEntry` rows its hours came from.
**The unwritten posting rule / Every column or none / The period that
already moved** — n/a: a timesheet posts no `JournalLine` itself; its
downstream payroll effect follows doc 19's own posting rule unchanged.
**The second legal entity** — `TimesheetApprovalPolicy` scoped per
`organizationId`.
**Dry run before live** — `canApprove(timesheet, position)` and
`isChainComplete(timesheet)` are pure functions the UI calls to disable an
illegal approve button — the same shape doc 23's `canTransition` already
establishes.
**Three silhouettes** — Solo: no timesheets, or a single self-attested one
with no chain — payroll's own `$0`-gap behavior is unaffected either way.
Chain: one or two approval levels per branch. Organization: multi-level
chains across offices, escalation on a stalled approval (doc 24) actually
firing.
**The absent collaborator** — with `payroll` off, timesheets still submit
and approve, simply feeding nothing downstream; with doc 22's attendance
off, entries are always manually typed, never pre-filled — neither module
is a hard dependency of this one.
**The second copy of the write** — `@@unique([employeeId, periodStart,
periodEnd])` stops a duplicate timesheet for the same period;
`@@unique([timesheetId, level])` stops a redelivered approval-chain-advance
event from creating a second decision at the same level.
**The hundred-thousandth row** — timesheet volume scales with headcount ×
pay periods; bounded by `[employeeId, status]`, and closed-period
timesheets are read-only and safe to archive after the pay run that
consumed them posts.
**The reversal document** — a wrongly-approved timesheet already consumed
by a `POSTED` pay run is corrected through doc 19's own `PayRunAdjustment`
path, never an in-place edit of the timesheet or a silent re-approval.
**The undo fan-out** — rejecting a timesheet does not retroactively affect
a pay run that already ran without it (it was already the visible `$0`
gap); resubmitting after rejection is a new submission, chain restarted
from level 1, never resuming mid-chain with a stale earlier approval.
**The version stamp** — a timesheet stores the approval-policy level count
it was submitted under, so a later policy change (adding a level) does not
retroactively invalidate an already-complete chain.
**The erasure the ledger cannot obey** — `Timesheet`/`TimesheetApproval`
rows survive an employee's erasure under the same statutory payroll-record
basis doc 20/25 already state, keyed on `Employee`, pseudonymised.
**The failure path** — a chain-advance notification that fails to deliver
(doc 24's own outbox) leaves the approval at its current level, visible on
a "my pending approvals" screen (doc 44) rather than silently stalling
with no trace.

## Work orders

**WO-42.1 — schema**: `Timesheet`, `TimesheetEntry`, `TimesheetApproval`,
`TimesheetApprovalPolicy`.
**WO-42.2 — `TimesheetService`**: draft/submit/approve/reject,
`canApprove`/`isChainComplete` pure, self-approval refusal.
**WO-42.3 — attendance pre-fill**: reads doc 22's `AttendanceEvent` through
a registry entry when enabled, populates `TimesheetEntry.sourceEventIds` —
optional, never a hard import.
**WO-42.4 — payroll integration**: `PayrollService`'s hourly calculation
reads an `APPROVED` timesheet's `totalHours` for the period, falling back
to doc 19's existing `$0`-gap behavior otherwise.
**WO-42.5 — permissions**: `hr.timesheet.submit`, `hr.timesheet.approve`
(scoped to the approver's own chain position), `hr.timesheet.admin`
(policy).
**WO-42.6 — UI**: submission screen (pre-filled where attendance is on),
approval queue per level, a chain-status view on the timesheet itself.

## Acceptance

- An employee cannot be their own timesheet's approver at any level.
- A timesheet cannot be marked `APPROVED` until every configured level has
  decided `APPROVED`; one `REJECTED` level rejects the whole timesheet.
- `PayrollService`'s hourly line for a period with an `APPROVED` timesheet
  uses its `totalHours`; a period with none still shows doc 19's own
  visible `$0` gap, proven by running that existing spec unchanged.
- A posting ending mid-chain (doc 20) hands the pending decision to the
  post's new holder, never stalls it silently.
- With attendance off, timesheet entries are manually enterable and the
  pack-absence test still passes.

## Out of scope

Automatic hours calculation from GPS/geofenced field punches (doc 30) —
named as a natural future pre-fill source, not built here. Overtime rate
calculation — this document carries `hours`, not a rate; a
compensation-rules extension to `CompensationRate` (doc 19) is where an
overtime multiplier would live, not this document. A time-tracking
stopwatch/live-clock UI — this is a submission-and-approval flow for
already-worked hours, not a real-time tracker.
