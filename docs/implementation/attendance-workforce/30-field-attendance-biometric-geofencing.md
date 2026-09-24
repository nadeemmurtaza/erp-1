# 30 — Field attendance: face-match verification and geofenced clock-in

This is an extension of doc 22, not a second attendance system, and it
changes none of doc 22's central ruling: **a punch is never refused.**
Doc 22 already models a biometric device as a key-hash counterparty
(`AttendanceSource.DEVICE`) and already, deliberately, excludes geofencing
because "it turns a record into a refusal." Both statements stay true here.
What doc 22 does not yet cover is two real, distinct capabilities the
business asked for, and this document adds them as **data on the punch and a
reason on the exception queue** — never as a gate — which is the only way to
add either without reopening doc 22's own settled decision.

## 1. CCTV face-match is a verification signal attached to a punch, never the punch itself

A camera does not replace `AttendanceEvent.source` — the underlying punch
still comes from a device, a badge, or self-service, exactly as doc 22
already models. What CCTV adds is `FaceMatchVerification`: a second row,
written by a face-recognition appliance/vendor, that says "the person we saw
at this door at this instant matched employee X with confidence 0.94" (or
did not). This repository **never stores a raw biometric template.** The
appliance does its own matching against templates it holds; this system
only ever receives and records a match result, the same trust boundary
`identity-verification`'s `NidProvider` already draws for a government ID
check — a `FaceMatchProvider` interface, one implementation per vendor,
verified the same way `callback-verification.spec.ts` verifies a payment
webhook's signature before trusting its payload.

A punch with no matching face-match row, or one below the confidence
threshold, is **still written** — it becomes an `AttendanceException` with a
new reason, queued for a human, exactly as doc 22 already does for
`OUTSIDE_ROSTER`. Anti-proxy is caught by the exception queue surfacing the
mismatch, not by refusing the door.

## 2. A geofence violation is a new exception reason, never a refusal

`GeofenceZone` defines a radius around a real location — a branch, a client
site, a delivery territory. A field employee's mobile app submits
`latitude`/`longitude` with every punch. If the coordinates fall outside
every zone the employee's assignment covers, the event is still written —
`AttendanceExceptionReason` gains `OUTSIDE_GEOFENCE`, resolved by
`hr.attendance.reconcile` exactly like every other exception doc 22 defines.
This is the precise sense in which this document does not reopen doc 22's
exclusion: geofencing here is evidence for a human, never a lock on the door.

## 3. Field staff have no fixed branch, so the roster changes shape, not the rule

Doc 22's `Shift.orgUnitId` assumes a fixed unit. A field sales rep or a
delivery technician doesn't have one — they have a `FieldAssignment`: a
named territory or a rotating list of client sites for a date range. The
`orgUnitId` on their `AttendanceEvent` is still required and still copied at
write time (doc 22's "movement with no address" lens, unchanged) — it
resolves to the employee's **home unit** (payroll/reporting purposes), while
`GeofenceZone` carries the actual site-level location check. Two different
questions, two different columns, neither one standing in for the other.

## Schema — append to `hr.prisma`

```prisma
/// Doc 22's AttendanceExceptionReason enum gains two members:
/// FACE_MATCH_MISMATCH, FACE_MATCH_LOW_CONFIDENCE, OUTSIDE_GEOFENCE.
/// (Documented here rather than re-declared; the enum lives in doc 22.)

model FaceMatchProfile {
  id           String  @id @default(cuid())
  employeeId   String  @unique
  /// Opaque reference the vendor appliance uses internally — never a
  /// template, never a photo, stored here.
  providerRef  String
  enrolledAt   DateTime @default(now())
  status       ProfileStatus @default(ACTIVE)

  employee Employee @relation(fields: [employeeId], references: [id])
}

enum ProfileStatus { ACTIVE REVOKED }

/// One row per camera-driven match attempt, linked to the AttendanceEvent
/// it verifies (or failed to). Never the punch itself.
model FaceMatchVerification {
  id           String   @id @default(cuid())
  eventId      String   @unique
  matchedEmployeeId String?  /// NULL when the appliance found no match above its own floor
  confidence   Float
  providerName String   /// which FaceMatchProvider implementation produced this
  occurredAt   DateTime @default(now())

  event AttendanceEvent @relation(fields: [eventId], references: [id])

  @@index([matchedEmployeeId, occurredAt])
}

model GeofenceZone {
  id           String  @id @default(cuid())
  organizationId String
  label        String
  centerLat    Float
  centerLng    Float
  radiusMeters Int
  /// NULL = a standing zone (a branch). Set = a time-boxed zone for a
  /// specific job (a client site for the duration of a service call).
  activeFrom   DateTime?
  activeTo     DateTime?

  assignments FieldAssignmentZone[]
}

model FieldAssignment {
  id         String   @id @default(cuid())
  employeeId String
  startsOn   DateTime
  endsOn     DateTime?
  label      String   /// "North territory", "Client X — on-site install"

  employee Employee @relation(fields: [employeeId], references: [id])
  zones    FieldAssignmentZone[]

  @@index([employeeId, startsOn])
}

model FieldAssignmentZone {
  id           String @id @default(cuid())
  assignmentId String
  zoneId       String

  assignment FieldAssignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  zone       GeofenceZone    @relation(fields: [zoneId], references: [id])

  @@unique([assignmentId, zoneId])
}
```

`AttendanceEvent` (doc 22) gains two nullable columns —
`latitude`/`longitude` — populated only for field punches; a branch punch
through a fixed terminal leaves both NULL, because it has an
`orgUnitId`/terminal already and gains nothing from a coordinate.

## Extension point

```ts
// apps/api/src/modules/hr-attendance/face-match-provider.ts
export interface FaceMatchProvider {
  verifyPunch(input: { imageRef: string; capturedAt: Date }): Promise<{
    matchedEmployeeId: string | null;
    confidence: number;
  }>;
}
```

One implementation per vendor appliance, registered the same way
`payment-provider.ts` registers Easypaisa/JazzCash — `hr-attendance` never
imports a vendor SDK directly, and a deployment with no camera hardware runs
with zero implementations registered and simply never gets a
`FaceMatchVerification` row, which is a correct, silent absence, not an error.

## Scope lenses

**The actor with three tables** — the face-match appliance is a fourth
counterparty type, same shape as doc 22's biometric-device lens: a key-hash
principal identified by `providerName`, never a `User`.
**The principal with no permission key** — the appliance authenticates by a
webhook signature (verified the same way `callback-verification.spec.ts`
verifies a payment callback) and may write only `FaceMatchVerification` rows
referencing an `AttendanceEvent` already written by a real punch; it can
never create an `AttendanceEvent` itself.
**The grant that ends itself** — `FaceMatchProfile.status = REVOKED` when an
employee leaves or opts out (where policy allows); a revoked profile causes
every subsequent verification for that employee to resolve
`matchedEmployeeId: null`, never a stale match.
**Whose rows, and which columns** — `FaceMatchVerification.confidence` and
raw coordinates are visible only to `hr.attendance.reconcile`; a manager
sees the exception ("mismatch flagged"), never the underlying score, unless
they hold that permission.
**The threshold nobody approves alone** — n/a: no money or stock; the
"threshold" here is a confidence floor, a policy setting, not an approval
chain.
**The toxic pair** — `hr.attendance.reconcile` with `hr.attendance.enroll_face`
(who may enrol a face profile): the same person who can silently re-enrol a
different face against an employee's profile and then clear the mismatch
exception it would otherwise raise is refused together.
**Authority and blast radius** — who may create/resize a `GeofenceZone`, at
which organization; the worst value is a zone radius set too large,
silently accepting punches from outside the intended area — the exception
reason still exists as a check on this, but the audit trail on zone changes
(old/new radius) is what actually catches it.
**Audience is a capability, not an address** — n/a beyond doc 22's own
existing reconcile-queue audience (`hr.attendance.reconcile`); no new
notification audience introduced.
**Request or record** — RECORD, unconditionally, unchanged from doc 22. This
document adds evidence to the record; it adds no refusal path. Restated
because it is the one rule this whole document exists to not violate.
**The movement with no address** — every field punch still names an
`orgUnitId` (the employee's home unit); the `GeofenceZone` is a second,
separate location fact, never a substitute for it.
**Four hours down, the counter stays open** — the mobile app buffers
punches with their captured coordinates and photo reference offline and
replays on reconnect, `externalRef` (doc 22) making replay idempotent
exactly as it already does; a face-match appliance itself being unreachable
simply means no `FaceMatchVerification` row is ever written for that punch —
the punch stands, unverified, visible as such on the reconcile screen.
**The unwritten posting rule / Every column or none / The period that
already moved** — n/a: posts no `JournalLine`; doc 25 is unaffected by this
extension exactly as it is unaffected by doc 22 itself.
**The second legal entity** — `GeofenceZone`/`FieldAssignment` scoped per
`organizationId`, same as every other model in this set.
**Dry run before live** — `classifyPunch(event, verification, zones)` is
pure, takes the raw inputs, returns the exception reason (or none), and is
what both the live write path and a policy-preview screen call — one
implementation, not reimplemented for a "what would this flag" tool.
**Three silhouettes** — Solo: no field staff, this extension never
activates, doc 22 alone runs. Chain: field reps per branch territory. Organization:
cross-brand field force, zone volume and enrolment count both matter.
**The absent collaborator** — with no `FaceMatchProvider` implementation
registered, verification rows are simply never created — doc 22's
attendance path is entirely unaffected, proven by the same pack-absence
boot test pattern every other module here uses.
**The second copy of the write** — `FaceMatchVerification.eventId @unique`:
a redelivered appliance webhook for the same punch updates nothing (refused
as a duplicate, not silently overwritten) since a punch is matched once.
**The hundred-thousandth row** — verification volume tracks punch volume
1:1 at sites with cameras; indexed by `[matchedEmployeeId, occurredAt]` for
the reconcile screen's own lookups, and partitioned alongside
`AttendanceEvent` itself since the two grow together.
**The reversal document** — n/a: a verification is evidence, never itself
reversed; a wrongly-flagged exception is cleared through doc 22's existing
reconcile action, which already records who cleared it and why.
**The undo fan-out** — clearing a face-match-mismatch exception does not
retroactively alter payroll for a period already posted (doc 25 owns that
boundary, unchanged); it does mark the punch reconciled (automatic).
**The version stamp** — `GeofenceZone` radius/centre changes do not
retroactively reclassify past punches; each `AttendanceEvent` is classified
once, at write time, against the zones active then.
**The erasure the ledger cannot obey** — `FaceMatchProfile.providerRef` is
deleted (not merely pseudonymised) on an employee's erasure request, since
it is a live pointer into a third-party biometric system and retaining it
serves no audit purpose once revoked; `FaceMatchVerification` history
survives, keyed on the `AttendanceEvent`, under the same statutory
working-time basis doc 22 already states.
**The failure path** — an appliance webhook that fails signature
verification is rejected and logged (same shape as
`NidVerificationProvider`'s own rejected-webhook logging, already proven in
`nid-callback-verification.spec.ts`), never trusted, never silently retried
with a relaxed check.

## Work orders

**WO-30.1 — schema**: `FaceMatchProfile`, `FaceMatchVerification`,
`GeofenceZone`, `FieldAssignment`/`FieldAssignmentZone`; add
`latitude`/`longitude` to `AttendanceEvent` and the three new members to
`AttendanceExceptionReason` (both in doc 22's `hr.prisma`, amending that
file rather than forking a second attendance schema).
**WO-30.2 — `FaceMatchProvider` interface** + webhook signature
verification, following `payment-provider.ts`'s registration pattern.
**WO-30.3 — `classifyPunch()`** pure function wiring face-match confidence
and geofence membership into doc 22's existing exception path — no change
to the unconditional write itself.
**WO-30.4 — mobile field clock-in**: coordinate capture, offline buffering,
`externalRef` idempotency, reusing doc 22's device-enrolment/replay design.
**WO-30.5 — permissions**: `hr.attendance.enroll_face`,
`hr.attendance.geofence.manage`; reuses doc 22's
`hr.attendance.reconcile` for clearing the new exception reasons.
**WO-30.6 — UI**: face enrolment screen, geofence zone admin, field
assignment scheduling, and the three new reasons rendered on doc 22's
existing reconcile screen — not a second screen.

## Acceptance

- A punch with a face-match confidence below the policy floor is still
  written, and appears on the reconcile queue with reason
  `FACE_MATCH_LOW_CONFIDENCE`.
- A punch outside every zone the employee's field assignment covers is
  still written, flagged `OUTSIDE_GEOFENCE`, never refused.
- Revoking a `FaceMatchProfile` stops all future matches for that employee
  without touching any historical `AttendanceEvent`.
- With no `FaceMatchProvider` registered, attendance behaves identically to
  doc 22 alone — proven by running doc 22's own acceptance suite unchanged
  against a deployment with this extension's module absent.
- A forged appliance webhook (bad signature) is rejected and never creates
  a `FaceMatchVerification` row.

## Out of scope

Live video analytics / continuous presence tracking beyond the punch
moment (this module records discrete verification events, not a video
feed), any on-device biometric storage (templates live in the vendor
appliance only, by design, never in this database), automatic disciplinary
action from repeated mismatches (a human decides at the reconcile screen —
automating a consequence from a flagged exception is a policy the business
has not asked for and this document does not assume it).
