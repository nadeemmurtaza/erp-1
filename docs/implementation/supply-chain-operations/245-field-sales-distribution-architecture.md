# 245 — Field sales and distribution: a capability, not a pack; a device is not a node

> **Status: Planned (2026-10-04). Nothing built.** Decision record:
> [ADR-089](../decisions/ADR-089-field-sales-is-a-capability-not-a-sector-pack-a-device-is-not-a-node.md)
> (Proposed). This is the fifth customer profile of the program started in
> [doc 236](./236-supply-chain-operations-architecture.md), confirmed by the owner
> on 2026-10-04. Capability briefs:
> [246 `fieldsales`](./246-field-sales.md),
> [247 `fieldtracking`](./247-field-tracking.md),
> [248 customer receipts](./248-customer-receipts-allocation.md). Where this
> brief proposes a change to `RETAIL-ERP.md` (R31, §4), it is **proposed, not
> made**.

## 1. Objective and the source material

A distributor (or a manufacturer, an apparel brand selling wholesale, a pharma
company with medical reps) sells to many small businesses through a field
force:

- **Order bookers** (pre-sell) visit outlets on a planned route and take
  orders for later delivery.
- **Van salesmen** (ready stock) sell from the vehicle and hand the goods over
  on the spot.
- **Both** collect cash against what the outlet owes.

Supervisors see where their reps are and have been. Head office sees, per
rep, route, team and day:

- visits, orders and order value;
- money collected;
- outlets served;
- an efficiency measure.

**Everything a rep does works offline** and syncs when connectivity returns.

The owner's reference material was screenshots of a competitor's
distributor app. It is treated as an illustration of the shape, not a
specification. In particular:

- the "orders sync in 0.8 seconds" claim is advertising copy, not a service
  level;
- the "efficiency" figure on its dashboard is undefined.

Section 6 gives this design's own measurable definitions instead.

## 2. Pack or capability? The test, applied

**Decision: a capability. Two new `core` modules (`fieldsales`,
`fieldtracking`) plus a receipt capability in `receivables`. No sector pack.**

The coordinator's case for a pack deserves a straight answer: "an FMCG
distributor and a grocery retailer are arguably different kinds of business,
not just different scale." They are. But `MULTI-SECTOR.md` already splits
"kind of business" into two axes:

- A **sector** changes *what a product is* (its data shape). A pack exists,
  in `module-packs.ts`'s own words, "only where a vertical owns genuine domain
  data that core cannot express — a drug schedule, a vehicle tree, an ISBN."
- A **business model** changes *who trades with whom, on what terms*, and
  "cuts across every sector". It is a capability module in core.

An FMCG distributor sells the same biscuit a grocer sells. What differs is
the route to market: B2B, to many small accounts, on credit, through people
who travel to them. That is the business-model axis. The test
`MULTI-SECTOR.md` uses for D2C settles it. Take the mechanics needed here
(routes, visits, offline booking, van stock, collections, GPS) and ask which
change for:

- a pharma company's medical reps visiting pharmacies;
- an apparel brand's wholesale reps visiting boutiques;
- a beverage distributor;
- an agri-inputs dealer network.

**None change. Only the products differ.** A `distribution` pack would force
an apparel brand to enable a pack named for another sector, or would need a
copy per sector. That is the "ten sectors × eight models = eighty packs"
failure the taxonomy exists to prevent.

Where field work does own sector-specific domain data, it plugs in through
an extension point and never edits core. Two examples:

- pharma: samples handed to a doctor, with their regulated accountability;
- FMCG: shelf-share and planogram audits.

`fieldsales` exposes a `VisitActivityRegistry` (doc 246 §2) that a pack
registers into. If such a pack is ever built, *that* is the sector pack, and
it sits on top of a core capability.

**The three-part test** (the same one ADR-088 applied to its eight modules):

| Test | `fieldsales` | `fieldtracking` | `receivables` receipt |
|---|---|---|---|
| Some deployment wants it without the alternative | A distributor wants field sales and no `pos`, stores or WMS. A store chain wants `pos` and no field sales. A manufacturer (profile 4) wants field sales beside `bom`. | A privacy-constrained deployment (where tracking employees needs consent, notice or co-determination) wants field sales **without** tracking. A courier or service fleet wants tracking without field sales. | A head-office counter receiving a customer's cheque needs the identical receipt, with no field force at all |
| The actors differ | Order booker, van salesman, depot cashier settling the day, territory supervisor. None of them is a cashier at a fixed till or a warehouse picker. | The tracked worker, and the supervisor viewing a map. A privacy officer sets retention. | Finance clerk, credit controller |
| Every cross-module flow is an event, a read-only read or order intake | Bookings and van sales enter `orders` through order intake (doc 236 OD-3). Collections → `receivables` by event. Outlet creation → `crm` in one transaction (one coupling, the `support -> crm` precedent). Prices, discounts, credit and stock are read-only reads for the device snapshot. | Writes only its own tables. The app starts and stops a session when the rep's day opens and closes, so it has no server-side dependency on `fieldsales`. | Posts by event. Settles pending payments by event. Reads orders read-only for allocation. |

**Why `fieldtracking` is its own module and not part of `fieldsales`.**
Location breadcrumbs are high-volume personal data, and whether, when and for
how long an employer may keep them differs by jurisdiction (§9). The only
honest way to let a deployment comply where tracking is restricted is to let
it remove tracking entirely through `MODULES`, while field sales keeps
working. A visit's single check-in position is `fieldsales` data, with its
own switch (`fieldsales.visit_geostamp`, doc 246).

**Why receipts are `receivables`', not `fieldsales`'.** "What does this
customer owe, and what has it paid" has one writer. Today it has no receipt
at all: `Payment.orderId` is required, and on-account orders settle one whole
`Payment` per order (`account.provider.ts`). That is a core AR gap any
channel hits, so it gets a core fix (doc 248). The field app is one caller.

## 3. Does this overlap `pos`? In shape, not in actor

A rep's phone can look like a mobile till. Verified against `pos.prisma`,
`pos-sales.service.ts` and `orders.service.ts` `placeFromPos()`:

| Concern | `pos` today | Field rep | Verdict |
|---|---|---|---|
| Device identity | `PosTerminal.deviceKeyHash`, but `verifyDeviceKey()` has **no caller**; the till syncs under the user's JWT | One phone per rep | Reuse neither table. A phone is a **refresh-token sign-in family** (`RefreshToken.familyId`, WO-206.3), revocable as one, which avoids a fourth copy of the device-credential pattern |
| Custody window | `PosShift`: terminal, opening float, cash movements, closing count | The rep's day: van change float, collections, cheques, deposit at the depot | **Same shape, separate table** (`FieldDay`). The custody belongs to a person and an optional vehicle, not a fixed terminal, and `pos` must stay absent for a distributor with no tills. |
| Sale semantics | `placeFromPos()`: DELIVERED now, `postUnconditional()` at the till's location, cash `Payment` PAID | Van sale: goods handed over now at the van's `Location`, often **on credit** to a known outlet. Pre-sell booking: a **request** for later delivery from a depot. | `placeFromPos()`'s "handed over" semantics are right for van sales, but it has no `contactId` and no on-account tender. **Generalise through order intake** (OD-3) with two modes, `HANDED_OVER` and `BOOKED`. `placeFromPos()` becomes intake's first caller rather than a second copy. |
| Customer | A guest name and phone | A known `Contact` with credit terms, an outstanding balance and a route slot | Different |
| Context | A counter | A planned stop on a route, geo-stamped, with a "no order" reason when nothing is sold | No `pos` equivalent |
| Collections against AR | None | Core of the job | No `pos` equivalent (doc 248) |
| Offline outbox | `packages/pos-core` `outbox.ts` (pure) | Same need | **Reuse the code** (moved to `packages/shared`, WO-245.2) |

**Defects found in `pos` while checking.** These must be fixed before a
second device type depends on the same pattern:

1. **A replayed offline sale is refused forever once its shift has closed.**
   - `PosSalesService.sell()` throws for a non-OPEN shift.
   - Neither `PosShiftsService.closeShift()` nor `apps/pos`'s close screen
     checks for queued sales.
   - `outbox-sync.ts` turns that refusal into a FAILED entry that fails the
     same way on every retry.

   This contradicts R5, "a sale that already happened is never rejected by
   sync". The likely path: the till goes offline, sales queue, the
   connection returns, and the cashier opens the close screen before the
   till screen's sync runs.
2. **A replayed offline sale carries no time of sale.** `placedAt`, `paidAt`
   and `deliveredAt` take the sync time. A sale made at 21:50 and synced at
   09:10 lands in the next day's figures and the next shift's period. R15's
   late-fact rule ("posts … with its original `occurredAt` retained") has
   nothing to retain.

WO-245.1 fixes both.

## 4. Does the existing sync give us offline booking? Mostly, once fixed. Plus one new piece.

**`core/replication` is the wrong primitive for a phone.** It moves rows
between **nodes**: deployments running the full schema in their own
Postgres. A phone:

- cannot run the image (R1);
- must hold only its rep's slice: ~300 outlets, their prices and balances,
  not the brand's customer base;
- at 500 reps, would make 500 nodes.

A rep's records land in **the node the rep belongs to**, as that node's own
facts. Orders and journal lines then replicate up through `core/replication`
like any others. Two layers, exactly as the till already has: device → node,
then node → parent.

**The till's device → node pattern is the right primitive, with its gaps
fixed.** What it lacks, and how this program fixes it once for every device
type (till, warehouse handheld doc 237, plant tablet doc 242, RFID reader
doc 244, rep phone):

| Gap in the till's pattern | Fix |
|---|---|
| No occurred-at time | Every device-originated record carries `occurredAt` (UTC) and `timezone` (IANA), as `AttendanceEvent` already does |
| A replay into a closed session is refused | Accepted and flagged `LATE`; the closed session (shift or field day) shows it as a late item for review. Never refused. |
| The idempotency key expires after 7 days (`idempotency.cron.ts`) | Field records are stored first in **domain-keyed inboxes** (`@unique` on the client id, kept permanently), the `PartnerFactInbox` / `AttendanceEvent.externalRef` pattern, rather than relying on the generic, time-limited `Idempotency-Key`. A device offline longer than a week still cannot double-post. |
| No offline reference data (the till looks products up online) | **New:** a scoped down-sync, a snapshot plus keyset cursor per signed-in rep (doc 246 §4). Neither the till nor replication has one. |
| One HTTP call per queued record | A batch endpoint with a per-record result. The outbox state machine is unchanged; only the transport batches. |
| Head office cannot see what a device still holds | A device heartbeat reports queue depth and the age of the oldest unsynced record |

**Proposed ruling R31**, for insertion after R30 (doc 236 §3) in
`RETAIL-ERP.md`, if the owner approves (OD-F7):

> **R31. A device is not a node.** A till, a warehouse handheld, a plant
> tablet, an RFID reader or a field rep's phone writes to exactly one node's
> API, over HTTPS, with a client-generated id on every record it originates.
> It holds only a scoped, read-only snapshot of policy, delivered by cursor.
> It is never registered with `ReplicationRegistry` and never holds the
> schema. What it originates is stored first in a domain-keyed inbox (unique
> on the client id, permanent — never a time-limited key) and carries the
> instant it happened and its timezone. It is accepted even when the session
> it belongs to (a shift, a field day) has already closed: a late record is
> flagged, never refused (R5). Its facts reach the tiers above as the node's
> own registered facts.

## 5. Profile 5 as a `MODULES` preset

Documentation only, like doc 236 §7. No code reads a profile name.

```bash
# Profile 5 — FMCG distributor: pre-sell booking, van sales, collections, tracking
MODULES=catalog,orders,payments,inventory,purchasing,crm,accounting,receivables,accounts,pricing,promotions,fulfilment,transfers,fieldsales,fieldtracking,tax

# … with a multi-depot network and a bin-managed main depot: add orderrouting,supplynetwork,warehouse
# … where tracking employees is restricted: remove fieldtracking — nothing else changes
# … a manufacturer with its own sales force: profile 4 ∪ profile 5
```

`accounts` is in the preset because credit outlets settle "on account"
through the existing `AccountProvider`, which requires a `B2BAccount`.

## 6. Efficiency: what is measured, and how

The competitor's "efficiency" is undefined, so this design does not imitate
it. These are the standard field-sales measures, each computed from stored
rows and each clickable to them (doc 246 §6):

| Measure | Definition |
|---|---|
| Planned calls | Route stops scheduled for that rep on that day |
| Coverage | Planned outlets visited ÷ planned calls |
| Productive calls | Visits with at least one booked or van-sold line |
| Strike rate | Productive calls ÷ visits |
| Lines per call | Order lines ÷ productive calls |
| Drop size | Order value ÷ productive calls |
| Collection | Σ field receipts recorded on the day |
| Time in market | First check-in to last check-out |
| Time per stop | Mean of check-out − check-in |
| Off-site check-ins | Visits whose position was outside the outlet's geofence |

Which one is the headline "efficiency" tile is the owner's choice (OD-F6).
None is a composite score invented here.

## 7. Roadmap — Tranche F

One work order = one branch = one PR. Order of dependency:

```
F0 ── 248 (receipts) ── 246.1–246.8 (fieldsales) ── 246.9 (rep app)
  \── 247.1–247.3 (fieldtracking) ─────────────── 247.4 (background capture)
                                       246.10 (own-fleet delivery runs) — sequenced
```

**F0 — the floor.** Each item fixes a found defect or unblocks every device
type.

- `WO-245.1` **The till's offline replay.**
  - `apps/pos` sends `occurredAt` and `timezone` with every sale.
  - `placeFromPos()` uses them for `placedAt`, `paidAt` and `deliveredAt`
    (bounded: never in the future, never earlier than the shift's
    `openedAt`).
  - `PosSalesService.sell()` accepts a replay into a CLOSED shift whose
    `openedAt ≤ occurredAt ≤ closedAt`, flagging it `lateAfterClose`.
  - The Z-report lists late sales.
  - The close screen syncs the outbox before submitting and warns if entries
    remain.

  Acceptance: a sale queued, then the shift closed, then the sale synced,
  produces exactly one order dated at its sale time.
- `WO-245.2` **One outbox.** `packages/pos-core/src/outbox.ts` moves to
  `packages/shared/src/offline/outbox.ts`, with `syncedOrderId` generalised
  to `syncedRef`. `pos-core` re-exports it, and the till's behaviour is
  byte-identical (its spec suite passes unchanged).
- `WO-236.7` **Order intake** (doc 236 OD-3), with modes `HANDED_OVER`
  (record: `postUnconditional()`, DELIVERED) and `BOOKED` (request: guarded
  commit at the fulfilling location, or backorder under
  `checkout.allow_backorder`), plus `OrderChannel.FIELD` (additive).
  `placeFromPos()` becomes a caller.
- `WO-245.3` `LocationType.VEHICLE` (additive, not promisable under
  WO-236.2's predicate). If WO-236.2 has not shipped, it is folded into that
  migration.
- `WO-245.4` A public `AuthService.revokeSignInFamily(familyId, actorId)` in
  `core/auth`, wrapping the existing private `revokeFamily()`, audited
  evidence-class. This is how a lost phone is cut off.

**Then:** doc 248 (`WO-248.1`–`248.4`) → doc 246 (`WO-246.1`–`246.9`) and
doc 247 (`WO-247.1`–`247.4`). `WO-246.10` (own-fleet delivery runs) is
sequenced. Until it is built, a pre-sell order is delivered through
`fulfilment`'s existing manual courier flow, and the driver's cash comes in
as a receipt at the depot (doc 248). The transaction is complete without it.

## 8. Open decisions for the owner

Each has a recommendation.

**OD-F1 — the rep app surface.**

- **Recommendation:** a staff "field" mode in the existing Expo
  `apps/mobile`. It already switches a tailor to a staff queue, so this is
  not a new stack.
- **Why not a PWA:** an `apps/pos`-style PWA can book offline but cannot
  record location in the background, because browsers suspend it. With a
  PWA, `fieldtracking` degrades to positions captured only while the app is
  open.
- **Dependencies:** native background tracking needs three, each answered
  under `.claude/rules/dependencies.md` in its work order:
  - a location API;
  - a background task runner;
  - an on-device database for ~300 outlets and the catalogue
    (`AsyncStorage` is unsuited).
- **Relation to doc 52:** doc 52/91's PWA ruling covered self-service
  screens with no background need and stays as it is.

**OD-F2 — tracking lawfulness.** Consent and notice wording, working-hours
limits and retention, per jurisdiction where the deployment operates. The
design ships the mechanisms (doc 247): consent records, a working-hours-only
session, retention purge, and access by permission. The owner, with legal
advice, sets the values.

**OD-F3 — cash shortages.**

- **Recommendation:** a shortage at day settlement is written off to `5710`
  only with a second person's approval.
- **Recovery from wages:** "recover from the rep" (Dr `1300` Employee
  Advances, deducted through `payroll`) ships **off**. Deducting from wages
  is regulated differently by country.

**OD-F4 — revenue timing for pre-sell bookings.** The same question as doc
236 OD-4. `OrderPlaced` posts revenue when booked, but delivery is usually
the next day. This is a call for the owner and their accountant.

**OD-F5 — order intake** (doc 236 OD-3) is now a hard prerequisite, with five
channels funnelling into `OrdersService`: POS, B2B accounts, EDI, field
booking and van sales, plus ADR-084's proposed hospitality sink. The
recommendation stands.

**OD-F6 — the headline efficiency measure** (§6).

**OD-F7 — approve R31.**

**OD-F8 — own-fleet delivery runs.**

- **Where they live:** recommend inside `fieldsales` when built (WO-246.10).
  They share its device, day and custody substrate.
- **Extraction trigger, written down now:** when a second non-sales field
  workflow is real (field service technicians, for example), the shared
  substrate (devices, days, custody, stops) moves into its own `fieldforce`
  module.

## 9. Needs verification — never invented here

1. **Employee location tracking law** where each deployment operates:
   lawful basis, consent or notice, working-hours limits, retention, and
   employee access rights. The 90-day retention default in doc 247 is an
   engineering placeholder that keeps the system from holding data forever.
   It is not a legal opinion.
2. **Google Play's background-location permission policy and Apple's review
   rules for "Always" location.** Both require declared justification and
   change over time. Check at build time, before WO-247.4.
3. **Tax-invoice and fiscal rules for van sales.** R18 already says an
   offline sale issues a receipt and the tax invoice is numbered on sync;
   whether a jurisdiction requires more is open (the `fiscal` module is
   absent, per `RETAIL-VERTICAL-COVERAGE-MATRIX.md`).
4. **Whether a field collection slip is a regulated document** (numbering,
   content) anywhere the product is sold.
5. **The legality of recovering cash or stock shortages from wages** (OD-F3).
6. **Real route sizes for the first customer.** The ~300 outlets per rep used
   for sizing is an illustration. The cap of 2,000 is a technical bound.
7. **The Bluetooth printer models reps actually carry**, before any
   on-device printing dependency is chosen.

## 10. Documents this changes (proposed, not made)

| Document | Amendment |
|---|---|
| `RETAIL-ERP.md` | Insert R31 (§4). Part 5 gains `fieldsales` and `fieldtracking`. |
| `MULTI-SECTOR.md` | Capability table gains both modules. The preset list gains profile 5. `KNOWN_MODULE_COUPLINGS` prose gains `fieldsales -> crm`. |
| Doc 236 | §7 gains the profile 5 preset. §12 gains Tranche F. OD-3 notes field booking as a caller. |
| `hr-people-org/52-staff-self-service-mobile-app.md` | A note that field reps use `apps/mobile` (OD-F1), and why that does not reverse doc 52 |
| `RETAIL-VERTICAL-COVERAGE-MATRIX.md` | Gains a profile 5 section |
| `docs/implementation/README.md` | The "Numbers 236–244" paragraph extends to 248 |
