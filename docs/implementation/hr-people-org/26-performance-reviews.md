# 26 — Performance reviews and scoring

Docs 23 and 24 each named this and deferred it here on purpose: task
throughput (23) and notification response rates (24) are *signals*, not a
review. The wrong version of this module turns those signals into a score
and calls it done — which quietly tells a warehouse picker and a finance
manager they are being judged by the same yardstick, and turns "closed 40
tasks" into a number nobody can explain when the employee asks why their
rating dropped.

Two decisions prevent that.

## 1. A review is a document with a cycle, not a number with a date

`PerformanceCycle` is the period ("Q1 2027", "FY2026 Annual") an organization
runs once. `PerformanceReview` is one employee's document inside it —
ratings, goals, a manager's narrative — and it goes through the same
draft → submitted → acknowledged states every review process in the world
actually uses. A `score` column with no cycle and no document behind it is
the version that gets built by mistake; this document exists so it isn't.

## 2. Signals feed a review; they never become one automatically

`TaskTransition` (doc 23) and notification response times (doc 24) are read
by `PerformanceSignal` rows — one per employee per metric per cycle, computed
by a cron, cited on the review screen as evidence. **No cron writes a rating.**
A human sets the rating, sees the signal underneath it, and can disagree with
it. This is `CLAUDE.md`'s "click the number" lens applied to a person instead
of a dashboard tile: every score a manager gives links to the raw
`TaskTransition`/response-time rows that fed the signal it was informed by,
never presented as a computed verdict with no drill-down.

## Schema — append to `hr.prisma`

```prisma
model PerformanceCycle {
  id             String   @id @default(cuid())
  organizationId String
  label          String   /// "Q1 2027"
  startsOn       DateTime
  endsOn         DateTime
  status         CycleStatus @default(OPEN)

  reviews PerformanceReview[]
  signals PerformanceSignal[]

  @@unique([organizationId, label])
  @@index([organizationId, status])
}

enum CycleStatus { OPEN CLOSED }

/// One metric, one employee, one cycle — computed, never hand-edited.
model PerformanceSignal {
  id         String @id @default(cuid())
  cycleId    String
  employeeId String
  /// "tasks.completion_rate", "tasks.avg_cycle_time_hours",
  /// "notifications.ack_rate" — a catalogue key, not a free string, so a
  /// review screen can look up how to label and chart it.
  metricKey  String
  value      Float
  computedAt DateTime @default(now())

  cycle    PerformanceCycle @relation(fields: [cycleId], references: [id])
  employee Employee         @relation(fields: [employeeId], references: [id])

  @@unique([cycleId, employeeId, metricKey])
  @@index([employeeId, metricKey])
}

model PerformanceReview {
  id           String   @id @default(cuid())
  cycleId      String
  employeeId   String
  /// The post the review is against — ratings mean different things at
  /// different ranks, and a mid-cycle transfer must not silently move the
  /// review to the new post's rubric.
  positionId   String
  reviewerUserId String

  status       ReviewStatus @default(DRAFT)
  overallRating Int?        /// Scale defined per organization in `RatingScale` (below), not hardcoded here.
  managerNotes String?
  employeeAck  Boolean      @default(false)
  employeeAckAt DateTime?

  submittedAt   DateTime?
  acknowledgedAt DateTime?

  cycle    PerformanceCycle @relation(fields: [cycleId], references: [id])
  employee Employee         @relation(fields: [employeeId], references: [id])
  position Position         @relation(fields: [positionId], references: [id])
  goals    PerformanceGoal[]

  @@unique([cycleId, employeeId])
  @@index([reviewerUserId, status])
}

enum ReviewStatus { DRAFT SUBMITTED ACKNOWLEDGED }

model PerformanceGoal {
  id         String   @id @default(cuid())
  reviewId   String
  title      String
  targetNote String?
  achieved   Boolean  @default(false)
  carriedToNextCycle Boolean @default(false)

  review PerformanceReview @relation(fields: [reviewId], references: [id], onDelete: Cascade)

  @@index([reviewId])
}

/// Rows, not a hardcoded 1–5: one client rates 1–5, the next uses
/// Exceeds/Meets/Below. Same reasoning as `Rank.level` in doc 20.
model RatingScale {
  id             String @id @default(cuid())
  organizationId String
  value          Int
  label          String

  @@unique([organizationId, value])
}
```

`@@unique([cycleId, employeeId])` on `PerformanceReview` is deliberate: one
review per employee per cycle, full stop. A re-open is a status transition
back to `DRAFT` with an audit row, never a second review row racing the first.

## Scope lenses

**The actor with three tables** — n/a: reviews an `Employee`/`Position` from
doc 20, no new actor.
**The principal with no permission key** — n/a: every write here is by a
`User` through `PermissionsGuard`.
**The grant that ends itself** — n/a: a review confers no access.
**Whose rows, and which columns** — a manager sees reviews for posts that
report, directly or transitively, to one of theirs (doc 21's subtree); an
employee sees only their own, and never another employee's `managerNotes`.
**The threshold nobody approves alone** — n/a: commits no money or stock.
**The toxic pair** — `hr.performance.review` with reviewing your own post:
`reviewerUserId` must resolve to an `Employee` whose `Posting` is not the
subject's own and outranks it (doc 20's rank order) — refused at
`PerformanceReviewService.create()`, the same shape as `closeShift()` in
`CLAUDE.md`'s own toxic-pair example.
**Authority and blast radius** — who may open/close a `PerformanceCycle` (HR
admin, org-wide) versus who may submit one review (the assigned reviewer);
the worst value is closing a cycle with reviews still in `DRAFT`, which the
close action refuses rather than silently finalizing.
**Audience is a capability, not an address** — a submitted review notifies
the employee and the reviewer's own manager (escalation lens, doc 24's
`reportsTo` walk), resolved from the post, never a stored email.
**Request or record** — REQUEST. A submission can be refused (goals missing,
rating scale value not in `RatingScale`); an acknowledgement is the
employee's own act and cannot be forced.
**The movement with no address** — n/a: no stock or cash movement.
**Four hours down, the counter stays open** — a branch with no connectivity
queues review drafts locally (same PWA-outbox pattern as POS) and submits on
reconnect; nothing here is time-critical enough to need a paper fallback.
**Click the number** — every `overallRating` and goal on a submitted review
links to the `PerformanceSignal` rows computed for that employee/cycle, each
of which names the exact `TaskTransition`/notification rows it summed —
required, not optional, per this doc's own §2.
**The unwritten posting rule / Every column or none / The period that
already moved** — n/a: posts no `JournalLine`.
**The second legal entity** — `RatingScale` and `PerformanceCycle` are both
scoped per `organizationId`; a second legal entity gets its own scale, never
a shared one silently reinterpreted.
**Dry run before live** — `computeSignals(cycle, employee)` is pure over
already-written `TaskTransition`/notification rows and has a read-only
preview caller the review screen uses before a manager opens the form.
**Three silhouettes** — Solo: no cycles, no reviews, this module simply does
not run — nothing in payroll or tasks depends on it existing. Chain: one
cycle per brand, reviews scoped to branch managers. Organization: HR-admin
runs cycles org-wide, `PerformanceSignal` volume matters (next lens).
**The absent collaborator** — with `tasks` or `notifications` off,
`PerformanceSignal.metricKey`s sourced from them are simply never computed;
a review can still be written and submitted with zero signals, narrative
only — this module imports neither module directly, it reads their tables
through a registry entry the same way doc 23 takes events, never a hard
import.
**The second copy of the write** — `@@unique([cycleId, employeeId, metricKey])`
on `PerformanceSignal` makes a re-run of the nightly compute job idempotent
(upsert, not insert); `@@unique([cycleId, employeeId])` on `PerformanceReview`
stops a double-submit race from creating two reviews.
**The hundred-thousandth row** — signals are the volume driver (employees ×
metrics × cycles); bounded by `[employeeId, metricKey]` and by cycle, and a
closed cycle's signals are read-only and safe to move to cold storage after
a retention window — not designed for real-time query the way attendance is.
**The reversal document** — a `DRAFT` re-open on an already-submitted review
is a new `ReviewStatus` transition with a reason logged in `AuditService`,
never an in-place edit of the submitted text; the prior submitted text is
kept, not overwritten, so "what did the employee actually acknowledge" never
depends on what the row currently says.
**The undo fan-out** — reopening a review does not un-notify the employee
(deliberately irreversible: they already saw it) and does not recompute
signals (automatic, safe, they were never mutated).
**The version stamp** — a review stores the `RatingScale` values in force at
`organizationId` when submitted (denormalized `label` alongside `value`), so
a later change to the scale's labels does not reword last year's review.
**The erasure the ledger cannot obey** — `reviewerUserId` and `managerNotes`
survive an employee's own erasure (the review is evidence of due process for
a termination dispute) under the same statutory-retention basis doc 20 states
for `Employee`; the reviewer's own `User` erasure pseudonymises
`reviewerUserId`, never deletes the review.
**The failure path** — the nightly signal-compute job records a failure per
`(cycle, employee, metricKey)` in the existing cron-failure pattern
(`InventoryCron`'s own error handling is the precedent); a partial failure
blocks only that employee's signal, never the whole cycle's compute run.

## Work orders

**WO-26.1 — schema**: `PerformanceCycle`, `RatingScale`, `PerformanceReview`,
`PerformanceGoal`.
**WO-26.2 — `PerformanceSignal` + nightly compute job**, reading `tasks` and
`notifications` tables through a registry entry (module-independence, per
`CLAUDE.md`), each source module optional.
**WO-26.3 — `PerformanceReviewService`**: create (toxic-pair guard), submit,
acknowledge, reopen; `computeSignals()` pure with a preview caller.
**WO-26.4 — permissions**: `hr.performance.review` (write a review for posts
in your subtree), `hr.performance.view_own` (an employee's own), `hr.performance.admin`
(cycles, rating scale).
**WO-26.5 — UI**: cycle admin screen, reviewer's queue, one review form with
the signal drill-down inline, employee's own read + acknowledge screen. Nav
entry under the existing People/HR group.

## Acceptance

- Closing a cycle with any review still `DRAFT` is refused, named on screen.
- A manager cannot be recorded as the reviewer of their own post.
- Every submitted rating and goal links to the signal rows it was informed
  by; a spec proves the link resolves to real `TaskTransition` rows.
- Re-running the nightly compute job twice produces the same
  `PerformanceSignal` rows, not duplicates.
- With `tasks` and `notifications` both off, a cycle can still be opened,
  reviews written and submitted, and the pack-absence boot test still passes.

## Out of scope

360-degree/peer review (a second `reviewerUserId` type — named, deferred,
not stubbed), compensation-linked review outcomes (a review does not itself
create a `CompensationRate` row — that stays a deliberate, separate act by
whoever holds `payroll.compensation.manage`), calibration sessions across
managers (a cross-cycle comparison screen — worth a work order once one
organization actually runs more than one manager's worth of reviews).
