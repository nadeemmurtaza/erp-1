# ADR-046 — Doc 22 (attendance, shifts and leave): `AttendanceEvent` partitioned by month exactly as specified; `AttendanceDevice` added as the missing WO-22.4 model; `employeeId` corrected to `userId`; `hr.attendance.reconcile` seeded to no role by default; the classification and adjustment rules concretised where the doc names a mechanism it does not fully specify

[← Decision log](../DECISIONS.md)


### Context

Doc 22 (`attendance-workforce/22-attendance-shifts-leave.md`) is this
document set's first genuine RECORD, not REQUEST: a punch must never be
refused, and the doc's own words are explicit that this is "the one table
in this set that must be designed for the volume on day one." Building it
required more decisions than any prior document in this set, because the
doc names several mechanisms (a device principal, a partitioned table, a
classification engine, an adjustment threshold) without fully specifying
their schema or algorithm. Each decision below was checked against this
repository's actual code before being written down.

### Decision 1 — `employeeId` is `userId -> User`, exactly ADR-044's precedent

The doc's own schema uses `employeeId Employee`. This document predates
ADR-044 (docs 19/20), which already settled this question for the entire
hr-people-org set: no separate `Employee` model, every actor is a `User`.
`AttendanceEvent.userId`, `Shift.userId` and `AttendanceException.userId`
all key straight to `User`, matching `Posting`, `EmployeeProfile` and
`AssetAssignment` before them. Not re-litigated here.

### Decision 2 — `AttendanceDevice` is a new model this document adds

The doc's own text says a device "authenticates by key hash exactly as
`PosTerminal.deviceKeyHash` does" — but its own schema block never declares
the table. WO-22.4 ("device enrolment, key hash, rotation, externalRef
required") is exactly that missing model. `AttendanceDevice`
(`attendance.prisma`) mirrors `PosTerminal` field-for-field:
`code`/`label`/`orgUnitId`, a nullable `deviceKeyHash` issued once via
`rotateDeviceKey()`, a `PENDING`/`ACTIVE`/`SUSPENDED` status, `lastSeenAt`.
`AttendanceDeviceService` mirrors `PosTerminalsService` method-for-method.

### Decision 3 — a new module and schema file, not appended to `hr`/`hr.prisma`

The doc's own text says "append to hr.prisma." This document's own folder
(`attendance-workforce/`) is a different category from `hr-people-org/`
(docs 19/20) — a genuinely distinct capability, not an extension of
assets/positions/postings. A new `attendance` module (core-packed, on by
default, matching `hr`/`orgstructure`) with its own `attendance.prisma`
follows the one-schema-file-per-module convention `org-structure.prisma`
already set for `orgstructure`, rather than growing `hr.prisma` with a
15,000-row-a-day table that has nothing to do with assets or ranks.

### Decision 4 — partitioning: composite primary key, a widened but still-correct unique constraint, a DEFAULT partition as the actual safety net, and a real composite foreign key where the doc implies one

Postgres requires every unique constraint and the primary key on a
partitioned table to include the partition key column. `AttendanceEvent`'s
primary key is therefore the composite `(id, occurredAt)`, and its
idempotency constraint — `@@unique([userId, source, externalRef, occurredAt])`
— includes `occurredAt` too. This is not a weaker guarantee in practice: a
genuine replay of the same punch (the case this constraint exists for)
carries the identical `occurredAt` the device sent the first time, so the
extra column changes nothing about what "the same punch" means.

The migration creates monthly partitions three months back through nine
months ahead (twelve total) plus an `AttendanceEvent_default` partition.
The default is not decorative: it is what keeps "a punch is never refused"
literally true even if `AttendancePartitionCron` (which extends real
coverage six months ahead, monthly) ever stops running — Postgres routes
any `occurredAt` outside every named range into it rather than raising "no
partition found for row," which would be exactly the refusal this whole
document exists to prevent.

`AttendanceException.eventId` gets a real, DB-enforced two-column foreign
key against `AttendanceEvent`'s own composite primary key
`(id, occurredAt)` — supported since Postgres 12 — rather than the bare
scalar a first reading of "no plain FK to a partitioned table's `id`" might
suggest; `eventOccurredAt` is denormalised alongside it for exactly this.
`AttendanceEvent.correctsId` (self-referencing the same partitioned table,
used only by the rarer adjustment path) stays a bare scalar with no
relation — the one place this schema does use the documented
`PosTerminal.locationId` pattern ("a bare scalar... checks it exists itself
rather than leaning on a DB-level FK"), since a second denormalised
timestamp column for that path was not worth the schema weight the core
reconciliation path already justifies. Verified end to end with a real
insert/read/delete against the partitioned table before writing any
service code against it.

### Decision 5 — `workingDayOf()`/`workedMinutesBetween()` reuse `core/time/shop-time.ts`, not a new DST implementation

The doc's own "working day is not a date" section describes exactly the
problem `core/time/shop-time.ts` already solves for the shop's own
calendar day ("never label a day with `toISOString()`", DST-safe day
stepping via `shopLocalHour`/`startOfShopDay`/`startOfShopDaysAgo`).
`workingDayOf()` is that same computation with a configurable cut-over hour
instead of midnight, built by composing those existing functions rather
than re-deriving timezone/DST handling — CLAUDE.md's own "can the existing
system already solve this?" question, answered yes. `workedMinutesBetween()`
is a plain UTC-instant subtraction, correct by construction because
`AttendanceEvent.occurredAt` is always a true UTC instant (the schema's own
rule) — proven against both a spring-forward and a fall-back transition in
`attendance-time.spec.ts`.

### Decision 6 — the toxic pair is `hr.attendance.reconcile` + `payroll.manage`, not `hr.attendance.reconcile` + `hr.payroll.run`

The doc names the pair as "`hr.attendance.reconcile` with `hr.payroll.run`."
Checked directly: no `hr.payroll.run` permission key exists anywhere in
this codebase; running a pay run is gated by `payroll.manage`
(`pay-run.controller.ts`). `TOXIC_PERMISSION_PAIRS` therefore pairs
`hr.attendance.reconcile` with `payroll.manage`, the key that actually
gates the write the doc's own reasoning ("clearing your own exception and
then paying it") is protecting against.

### Decision 7 — `hr.attendance.reconcile` is seeded to no role by default, not ADMIN — the identical shape ADR-045 already established for `org.access.grant`

ADMIN already holds `payroll.manage` (seeded since payroll shipped).
Seeding `hr.attendance.reconcile` onto the same role would put the toxic
pair Decision 6 just defined onto the one role every deployment starts
with, on a path (`seedRoles()`/`seedPermissions()`) the `RolesService`
check cannot reach. `hr.attendance.view` and `hr.attendance.record` (safe,
no toxic pairing) are seeded to ADMIN; `hr.attendance.reconcile` is not — a
deployment that needs to reconcile attendance creates a dedicated role
holding it without `payroll.manage`, exactly the "Access Reviewer" pattern
ADR-045 already established, applied here to a second pair.

### Decision 8 — the classification algorithm: a concretisation, not a literal reading

The doc names six exception reasons but not the algorithm that produces
them. `AttendanceService.classify()` checks, in priority order: an approved
`LeaveRequest` covering the punch (`WHILE_ON_LEAVE`) before anything else;
a same-kind punch within `AttendanceDuplicateWindowMinutes` (new Setting,
default 2) of the previous one (`DUPLICATE_SUSPECTED`); then the nearest
`Shift` within 24 hours by distance to its own window — none at all is
`NO_MATCHING_SHIFT`, a different `orgUnitId` is `WRONG_UNIT`, outside
`AttendanceShiftGraceMinutes` (new Setting, default 15) of that shift's own
start/end is `OUTSIDE_ROSTER`; finally, for an `OUT` or `BREAK_END`, no
immediately preceding `IN`/`BREAK_START` is `MISSING_COUNTERPART`. Each
reason gets its own spec in `attendance.service.spec.ts`, isolating exactly
the condition that produces it.

### Decision 9 — the adjustment threshold, the second-approver check, and one authorisation gap closed before it shipped

`SettingKey.AttendanceMaxSelfAdjustMinutes` (default 30) is the "policy"
value the doc names but does not default; `AttendanceService.adjust()`
needs an approver who outranks the employee (rank levels from open
`Posting` rows, the identical duplicated-rather-than-imported pattern
`GrantService`, doc 21, already establishes and justifies) whenever the
actor is adjusting their own record, or the change exceeds that threshold.
While building this, a real authorisation gap surfaced that the doc's own
text does not name: nothing stopped an arbitrary signed-in user from
submitting an adjustment against *someone else's* event, so long as they
also supplied a valid approver. `checkAdjustRefusals()` now refuses
(`NOT_AUTHORIZED`) any adjustment where the actor is neither the event's
own user nor a holder of `hr.attendance.record` — closed before this ADR
was written, not left as a known issue.

### Decision 10 — what shipped in the UI, and what did not

WO-22.5's reconcile screen (`/admin/attendance`) is built exactly as named:
every open exception, gated by `hr.attendance.reconcile` to resolve, listed
for `hr.attendance.view` to see. A second screen, `/admin/my-attendance`,
ships alongside it — the doc's own "Solo: self punch on one screen, no
devices, no roster" silhouette describes UI, and without it nothing in
this deployment could ever create an `AttendanceEvent` through the product
at all for a shop with no devices; it carries no `permissions` field
(nav-registry.ts's own documented "omit for everyone signed in"), matching
the fact that `POST /admin/attendance/punch` itself needs no capability
beyond `@AuthenticatedOnly()`.

`AttendanceDeviceController` (enrolment CRUD) ships API-only, no web page —
the same precedent `PosTerminalsController` already sets in this exact
codebase (a full CRUD controller with zero web pages consuming it today).
Shift creation/listing ships as a plain API (`POST`/`GET
/admin/attendance/shifts`) with no dedicated roster-management screen — the
doc's own text calls rostering "deliberately thin" and separately lists
"rota optimisation and shift bidding" as out of scope; a full roster
builder is not required to satisfy any acceptance criterion here.

### Consequences

- Every later `attendance-workforce` document that reads or writes
  `AttendanceEvent` must go through `AttendanceService.record()` — the only
  writer — and must never assume `id` alone is a valid `findUnique` key;
  it is always `id_occurredAt`.
- `AttendancePartitionCron` must keep running for `AttendanceEvent` to stay
  performant at scale; its failure degrades gracefully (rows land in the
  default partition, never refused) rather than breaking anything, but a
  large default partition eventually needs a manual detach-and-resplit —
  named here so it is not discovered cold in an incident.
- `hr.attendance.reconcile`'s no-default-seed follows the exact shape
  ADR-045 established; any THIRD toxic pair this document set discovers
  should look here and at ADR-045 before assuming ADMIN can safely hold it.
- The classification algorithm (Decision 8) is this document's own
  reasonable reading of an under-specified brief, not a literal
  transcription — a future document refining rostering rules should read
  this ADR, not just the original doc, before changing `classify()`.

### Status
**Accepted.**
