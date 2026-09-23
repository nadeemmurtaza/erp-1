# 27 — Corporate training, course scheduling and skill tracking

A training record that is not tied to a post's requirements is a certificate
filing cabinet: nobody can answer "who on the floor is licensed to run the
autoclave" without opening every employee's file by hand. The design question
this module answers is not "how do we schedule a class" — that part is easy —
it is **how does a skill, once certified, become something the rest of the
system can query without re-deriving it from a pile of PDFs.**

## 1. A skill is a row a `Position` can require, not a line in a résumé

`SkillDefinition` is an organization-wide catalogue ("Forklift — Class 3",
"Food Handler Certificate", "Cash Handling"). `PositionSkillRequirement`
says a `Position` (doc 20) needs one, optionally with an expiry window. This
is what makes "who is qualified to be rostered into this post" a query
instead of a conversation — doc 22's attendance/shift roster reads this table
when it validates a shift assignment, without importing this module (an
extension-point read, same pattern as doc 26's signal compute).

## 2. A course produces a certification event, not a status flag

`TrainingEnrollment.status` moves ENROLLED → COMPLETED/FAILED/WITHDRAWN, and a
COMPLETED enrollment against a course that maps to a `SkillDefinition` writes
one `EmployeeSkill` row with an `expiresOn` if the skill requires renewal.
The alternative — a single `certified: boolean` column on the employee — loses
which course certified them, when, and whether it has lapsed; this module
exists so an auditor asking "show me this person's forklift certificate and
the date it expires" gets an answer with a paper trail behind it.

## Schema — append to `hr.prisma`

```prisma
model SkillDefinition {
  id             String  @id @default(cuid())
  organizationId String
  key            String
  label          String
  /// NULL = never expires (e.g. "completed onboarding"). Set = a real
  /// licence/certificate window (e.g. food handler, 24 months).
  validityMonths Int?

  requirements PositionSkillRequirement[]
  employeeSkills EmployeeSkill[]

  @@unique([organizationId, key])
}

model PositionSkillRequirement {
  id         String @id @default(cuid())
  positionId String
  skillId    String
  isRequired Boolean @default(true) /// false = preferred, shows as a gap not a block

  position Position        @relation(fields: [positionId], references: [id])
  skill    SkillDefinition @relation(fields: [skillId], references: [id])

  @@unique([positionId, skillId])
}

model EmployeeSkill {
  id          String    @id @default(cuid())
  employeeId  String
  skillId     String
  earnedOn    DateTime
  /// Copied from SkillDefinition.validityMonths at earn time — a later
  /// policy change (18 months instead of 24) must not silently re-expire
  /// certificates already issued.
  expiresOn   DateTime?
  sourceEnrollmentId String? @unique /// NULL for a manually-recorded prior certificate (e.g. imported history)

  employee Employee         @relation(fields: [employeeId], references: [id])
  skill    SkillDefinition  @relation(fields: [skillId], references: [id])
  sourceEnrollment TrainingEnrollment? @relation(fields: [sourceEnrollmentId], references: [id])

  @@unique([employeeId, skillId, earnedOn])
  @@index([employeeId, expiresOn])
}

model TrainingCourse {
  id             String  @id @default(cuid())
  organizationId String
  title          String
  grantsSkillId  String?
  isActive       Boolean @default(true)

  grantsSkill SkillDefinition? @relation(fields: [grantsSkillId], references: [id])
  sessions    TrainingSession[]
}

model TrainingSession {
  id          String   @id @default(cuid())
  courseId    String
  startsAt    DateTime
  endsAt      DateTime
  capacity    Int?
  instructorNote String?

  course      TrainingCourse @relation(fields: [courseId], references: [id])
  enrollments TrainingEnrollment[]

  @@index([courseId, startsAt])
}

model TrainingEnrollment {
  id         String @id @default(cuid())
  sessionId  String
  employeeId String
  status     EnrollmentStatus @default(ENROLLED)
  completedAt DateTime?
  score      Float?

  session  TrainingSession @relation(fields: [sessionId], references: [id])
  employee Employee        @relation(fields: [employeeId], references: [id])
  grantedSkill EmployeeSkill?

  @@unique([sessionId, employeeId])
  @@index([employeeId, status])
}

enum EnrollmentStatus { ENROLLED COMPLETED FAILED WITHDRAWN }
```

`@@unique([sessionId, employeeId])` stops the double-booking that makes
capacity planning meaningless. `sourceEnrollmentId` is nullable and unique
because organizations onboarding onto this module have real, already-earned
certificates with no session behind them — the model does not force a fake
enrollment row just to record history.

## Scope lenses

**The actor with three tables** — n/a: employees and posts from doc 20, no
new actor.
**The principal with no permission key** — n/a.
**The grant that ends itself** — n/a: a certificate does not grant system
access; it only satisfies a `PositionSkillRequirement` check elsewhere.
**Whose rows, and which columns** — a manager sees training records for their
subtree; `TrainingEnrollment.score` is visible only to `hr.training.admin`
and the employee themselves, never to a peer manager comparing scores.
**The threshold nobody approves alone** — n/a: no money or stock committed.
Session capacity is a soft cap enforced at enrollment, not an approval chain.
**The toxic pair** — n/a: no self-certifying path exists — completion is
recorded by `hr.training.record` (an instructor/admin action), never by the
employee marking their own enrollment complete.
**Authority and blast radius** — who may define a `SkillDefinition` or attach
one to a `Position` (HR admin, org-wide — this changes who is considered
qualified for a post everywhere it's used); the worst value is requiring a
skill nobody in the organization holds, which the admin screen flags as a
warning, not a block (doc 22's roster read treats an unmet requirement as a
scheduling warning, never a refusal — see the next lens).
**Audience is a capability, not an address** — an `EmployeeSkill` approaching
`expiresOn` notifies the employee and their manager (`reportsTo`, doc 20)
through doc 24's channel, resolved by permission/relationship, never a stored
address.
**Request or record** — enrollment is a REQUEST (capacity, refused past
`endsAt`); a completion write is a RECORD once made — a completed course does
not un-happen because a certificate later lapses; `expiresOn` passing is a
state change on `EmployeeSkill`, not a deletion of the fact it was earned.
**The movement with no address** — n/a.
**Four hours down, the counter stays open** — training is not time-critical
in the way attendance or a sale is; a session's enrollment reopens once
connectivity returns rather than needing a paper fallback.
**Click the number** — a "qualified staff" count on any dashboard (doc 22's
roster warning included) links to the exact `EmployeeSkill` rows behind it,
never a bare number.
**The unwritten posting rule / Every column or none / The period that
already moved** — n/a: posts no `JournalLine`.
**The second legal entity** — `SkillDefinition` and `TrainingCourse` are
scoped per `organizationId`; a licence that is legally specific to one
jurisdiction (a provincial food-handler card) is still just a row here, not
a schema branch.
**Dry run before live** — `qualifiedFor(position)` is a pure query over
`PositionSkillRequirement` + `EmployeeSkill`, and is exactly what doc 22's
roster screen calls to render its warning — one implementation, two callers.
**Three silhouettes** — Solo: no course catalogue, this module simply does
not run. Chain: courses run per branch, a regional instructor teaches several
branches' staff in one session. Organization: skills gate rostering into
posts org-wide, expiry volume matters at scale.
**The absent collaborator** — with `payroll`/`hr` attendance off, this module
still runs standalone (a certificate log with no roster to gate); doc 22 reads
`qualifiedFor()` only if this module is present — an optional read, never a
hard dependency in either direction.
**The second copy of the write** — `@@unique([sessionId, employeeId])` on
enrollment; `@@unique([employeeId, skillId, earnedOn])` on `EmployeeSkill`
so a redelivered completion event does not mint a second certificate for the
same course completion.
**The hundred-thousandth row** — enrollment volume scales with headcount ×
required-renewal cadence; bounded by `[employeeId, status]` and
`[employeeId, expiresOn]`; a nightly job flags expiring certificates rather
than every read scanning the whole table.
**The reversal document** — a wrongly-recorded completion is corrected by a
new `FAILED`/`WITHDRAWN` transition plus, if a skill was already granted, an
explicit revoke that sets `EmployeeSkill.expiresOn` to now with a reason —
never a silent delete of the enrollment row.
**The undo fan-out** — revoking a skill does not retroactively un-qualify
past rosters it satisfied (deliberately irreversible — the person was, in
fact, qualified then) and does surface on the employee's current
qualification screen going forward (automatic).
**The version stamp** — `EmployeeSkill.expiresOn` is computed from
`validityMonths` at earn time and stored, so a later policy change to the
renewal window does not retroactively expire or extend certificates already
issued.
**The erasure the ledger cannot obey** — `EmployeeSkill` and
`TrainingEnrollment.score` survive an employee's erasure under the same
statutory/audit basis as doc 20's `Employee`, keyed on `Employee`, never
requiring `User`.
**The failure path** — an enrollment that fails to reach capacity check (a
concurrent booking race) is refused at write time with the existing
predicate-on-write pattern (House Rule 10), surfaced on the booking screen,
not silently overbooked.

## Work orders

**WO-27.1 — schema**: `SkillDefinition`, `PositionSkillRequirement`,
`TrainingCourse`, `TrainingSession`, `TrainingEnrollment`, `EmployeeSkill`.
**WO-27.2 — `TrainingService`**: enroll (capacity guard), record completion
(writes `EmployeeSkill` when the course grants a skill), withdraw/fail.
**WO-27.3 — `qualifiedFor(position)`** pure query + expiry-warning nightly
job (doc 24 notification on approaching `expiresOn`).
**WO-27.4 — permissions**: `hr.training.enroll`, `hr.training.record`
(instructor/admin completion), `hr.training.admin` (catalogue, requirements).
**WO-27.5 — UI**: course catalogue + session scheduling, enrollment roster
per session, employee's own skills/certificates screen, manager's subtree
skill-gap view. Nav entry under People/HR.

## Acceptance

- Enrolling past a session's capacity is refused, named on screen.
- Completing a course that grants a skill writes exactly one `EmployeeSkill`
  row, proven by a spec that redelivers the completion event twice.
- A later change to `SkillDefinition.validityMonths` does not alter the
  `expiresOn` of certificates already issued.
- `qualifiedFor(position)` returns the same answer whether called from the
  training screen or doc 22's roster warning — one implementation, tested
  once, called twice.
- With `hr`/attendance off, training still records completions and issues
  certificates; the pack-absence boot test passes.

## Out of scope

External LMS/SCORM content hosting (this module schedules and certifies, it
does not host course material — a `contentUrl` field on `TrainingCourse` is
enough for now, a real content player is a different, larger scope), skills
matrices as a compensation input (a skill does not itself change
`CompensationRate` — that stays a deliberate act under `payroll.compensation.manage`,
same boundary doc 26 draws for review outcomes).
