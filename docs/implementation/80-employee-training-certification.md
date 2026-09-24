# 80 — Training records: the second genuine gap the HR nav list surfaced

Doc 78's own check found no `Training`, `Certification`, or course-
completion model anywhere in this repository — doc 26 tracks performance
*scores*, doc 28 tracks *documents* (a signed contract, an ID scan), and
neither is "did this employee complete this required training, and when
does their certification lapse." This is a real, narrowly-scoped gap,
deliberately kept small: a record of completions against a catalogue of
requirements, not a learning-management system.

## 1. A training course is a catalogue entry; a completion is a record against it

```prisma
model TrainingCourse {
  id             String  @id @default(cuid())
  organizationId String
  name           String
  category       String   // "safety", "compliance", "onboarding", "skills" —
                           // data, not an enum, since categories vary by client
  validityMonths Int?     // null = does not expire once completed (e.g., a
                           // one-time onboarding module); a number means the
                           // completion needs renewal after that many months
  isMandatory    Boolean @default(false)

  completions TrainingCompletion[]

  @@index([organizationId])
}

/// One row per employee per completion — a re-certification is a NEW row,
/// never an update to the old one, so the history of every attempt/renewal
/// survives (the same append-only discipline BomProductionRun/Lot already
/// establish for a physical event that already happened).
model TrainingCompletion {
  id             String   @id @default(cuid())
  courseId       String
  employeeId     String
  completedOn    DateTime
  expiresOn      DateTime?  // completedOn + course.validityMonths at write
                              // time — SNAPSHOTTED, so a later change to
                              // validityMonths never silently re-dates a
                              // completion that already happened.
  certificateRef String?    // StorageService.putDocument() reference, the
                              // same primitive doc 28's EmployeeDocument and
                              // finance's receipts already use — never a
                              // second file-storage mechanism.
  recordedById   String?

  course   TrainingCourse @relation(fields: [courseId], references: [id])
  employee Employee       @relation(fields: [employeeId], references: [id])

  @@index([employeeId])
  @@index([courseId, expiresOn])
}
```

`expiresOn`'s snapshot discipline is the identical reasoning doc 40's own
deduction snapshots and `BomProductionRun`'s cost snapshots already
establish: a rule change must never rewrite a fact that already happened.

## 2. Expiring certifications register against doc 54's watcher — never a second scheduler

A `TrainingCompletion` nearing `expiresOn` is exactly what doc 54's
`ExpiringRecordSource` registry already exists to generalize over — the
identical mechanism doc 62 (document expiry) and the original doc 27/28
pairing already register against. `TrainingCompletion` becomes a fourth
registered source, never a new nightly job.

## Scope lenses

**The actor with three tables** — `TrainingCompletion.employeeId` reuses
doc 20's `Employee`; no new actor kind.
**The principal with no permission key** — n/a: every recorder is an
authenticated `User` under `hr.training.manage`.
**The grant that ends itself** — n/a: a completion record does not grant
any system access; it records a real-world fact.
**Whose rows, and which columns** — scoped to `organizationId`; visible to
the employee's own manager subtree and the employee themselves (their own
training record), never a cross-branch roster dump.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: recording a completed training commits no money or
stock; no approval quorum applies. The audit row is `AuditService`'s own
create-event log.
**Audience is a capability, not an address** — an expiring mandatory
certification's reminder resolves through doc 54's own registered-source
audience (the employee plus their manager, per doc 54's existing
resolution), never a literal address.
**Request or record** — recording a completion is a REQUEST (can be
refused — a course the employee was never enrolled in, a future-dated
`completedOn`); once recorded, the row is a RECORD, never edited — a
correction is a new completion row, per the append-only discipline above.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a: no money or stock fact.
**Dry run before live** — n/a: no computed rule to preview beyond the
snapshot arithmetic already shown inline.
**Three silhouettes** — Solo: a handful of mandatory courses (food-safety
basics), tracked almost informally. Chain: real compliance tracking across
branches — "which branches have a lapsed food-safety certification" is a
genuine operational question at this scale. Organization: cross-brand
compliance rollup, `organizationId`-scoped exactly as everything else.
**The absent collaborator** — with `hr` off, no training records exist;
with doc 54's watcher off, completions are still recorded, only the expiry
reminder is silent — a correct, honest degrade, not an error.
**The second copy of the write** — a re-certification always creates a
new `TrainingCompletion` row (never an update), so a re-submitted
completion for the same course is intentionally never deduplicated — each
sitting is its own fact; a UI-level "did you mean to log this twice today"
confirmation prevents an accidental double-click, not a schema constraint.
**The hundred-thousandth row** — `TrainingCompletion` indexed by
`employeeId` and `[courseId, expiresOn]` for the two natural queries ("my
training history," "who's expiring soon in this course") — bounded by
headcount × course count × re-certification frequency, never unbounded.
**The reversal document** — n/a beyond the append-only discipline already
stated; a mistaken entry is superseded by a corrective row, never deleted.
**The undo fan-out** — n/a: recording or correcting a training completion
has no side effects on any other module beyond doc 54's own expiry watch.
**The version stamp** — a course's `validityMonths` changing does not
retroactively alter any `TrainingCompletion.expiresOn` already snapshotted
— only completions recorded after the change use the new value.
**The erasure the ledger cannot obey** — `TrainingCompletion.employeeId`
holds a person; on user deletion, follows doc 20's own stated basis
(pseudonymise while retaining the compliance record, since "was this
person trained on X" is itself a legitimate audit fact, the same
reasoning doc 79's asset-custody record and doc 28's document vault
already apply).
**The failure path** — n/a beyond an ordinary write failure; no automated
process depends on this table beyond doc 54's own already-resilient
watcher.

## Work orders

**WO-80.1 — schema**: `TrainingCourse`, `TrainingCompletion`,
forward-only migration.
**WO-80.2 — `TrainingService`**: `recordCompletion()`,
`courseCompletionsFor(employeeId)`, `expiringCompletions()` (feeding doc
54's registry).
**WO-80.3 — doc 54 registration**: register `TrainingCompletion` expiry
against the existing `ExpiringRecordSource` watcher.
**WO-80.4 — permissions**: `hr.training.manage`, `hr.training.view`
(broader — an employee views their own record), seeded to real roles.
**WO-80.5 — UI**: a training catalogue admin screen, a completion-
recording form, an employee's own training history on their profile
(`/admin/hr/training`, per doc 78's nav entry).

## Acceptance

- A mandatory course nearing a completion's `expiresOn` surfaces through
  doc 54's existing watcher, proven by a spec.
- Changing `TrainingCourse.validityMonths` never alters an already-
  recorded `TrainingCompletion.expiresOn`, proven by a spec.
- An employee can view only their own training history unless their
  viewer role holds a broader HR permission.

## Out of scope

A learning-management system (course content delivery, quizzes,
in-app training modules) — this document tracks completion *records*
only; delivering the training itself is a materially larger, distinct
capability not requested here.
