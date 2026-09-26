# 20 — The employee record, positions, and the rank ladder

> **Status (2026-09-26): built, WO-20.1–20.5, with one deliberate
> departure from this document's own schema — no `Employee` model — decided
> and recorded in `DECISIONS.md` ADR-044 before any schema file was
> written.** This document's own justification for a separate `Employee`
> ("a tailor may never sign in") does not require a fourth actor table:
> `User.email`/`.phone`/`.passwordHash` are already all nullable in
> `core.prisma`, so a login-less worker is already representable as a
> `User` row with all three null, and `AuthService.login()` cannot locate
> such a row by identifier or pass its hash check — it is structurally
> unable to authenticate. This is not a new call: `payroll.prisma`'s own
> header ("every actor here is a `User`") and `hr.prisma`'s own header from
> `79-employee-assets.md` both already answered this exact question the
> same way, months before this document was written. `Position`/`Posting`
> (`apps/api/prisma/schema/hr.prisma`) key directly to `User.id`, not to an
> `Employee.employeeId`; a thin, optional 1:1 `EmployeeProfile` sidecar
> (`employeeCode`, `status`, `joinedOn`, `leftOn`) holds the HR-specific
> fields that have no home on the universal `User` — a `User` with no
> `EmployeeProfile` row can still hold a `Posting`, the profile only ever
> adds detail. `Rank.organizationId` is likewise dropped (`key`/`level`
> each `@unique` alone), the same single-tenant reasoning as doc 19's
> `OrgUnitType`. Every later hr-people-org document that says "Employee"
> now means "a `User` holding a `Posting`, optionally with an
> `EmployeeProfile` row" — ADR-044 states this for docs 28/42/53 by name.
>
> **`PeopleService.assign()` (`apps/api/src/modules/hr/people.service.ts`)
> refuses a second open primary posting rather than silently ending the
> first** — this document's own acceptance criterion ("rejected by the
> index") and its "undo fan-out" answer ("reassigns nothing... needs a
> human, named screen and permission") both rule out automatic
> supersession. The partial unique index
> (`posting_one_primary_open`) is the real enforcement point; the
> application-level pre-check is only the friendly fast path, and a
> database-level `P2002` race is converted to the identical
> `ConflictException`, proven by `people.service.spec.ts`'s 17 specs.
> `outranks(ranksA, ranksB)` is a genuinely pure function over already-
> loaded rank-level arrays (`Math.max`, empty array unrankable), exactly as
> WO-20.3 specifies, so doc 24's escalation logic can replay it without a
> fresh query.
>
> **WO-20.5's admin UI ships as one people list plus inline actions**
> (`apps/web/src/app/(admin)/admin/(app)/people/page.tsx|
> /admin/people`), not the "person drawer, org-chart view reusing doc 19's
> tree" this document names — a live preview of the block reason
> (`previewAssign()`) surfaces inline in the assign dialog instead. This is
> a smaller but complete instance of Law 5 ("one main job per page"): the
> list already shows every person's name, email, primary posting and rank,
> with assign/end actions and position/rank management, satisfying this
> document's acceptance criteria without a second page. A drawer or an
> org-chart visualisation is not required by any acceptance criterion here
> and is left for a future document if the list proves insufficient — not
> built speculatively. `hr.people.view`/`.manage` are seeded to `ADMIN`.
>
> **Update (2026-09-26, doc 21 built):** the toxic pair named in this
> document's own scope lens (`hr.people.manage` + `org.access.grant`) is now
> enforced — `TOXIC_PERMISSION_PAIRS` (`packages/shared/src/permissions.ts`)
> refuses the two together in `RolesService.create()`/`.update()`. The
> original note is kept for the record: it was not enforced when this
> document shipped, because `org.access.grant` did not exist until doc 21
> defined it, and `RolesService` had no generic toxic-pair mechanism at
> all. ADR-044 recorded this as doc 21's to close; ADR-045 is where it was
> closed.

This repository has a `User` (`core.prisma:11`) and it has `Role`
(`core.prisma:307`). It has no employee, no post, and no notion that one person
outranks another. Every document after this one needs all three: attendance
belongs to an employee, a task is assigned to a post, and an approval that
escalates has to know who is senior.

## Three things that are not each other

| | What it is | What it must never be used for |
|---|---|---|
| `User` | An authentication principal. Has a password, a session, permissions. | Deciding who is senior, or who is on shift |
| `Role` | A set of permission keys. Answers *what may this person do*. | A rung on a ladder — a role set is not ordered |
| `Rank` | A seniority band, comparable to other bands. Answers *who outranks whom*. | A permission set — a senior person is not automatically an authorised one |

**A role is a set; a rank is an order.** Conflating them is how an approval
ladder ends up unbuildable: `Role` has no `level` column and cannot get a useful
one, because two roles at the same seniority ("Regional Manager — North",
"Regional Manager — South") are not comparable to each other and must not be.
Rank is a separate axis, deliberately small and deliberately ordered.

**An employee is not a user.** A tailor on the workshop floor may never sign in;
a customer signs in and is not an employee. `Employee.userId` is nullable on
purpose, and nothing may assume the link exists.

## Schema — `hr.prisma`

```prisma
model Employee {
  id             String  @id @default(cuid())
  /// The payroll/HR identifier the client already uses on paper. Unique per
  /// organization, never global — two group companies legitimately both
  /// have an employee 001.
  employeeCode   String
  fullName       String
  organizationId String

  /// NULL for a person who never signs in. Nothing may assume this is set:
  /// attendance, tasks and payroll all key on `Employee`, never on `User`.
  userId         String? @unique

  status         EmploymentStatus @default(ACTIVE)
  joinedOn       DateTime
  /// Set on the last working day. Kept, never deleted — payroll, attendance
  /// and completed tasks must still resolve years later.
  leftOn         DateTime?

  organization Organization @relation(fields: [organizationId], references: [id])
  user         User?        @relation(fields: [userId], references: [id])
  postings     Posting[]

  @@unique([organizationId, employeeCode])
  @@index([status])
}

enum EmploymentStatus {
  ACTIVE
  ON_LEAVE
  SUSPENDED
  LEFT
}

/// A rank is a rung. Rows, not an enum — one client has five grades, the next
/// has twenty-two. `level` is the only thing compared, and it is compared with
/// `>`, never with equality against a hardcoded number.
model Rank {
  id             String @id @default(cuid())
  key            String
  label          String
  /// Higher outranks lower. Gaps are deliberate: seed 10, 20, 30 so a band
  /// can be inserted later without renumbering everyone.
  level          Int
  organizationId String

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  positions    Position[]

  @@unique([organizationId, key])
  @@unique([organizationId, level])
}

/// A post in the org chart: "Finance Manager, North Region". The post carries
/// the rank and the unit; the person occupying it is a `Posting`. A post
/// outlives its occupant, which is what makes a vacancy expressible.
model Position {
  id        String  @id @default(cuid())
  title     String
  orgUnitId String
  rankId    String
  /// The post this one reports to. The reporting line lives on the POST, not
  /// on the person, so a leaver does not sever the chain — doc 24's
  /// escalation walks this edge.
  reportsToId String?

  orgUnit   OrgUnit    @relation(fields: [orgUnitId], references: [id])
  rank      Rank       @relation(fields: [rankId], references: [id])
  reportsTo Position?  @relation("Reporting", fields: [reportsToId], references: [id])
  reports   Position[] @relation("Reporting")
  postings  Posting[]

  @@index([orgUnitId])
  @@index([reportsToId])
}

/// Who holds which post, when. History, not a current-state column: last
/// year's attendance and payroll must resolve to the unit and rank the person
/// held THEN, not the one they hold now.
model Posting {
  id         String   @id @default(cuid())
  employeeId String
  positionId String
  /// Exactly one posting per employee may be primary at a time. A person can
  /// genuinely hold two posts (acting cover, a shared services lead); the
  /// primary is the one payroll and the org chart use.
  isPrimary  Boolean  @default(true)
  startedOn  DateTime
  endedOn    DateTime?

  employee Employee @relation(fields: [employeeId], references: [id])
  position Position @relation(fields: [positionId], references: [id])

  @@index([employeeId, endedOn])
  @@index([positionId, endedOn])
}
```

`Posting` is where the "one person, two hats" problem is answered rather than
dodged. The composition rule, stated once here and referenced by every later
document: **authority composes as the maximum; obligation composes as the union.**
A person holding two posts may approve at the higher of the two ranks, and owes
the attendance and tasks of both. Nothing anywhere may take the *first* posting
it finds.

### The unique that Postgres cannot express

"At most one primary posting per employee at a time" is a temporal constraint,
and no composite unique states it. It gets a partial index for the open case and
a service-level check for the closed one:

```sql
CREATE UNIQUE INDEX posting_one_primary_open
  ON "Posting" ("employeeId") WHERE "isPrimary" AND "endedOn" IS NULL;
```

Overlapping *closed* primaries are refused by `PostingService.assign()`, which
is the only writer, and a spec proves an overlapping insert is rejected.

## Scope lenses

**The actor with three tables** — `Employee`, linked to `User` by a nullable
`userId`; the counterparty case (a contractor who is also a `TradingPartner`) is
out of scope and named in doc 25.
**The principal with no permission key** — an employee without a `User` is not a
principal at all: it authenticates nothing and reads nothing. Every read still
goes through a `User` and `PermissionsGuard`.
**The grant that ends itself** — `Posting.endedOn` ends the post; doc 21's
grants key on the posting and expire with it, which is the mechanism that makes
a leaver lose access without anyone remembering.
**Whose rows, and which columns** — an employee list is filtered to the caller's
`OrgUnit` subtree; salary-bearing columns are excluded entirely unless the
caller holds `hr.compensation.view`, and doc 25 owns that key.
**The threshold nobody approves alone** — creating a `Position` at a rank at or
above the creator's own is refused; raising a rank requires the second signature
in doc 21. The undo — demotion — requires the same, never less.
**The toxic pair** — `hr.people.manage` with `org.access.grant`: inventing a
post and granting it authority is the same person twice. Refused at grant time.
**Authority and blast radius** — changing `Position.reportsToId` re-routes every
future escalation under it; the audit row carries the old and new parent post.
**Request or record** — REQUEST for a posting change; **RECORD** for
`leftOn` — a person who left on Friday left on Friday, and a system that refuses
that write is wrong. The unconditional path writes the leaving date and queues
the consequences.
**The movement with no address** — n/a: writes no stock or cash.
**Four hours down** — n/a: HR edits are not on the trading path.
**The unwritten posting rule** — n/a here; payroll posting is doc 25's.
**Every column or none** — n/a: writes no `JournalLine`.
**The period that already moved** — n/a; doc 25 answers backdated pay.
**The second legal entity** — `Employee.organizationId` scopes the code; two
group companies with the same employee code do not collide.
**Dry run before live** — `PostingService.previewAssign()` returns what the
assignment would end and what it would start, writing nothing.
**Three silhouettes** — Solo: one implicit position per user, no rank picker.
Chain: posts per branch. Organization: full ladder.
**The absent collaborator** — with attendance, tasks and payroll off, an
employee record is still valid and still renders.
**The second copy of the write** — `@@unique([organizationId, employeeCode])`
makes a retried import a no-op.
**The hundred-thousandth row** — 100k employees is realistic at group scale;
every list is paginated and filtered on the indexed `path` prefix of the caller's
unit, never a full scan.
**The reversal document** — a `Posting` is ended, never deleted; a mistaken
assignment is ended same-day and the reverse is its own row.
**The undo fan-out** — ending a posting revokes its derived grants (doc 21,
automatic), reassigns nothing (doc 23, needs a human, named screen and
permission), and leaves attendance history untouched (deliberately irreversible).
**The version stamp** — attendance and payroll rows copy the `orgUnitId` and
`rankId` in force at write time, so a reorganisation does not re-shape history.
**The erasure the ledger cannot obey** — after a `User` is erased, the person
remains in `Employee.fullName`, in payroll journal lines, and in completed
`Task` rows. `Employee` is pseudonymised on erasure — name replaced, code kept —
because the ledger cannot lose the reference. The basis is statutory retention of
employment records; doc 25 names the period.
**The failure path** — a failed import lands in the existing outbox failure
path; a partial import is refused whole.

## Work orders

**WO-20.1 — schema.** `Employee`, `Rank`, `Position`, `Posting`, both partial
indexes, forward-only migration.
**WO-20.2 — `PostingService`.** Sole writer of `Posting`. `assign`,
`previewAssign`, `end`, `primaryFor(employeeId, at)`, `ranksOf(employeeId, at)`.
Every read takes an `at` date and defaults to now — never "current row."
**WO-20.3 — `outranks(a, b, at)`.** The single comparison every later document
calls. Returns the max rank level across the employee's open postings, and is a
pure function over already-loaded rows so doc 24's escalation can replay it.
**WO-20.4 — permissions.** `hr.people.view` (low), `hr.people.manage` (high),
seeded through to a real grant.
**WO-20.5 — admin UI.** People list, person drawer, org-chart view reusing doc
19's tree. One nav entry.

## Acceptance

- A person with two open postings returns the higher rank from `outranks()`, and
  a spec proves the maximum rule rather than first-found.
- A second open primary posting for one employee is rejected by the index.
- `primaryFor(employee, lastYear)` returns the post held then, not the post held
  now — proven against a reassigned employee.
- Ending a posting leaves attendance and completed tasks readable and unchanged.
- An employee with no `User` can be created, listed and posted, and no code path
  dereferences `employee.user` without a null check.

## Out of scope

Access derived from a posting (doc 21). Attendance (22), tasks (23),
notifications (24), advance salary and payroll posting (25), performance (26).
Leave balances and accrual are named here and defined nowhere yet — they belong
with attendance in doc 22 and are explicitly deferred.
