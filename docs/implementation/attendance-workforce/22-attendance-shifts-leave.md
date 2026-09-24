# 22 — Attendance, shifts and leave

Attendance is the first module in this set that is **a record, not a request**.
Somebody walked through a door at 08:58. The system does not get a vote. A
design that can refuse that write — because the shift roster disagrees, because
the branch is offline, because the employee is marked ON_LEAVE — will silently
lose the fact, and the person will not be paid for a day they worked.

This is `RETAIL-ERP.md` R5's rule ("a sale that already happened is never
rejected by sync") applied to people instead of money, and it decides the whole
shape of the module.

## The unconditional path

Every attendance write takes the same path: **record first, reconcile after.**

```
punch arrives ──> AttendanceEvent row written, always, never refused
                      │
                      ├── matches an open shift?      ──> linked, done
                      └── no shift / wrong place /
                          outside roster / on leave   ──> AttendanceException row,
                                                          queued for a human
```

The variance row is the design. A punch that does not fit becomes an
`AttendanceException` with a reason, appears on a named screen, and is cleared by
someone holding `hr.attendance.reconcile`. It is never dropped and never
silently coerced into the nearest shift.

## Schema — append to `hr.prisma`

```prisma
/// Raw, immutable. One row per punch. Never updated, never deleted — a
/// correction is a second row of kind ADJUSTMENT referencing the first.
model AttendanceEvent {
  id         String   @id @default(cuid())
  employeeId String
  kind       AttendanceKind
  /// The instant, in UTC, always. Never a local wall-clock string.
  occurredAt DateTime
  /// The IANA zone of the place it happened, copied at write time. A group
  /// spanning zones cannot compute a working day without it, and the zone of
  /// a branch can change (policy, DST rules) after the fact.
  timezone   String
  /// Where. Copied, not joined: the unit may be re-parented later (doc 19)
  /// and this row must keep the unit it was written against.
  orgUnitId  String

  /// What produced it — a terminal, a biometric device, a manager's screen,
  /// an import. Needed to judge trust when two sources disagree.
  source     AttendanceSource
  /// The device's own id when `source` is DEVICE. The device authenticates by
  /// key hash exactly as `PosTerminal.deviceKeyHash` does (`pos.prisma`); it
  /// is not a `User` and holds no permission key.
  deviceId   String?

  /// Set when this row corrects an earlier one. The earlier row stays.
  correctsId String?
  /// Idempotency key from the device or import, so a replayed punch is a
  /// no-op rather than a second day's pay.
  externalRef String?

  createdAt  DateTime @default(now())

  employee Employee @relation(fields: [employeeId], references: [id])

  @@unique([employeeId, source, externalRef])
  @@index([employeeId, occurredAt])
  @@index([orgUnitId, occurredAt])
}

enum AttendanceKind { IN OUT BREAK_START BREAK_END ADJUSTMENT }
enum AttendanceSource { DEVICE SELF MANAGER IMPORT }

/// A planned shift. Rostering is deliberately thin here: a shift is a window
/// and a unit, and the client's own rota rules live in policy, not in code.
model Shift {
  id         String   @id @default(cuid())
  employeeId String
  orgUnitId  String
  startsAt   DateTime
  endsAt     DateTime
  timezone   String

  employee Employee @relation(fields: [employeeId], references: [id])

  @@index([employeeId, startsAt])
}

/// A punch that did not fit. The queue that makes "never refuse" safe.
model AttendanceException {
  id         String   @id @default(cuid())
  eventId    String
  reason     AttendanceExceptionReason
  resolvedAt DateTime?
  resolvedByUserId String?
  note       String?

  event AttendanceEvent @relation(fields: [eventId], references: [id])

  @@index([resolvedAt])
}

enum AttendanceExceptionReason {
  NO_MATCHING_SHIFT
  OUTSIDE_ROSTER
  WRONG_UNIT
  WHILE_ON_LEAVE
  DUPLICATE_SUSPECTED
  MISSING_COUNTERPART
}

```

**Leave does not get a model here.** `LeaveType`, `LeaveBalance`,
`LeaveRequest` and `LeaveRequestStatus` already exist in `payroll.prisma`
(WO-19.3, shipped) — a policy-row `LeaveType.kind: LeaveKind` (`ANNUAL` ·
`SICK` · `UNPAID` · `OTHER`), not the enum this brief originally sketched.
This doc's own `LeaveStatus`/typeKey draft above predates that build and is
struck rather than kept as a second, conflicting shape (see `DECISIONS.md`).
`AttendanceException`'s `WHILE_ON_LEAVE` reason is produced by querying that
existing `LeaveRequest` (status `APPROVED`, date range covering the punch),
not by a table this module owns.

## The working day is not a date

A punch at 23:50 and its pair at 07:10 are one night shift, not two days. The
working day is computed, in the unit's `timezone`, by a pure function
`workingDayOf(event, policy)` — not by `date_trunc('day', occurredAt)`, which is
wrong for every night shift and every employee who crosses midnight. The policy
names the cut-over hour; the function is pure so payroll (doc 25) can replay a
whole month with nothing written.

## Scope lenses

**The actor with three tables** — a biometric device is the new counterparty: a
key-hash principal, `deviceId`, modelled exactly as `PosTerminal.deviceKeyHash`,
never a `User`.
**The principal with no permission key** — the device authenticates by key hash
and bypasses `PermissionsGuard`; it may write `AttendanceEvent` for employees of
its own unit and read nothing at all. That is the entire bound, stated here
because a write-only device is the one principal people forget to bound.
**The grant that ends itself** — a device key is rotated by
`rotateDeviceKey()`; a lost device is revoked by setting its status, and its
in-flight punches still land because the row is already written.
**Whose rows, and which columns** — attendance is filtered to the caller's
subtree; a manager sees their department, not the region. The `note` on an
exception is visible only with `hr.attendance.reconcile`.
**The threshold nobody approves alone** — an ADJUSTMENT that adds more than
`MAX_SELF_ADJUST_MINUTES` (policy) needs a second approver who outranks the
employee; adjusting your own attendance always does, regardless of amount.
**The toxic pair** — `hr.attendance.reconcile` with `hr.payroll.run`: clearing
your own exception and then paying it. Refused together.
**Authority and blast radius** — who may change the rota policy, at which unit,
and the worst value: a cut-over hour set wrongly reclassifies a whole month of
night shifts. Audit carries old and new policy value.
**Request or record** — **RECORD**, unconditionally, and this document is that
lens's worked example. The unconditional path is above; the variance row is
`AttendanceException`; the queue is the reconcile screen; the clearer holds
`hr.attendance.reconcile`.
**The movement with no address** — every event names `orgUnitId`, copied at
write time; there is no default and no "the branch you're probably at."
**Four hours down, the counter stays open** — the device buffers and replays on
reconnect; `externalRef` makes the replay idempotent. Paper sign-in is ingested
through the IMPORT source on a named screen, and the reconciliation is the
exception queue, which is why duplicate-suspected is one of its reasons.
**The unwritten posting rule** — n/a: attendance posts nothing. Doc 25 posts.
**Every column or none** — n/a: writes no `JournalLine`.
**The period that already moved** — a punch dated inside a closed payroll period
is still written (it is a record) and raises an exception; doc 25 owns whether it
is paid this period or next.
**The second legal entity** — `timezone` per unit already carries the case; a
second country needs rows, not columns.
**Dry run before live** — `workingDayOf()` and `reconcile()` are pure over loaded
rows, with a read-only caller used by the payroll preview.
**Three silhouettes** — Solo: self punch on one screen, no devices, no roster.
Chain: devices per branch, rota per unit. Organization: multi-zone, night shifts,
import from an existing HRIS.
**The absent collaborator** — with payroll off, attendance still records and
reconciles and simply pays nobody.
**The second copy of the write** — `@@unique([employeeId, source, externalRef])`
makes the replayed punch a no-op. A device with no `externalRef` is refused at
onboarding, not at punch time.
**The hundred-thousandth row** — 100k employees punching four times a day is
~150M rows a year; the table is partitioned by month from the first migration,
and every read is bounded by `[employeeId, occurredAt]` or
`[orgUnitId, occurredAt]`. This is the one table in this set that must be
designed for the volume on day one.
**The reversal document** — an ADJUSTMENT row referencing `correctsId`; the
original is never updated and never deleted.
**The undo fan-out** — an adjustment recomputes the working day (automatic),
may reopen a payroll variance (needs a human — doc 25's screen), and leaves the
raw punch permanently (deliberately irreversible).
**The version stamp** — each event stores the `timezone` and `orgUnitId` in force
at write time, and the payroll run stores the policy version it applied.
**The erasure the ledger cannot obey** — attendance rows survive the erasure of a
`User`; they key on `Employee`, which is pseudonymised (doc 20) under statutory
retention of working-time records.
**The failure path** — a device push that fails lands in the outbox with its
payload, is listed on the reconcile screen, and is replayed by the action there;
replay is safe because of `externalRef`.

## Work orders

**WO-22.1 — schema and monthly partitioning** of `AttendanceEvent`.
**WO-22.2 — the unconditional write path** plus exception classification.
**WO-22.3 — `workingDayOf()`**, pure, with night-shift and DST specs.
**WO-22.4 — device enrolment**, key hash, rotation, `externalRef` required.
**WO-22.5 — reconcile screen** and `hr.attendance.reconcile`.
**WO-22.6 — wire `WHILE_ON_LEAVE`** against the existing `payroll` module's
`LeaveRequest`/`LeaveBalance` (WO-19.3, already built) — no new leave schema,
request flow or balance rule; this WO is the query and the exception
classification only.

## Acceptance

- A punch is never refused: with no shift, wrong unit, on leave, and while the
  parent is unreachable, the row exists afterwards in all four cases.
- A replayed punch with the same `externalRef` creates no second row.
- A 23:50→07:10 pair resolves to one working day, and a DST transition night does
  not gain or lose an hour of paid time.
- An adjustment never mutates the original row.
- Reconcile is reachable from a nav entry and gated by a real granted permission.

## Out of scope

Pay (25), performance (26), rota optimisation and shift bidding — named, not
built. Geofencing is deliberately excluded: it turns a record into a refusal.
