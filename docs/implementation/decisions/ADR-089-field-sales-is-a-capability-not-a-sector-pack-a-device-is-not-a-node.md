# ADR-089 — Field sales and distribution: two core capability modules (`fieldsales`, `fieldtracking`) and a `receivables` receipt, not a sector pack; a device is not a node; offline field records use the till's pattern, fixed and generalised

[← Decision log](../DECISIONS.md)

### Context

The owner confirmed a fifth customer profile on 2026-10-04: **FMCG
distribution and field sales**. Order bookers and van salesmen work a route of
shop visits. Each visit may produce an order and/or a cash collection. Reps are
GPS-tracked with route history. Booking and collection work fully offline and
sync when connectivity returns. Head office sees per-rep and per-route
rollups. The reference material was screenshots of a competitor app, not a
spec. Its figures (including an "orders sync in 0.8 seconds" claim) are treated
as illustrative, never as requirements.

The coordinator asked three questions:

1. Is this a **sector pack** or a **capability module**?
2. Does it overlap `pos`'s terminal and shift model?
3. Do `packages/pos-core`'s outbox and `core/replication` already provide
   offline sync, or does a phone need a new primitive?

The full design is in
[`supply-chain-operations/245-field-sales-distribution-architecture.md`](../supply-chain-operations/245-field-sales-distribution-architecture.md)
and briefs 246–248. This entry records the irreversible calls.

Verified in code on 2026-10-04:

- **Nothing in the schema models field sales:** no route, beat, territory,
  visit, or geolocation column anywhere.
- **`Payment.orderId` is required.** On-account orders settle one `Payment` per
  order through `PaymentsService.approve()` (`account.provider.ts`), so no
  model records a customer receipt covering several orders, or part of one.
- **Aged AR is FIFO over AR `JournalLine`s per `contactId`**
  (`gl-reports.service.ts` `agedReceivables()`).
- **The till's offline path** (`apps/pos` `till/page.tsx`, `outbox-sync.ts`,
  `packages/pos-core/src/outbox.ts`) is a pure outbox state machine. It
  replays a client UUID as the doc-157 `Idempotency-Key` against
  `POST /admin/pos/shifts/:id/sales`. Four gaps:
  - **No occurred-at time.** `placeFromPos()` stamps `placedAt`, `paidAt` and
    `deliveredAt` with sync time.
  - **No replay after shift close.** `PosSalesService.sell()` refuses a
    non-OPEN shift, and neither `closeShift()` nor the close screen checks for
    queued sales. A sale queued offline and replayed after close is refused
    on every retry, breaking R5 ("a sale that already happened is never
    rejected by sync").
  - **A 7-day key window.** `IdempotencyKey` rows are purged after 7 days
    (`idempotency.cron.ts`).
  - **No offline catalogue.** The till's product lookup is an online search
    (`pos-catalog.service.ts`).
- `PosTerminalsService.verifyDeviceKey()` exists, but nothing calls it.
- **`RefreshToken` has per-sign-in families** (WO-206.3), so one phone's
  sign-in can be revoked as a family. `AuthService.revokeFamily()` is private
  today.
- **`apps/mobile` is the Expo customer app.** It already hosts one staff
  surface (the tailor workshop queue), but has no location, background-task
  or local-database dependency.
- Docs 52 and 91 ruled that staff mobile self-service is an installable PWA,
  not a third native stack.
- **`computeOrderTotals()` and `evaluateDiscounts()` are pure functions in
  `packages/shared`.** `promotions` already expresses
  `BUY_X_GET_Y` scoped by `customerSegmentId`.
- **`orders.place()` is cart- and storefront-shaped:** cart token, buyer
  user, courier quote by city.
- `AttendanceEvent` is the existing precedent for a device-originated,
  offline-safe record: a client `occurredAt` plus timezone, an `externalRef`
  idempotency key, and monthly partitions.

### Options Considered

**A. Packaging**

- **A1. A sector pack (`distribution`).** Rejected:
  - `module-packs.ts`'s own test: "a pack exists only where a vertical owns
    genuine domain data that core cannot express — a drug schedule, a vehicle
    tree, an ISBN". Routes, visits, collections, van stock and GPS points
    describe _how_ a business sells, not _what it sells_.
  - The mechanics are identical for pharma medical reps, apparel wholesale
    reps, beverages, building materials and agri-inputs, which is the
    "ten sectors × eight models = eighty packs" failure `MULTI-SECTOR.md`
    names.
  - The coordinator's intuition is right that an FMCG distributor is a
    different kind of business from a grocery retailer. In this taxonomy
    that difference is the _business model_ axis (B2B route-to-market, on
    credit, through a field force), which is exactly what core capability
    modules exist for.
- **A2. Fold into `pos`** (a rep as a mobile terminal and shift). Rejected:
  - The actor, customer, location, credit and visit context all differ
    (doc 245 §3).
  - A pure distributor with no stores would have to enable `pos` and its till
    surface to sell from a van.
- **A3. Fold collections into `fieldsales`.** Rejected. AR is `receivables`',
  and a head-office cheque receipt needs the identical receipt.
- **A4. One module including GPS tracking.** Rejected. Tracking is
  high-volume personal data whose lawful use differs by jurisdiction, so a
  deployment must be able to switch it off entirely and keep field sales.
- **A5. Two new core modules, `fieldsales` and `fieldtracking`, plus a
  `CustomerReceipt` capability in `receivables` (chosen).**

**B. Offline sync**

- **B1. Make each phone a node** (`core/replication`). Rejected:
  - A phone cannot run the image or hold the schema (R1).
  - It must hold only its route's slice of data.
  - 500 reps would mean 500 nodes.
- **B2. Reuse `pos`'s endpoints and shift as they are.** Rejected for the A2
  reasons and the four gaps above.
- **B3. A bespoke field sync protocol.** Rejected: it would duplicate the
  till's working pattern.
- **B4. Generalise the till's pattern as a ruling (R31), fix its gaps once for
  every device, and add the one genuinely new piece, a scoped down-sync
  (snapshot plus cursor) (chosen).**

**C. Field app surface** (a recommendation; the owner decides, OD-F1)

- **C1. A PWA, as with `apps/pos`.** Offline booking works, but a browser
  cannot record location in the background, so there would be no
  breadcrumbs.
- **C2. A new native app.** Rejected: a third stack, which doc 52 already
  refused.
- **C3. A staff "field" mode in the existing Expo `apps/mobile`
  (recommended).** It is not a new stack, since it already hosts a staff
  surface. It needs three dependency decisions (location, background tasks,
  a local database).

### Decision

**A.**

- **No pack. `fieldsales`** (core) owns:
  - sales territories, routes, route stops and assignments;
  - field outlets (outlet geolocation, proposals, verification);
  - field days, with cash custody and settlement;
  - visits;
  - booking and collection inboxes;
  - van sales;
  - rollups;
  - the device snapshot feed.
- **`fieldtracking`** (core) owns consent records, tracking policy versions,
  tracking sessions, track points, last position and day route summaries.
  It is independent of `fieldsales`. The app starts and stops a tracking
  session when the rep opens and closes their field day, so delivery riders
  or service staff can use it later.
- **`receivables` gains `CustomerReceipt` and `ReceiptAllocation`:**
  - any-channel AR receipts;
  - FIFO allocation by default, matching the GL aging;
  - unallocated credit;
  - cheque receipts whose instrument is a treasury `Cheque` (ADR-090) and
    which post only on clearance.

  `CustomerReceipt` is the single writer of what a customer paid on account,
  which is the hand-over contract doc 249 §3 already states.

- **One sector door stays open:** a `VisitActivityRegistry` extension point,
  so a future pack can add sector-specific visit data (for example pharma
  sample accountability or FMCG shelf audits) without editing core.

**B. Proposed ruling R31** for `RETAIL-ERP.md`. The owner decides; this work
does not edit that file. Text in doc 245 §4:

- A device is not a node.
- It writes to one node's API with a client id on every record, which lands
  in a permanent domain-keyed inbox.
- It carries `occurredAt` and its timezone.
- It is accepted even after its session closed: late is flagged, never
  refused.
- It holds only a scoped, read-only snapshot delivered by cursor.

Two first fixes follow:

- **WO-245.1** fixes the till's R5 replay defect and missing occurred-at time.
- **WO-245.2** moves the outbox state machine to `packages/shared`, so the
  till and the rep app share one implementation.

**Device identity is the refresh-token sign-in family, not a new credential
table.** This avoids a fourth copy of the `PosTerminal` / `AttendanceDevice` /
`RfidReader` credential pattern.

**C.** C3 is recommended, as open decision OD-F1.

**Couplings.** At most one new `KNOWN_MODULE_COUPLINGS` entry:
`fieldsales -> crm`. Approving an outlet proposal creates the `Contact` and
the `FieldOutlet` in one transaction (the `support -> crm` precedent).

Bookings and van sales enter `orders` through order intake. That is doc 236's
OD-3, now a hard prerequisite, with field booking as its fifth caller. If the
owner rejects OD-3, the fallback is a `fieldsales -> orders` channel entry
(the `accounts -> orders` precedent).

Everything else is a domain event or a read-only read:

- collections → `receivables`;
- receipt allocations → `payments` (settles the pending payment without a
  second posting);
- day settlement → `accounting`.

### Reasoning

- **A.** The three-part test from ADR-088 passes for each new module (doc 245
  §2):
  - _A deployment wants it without the alternative._
    - A distributor wants field sales without `pos`.
    - A store chain wants `pos` without field sales.
    - A privacy-constrained deployment wants field sales without tracking.
    - A courier fleet wants tracking without field sales.
  - _The actors differ:_ order booker, van salesman, depot cashier and
    territory supervisor, versus cashier and picker.
  - _Every flow is an event, a read-only read or order intake._

  Collections live in `receivables` because "what does this customer owe" has
  one writer.

- **B.** The till's shape is right and only its gaps are wrong. Fixing the
  gaps once, as a ruling, makes the till, warehouse handhelds (doc 237), plant
  tablets (doc 242), RFID readers (doc 244) and rep phones consistent.

  Permanent domain keys remove the 7-day replay window. Accepting late
  records honours R5 and canonical Ruling 2. The down-sync is the only
  missing piece: replication is node-level, and the till looks products up
  online.

- **C.** Breadcrumbs are an explicit requirement, and only native background
  location delivers them. Doc 52's PWA ruling concerned self-service screens
  with no background need, so this is new evidence for one actor, not a
  reversal of doc 52.

### Consequences

- **Benefits:**
  - Profile 5 composes from the same commit as profiles 1–4. A company can be
    a distributor and a manufacturer at once.
  - A Solo shop sees none of it.
  - Turning off `fieldtracking` removes every breadcrumb, with field sales
    unaffected.
  - The till's R5 defect is fixed as a side effect.
- **Costs:**
  - Two modules and 23 new tables:
    - 15 in `fieldsales` (doc 246);
    - 6 in `fieldtracking` (doc 247);
    - `CustomerReceipt` / `ReceiptAllocation` in `receivables` (doc 248).
  - 14 new permission keys:
    - 7 `fieldsales.*`;
    - 3 `fieldtracking.*`;
    - 4 `receivables.receipts.*`.
  - **No new chart account.** Field cash is a treasury account dimension
    (ADR-090), and over/short uses doc 250's `5820`.
  - One additive `OrderChannel.FIELD`, `LocationType.VEHICLE` and a `field`
    payment provider.
  - Two additive amendments requested of treasury (doc 248 §2):
    `TreasuryAccount.custodianUserId` and a `ChequeReceived` event.
  - Three dependency decisions for the app (OD-F1).
  - Track points reach ~850 per rep per day; at 1,000 reps that is ~22 M rows
    a month over 26 working days. Monthly partitions and a retention purge
    handle it, and the retention figure needs legal verification (doc 247
    §4).
- **Open decisions** OD-F1 to OD-F8 are in doc 245 §8.
- **Needs verification, never invented** (doc 245 §9):
  - employee-tracking law and retention per jurisdiction;
  - Google Play and App Store background-location policies at build time;
  - fiscal or tax-invoice rules for van sales;
  - whether a collection slip is a regulated document;
  - the legality of recovering cash shortages from wages;
  - which "efficiency" metric the owner wants as the headline.

### Parameters

Exact values with reasoning are in each brief. These decide behaviour under
load, attack or disconnection:

| Parameter                      | Value                                                                                                                         | Applies to                    | Brief |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----- |
| Snapshot age ceiling           | 24 h, after which a booking with any price or credit delta goes to review                                                     | booking apply                 | 246   |
| Device new-booking refusal     | 72 h since the last successful up-sync, or 1,000 unsynced records; collections are never refused on the device                | rep app                       | 246   |
| Up-sync batch                  | 25 records per request, ≤ 100 KiB (the platform JSON limit)                                                                   | `POST /field/sync/up`         | 246   |
| Down-sync page                 | 500 rows, keyset cursor; full snapshot if the cursor is older than 7 days                                                     | `GET /field/sync/down`        | 246   |
| Field sync rate limit          | 120 requests / 60 s per user                                                                                                  | field sync routes             | 246   |
| Check-in geofence              | 100 m plus the fix's reported accuracy, capped at 250 m; outside it the visit is recorded and flagged `OFF_SITE`              | visits                        | 246   |
| Server booking acknowledgement | p95 ≤ 300 ms (one insert); apply to an order p95 ≤ 10 s after storage. Server-side only; network time is not ours to promise. | booking ingest                | 246   |
| Track capture                  | record at ≥ 50 m moved, else every 300 s stationary, never more than every 30 s; upload every 120 s                           | rep app                       | 247   |
| Track upload batch             | 1,000 points per request                                                                                                      | `POST /field/tracking/points` | 247   |
| Live map refresh               | poll every 30 s (no WebSocket, ADR-054)                                                                                       | supervisor map                | 247   |
| Track point retention          | 90 days, then purged and summarised. **Default pending legal verification.**                                                  | `TrackPoint`                  | 247   |
| Tracking session hard stop     | 14 h                                                                                                                          | `TrackingSession`             | 247   |

### Status

Proposed (2026-10-04). Nothing built. Decisions A–C await the owner's
approval of doc 245. OD-F1 to OD-F8 await the owner individually.

**Correction (2026-10-05), while writing docs 247 and 248.** As first
committed, this entry and doc 246 §3 introduced chart accounts `1050` Cash
with Field Staff and `5710` Cash Over/Short. ADR-090 (treasury, written in
parallel) already uses `1050` for Cash in Transit and `5820` for Cash
Over/Short. `Account.code` is unique, so both could not ship. Corrected as
follows:

- A rep's cash is a treasury `CASH_BOX` (a `JournalLine.treasuryAccountId`
  dimension on `1000`), and shortages use `5820`.
- Cheques go through treasury's instrument.
- The cost counts above are recounted from the finished schemas: 23 tables
  and 14 permission keys, not 22 and 13.

No decision in A–C changed.
