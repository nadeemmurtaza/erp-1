# 246 — Field sales: territories, routes and outlets, field days and cash custody, visits, offline booking, van sales, collection capture, rollups

> **Status: Planned (2026-10-04). Nothing built.** Architecture and the
> pack-vs-capability decision: [doc 245](./245-field-sales-distribution-architecture.md)
> (proposed R31: a device is not a node). Decision record: ADR-089. Receipts:
> [doc 248](./248-customer-receipts-allocation.md). Tracking:
> [doc 247](./247-field-tracking.md). **Prerequisites:** doc 245's Tranche F0
> (WO-245.1–245.5, WO-236.7 order intake).

## Objective

A rep opens their day on their phone and works their planned route. At each
outlet they:

- check in (geo-stamped);
- book an order for delivery, or sell from the van, or record why nothing was
  sold;
- collect cash against what the outlet owes;
- check out.

All of it works with no signal. When connectivity returns, bookings become
orders, collections become receipts, and the day's figures appear at head
office. In the evening the rep hands their cash and cheques to the depot
cashier, who settles the day against what the device recorded. Supervisors
and head office see coverage, strike rate, order value and collection per
rep, route, team and day, and can click any figure through to the visits,
orders and receipts that make it up.

## Existing state (verified, 2026-10-04)

- **No route, territory, visit or geolocation concept exists** anywhere in
  the schema.
- **Outlets fit existing tables.** An outlet is naturally a `Contact` (crm),
  with a `B2BAccount` (accounts) and `CustomerCreditTerm` (receivables) when
  it buys on credit.
- **Credit settlement.** `AccountProvider` checks credit through
  `CreditTermsService.checkCreditAvailable()`. Settlement is one `Payment` per
  order (doc 248 adds receipts).
- **Pricing on the device.** `PricingService.resolvePrices()` resolves an
  outlet's assigned price list server-side. `computeOrderTotals()` and
  `evaluateDiscounts()` are pure in `packages/shared`, so a device can compute
  the same totals. `promotions` expresses `BUY_X_GET_Y` per
  `customerSegmentId`.
- **`orders.place()` is cart-shaped.** Field orders need doc 236 OD-3's line
  intake (WO-236.7).
- **Van stock.** `transfers` moves stock between two `Location`s in one
  database. `StockCount` and `SpotCheck` count a location.
- **The catalog has no case-pack quantity or unit conversion**
  (`RETAIL-VERTICAL-COVERAGE-MATRIX.md` item 7). Reps typically take orders in
  cartons.
- **People hierarchy.** `Position.reportsToId` and the `OrgUnit` tree exist.
  `EmployeeOffboardingRegistry` exists for handing back a leaver's work.

## 1. Design

**Planning (policy).**

- **Territories.** A `SalesTerritory` tree is the commercial geography
  (region → area → territory). It is not the org tree, and not doc 239's
  supply regions.
- **Routes.** A `FieldRoute` belongs to a territory and names the depot
  `Location` that fulfils its bookings. Its `FieldRouteStop`s are outlets in
  visit sequence, each with the weekdays it is visited and a frequency
  (weekly, alternate weeks A/B, or one week of the month).
- **Assignments.** A `FieldRouteAssignment` binds a rep to a route for a
  date range.
- **Outlets.** A `FieldOutlet` adds field attributes to a `Contact`: location
  (integer microdegrees × 10, `latE7`/`lngE7`), outlet class code, and a
  delivery address.
- **New outlets.** A rep who finds a new shop files an offline
  `FieldOutletProposal`. Canonical Ruling 8: an upward flow is a proposal.
  Approval de-duplicates on normalised phone (`Contact.phoneE164`) and creates
  the `Contact` and `FieldOutlet` in one transaction. That is the one
  coupling, `fieldsales -> crm` (precedent: `support -> crm`). A new outlet
  starts cash-only. Credit is granted separately by finance through the
  existing accounts and credit-terms screens.

**The day (custody).**

- **Opening.** A `FieldDay` opens on the device, offline if need be, keyed by
  a client id. It names the rep, business date and timezone, the van
  `Location` if any, and an optional change float. If the depot cashier
  issues a float, they record it, and it posts (§3).
- **Planned calls.** At open, the planned calls are computed from the
  assignment and snapshotted on the day, so the plan for that day cannot
  change after the fact.
- **Closing.** The rep closes on the device and reports cash, cheque count and
  amount, and the device's unsynced record count.
- **Settlement.** A depot cashier settles it. Expected cash is the opening
  float plus Σ cash collections of the day. The cashier records counted cash
  and cheques received. A shortage or overage is computed and resolved as in
  §3.
- **Late records.** A record arriving after settlement is accepted and opens
  a `FieldSettlementException` (R31: late is flagged, never refused).

**The visit (record).**

- **Check-in.** `FieldVisit` records check-in and check-out time and
  position, distance from the outlet, and a pure `classifyCheckIn()`
  outcome: `ON_SITE`, `OFF_SITE`, `NO_FIX` or `OUTLET_UNLOCATED`.
  `OFF_SITE` is recorded and flagged, never refused.
- **Outcome.** `ORDER`, `VAN_SALE`, `COLLECTION_ONLY`, `NO_ORDER` (with a
  `FieldReasonCode`), or `OUTLET_CLOSED`.
- **Visit activities.** These are pluggable. Packs register types through
  `core/extension-points/visit-activity.registry.ts`, each with a zod schema.
  Results are stored as `FieldVisitActivity` rows (key + validated payload)
  and kept readable as raw JSON if the registering pack is later switched off.
- **Geo-stamping can be turned off.** `fieldsales.visit_geostamp` (Setting,
  default on) switches check-in positions off entirely for a deployment that
  must not collect them. Classification is then always `NO_FIX` and coverage
  still works.

**Booking and van sale (store first, apply second).** A booking is uploaded
with:

- its client id and visit id;
- the outlet;
- `mode`: `BOOKED` (pre-sell) or `HANDED_OVER` (van sale);
- lines in base units;
- the total the device showed and the snapshot version it was priced from;
- tender: `ACCOUNT` for a credit outlet, `FIELD` for settlement by a field
  receipt;
- `occurredAt` and `timezone`;
- the device slip number (`BK-` or `VS-` + device short code + sequence).

The flow:

1. **Store.** The row is inserted `RECEIVED`. Its unique client id makes a
   second copy a no-op. The server answers `202`.
2. **Decide.** The pure `decideBooking()` checks:
   - the outlet resolves (an unapproved proposal → `NEEDS_REVIEW
     OUTLET_PENDING`);
   - the snapshot is no older than the ceiling, or every price and discount
     it used is unchanged (else `NEEDS_REVIEW PRICE_CHANGED`).
3. **Apply.** Through order intake, with:
   - `channel = FIELD`;
   - `channelRef = FieldBooking:<id>` (unique on the order, so intake's
     second call is a no-op);
   - `placedByUserId` = the rep, `contactId` = the outlet, `occurredAt`;
   - location = the route's depot for `BOOKED`, or the day's van for
     `HANDED_OVER`.

   Outcomes:
   - **Credit refusal** from `AccountProvider` → `CREDIT_HOLD`.
   - **`BOOKED` short at the depot** → backordered lines if
     `checkout.allow_backorder` is on, else `NEEDS_REVIEW STOCK_SHORT`.
   - **`HANDED_OVER` is a record**, so intake uses `postUnconditional()`
     (R5). An oversold van produces a `StockVariance`, never a refusal.
4. **Result.** The rep's device learns each booking's outcome on its next
   down-sync.

Pre-sell delivery runs through `orderrouting` (doc 238) if enabled, and
`fulfilment`'s existing courier flow (`manual` for own vehicles) until
WO-246.10.

**Collection (record).** A collection is uploaded with:

- client id and visit id;
- outlet;
- amount;
- method: `CASH`, `CHEQUE` (number, bank, date) or `BANK_TRANSFER` (the
  customer's reference);
- optional allocation hint (order ids);
- `occurredAt` and `timezone`;
- slip number `FC-…`.

The flow:

1. It is stored as a `FieldCollection` and `FieldCollectionRecorded` is
   published.
2. `receivables` creates the `CustomerReceipt` (doc 248), idempotent by
   source.
3. `CustomerReceiptRecorded` returns the receipt id.

The day's expected cash is computed from `FieldCollection` rows, which
`fieldsales` owns. Settlement therefore works even when `receivables` is off.

**Van sales.**

- **Loading.** The day's van is a `Location` of type `VEHICLE` (WO-245.3).
  Loading is a `StockTransfer` depot → van through `transfers`' existing
  screens, linked from the day-open screen (UI composition, no import).
- **Selling.** A van sale is a `HANDED_OVER` booking with tender `FIELD`
  plus a cash collection on the same visit, allocated to that order. Every
  field rupee therefore enters through one path, a receipt.
- **Day end.** A count of the van location (existing `SpotCheck` /
  `StockCount`) and an unload transfer van → depot.
- **Tax invoice.** The tax invoice is numbered on sync, as R18 already
  requires for offline sales. It depends on doc 236 OD-2's invoicing
  document.

**Down-sync (new, R31).**

- **Snapshot.** `GET /field/sync/down?cursor=` returns the signed-in rep's
  scoped snapshot, built read-only from other modules' tables:
  - the rep's assignments, routes, stops and outlets, plus the full id list
    in scope, so the device prunes outlets that left its routes;
  - each outlet's payment terms, credit limit, outstanding balance and up to
    20 open orders;
  - the price-list entries for the price lists those outlets use;
  - active sellable variants, with case-pack quantity (WO-245.5), barcode and
    image URL. **Never cost price.**
  - active discounts, so the device can call `evaluateDiscounts()`;
  - tax configuration for `computeOrderTotals()`;
  - reason codes and visit-activity definitions;
  - van stock at the day's van location;
  - the status of the rep's bookings and collections from the last 7 days.
- **Delta.** Each section is delta by `(updatedAt, id)` keyset where its
  source table has a monotonic change column, else sent whole. WO-246.3
  verifies each source.
- **Up-sync.** `POST /field/sync/up` takes a batch of records (visit,
  booking, collection, outlet proposal, day open/close), each with its client
  id, and returns a per-record result.
- **Heartbeat.** `POST /field/devices/heartbeat` reports queue depth, the
  oldest unsynced record's age, app version and battery.

**Device identity.**

- A `FieldDevice` row binds an app install id and the sign-in's refresh-token
  `familyId` to a rep, plus a short code used in slip numbers.
- **Suspend.** Suspending it calls `revokeSignInFamily()` (WO-245.4), and the
  next contact tells the app to purge its local data.
- **No new credential.** A phone is the sign-in.

## 2. Schema — `apps/api/prisma/schema/field-sales.prisma` (new, hand-written forward-only migration)

Cross-module references are bare scalars (ADR-012). Scope columns are NOT
NULL (canonical Ruling 4).

```prisma
enum FieldVisitOutcome { ORDER VAN_SALE COLLECTION_ONLY NO_ORDER OUTLET_CLOSED }
enum FieldGeoStatus    { ON_SITE OFF_SITE NO_FIX OUTLET_UNLOCATED }
enum FieldBookingMode  { BOOKED HANDED_OVER }
enum FieldBookingStatus { RECEIVED APPLIED NEEDS_REVIEW CREDIT_HOLD REJECTED }
enum FieldDayStatus    { OPEN CLOSED_BY_REP SETTLED }

model SalesTerritory { id String @id @default(cuid()); code String @unique; name String; parentId String?; isActive Boolean @default(true); @@index([parentId]) }
model FieldRoute {
  id String @id @default(cuid())
  territoryId String; code String @unique; name String
  depotLocationId String               // fulfils BOOKED orders — scope column
  version Int @default(1)              // bumped on any stop change; stamped on FieldDay
  isActive Boolean @default(true)
}
model FieldRouteStop {
  id String @id @default(cuid())
  routeId String; contactId String; sequence Int
  weekdays Int                         // bitmask Mon=1 … Sun=64
  frequency String                     // WEEKLY | ALT_A | ALT_B | MONTH_WEEK_1..4
  @@unique([routeId, contactId])
  @@index([contactId])
}
model FieldRouteAssignment {
  id String @id @default(cuid())
  routeId String; repUserId String
  effectiveFrom DateTime; effectiveTo DateTime?   // null = open-ended, ended by offboarding
  assignedByUserId String
  @@index([repUserId, effectiveFrom])
}
model FieldOutlet {
  id String @id @default(cuid())
  contactId String @unique             // crm Contact
  latE7 Int?; lngE7 Int?               // degrees × 10^7 — integers, fits Int32 (±1,800,000,000)
  geoStatus String @default("UNLOCATED")   // UNLOCATED | UNVERIFIED | VERIFIED
  geoCapturedByUserId String?; geoCapturedAt DateTime?; geoVerifiedByUserId String?
  outletClassCode String?; deliveryAddress Json?
  isActive Boolean @default(true)
}
model FieldOutletProposal {
  id String @id @default(cuid())
  clientProposalId String @unique; proposedByUserId String
  name String; phoneE164 String?; deliveryAddress Json?; latE7 Int?; lngE7 Int?
  routeId String?; status String @default("PENDING")   // PENDING | APPROVED | MERGED | REJECTED
  resultingContactId String?; decidedByUserId String?; occurredAt DateTime
}
model FieldReasonCode { id String @id @default(cuid()); kind String; code String; labelKey String; isActive Boolean @default(true); @@unique([kind, code]) }
model FieldDevice {
  id String @id @default(cuid())
  repUserId String; installId String @unique; shortCode String @unique   // 4–6 chars, slip-number prefix
  refreshFamilyId String?              // core RefreshToken.familyId of the sign-in on this phone
  status String @default("ACTIVE")     // ACTIVE | SUSPENDED
  purgeRequestedAt DateTime?
  lastHeartbeatAt DateTime?; queueDepth Int?; oldestUnsyncedAt DateTime?; appVersion String?
}
model FieldDay {
  id String @id @default(cuid())
  clientDayId String @unique
  repUserId String; deviceId String; businessDate DateTime @db.Date; timezone String
  depotLocationId String               // where it settles — scope column
  vanLocationId String?
  routeIds String[]; routeVersions Int[]; plannedCalls Json      // the plan as it was that morning
  openingFloatMinor Int @default(0); floatIssuedByUserId String?
  status FieldDayStatus @default(OPEN)
  openedAt DateTime; closedAt DateTime?
  reportedCashMinor Int?; reportedChequeCount Int?; reportedChequeMinor Int?; unsyncedAtClose Int?
  expectedCashMinor Int?; countedCashMinor Int?; chequesReceivedCount Int?
  differenceMinor Int?                 // counted − expected; negative = shortage
  settledByUserId String?; settledAt DateTime?
  differenceResolution String?         // WRITE_OFF | RECOVER_FROM_STAFF | NONE
  resolvedByUserId String?; secondApproverUserId String?
  @@unique([repUserId, businessDate])
  @@index([depotLocationId, status])
}
model FieldVisit {                     // partitioned by month on checkInAt (hand-written; AttendanceEvent precedent)
  id String @default(cuid())
  clientVisitId String; fieldDayId String; repUserId String; contactId String
  routeStopId String?                  // null = unplanned visit
  checkInAt DateTime; checkOutAt DateTime?; timezone String
  latE7 Int?; lngE7 Int?; accuracyM Int?; isMocked Boolean @default(false)
  distanceM Int?; geoStatus FieldGeoStatus; geofenceRadiusM Int    // the radius applied — version stamp
  outcome FieldVisitOutcome?; reasonCode String?
  lateAfterSettlement Boolean @default(false)
  @@id([id, checkInAt])
  @@unique([clientVisitId, checkInAt])
  @@index([fieldDayId])
  @@index([contactId, checkInAt])
}
model FieldVisitActivity { id String @id @default(cuid()); clientVisitId String; activityKey String; schemaVersion Int; payload Json; occurredAt DateTime; @@index([clientVisitId]) }
model FieldBooking {
  id String @id @default(cuid())
  clientBookingId String @unique; clientVisitId String?; fieldDayId String
  repUserId String; contactId String?; outletProposalClientId String?
  mode FieldBookingMode; tender String  // ACCOUNT | FIELD
  locationId String                     // depot (BOOKED) or van (HANDED_OVER) — scope column
  lines Json                            // [{variantId, quantity}] — ids only, never names
  deviceShownTotalMinor Int; snapshotVersion String; deviceRef String
  occurredAt DateTime; timezone String
  status FieldBookingStatus @default(RECEIVED); statusReasons String[]
  orderId String?                       // orders, bare scalar
  reviewedByUserId String?; receivedAt DateTime @default(now())
  @@index([status, receivedAt])
  @@index([repUserId, occurredAt])
}
model FieldCollection {
  id String @id @default(cuid())
  clientCollectionId String @unique; clientVisitId String?; fieldDayId String
  repUserId String; contactId String
  amountMinor Int; currency String; method String   // CASH | CHEQUE | BANK_TRANSFER
  chequeNumber String?; chequeBank String?; chequeDate DateTime?; transferRef String?
  allocationHint String[]               // order ids the customer named, if any
  deviceRef String; occurredAt DateTime; timezone String
  status String @default("RECEIVED")    // RECEIVED | RECEIPTED | RECEIPT_FAILED | VOIDED
  receiptId String?                     // receivables, bare scalar
  receivedAt DateTime @default(now())
  @@index([fieldDayId])
  @@index([contactId, occurredAt])
}
model FieldSettlementException { id String @id @default(cuid()); fieldDayId String; kind String; refType String; refId String; amountMinor Int?; status String @default("OPEN"); resolvedByUserId String?; resolvedNote String?; createdAt DateTime @default(now()); @@index([fieldDayId, status]) }
model FieldDaySummary {                // CACHE — safe to delete and recompute from the rows above
  fieldDayId String @id
  repUserId String; businessDate DateTime @db.Date; depotLocationId String
  plannedCalls Int; visits Int; plannedVisited Int; productiveCalls Int; orderLines Int
  bookedValueMinor Int; appliedValueMinor Int; collectedMinor Int; outletsServed Int
  timeInMarketMinutes Int?; avgMinutesPerStop Int?; offSiteCheckIns Int; distanceM Int?
  computedAt DateTime @default(now())
  @@index([depotLocationId, businessDate])
}
```

That is 15 tables. `FieldDaySummary` is registered with `ReplicationRegistry`
as FACT, UP, so a brand or org dashboard sees every depot's days. `FieldVisit`,
`FieldVisitActivity` and device rows are node-local (proposed R29). The
orders, receipts and journal lines that matter upstream already replicate as
themselves.

## 3. Money

The postings are a pure account-selection function with one subscriber
(canonical Ruling 3). Accounts `1050` Cash with Field Staff (ASSET) and `5710`
Cash Over/Short (EXPENSE) are added by doc 248 WO-248.1. Every line carries
`locationId` = the day's depot (WO-236.6).

| Event | Journal | Key |
|---|---|---|
| `FieldFloatIssued` (cashier hands the change float) | Dr 1050 · Cr 1000 | `findPostedEntry('fieldsales.float_issued', fieldDayId)` |
| A field cash receipt (doc 248) | Dr 1050 · Cr 1100 (contactId = outlet) | doc 248 |
| `FieldDaySettled` | Dr 1000 (counted cash) · Cr 1050 (counted cash). The difference stays in 1050 against the day until resolved. | `('fieldsales.day_settled', fieldDayId)` |
| `FieldDayDifferenceResolved` shortage → `WRITE_OFF` | Dr 5710 · Cr 1050 | `('fieldsales.difference_resolved', fieldDayId)` |
| shortage → `RECOVER_FROM_STAFF` (only if OD-F3 enables it) | Dr 1300 Employee Advances · Cr 1050 | same |
| overage | Dr 1050 · Cr 5710 | same |

Cheques post nothing on collection. They are uncleared receipts in doc 248,
and the cashier counts them by number at settlement. **`1050` per rep** has
no `JournalLine` dimension. It is reconciled by the "Cash with field staff"
report: the GL balance of `1050` equals Σ (float + cash collections −
counted cash) over unsettled or unresolved days, by rep. The only legitimate
delta is a posting still in the outbox.

## 4. Parameters (exact)

| Parameter | Value | Why this number | Enforced in | On failure |
|---|---|---|---|---|
| Snapshot age ceiling | **24 h** | One working day. A rep syncs at least each morning at the depot. A price change reaches every device within a day, and bookings priced from an older snapshot are checked line by line. | `decideBooking()` | `NEEDS_REVIEW PRICE_CHANGED` only if a price or discount actually differs; unchanged lines apply |
| Price tolerance on a stale snapshot | **0 bps** (`Setting` `fieldsales.price_review_threshold_bps`) | A rep quoted a price to a shopkeeper; any change needs a person. Prices change rarely, so review volume is bounded to bookings in the ≤ 24 h window after a change. | `decideBooking()` | Review |
| Device stops new bookings | **72 h** since the last successful up-sync, **or 1,000** unsynced records | 72 h covers a weekend plus a holiday upcountry. Past that, three days of collected cash is in one person's hands, which is the custody risk settlement exists to bound. A heavy rep makes ~75 records a day, so 1,000 is ~13 days, a pure technical bound behind the time limit. Collections are **never** refused on the device, because the customer has already paid. | rep app | "Sync required" screen; paper fallback (lens 16) |
| Up-sync batch | **25 records** per request, **≤ 100 KiB** | A 30-line booking is ~2.5 KB, so 25 is ≤ ~65 KiB, inside the platform's 100 KiB JSON limit. A 1,000-record backlog is 40 requests, under a minute on a slow mobile link. | DTO validator | `413`; the app halves the batch |
| Lines per booking | **200** | A wholesale outlet's largest realistic order. 200 × ~60 B stays far inside one batch. | DTO | `400`; the app splits the order |
| Down-sync page | **500 rows**, keyset `(updatedAt, id)`; full snapshot if the cursor is older than **7 days** | 500 rows is ~100 KiB of outlet or product JSON. 7 days bounds how much history a delta must reconstruct. | `FieldSyncService` | n/a |
| Outlets in one rep's scope | **2,000** | A 6-day beat of 40–60 calls a day is ~240–360 outlets. 2,000 bounds device storage and keeps a first full sync to a few minutes on a slow link. | assignment validator | Assignment refused with the count |
| Check-in geofence | **100 m plus the fix's reported accuracy, capped at 250 m** (`Setting` `fieldsales.geofence_m`) | Outdoor GPS is typically accurate to tens of metres but degrades inside shops. Adding the device's own accuracy avoids flagging honest indoor check-ins. The cap stops a coarse network fix (often > 1 km) from passing. | `classifyCheckIn()` | `OFF_SITE`, recorded, flagged on the supervisor's list |
| Sync rate limit | **120 requests / 60 s per user** | A backlog flush of 25 × 120 = 3,000 records a minute. A normal rep sends a few requests a minute. A stolen token cannot flood. | `@Throttle` (`core/throttling`) | `429` + `Retry-After`; the outbox backs off |
| Heartbeat | **every 15 min** while online, and on every sync | A silent device shows on the supervisor screen within a quarter hour. ~96 tiny requests a day is negligible. | rep app | Device listed "silent since …" |
| Booking acknowledgement (server) | **p95 ≤ 300 ms** (one insert); **apply p95 ≤ 10 s** after storage | Store-first makes acknowledgement one write. Apply rides the outbox (2 s poll) plus order intake. **Network time is not counted and not promised.** The competitor's "0.8 s" is not a target. | SLO recorder (`core/slo`) | Alert only |
| Settlement second approval | `Setting` `fieldsales.settlement_second_approval_minor`, **unset = any non-zero difference needs a second person** | Fail closed. No currency literal (Law 1). | `FieldDayService.resolveDifference()` | Waits for a second user |
| Unsynced-cash alert | `Setting` `fieldsales.unsynced_cash_alert_minor`, **unset = no alert** | A business sets its own risk appetite. Heartbeats carry the device's unsynced cash total. | heartbeat handler | Alert to the depot's `fieldsales.settle` holders |
| `FieldVisit` partitioning | **monthly** on `checkInAt`, from the first migration | 1,000 reps × 40 visits × 300 days ≈ 12 M rows a year at the largest plausible deployment | migration | n/a |

## 5. Work orders

Each ships backend, the minimum screen (with a `/ux-design` brief first), a
nav entry, permission grants in `ROLE_PERMISSION_SEED`, and tests.

- **WO-246.1 — Territories, routes, outlets.**
  - Schema and registry line (`offByDefault`), `MODULE_PACKS` (`core`).
  - `/admin/field/territories`, `/routes` (stop sequence, weekdays,
    frequency, assignment with the 2,000 cap), `/outlets` (location
    verification, proposals queue with de-dup on phone).
  - Reason codes.
  - The `fieldsales -> crm` coupling with its justification comment.
  - Permissions `fieldsales.view`, `fieldsales.manage`,
    `fieldsales.outlet.verify`.
- **WO-246.2 — Devices and days.**
  - `FieldDevice` registration at sign-in, heartbeat, suspend
    (`revokeSignInFamily()`, purge on next contact).
  - `FieldDay` open, close and the settlement screen
    (`/admin/field/days`).
  - Float issue, the difference resolution band, `FieldSettlementException`.
  - Posting rules (§3).
  - Permissions `fieldsales.operate`, `fieldsales.settle`,
    `fieldsales.settle.writeoff`.
  - `EmployeeOffboardingRegistry` registration.
- **WO-246.3 — Down-sync.** `FieldSyncService` (read-only reads), sections,
  cursors, scope pruning, no cost price (asserted by a test that greps the
  payload).
- **WO-246.4 — Up-sync and inboxes.**
  - Batch endpoint with per-record results.
  - `FieldVisit` (partitioned), `FieldVisitActivity` with the core
    `VisitActivityRegistry`.
  - `FieldBooking` and `FieldCollection` storage.
  - `classifyCheckIn()` with haversine in `packages/shared`.
- **WO-246.5 — Booking apply.**
  - `decideBooking()` (pure), apply through order intake, `channelRef`
    idempotency.
  - `/admin/field/bookings/review` (price, stock, outlet, credit reasons).
  - Permission `fieldsales.review`.
- **WO-246.6 — Collections.** The `FieldCollectionRecorded` publisher, the
  receipt link-back subscriber, and the receipt-failure exception list. Needs
  WO-248.2.
- **WO-246.7 — Van sales.**
  - The van `Location` on the day.
  - Load-out and unload links into `transfers`.
  - `HANDED_OVER` bookings plus the same-visit collection.
  - Day-end van count through `SpotCheck`, with van variances shown on the
    settlement screen.
- **WO-246.8 — Rollups and dashboard.**
  - `summariseDay()` (pure) → `FieldDaySummary`, recomputed on close,
    settlement and any late record.
  - `/admin/field/dashboard` by rep, route, territory, team
    (`Position.reportsToId`) and date range. Every figure links to its rows.
  - FACT-UP replication registration.
- **WO-246.9 — The rep app** (OD-F1).
  - In `apps/mobile`'s field mode: day open, today's route, visit flow
    (check-in, book or van-sell, collect, no-order reason, check-out),
    outlet proposal, sync screen with queue and failures, day close.
  - The shared outbox (WO-245.2), and the on-device database
    (dependency questionnaire in the PR).
  - Carton entry using `casePackQty` (WO-245.5).
  - Printing slips is out of scope until a printer is named (doc 245 §9).
- **WO-246.10 — Own-fleet delivery runs. Sequenced, not built here.**
  - Shipments assigned to a driver's day.
  - Proof of delivery (position, photo), and partial refusal at the door,
    which raises a `fulfilment` return for the refused lines through
    `fulfilment`'s own subscriber.
  - Cash on delivery as a field receipt.
  - `Shipment` status through `fulfilment.applyStatusChange()`, which gains
    an additive `occurredAt` parameter.

## 6. Files likely affected

`field-sales.prisma` (+ migration); `apps/api/src/modules/sales/fieldsales/*`;
`core/extension-points/visit-activity.registry.ts`; `packages/shared`
(haversine, `classifyCheckIn`, `summariseDay` types);
`posting-rules.subscriber.ts`; `domain-events.ts`;
`check-module-boundaries.mjs` (one entry); `permissions.ts`;
`apps/web/src/app/admin/field/*`; `nav-registry.ts`; `apps/mobile` (field
mode).

## 7. Dependencies reused

`Contact`, `B2BAccount`, `CustomerCreditTerm` and `AccountProvider`;
`PricingService` tables, `evaluateDiscounts()` and `computeOrderTotals()`;
order intake (WO-236.7); `transfers`; `SpotCheck`/`StockCount`;
`StockVariance` (R5); `documentNumber()`; `EmployeeOffboardingRegistry`;
`Position.reportsToId`; `core/throttling`; `core/slo`; `RefreshToken`
families; `ReplicationRegistry`; doc 248 receipts; the doc 238 and 239
routing stack when on.

## 8. Risks

- **Fake check-ins** (mock-location apps). Mitigation:
  - the device's mock flag is stored (`isMocked`) and shown;
  - a check-in whose position matches the previous outlet's (a rep "visiting"
    from one spot) is flagged by the summary;
  - a supervisor's outlet verification breaks the rep-plants-the-geo loop
    (toxic pair).
- **Collection leakage.** Cash collected and never recorded. Mitigations:
  - **Slip numbers are device-sequenced.** A gap in a device's `FC-` series
    shows on the settlement screen.
  - **Outlets can check balances.** Statements (doc 248) let an outlet see
    its balance, which is the classic control: the shopkeeper notices an
    unrecorded payment.
- **Stale prices.** Bounded by the snapshot ceiling and line-level review.
- **A lost phone holds the route's outlets and balances.** Mitigation:
  - scope is limited to the rep's own routes, and no cost data is on the
    device;
  - suspend revokes the sign-in and purges on contact;
  - an encrypted on-device store is part of WO-246.9's dependency decision.

## 9. Acceptance criteria

1. With `fieldsales` off, every existing spec passes, and no field route or
   nav entry exists.
2. A booking uploaded twice (same client id) produces one `FieldBooking` and
   one order. An order-intake retry with the same `channelRef` produces
   nothing new.
3. A rep offline for 30 hours books 40 orders and collects 15 payments. On
   reconnect:
   - every record is stored with its own `occurredAt`;
   - bookings whose prices did not change become orders;
   - bookings whose prices changed wait in review.
4. A van sale that drives van stock negative is recorded (R5), with a
   `StockVariance`, never refused.
5. A collection recorded after its day was settled is accepted and opens a
   settlement exception.
6. Settlement:
   - computes expected cash exactly from float plus cash collections;
   - posts Dr 1000 / Cr 1050 once;
   - refuses settlement by the day's own rep;
   - needs a second person to write off any difference while the band is
     unset.
7. The down-sync payload never contains a cost price or another rep's
   outlets.
8. Suspending a device revokes that sign-in family, and the next request
   from it is refused.
9. Every dashboard figure equals the count or sum of the rows its drill-down
   lists.
10. `pnpm lint && pnpm typecheck && pnpm test` pass, and the migration
    applies forward on a copy of production data.

## 10. Out of scope

- Trade-scheme management beyond what `promotions` already expresses.
- Merchandising and shelf audits (a pack, through `VisitActivityRegistry`).
- Route optimisation (suggesting stop order). Today a person sequences stops.
- Incentive and commission calculation for reps (a later brief over
  `FieldDaySummary`).
- Principal–distributor secondary-sales visibility. A manufacturer seeing its
  independent distributors' sales is cross-business, through
  `tradingpartners` facts or doc 241's sell-through ingestion, sequenced.
- Full unit-of-measure conversion (coverage matrix item 7). `casePackQty` is
  an entry convenience only.
- Post-dated cheque lifecycle beyond doc 248's minimal states.

## Scope lenses

**0. The shop-scale five**

- The transaction, start to finish: day open → route → check-in → book or
  van-sell → collect → check-out → sync → order (intake) and receipt
  (doc 248) → delivery (`orderrouting` / `fulfilment`) → day close →
  settlement. Every step has a screen (WO-246.1–246.9).
- The other side of the same transaction: the supervisor dashboard, the
  booking review queue, the outlet proposal and verification queue, the
  depot settlement screen, and the device list ("silent since", queue depth).
- What happens after "done":
  - a booked order is cancelled through `orders`' cancel, restocking from the
    ledger (WO-236.3);
  - a collection is voided in doc 248 by another person;
  - a late record after settlement opens an exception;
  - a refused delivery uses `fulfilment`'s RTO path.
- The integrations a real business needs:
  - real background location through native APIs (OD-F1);
  - credit through the existing `AccountProvider`;
  - the delivery leg through `fulfilment`'s courier extension point.

  Printing waits for a named printer; it is not faked.
- The policy layer: routes and their versions, assignments, geofence,
  snapshot ceiling, price tolerance and settlement band. Each is a Setting
  or row with evidence-class audit on change.

**1. The actor**

- The actor with three tables:
  - A rep is a `User`.
  - An outlet is a `Contact`, linked by `FieldOutlet.contactId`, with
    `B2BAccount.customerId` when on credit.
  - A phone is a `FieldDevice` bound to a `RefreshToken.familyId`.
  - A proposed outlet is a `FieldOutletProposal` until it becomes a
    `Contact`.
- The principal with no permission key: none. Every route is
  `PermissionsGuard`-checked under the rep's own session
  (`fieldsales.operate`). The device is not a principal; it is the sign-in.
- The grant that ends itself: `FieldRouteAssignment.effectiveTo`. On
  deactivation, `EmployeeOffboardingRegistry` sets it to now, suspends the
  rep's `FieldDevice`s and revokes their sign-in families in the same
  transaction. An OPEN `FieldDay` stays open for settlement, because custody
  is a fact.

**2. The authority**

- Whose rows, and which columns:
  - A rep reads only their own assignments, days and records (an
    own-rows guard in the `assertCanManage()` shape). Supervisors read days
    and dashboards for their depot `Location` scope (WO-236.4).
  - The snapshot never carries `costPrice`, and the rep sees outstanding
    balances only for outlets on their own routes.
- The threshold nobody approves alone:
  - a settlement difference above `fieldsales.settlement_second_approval_minor`
    (unset = any) needs `secondApproverUserId ≠ resolvedByUserId`;
  - releasing a credit hold stays with `finance.credit-terms.manage` (no
    bypass path);
  - the undo of a resolution is a reversal by a different user.
- The toxic pair:
  - collecting and settling: `FieldDayService.settle()` throws when the
    actor equals `FieldDay.repUserId`;
  - capturing and verifying an outlet's location: `verifyOutletGeo()` throws
    when the actor equals `geoCapturedByUserId`.
- Authority and blast radius:
  - route edits bump `FieldRoute.version`, audited old and new;
  - the worst value, a geofence of 250 m on every outlet, is bounded by the
    cap;
  - a snapshot ceiling raised to weeks is visible as a Setting change in the
    evidence-class audit digest to `fieldsales.manage` holders.
- Audience is a capability:
  - review items go to `fieldsales.review` holders scoped to the booking's
    depot `Location`;
  - settlement exceptions and unsynced-cash alerts go to `fieldsales.settle`
    holders of that depot;
  - zero holders escalates to `fieldsales.manage`;
  - many holders get one digest per hour each, never a ping per record.

**3. The act in the world**

- Request or record:
  - a booking is a RECORD of demand (always stored), and its conversion to an
    order is a REQUEST that review may hold;
  - a van sale, a collection and a visit are RECORDS, never refused. A van
    oversell goes through `postUnconditional()` and a `StockVariance`;
  - an outlet proposal is a REQUEST.
- The movement with no address:
  - a `BOOKED` order commits at `FieldRoute.depotLocationId` (or the routed
    location under `orderrouting`);
  - a `HANDED_OVER` sale moves stock at `FieldDay.vanLocationId`;
  - load-out and unload name both locations.

  `defaultLocationId()` is reached on no path.
- Four hours down:
  - offline is this feature's normal state;
  - with the server down, devices keep queuing under the 72 h ceiling;
  - past it, a rep writes paper order slips, which a depot clerk enters
    through "enter from paper" (`fieldsales.operate` on the rep's behalf,
    attributed to both), keyed by the paper slip number so a later device
    upload of the same order is caught as a duplicate in review;
  - with the settlement screen down, the cashier records counts on the
    printed day sheet and enters them later.

**4. The money**

- The unwritten posting rule: written out in §3 (float, settlement,
  difference resolution), keyed per day. Field receipts post in doc 248.
- Every column or none: every line sets `locationId` = the depot. Receipt
  lines set `contactId` = the outlet. `retailBrandId` and `branchNodeId`
  follow the existing rules. `counterpartyBrandId` stays null.
- The period that already moved: a day settled after its period closed posts
  to the current open period with its own date retained (R15 invariant 3). A
  late collection follows doc 248's rule.
- The second legal entity: one deployment is one legal entity (Br1). Amounts
  carry the deployment currency. A distributor with two companies runs two
  deployments.
- Dry run before live: `decideBooking()`, `classifyCheckIn()` and
  `summariseDay()` are pure. Their second callers are:
  - the review screen's "why";
  - the outlet screen's check-in history;
  - a replay of last month's days through `summariseDay()` after a definition
    change.
- Click the number: each dashboard tile drills to visits, bookings or
  receipts. Two figures look alike and are not:
  - booked value comes from `FieldBooking.deviceShownTotalMinor`;
  - applied value comes from `Order.grandTotal`.

  They differ only by price-change review outcomes, stock shortfalls and
  credit holds, each listed. Collected comes from `FieldCollection`, and
  receipted comes from `CustomerReceipt`; they differ only by receipt
  failures, listed.

**5. The scale**

- Three silhouettes:
  - a distributor with 5 reps on one STANDALONE node;
  - a forty-depot network where each depot is a site node and reps sync to
    their depot's node;
  - a group, where `FieldDaySummary` replicates up for brand and org
    dashboards.

  `depotLocationId` is NOT NULL on days, routes and bookings.
- The absent collaborator:
  - `orders` off: bookings stored, "N bookings waiting".
  - `receivables` off: collections stored and settled by custody, with no AR
    credit; the dashboard warns.
  - `transfers` off: van sales disabled, with the reason on screen.
  - `fieldtracking` off: no distance figure.
  - `promotions` / `pricing` off: base prices only.
  - `crm` off: Nest refuses to boot with a named error, because `fieldsales`
    imports it for outlet creation; the S4 preset matrix never omits it.
- The second copy of the write:
  - client-id `@unique` on day, visit (with `checkInAt`), booking, collection
    and proposal;
  - `channelRef` unique on the order;
  - status predicates on apply and settle.
- The hundred-thousandth row:
  - ~12 M visits a year at 1,000 reps (monthly partitions);
  - ~7.5 M bookings and ~3 M collections a year (indexed, unpartitioned until
    a measured 50 M);
  - dashboards read `FieldDaySummary` by `(depotLocationId, businessDate)`,
    two statements a page, never the raw visits.
- The adoption test: device slip numbers are `<KIND>-<FieldDevice.shortCode>-<seq>`,
  unique by construction across offline devices, never a legal series. Order,
  receipt and tax-invoice numbers come from `documentNumber()` on the node.

**6. The afterlife**

- The reversal document:
  - an order is reversed by `orders`' cancel and returns (partial,
    repeatable);
  - a collection by a voided `CustomerReceipt` (doc 248);
  - a settlement by `AccountingService.reverseEntry()` plus re-settlement by
    a different user.
- The undo fan-out of a booking apply:
  - the order: needs a human (`orders` cancel);
  - the stock commit: reverses automatically from the ledger on cancel
    (WO-236.3);
  - the device slip given to the shopkeeper: deliberately irreversible, and
    the cancellation shows on the next statement.
- The version stamp: `FieldBooking.snapshotVersion`, `FieldDay.routeVersions`
  and `plannedCalls`, and `FieldVisit.geofenceRadiusM`. A coverage figure
  stays explainable after a route changes.
- The erasure the ledger cannot obey:
  - rep ids on visits, days and bookings are pseudonymised by the existing
    erasure path (canonical Ruling 1);
  - outlet owners are often sole traders, so their personal data sits on
    `Contact` (crm's erasure path) and `FieldOutletProposal`;
  - booking payloads hold ids only, by design.
- The failure path:
  - bookings in `NEEDS_REVIEW` / `CREDIT_HOLD` appear on
    `/admin/field/bookings/review` under `fieldsales.review`;
  - collections in `RECEIPT_FAILED` appear on the collections exception list
    under `fieldsales.settle`, with a "retry receipt" action that is
    idempotent by source;
  - device-side failures appear on the app's sync screen and in heartbeats.
