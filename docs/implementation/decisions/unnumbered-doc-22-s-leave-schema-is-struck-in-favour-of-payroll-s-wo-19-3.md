# Decision: doc 22's leave schema is struck in favour of payroll's (WO-19.3)

[← Decision log](../DECISIONS.md)


### Context
`22-attendance-shifts-leave.md` was written as a self-contained brief and
sketched its own `LeaveRequest` model with a `typeKey` string field and a
`LeaveStatus` enum (`PENDING`/`APPROVED`/`REJECTED`/`CANCELLED`/`WITHDRAWN`),
deferring "the balance rules" to doc 20. It predates this session's payroll
build (WO-19.1–19.7, `19-payroll.md`), which shipped its own `LeaveType` /
`LeaveKind` (`ANNUAL`/`SICK`/`UNPAID`/`OTHER`) / `LeaveBalance` /
`LeaveRequest` / `LeaveRequestStatus` (`PENDING`/`APPROVED`/`REJECTED`/
`CANCELLED`) models in `payroll.prisma`, live on `main`. Building doc 22 as
written would create a second, incompatible leave system — two tables named
`LeaveRequest` is not possible in one schema, and two different status
vocabularies for the same real-world approval is exactly the "revenue four
ways" trap `CLAUDE.md`'s money lens warns about, applied to leave instead.

### Options Considered
1. Keep doc 22's sketch, rename its model (`AttendanceLeaveRequest`) to avoid
   the collision, and let two leave systems coexist.
2. Strike doc 22's leave schema entirely; WO-22.6 becomes "query the existing
   `payroll` module's `LeaveRequest`/`LeaveBalance`", not a new build.

### Decision
**Option 2.** Doc 22 amended in place: its `LeaveRequest`/`LeaveStatus` block
is replaced with a pointer to `payroll.prisma`'s already-shipped models, and
WO-22.6 is rescoped from "leave, request/approve, and the balance rules" to
"wire `AttendanceException`'s `WHILE_ON_LEAVE` reason against the existing
`LeaveRequest`" — a query, not a schema.

### Reasoning
`payroll`'s leave models are built, tested and posting-integrated; doc 22's
were never implemented. One leave concept is authoritative. `CLAUDE.md`'s own
"No duplicate implementation introduced" and "Preserve existing systems"
rules apply here exactly as they would to two `Order` tables.

### Consequences
- Whoever builds WO-22 (attendance) takes a hard dependency on `payroll`
  being enabled — `LeaveKind`/`LeaveRequest` live there, not in `hr`/
  attendance's own schema. If a deployment runs attendance without payroll,
  `WHILE_ON_LEAVE` degrades to "never fires" rather than failing to boot
  (same absent-collaborator shape doc 22 already specifies for payroll off).
- Doc 20 (`people-positions-ranks.md`)'s deferred "balance rules" reference
  is now stale in the same way; whoever builds doc 20 should point at
  `payroll.prisma` too rather than re-deriving accrual rules.
- No code changes today — both `payroll` and doc 22's build are unaffected;
  this only prevents a future doc-22 implementer from building the second
  model doc 22 used to describe.

### Status
**Accepted.**
