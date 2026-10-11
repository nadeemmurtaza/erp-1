# 247 — Field tracking: consented, working-hours-only GPS — breadcrumbs, live position, route history

> **Status: Planned (2026-10-05). Nothing built.** Architecture:
> [doc 245](./245-field-sales-distribution-architecture.md) §2 (why tracking is
> its own module) and §4 (proposed R31, a device is not a node). Decision
> record: ADR-089. Field sales: [doc 246](./246-field-sales.md). **Open
> decisions it depends on:** OD-F1 (a native app is needed for background
> capture) and OD-F2 (lawfulness, notice or consent, and retention per
> jurisdiction). **Every retention and consent value below is an engineering
> default, not a legal opinion** (doc 245 §9 item 1).

## Objective

While a field worker is on duty, and only then, their phone records where
they are, often enough to:

- draw the route they travelled;
- measure the distance;
- show a supervisor their latest position within a few minutes.

The worker:

- knows tracking is on;
- can see their own tracked days;
- stops being tracked the moment their day ends.

Breadcrumbs are deleted after a retention period, leaving only a per-day
summary.

The module is independent of `fieldsales`, so delivery riders or service
staff can use it later. A deployment that must not track employees removes
it from `MODULES`, and field sales works unchanged.

## Existing state (verified, 2026-10-05)

- **No geolocation exists anywhere in the schema.** A grep for latitude,
  longitude, geofence and geoloc across `apps/api/prisma/schema` and
  `apps/api/src` returns nothing.
- **`apps/mobile`** (Expo, iOS and Android) has no location, background-task
  or local-database dependency. Browsers suspend background location, so an
  installable PWA cannot record a route in the background (doc 245 OD-F1).
- **`AttendanceEvent` is the precedent** for a device-originated,
  high-volume, offline-safe record:
  - client `occurredAt` plus IANA `timezone`;
  - an idempotency key that includes the partition column;
  - monthly `PARTITION BY RANGE` with a DEFAULT partition, maintained by
    `AttendancePartitionCron`.
- **There is no WebSocket or SSE gateway** (ADR-054, deliberately unbuilt),
  so "live" means polling.
- **Refresh tokens have a 30-day TTL** (`JWT_REFRESH_TTL`) and are grouped
  in sign-in families (WO-206.3). Access tokens last 15 minutes.
- **Canonical Ruling 9** makes "a read of a record behind a
  critical-sensitivity key" evidence-class audit, written in the same
  transaction as the read.
- **Location scoping** of list endpoints is WO-236.4 (L2), not built.

## 1. Design

**Policy, consent, session.**

- **Policy.** A `TrackingPolicyVersion` holds the capture parameters (§4) and
  the retention period. It is proposed and activated by two different users.
- **Acknowledgement.** Before a worker's first session, the app shows the
  active notice text (a translation key per policy version). The worker's
  acknowledgement, or consent where the jurisdiction requires consent,
  becomes a `TrackingConsent` row. Which of the two is the lawful basis is
  OD-F2's question; the record holds either.
- **Session.** A `TrackingSession` is opened by the app when the worker
  starts duty. For a rep, that is opening their field day: client
  composition, with no server-side link to `fieldsales`.

  A session closes on any of these:
  - the worker stops it;
  - the field day closes;
  - the 14-hour hard stop;
  - consent is withdrawn;
  - the sign-in is revoked.

**Capture** (app, WO-247.4).

- **When a point is recorded:** after moving ≥ 50 m, else every 300 s while
  stationary, never more often than every 30 s.
- **What a point carries:** time, position (integer microdegrees × 10),
  reported accuracy, speed and heading when available, the source (GPS,
  network, fused), the OS's mock-location flag, and battery.
- **Upload:** batched every 120 s when online, queued in the shared outbox
  (WO-245.2) when not.
- **Background mode.** On Android this needs a foreground service with a
  persistent notification. The notification is also the worker's visible
  signal that tracking is on.

**Ingestion.** `POST /field/tracking/points` takes up to 1,000 points for one
session under the worker's own session token (`fieldtracking.report`). Each
point is:

- **Dropped and counted, not stored,** if its `occurredAt` is outside the
  session's open window plus a 15-minute grace. This is a deliberate
  exception to R31's "never refused": R31 protects business facts, while an
  off-duty location is not a business fact, and holding it is the harm. The
  count (`TrackingSession.droppedOutsideWindow`) is visible.
- **Otherwise inserted** with `@@unique([sessionId, occurredAt])`, so a
  re-upload is a no-op.

`TrackLastPosition` is then upserted, but only if the batch's newest point is
newer than the stored one (a predicate on write), so an old backlog never
moves the live marker backwards.

**Reading.** All reads are polling (no WebSocket, ADR-054):

- **Live map:** last positions for the viewer's location scope, with each
  position's age shown.
- **Day history:** points for one worker on one date, simplified for drawing
  by a pure `simplifyTrack()` (Douglas–Peucker, tolerance in metres) to at
  most 2,000 vertices.
- **"My tracked days":** the worker's own sessions and summaries.

Every read of an individual's history or live position writes an
evidence-class audit row in the same transaction. `fieldtracking.view` is
catalogued at `critical` sensitivity (canonical Ruling 9).

**Summary and retention.**

- **Summary.** At session close, and nightly, a pure `summariseTrack()`
  computes per (worker, business date):
  - distance (excluding points with accuracy worse than 100 m, and jumps
    implying more than 150 km/h);
  - point count and mocked-point count;
  - gaps longer than 15 minutes inside a session;
  - first and last point, and session count.

  It writes `TrackDaySummary`, which is kept after breadcrumbs are purged.

- **Retention.** A daily purge deletes `TrackPoint` rows older than the
  active policy's `retentionDays` and drops monthly partitions that are fully
  expired.

**Maps.** Drawing a route on a map needs map tiles, a third-party service
with its own terms and cost. No vendor is chosen here. A `MAP_TILE_URL`
environment value (config, never a literal) enables the map view. Without
it, day history renders as a timeline list of stops, gaps and distance,
which is complete and simply not drawn. Choosing a provider is a dependency
and vendor decision in WO-247.3.

## 2. Schema — `apps/api/prisma/schema/field-tracking.prisma` (new, hand-written forward-only migration)

Cross-module references are bare scalars (ADR-012). Six tables.

```prisma
enum TrackingConsentKind { NOTICE_ACKNOWLEDGED CONSENT_GIVEN }
enum TrackingSessionEnd  { USER_STOPPED DAY_CLOSED MAX_DURATION CONSENT_WITHDRAWN SIGN_IN_REVOKED }
enum TrackPointSource    { GPS NETWORK FUSED }

model TrackingPolicyVersion {
  id String @id @default(cuid())
  version Int @unique
  captureDistanceM Int; stationaryIntervalS Int; minIntervalS Int; uploadIntervalS Int
  accuracyDiscardM Int; maxSpeedKmh Int; gapAlertMinutes Int
  maxSessionHours Int; graceMinutes Int
  retentionDays Int                     // engineering default 90 — legal verification pending (OD-F2)
  noticeKey String                      // translation key of the notice shown before first session
  status String @default("DRAFT")       // DRAFT | ACTIVE | RETIRED
  proposedByUserId String; activatedByUserId String?; activatedAt DateTime?
}
model TrackingConsent {
  id String @id @default(cuid())
  userId String; policyVersionId String; kind TrackingConsentKind
  givenAt DateTime; withdrawnAt DateTime?
  deviceInstallId String               // the install it was given on — evidence, not auth
  @@index([userId, givenAt])
}
model TrackingSession {
  id String @id @default(cuid())
  clientSessionId String @unique
  userId String; deviceInstallId String
  locationId String                     // the worker's base Location for the day — scope column, NOT NULL
  policyVersionId String; consentId String
  startedAt DateTime; endedAt DateTime?; endReason TrackingSessionEnd?
  droppedOutsideWindow Int @default(0)
  @@index([userId, startedAt])
  @@index([locationId, endedAt])
}
model TrackPoint {                      // partitioned by month on occurredAt, DEFAULT partition (AttendanceEvent precedent)
  id String @default(cuid())
  sessionId String; userId String
  occurredAt DateTime
  latE7 Int; lngE7 Int; accuracyM Int
  speedCmS Int?; headingDeg Int?; source TrackPointSource
  isMocked Boolean @default(false); batteryPct Int?
  @@id([id, occurredAt])
  @@unique([sessionId, occurredAt])     // includes the partition key, as Postgres requires
  @@index([userId, occurredAt])
}
model TrackLastPosition {               // CACHE — one row per worker, safe to delete and rebuild from TrackPoint
  userId String @id
  sessionId String; locationId String
  occurredAt DateTime; latE7 Int; lngE7 Int; accuracyM Int; isMocked Boolean
  updatedAt DateTime @updatedAt
  @@index([locationId])
}
model TrackDaySummary {                 // kept after breadcrumbs are purged
  userId String; businessDate DateTime @db.Date
  timezone String; locationId String
  distanceM Int; pointCount Int; mockedPointCount Int; gapCount Int; sessionCount Int
  firstPointAt DateTime?; lastPointAt DateTime?
  policyVersionId String                // the version stamp
  computedAt DateTime @default(now())
  @@id([userId, businessDate])
  @@index([locationId, businessDate])
}
```

**Replication.** All six tables are node-local (proposed R29). Location
breadcrumbs never leave the node where they were written. A brand or org
dashboard that needs distance reads it from `fieldsales`' `FieldDaySummary`,
which copies `distanceM` and replicates up (doc 246 §2).

## 3. Permissions

| Key                    | Sensitivity  | Who                             | What it gates                                                                                       |
| ---------------------- | ------------ | ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `fieldtracking.report` | low          | every field worker role         | Open and close own sessions, upload own points, read own sessions and summaries ("My tracked days") |
| `fieldtracking.view`   | **critical** | supervisors, scoped by location | Live map and others' day history. Every individual read is evidence-class audited.                  |
| `fieldtracking.manage` | high         | operations or privacy lead      | Propose and activate policy versions; view consent records                                          |

All three are seeded through `ROLE_PERMISSION_SEED` in WO-247.1, not only as
`Permission` rows.

## 4. Parameters (exact)

These are the active `TrackingPolicyVersion`'s values at first seed. Changing
one needs a new version and two people.

| Parameter                        | Value                                          | Why this number (not smaller or larger)                                                                                                                                                                                                | Enforced in                       | How it degrades                                                  |
| -------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| Capture distance                 | **50 m**                                       | Outdoor GPS jitter is typically 5–20 m, so a smaller threshold records noise as movement. In a dense market 50 m is roughly the next block, enough to tell which street a rep walked. A larger value cuts corners off the drawn route. | app                               | n/a                                                              |
| Stationary heartbeat             | **300 s**                                      | Proves the phone is alive and on duty while a rep stands in a shop, without waking the GPS radio more than 12 times an hour                                                                                                            | app                               | Gap shown if heartbeats stop                                     |
| Minimum interval                 | **30 s**                                       | Caps the rate on a fast vehicle (50 m at 60 km/h is 3 s), which would otherwise produce 1,200 points an hour                                                                                                                           | app                               | n/a                                                              |
| Upload interval                  | **120 s**                                      | Radio wake-ups dominate battery. Two minutes bounds live-map staleness to about 2.5 minutes (120 s upload + 30 s poll). Shorter costs battery for a map no one watches second by second.                                               | app                               | Points queue offline and upload later; live marker shows its age |
| Points per upload                | **1,000**                                      | ~70 bytes per point in JSON is ~70 KiB, inside the platform's 100 KiB body limit. Clears a 4-hour offline backlog (~200 points) in one request.                                                                                        | DTO                               | `413`; the app halves the batch                                  |
| Upload rate limit                | **30 requests / 60 s per user**                | Normal use is one request every 2 minutes. 30 × 1,000 lets a long backlog flush within a minute, while a stolen token cannot flood                                                                                                     | `@Throttle` (`core/throttling`)   | `429` + `Retry-After`                                            |
| Live map refresh                 | **poll every 30 s**, with `ETag`               | No push channel exists (ADR-054). 30 s is well inside the 120 s upload interval, so faster polling shows nothing new.                                                                                                                  | web client                        | Stale positions show their age                                   |
| Session hard stop                | **14 h**                                       | The longest plausible field day including travel. It stops a forgotten session tracking someone overnight.                                                                                                                             | server cron (every 5 min) and app | Session ends `MAX_DURATION`                                      |
| Out-of-window grace              | **15 min**                                     | Covers clock skew and the last points captured just before a session was closed from another screen                                                                                                                                    | ingestion                         | Points dropped and counted                                       |
| Accuracy discard (distance only) | **100 m**                                      | A fix worse than 100 m (typical of network fixes indoors) adds false distance. Such points are stored and drawn, but not summed.                                                                                                       | `summariseTrack()`                | n/a                                                              |
| Speed filter (distance only)     | **150 km/h**                                   | No market or delivery work moves faster on local roads, so a jump implying more is a GPS glitch                                                                                                                                        | `summariseTrack()`                | Segment excluded from distance                                   |
| Gap threshold                    | **15 min**                                     | Three missed heartbeats. Shorter flags ordinary tunnels and basements.                                                                                                                                                                 | `summariseTrack()`                | Gap listed on the day view                                       |
| Draw simplification              | **≤ 2,000 vertices**, tolerance **10 m**       | A day of ~850 points draws without simplification. A long day of several thousand stays responsive on a phone-sized screen (Law 4).                                                                                                    | `simplifyTrack()`                 | n/a                                                              |
| Breadcrumb retention             | **90 days**, then deleted (summary kept)       | One quarter covers disputes about a visit or a claimed route. Beyond that, raw location history has no operational use. **Engineering default only; the lawful period is OD-F2's.**                                                    | daily purge cron                  | n/a                                                              |
| `TrackPoint` partitioning        | **monthly** on `occurredAt`, DEFAULT partition | ~850 points per rep per day (≈ 800 distance points over ~40 km plus ~50 heartbeats). 1,000 reps over 26 working days ≈ 22 M rows a month, the scale at which ADR-046 partitioned `AttendanceEvent`.                                    | migration and partition cron      | DEFAULT partition catches anything the cron missed               |

## 5. Work orders

Each ships backend, the minimum screen (with a `/ux-design` brief first), a
nav entry, permission grants and tests.

- **WO-247.1 — Policy, consent, sessions.**
  - Schema, registry line (`offByDefault`), `MODULE_PACKS` (`core`), and the
    seed policy version.
  - `/admin/field-tracking/policy` (propose and activate by two users).
  - `/admin/field-tracking/consents` (read-only, `fieldtracking.manage`).
  - Session open and close endpoints, and the 14-hour cron.
  - Sign-in revocation closes sessions. `AuthService.revokeSignInFamily()`
    (WO-245.4) publishes `SignInFamilyRevoked`, which this module
    subscribes to.
  - Permissions (§3).
- **WO-247.2 — Ingestion and retention.**
  - Partitioned `TrackPoint` with its partition cron.
  - The batch endpoint, window check, dedupe and `TrackLastPosition`
    predicate upsert.
  - Purge cron.
  - Load test at 1,000 simulated workers uploading every 120 s: p95 insert
    time per 1,000-point batch reported in the PR. The bar is ≤ 500 ms,
    above which batches are split server-side.
- **WO-247.3 — Live map, day history, summaries, self view.**
  - `summariseTrack()` and `simplifyTrack()` (pure, `packages/shared`,
    table-tested against fixed tracks).
  - Live map and day history, plus evidence-class read audit.
  - "My tracked days" for the worker.
  - `MAP_TILE_URL`: config, vendor decision and dependency questionnaire in
    the PR. The timeline fallback is built whether or not a provider is
    chosen.
- **WO-247.4 — Background capture in the app** (OD-F1).
  - In `apps/mobile`'s field mode: notice and acknowledgement screen,
    OS permission flow (foreground first, then background), Android
    foreground-service notification, capture rules from the active policy,
    upload through the shared outbox, and stop on day close.
  - Location and background-task dependencies, answered under
    `.claude/rules/dependencies.md`.
  - **Before starting:** verify Google Play's background-location policy and
    Apple's "Always" location review requirements as they stand at build time
    (doc 245 §9 item 2).

## 6. Files likely affected

`field-tracking.prisma` (+ migration); `apps/api/src/modules/people/fieldtracking/*`;
`packages/shared` (`summariseTrack`, `simplifyTrack`, haversine shared with
doc 246); `core/auth` (the `SignInFamilyRevoked` event from WO-245.4);
`domain-events.ts`; `permissions.ts`; `env.validation.ts` (`MAP_TILE_URL`,
optional); `apps/web/src/app/admin/field-tracking/*`; `nav-registry.ts`;
`apps/mobile` (field mode).

## 7. Dependencies reused

`AttendanceEvent`'s partitioning, idempotency and timezone pattern and its
partition cron; the shared outbox (WO-245.2); `RefreshToken` families;
`core/throttling`; `AuditService` (evidence-class); WO-236.4 location
scoping; `PermissionsResolverService.usersWithPermission()`.

## 8. Risks

- **Over-collection.** The worst failure is tracking someone off duty.
  Controls:
  - sessions are bounded (14 h);
  - day close stops capture;
  - out-of-window points are dropped server-side even if a device sends
    them;
  - the worker sees their own record.
- **Mock-location apps.** The OS flag is stored and counted per day. It is
  evidence for a supervisor, not an automatic sanction.
- **Battery complaints leading reps to disable location.** The capture rules
  above are battery-led, and gaps are surfaced as gaps, not hidden.
- **Platform policy rejection** of background location. Verified before
  WO-247.4, and the module still works foreground-only.

## 9. Acceptance criteria

1. With `fieldtracking` off, `fieldsales` and every existing spec work
   unchanged, and no tracking route or nav entry exists.
2. A session cannot open without a `TrackingConsent` for the active policy
   version.
3. A point whose `occurredAt` is 16 minutes after its session ended is not
   stored, and `droppedOutsideWindow` increments.
4. Re-uploading the same batch stores nothing new. An old backlog uploaded
   after newer points never moves `TrackLastPosition` backwards.
5. A session left open is ended at 14 hours with `MAX_DURATION`.
6. Points older than `retentionDays` are gone after the purge, and the day's
   `TrackDaySummary` remains.
7. Reading another worker's day history writes an evidence-class audit row
   in the same transaction. If the audit write fails, the read fails.
8. `summariseTrack()` excludes a 400 km/h jump and a 300 m-accuracy point
   from distance (table test).
9. Revoking a sign-in family ends that device's open session.
10. `pnpm lint && pnpm typecheck && pnpm test` pass, and the migration
    applies forward on a copy of production data.

## 10. Out of scope

- Geofence alerts ("tell me when a rep leaves their territory"), a named
  later read-model over `TrackPoint`.
- Route optimisation and ETA to the next stop.
- Telematics from vehicle trackers. A vehicle GPS device is a different
  principal, sequenced if a customer names one.
- Tracking customers or delivery recipients, never in scope.

## Scope lenses

**0. The shop-scale five**

- The transaction, start to finish: notice acknowledged → session opens with
  the day → points captured and uploaded → live position → session closes
  with the day → day summarised → breadcrumbs purged after retention. Each
  step has a screen or a cron (WO-247.1–247.4).
- The other side of the same transaction: the supervisor's live map and day
  history (`fieldtracking.view`). The worker's own twin is "My tracked days"
  (`fieldtracking.report`).
- What happens after "done": consent withdrawal ends the session and stops
  capture. Retention deletes raw points. A disputed visit is answered from
  the day history inside retention, and from the summary after it.
- The integrations a real business needs:
  - native OS background location (OD-F1), not a fake foreground timer;
  - a map tile provider behind `MAP_TILE_URL`, with a complete timeline
    fallback when none is configured.
- The policy layer: `TrackingPolicyVersion` (capture, retention, notice),
  activated by two people.

**1. The actor**

- The actor with three tables: the tracked worker is a `User`. Their phone is
  a `deviceInstallId` string recorded for evidence. The sign-in that
  authenticates it is a `RefreshToken` family. No new person table and no
  device credential table.
- The principal with no permission key: none. Uploads run under the worker's
  own session with `fieldtracking.report`. The app refreshes the 15-minute
  access token with the 30-day refresh token in its background task.
- The grant that ends itself:
  - a session ends at the 14-hour stop, on day close, on consent withdrawal,
    or on `SignInFamilyRevoked`;
  - on deactivation, the existing session revocation closes it through that
    same event, with no human needed.

**2. The authority**

- Whose rows, and which columns:
  - every session and last position names `locationId`, and viewers see only
    workers in their location scope (WO-236.4);
  - a worker sees only their own;
  - battery and speed are shown to the worker and to `fieldtracking.manage`,
    not on the supervisor map.
- The threshold nobody approves alone: activating a policy version, the only
  act here with a blast radius, needs a second user. There is no money and no
  stock.
- The toxic pair: proposing and activating a tracking policy.
  `TrackingPolicyService.activate()` throws when the actor equals
  `proposedByUserId`. That stops one person quietly extending retention or
  removing the working-hours bound.
- Authority and blast radius: the worst single value is `retentionDays`
  raised to years. It needs two people, is evidence-class audited with old and
  new values, and the active policy is shown on every worker's "My tracked
  days" screen, so the people affected can see it.
- Audience is a capability:
  - gap and mocked-point digests go to `fieldtracking.view` holders scoped to
    the session's `locationId`;
  - zero holders → `fieldtracking.manage`;
  - many holders → one daily digest each.

  Nothing pings per point.

**3. The act in the world**

- Request or record: a point captured inside a session is a RECORD, stored
  unconditionally. A point outside its session is deliberately not stored
  (§1, the privacy exception to R31). Opening a session is a REQUEST, refused
  without consent.
- The movement with no address: n/a. Nothing moves stock or cash.
  `TrackingSession.locationId` is required, and comes from the worker's day,
  never from `defaultLocationId()`.
- Four hours down: with the server down, points queue in the outbox and
  upload on recovery; the live map shows each marker's age; the day history
  is complete once the backlog lands. With the phone offline, the same.
  Nothing is double-counted (`@@unique([sessionId, occurredAt])`).

**4. The money**

- The unwritten posting rule: none. Tracking writes no money fact.
  Distance-based allowances (travel reimbursement) would be a `finance`
  expense rule reading `TrackDaySummary`, named and not built.
- Every column or none: n/a, because no `JournalLine` is written.
- The period that already moved: n/a, for the same reason.
- The second legal entity: n/a for money. The lawful basis and retention
  differ by jurisdiction, so a group operating in two countries runs two
  deployments (Br1), each with its own policy version.
- Dry run before live: `summariseTrack()` and `simplifyTrack()` are pure.
  Their second caller is the policy editor's "preview on last week's tracks",
  which shows how a changed accuracy or speed filter would alter distances
  before activation.
- Click the number: a day's distance links to the drawn route or the
  timeline, listing excluded segments with their reason (accuracy, speed).
  The field-sales dashboard's distance is `FieldDaySummary.distanceM`, copied
  from `TrackDaySummary`. The only legitimate delta is a summary recomputed
  after late points.

**5. The scale**

- Three silhouettes:
  - a 5-rep distributor;
  - a 1,000-rep network: ~22 M points a month, monthly partitions, 90-day
    purge;
  - a group, where breadcrumbs stay node-local and only summaries travel (via
    `fieldsales`).

  `locationId` is NOT NULL on sessions.

- The absent collaborator:
  - `fieldsales` off: tracking still works for any worker whose app opens a
    session.
  - `fieldtracking` off: `fieldsales` shows no distance and is otherwise
    unchanged.
  - no `MAP_TILE_URL`: the timeline view.
  - no native app (OD-F1 declined): positions only while the app is open.
- The second copy of the write: `TrackPoint @@unique([sessionId,
occurredAt])`, `TrackingSession.clientSessionId @unique`, and
  `TrackLastPosition`'s newer-only predicate.
- The hundred-thousandth row: `TrackPoint` holds ~66 M rows live at 1,000
  reps under 90-day retention. A day-history read uses
  `(userId, occurredAt)` within one or two partitions, ~850 rows. The live
  map reads `TrackLastPosition` by `locationId`, one row per worker.
- The adoption test: no human-readable number is minted. Session ids are
  client UUIDs.

**6. The afterlife**

- The reversal document: n/a. Nothing is reversed. A wrong point is
  superseded by the summary's filters, never edited.
- The undo fan-out of consent withdrawal:
  - session end: automatic;
  - capture stop: automatic, on the device's next contact;
  - stored points: kept until retention by default. Whether withdrawal must
    delete them immediately is OD-F2's call, and the purge job can run for
    one user.
- The version stamp: `TrackingSession.policyVersionId` and
  `TrackDaySummary.policyVersionId`. A distance stays explainable after the
  filters change.
- The erasure the ledger cannot obey:
  - location history is the most sensitive personal data this program holds;
  - on the worker's erasure, `TrackPoint`, `TrackLastPosition` and
    `TrackingSession` rows for that user are **deleted**, not pseudonymised,
    because no ledger depends on them;
  - `TrackDaySummary` is pseudonymised;
  - `TrackingConsent` is kept as the evidence of what the worker agreed to,
    under the basis OD-F2 names.
- The failure path:
  - a rejected batch (malformed, over limit) is answered `400`/`413`/`429`,
    and the app's outbox keeps it FAILED and visible on the sync screen;
  - dropped out-of-window points are counted on the session, visible to
    `fieldtracking.manage`;
  - a partition-cron failure lands rows in the DEFAULT partition and is
    reported through the cron's structured `Logger.error()`, the same way
    `AttendancePartitionCron` reports. No APM is wired (ADR-017 open), so
    that log line is the alert, said plainly.
