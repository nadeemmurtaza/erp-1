# 237 — Warehouse management: sites, bins, tasks, waves, packing

> **Status: Planned (2026-10-04). Nothing built.** Architecture and rulings:
> [doc 236](./236-supply-chain-operations-architecture.md) (R29: a bin is a
> sub-ledger, not a `Location`). Decision record: ADR-088.

## Objective

A distribution center, or any stocked site that opts in, knows **where**
every unit is, down to the bin, and runs its work as tasks: receive,
put away, replenish, pick (discrete, batch, zone, in waves, along a walk
path), pack into SSCC-labelled cartons, load and ship. A site that does not
opt into bins can still pack and label cartons. A deployment without this
module is unchanged.

## Existing state (verified, 2026-10-04)

- `Location` is the finest stock granularity. `VariantLocationStock` is keyed
  `(variantId, locationId)`. `InventoryService.move()` is its only writer.
- Web and POS orders decrement location stock **at placement**
  (`orders.service.ts` ~L384), so location stock means _available_. Units
  for open orders are still physically on the shelf.
- `StockCount` and `SpotCheck` count whole locations. There is no bin, task,
  wave, carton or SSCC concept anywhere in the schema.
- `Lot`/`LotStock` show the sub-ledger pattern (ADR-069). `Location.code`'s
  comment documents the NULL-in-composite-unique trap this design must avoid.
- `apps/mobile` exists. `RETAIL-ERP.md` Part 6 says "Later: handheld
  receiving, stock count, price check."
- `fulfilment` owns courier shipments, labels via `CourierProvider`, and
  manifests. A `Shipment` records no ship-from location.
- `core/extension-points/employee-offboarding.registry.ts` exists for
  returning a leaver's open work.

## 1. The rule this module keeps

At a bin-managed site with `locationId = L`, for every variant `v`:

```
Σ BinStock(site, v)  =  VariantLocationStock(v, L)  +  OpenOutboundDemand(site, v)
```

**Outbound commitments hit the location ledger first, exactly as today.**
An order placement, a routing reassignment or a transfer dispatch decrements
`VariantLocationStock` the moment it is made. The units stay physically in
their bins as _open outbound demand_ until a pick-and-ship confirmation
removes them from the bin sub-ledger.

**Inbound arrives at the location ledger first, too.** A purchase receipt, a
transfer receipt, a return restock or a production receipt lands in the
site's receiving bin automatically, then moves by putaway.

No caller of `move()` changes behaviour. No new writer of location stock
exists.

**Two writers, two ledgers, no shared invariant writer:**

- `InventoryService.move()` writes location stock and publishes `StockMoved`
  (WO-236.1) in the same transaction.
- `warehouse` is the **only writer** of `BinStock`/`BinMovement`. It
  subscribes to `StockMoved` for movements at its sites and classifies each
  with a pure function:

| `StockMoved` at a WMS site                                                                                               | `classifyMovement()` outcome | Bin effect                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SALE`, `POS_SALE`, `TRANSFER_OUT`, `ADJUSTMENT` with `refType = 'Order'` and `delta < 0` (a routing commit)             | `DEMAND_OPEN`                | none yet; a `WarehouseDemandLine` opens                                                                                                                                                    |
| `CANCELLATION`; `ADJUSTMENT` with `refType = 'Order'` and `delta > 0` (a routing release)                                | `DEMAND_RELEASE`             | unpicked: the demand closes. Picked: a put-back task.                                                                                                                                      |
| `PURCHASE_RECEIPT`, `TRANSFER_IN`, `RETURN`, `PRODUCTION_RECEIPT`, positive `ADJUSTMENT`/`COUNT` with no order ref       | `INBOUND_UNPLACED`           | `+delta` into the site's receiving bin; a putaway task                                                                                                                                     |
| `DAMAGE`, `WRITE_OFF`, `PRODUCTION_CONSUMPTION`, negative `ADJUSTMENT`/`COUNT` with no order ref, `POS_OFFLINE_VARIANCE` | `PHYSICAL_REMOVAL`           | taken from the receiving bin, or the site's production-supply bin for consumption. If neither holds enough, a `BinVariance` opens ("stock left through a non-warehouse path; which bin?"). |

A movement the warehouse **itself** caused (a bin-count correction,
WO-237.5) is written in the same transaction as its `BinMovement`. The
later `StockMoved` for it is a no-op by `BinMovement.stockMovementId @unique`.

## 2. Schema — `apps/api/prisma/schema/warehouse.prisma` (new, hand-written forward-only migration)

All cross-module references are bare scalars (ADR-012). Every scope column
is NOT NULL (canonical Ruling 4).

```prisma
enum BinKind      { RECEIVING PICK_FACE RESERVE STAGING PACK DOCK RETURNS PRODUCTION_SUPPLY }
enum WarehouseTaskKind   { PUTAWAY PICK REPLENISH MOVE COUNT PUT_BACK }
enum WarehouseTaskStatus { OPEN ASSIGNED IN_PROGRESS DONE CANCELLED EXCEPTION }
enum BinMovementKind     { RECONCILE_IN RECONCILE_OUT PUTAWAY PICK REPLENISH MOVE SHIP COUNT_ADJUST PUT_BACK REVERSAL }

model WarehouseSite {            // 1:1 with an inventory Location that opted in
  id                    String  @id @default(cuid())
  locationId            String  @unique          // inventory Location (WAREHOUSE, STORE, PRODUCTION or QUALITY_HOLD)
  binManaged            Boolean @default(false)  // false = pack/SSCC/loads only
  receivingBinId        String?                  // required once binManaged (service-enforced)
  productionSupplyBinId String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
model WarehouseZone { id String @id @default(cuid()); siteId String; code String; name String; @@unique([siteId, code]) }
model Bin {
  id String @id @default(cuid())
  siteId String; zoneId String
  code String                     // "A-03-02-B" — unique per site, never globally (adoption test)
  kind BinKind
  walkSequence Int                // pick-path order; sequencePicks() sorts by it
  capacityUnits Int?              // null = unchecked
  isActive Boolean @default(true)
  @@unique([siteId, code])
  @@index([siteId, kind, isActive])
}
model BinStock {
  id String @id @default(cuid())
  siteId String; binId String; variantId String
  lotKey String @default("")      // "" = not lot-tracked. NOT NULL on purpose: a nullable lotId in the
                                   // unique below would let duplicates through (Location.code's own warning)
  quantity Int @default(0)        // predicate-on-write: never < 0 on the guarded path
  @@unique([binId, variantId, lotKey])
  @@index([siteId, variantId])
}
model BinMovement {               // append-only; partitioned by month on occurredAt (hand-written, ADR-046 precedent)
  id String @default(cuid())
  siteId String; variantId String; lotKey String @default("")
  fromBinId String?; toBinId String?
  quantity Int                    // > 0; direction is from → to
  kind BinMovementKind
  taskId String?; demandLineId String?
  stockMovementId String?         // the inventory movement this reconciles or causes
  clientConfirmationId String?    // UUID from the handheld — the retry key
  reversesMovementId String?
  actorId String?
  occurredAt DateTime             // when it happened on the floor (offline-safe)
  recordedAt DateTime @default(now())
  @@id([id, occurredAt])
  @@unique([stockMovementId, occurredAt])        // per-partition uniqueness; see WO-237.2 note
  @@unique([clientConfirmationId, occurredAt])
  @@index([siteId, variantId, occurredAt])
}
model WarehouseDemandLine {
  id String @id @default(cuid())
  siteId String; variantId String; lotKey String @default("")
  sourceType String               // "Order" | "StockTransfer" — the StockMoved refType
  sourceId String; openedByStockMovementId String @unique
  quantity Int; quantityPicked Int @default(0); quantityShipped Int @default(0)
  fulfilmentRequestId String?     // orderrouting, when on
  status String                   // OPEN | PICKING | PICKED | SHIPPED | RELEASED
  createdAt DateTime @default(now())
  @@index([siteId, status])
}
model WarehouseTask {
  id String @id @default(cuid())
  siteId String; kind WarehouseTaskKind; status WarehouseTaskStatus @default(OPEN)
  variantId String; lotKey String @default(""); quantity Int; quantityDone Int @default(0)
  fromBinId String?; toBinId String?; demandLineId String?; waveId String?
  ruleVersionId String?           // the putaway/replenishment rule version that generated it
  assignedToUserId String?; priority Int @default(100)
  createdAt DateTime @default(now()); startedAt DateTime?; completedAt DateTime?
  @@index([siteId, status, priority])
  @@index([assignedToUserId, status])
}
model PickWave { id String @id @default(cuid()); siteId String; number String @unique; status String; cutoffAt DateTime?; releasedAt DateTime?; releasedByUserId String? }
model WarehouseRuleVersion {      // putaway, replenishment and pick-strategy policy as data
  id String @id @default(cuid()); siteId String; kind String; version Int
  rules Json                      // validated by a zod schema in the module; effective-dated
  effectiveFrom DateTime; proposedByUserId String; activatedByUserId String?
  @@unique([siteId, kind, version])
}
model Carton {
  id String @id @default(cuid())
  siteId String
  sscc String @unique             // 18 digits, GS1 check digit
  status String                   // OPEN | CLOSED | LOADED | SHIPPED
  weightGrams Int?; loadId String?; shipmentId String?   // fulfilment Shipment, bare scalar
  createdAt DateTime @default(now()); closedAt DateTime?
  lines CartonLine[]
}
model CartonLine { id String @id @default(cuid()); cartonId String; demandLineId String; variantId String; lotKey String @default(""); quantity Int; carton Carton @relation(fields: [cartonId], references: [id]) }
model SsccSerialBlock {           // leased from the brand tier so two nodes never mint the same SSCC
  id String @id @default(cuid()); nodeId String; siteId String
  extensionDigit Int; fromSerial BigInt; toSerial BigInt; nextSerial BigInt
  @@unique([extensionDigit, fromSerial])
}
model ShipmentLoad { id String @id @default(cuid()); siteId String; number String @unique; dockBinId String?; carrierRef String?; status String; shippedAt DateTime?; shippedByUserId String? }
model BinVariance {
  id String @id @default(cuid())
  siteId String; binId String?; variantId String; lotKey String @default("")
  quantity Int                    // signed: + found, − missing
  cause String                    // NON_WMS_REMOVAL | COUNT | OFFLINE_OVERSHOOT | INVALID_CONFIRMATION
  stockMovementId String?; payload Json?
  countedByUserId String?
  status String @default("OPEN")  // OPEN | RESOLVED
  resolvedByUserId String?; secondResolverUserId String?; resolvedNote String?; resolvedAt DateTime?
  createdAt DateTime @default(now())
  @@index([siteId, status])
}
```

`Carton.number`, `PickWave.number` and `ShipmentLoad.number` come from
`documentNumber()` (node-prefixed). `SsccSerialBlock` exists because the
SSCC serial space is finite and shared by every site under one GS1 company
prefix. The prefix itself is the `Setting` `gs1.company_prefix`, one per
deployment (Br1).

## 3. Behaviour

- **Receiving** (handheld). Scan the PO, or the ASN when `edi` delivered one
  through `tradingpartners`. The screen calls `purchasing`'s existing receive
  endpoint, composed in the client, not by a module import. The resulting
  `StockMoved` puts units in the receiving bin, and `suggestPutaway()` (pure,
  over the active `WarehouseRuleVersion`) opens putaway tasks.
- **Putaway, replenishment, moves.** Each is a task with a from-bin and a
  to-bin. Confirmation writes one `BinMovement` and adjusts two `BinStock`
  rows in one transaction. The guarded path refuses a negative bin
  (predicate on write, House Rule 10).
- **Picking.**
  - Every `WarehouseDemandLine` becomes pick tasks. `planWave()` groups them
    by cutoff, zone and carrier.
  - `sequencePicks()` orders a picker's list by `Bin.walkSequence`.
  - A short pick (bin empty on arrival) records what was found, opens a
    `BinVariance`, and publishes `FulfilmentRequestStatusChanged{short}`
    through `orderrouting` when on, so the line can re-route (doc 238).
- **Packing.** Picked units go into an open `Carton` (SSCC minted from the
  site's block). Closing it prints a GS1-128 label through the existing
  label/print path. `ShipmentPacked` carries the shipment → carton → line
  hierarchy (`vendorcompliance` builds the 856 from it).
- **Ship confirm.** Loading cartons onto a `ShipmentLoad` and confirming it:
  - writes `SHIP` bin movements out of staging;
  - closes demand lines;
  - links cartons to `fulfilment`'s `Shipment` (created through the courier
    flow, unchanged);
  - publishes `WarehouseShipConfirmed`.

  Its consumers are `orderrouting` (request shipped), `vendorcompliance`
  (ship time for the ASN and OTIF) and `transfers` (records
  `StockTransfer.physicallyShippedAt`, one additive column, so in-transit
  age is measured from the truck, not the commitment).

- **Bin counts.** A count task freezes `expected` from `BinStock`.
  Resolution of a variance corrects `BinStock` and posts the location-level
  `COUNT` movement through `InventoryService.move()` in **one transaction**.
  This is the `warehouse -> inventory` coupling.
- **Site without bins** (`binManaged = false`). Pick lists come from demand
  lines with no bins. Packing, SSCC, loads and ship-confirm work as above.
  No `BinStock` rows exist.

## 4. Parameters (exact)

| Parameter                  | Value                                                                | Why this number                                                                                                                                                                                                             | Enforced in                    | On failure                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handheld offline ceiling   | **500 queued confirmations or 4 h** since last sync, whichever first | Canonical Ruling 2 requires a number. 4 h is the outage this repo plans for ("four hours down"). 500 is about four hours of a fast picker at ~120 confirmations an hour, so the two limits bind at roughly the same moment. | `apps/mobile` warehouse client | Device stops accepting new confirmations and says "reconnect to continue". Already-queued confirmations are always accepted by the server (they are records). |
| Reconciliation lag alert   | `StockMoved` at a WMS site unreconciled after **5 min**              | The outbox polls every 2 s; normal lag is seconds. Five minutes means the subscriber is failing, not slow.                                                                                                                  | `WarehouseReconcileCron`       | Alert to `warehouse.manage` holders of that site                                                                                                              |
| Wave size cap              | **300 demand lines** (`Setting` `warehouse.wave_max_lines`)          | Keeps wave release in one transaction under ~1 s on the bench fixture, and a printed pick list under ~10 pages                                                                                                              | `planWave()`                   | Remaining lines roll to the next wave                                                                                                                         |
| `BinMovement` partitioning | **monthly on `occurredAt`, from the first migration**                | A profile-2 DC at 20,000 order lines a day is ~80,000 bin movements a day (receive, put away, pick, ship), ~29 M a year, already past the size at which ADR-046 partitioned `AttendanceEvent`                               | hand-written migration         | n/a                                                                                                                                                           |
| List page size             | **50** rows, keyset on `(priority, createdAt, id)`                   | The task board must never be unbounded (performance rule)                                                                                                                                                                   | controllers                    | n/a                                                                                                                                                           |

## 5. Work orders

Each ships backend, the minimum screen, a nav entry
(`nav-registry.ts`, gated by `warehouse` and its permission), permission
grants in `ROLE_PERMISSION_SEED`, and tests. Each screen gets a `/ux-design`
brief before its first JSX.

- **WO-237.1 — Sites, zones, bins.** Schema, `/admin/warehouse/sites`
  (site → zones → bins, bulk bin import from CSV, bin label print),
  `binManaged` toggle with the guard in the Authority lenses. Permissions
  `warehouse.view`, `warehouse.manage`. Registry, `MODULE_PACKS` (`core`) and
  `offByDefault` lines.
- **WO-237.2 — The bin sub-ledger.** `BinStock`, `BinMovement`,
  `WarehouseDemandLine`, the `StockMoved` subscriber, `classifyMovement()`
  (pure, table-tested against every `StockMovementReason`), the
  `BinVariance` queue at `/admin/warehouse/variances`, and the reconciliation
  read at `/admin/warehouse/sites/:id/reconciliation` (§1's equation,
  per variant, with each delta explained). Needs WO-236.1. Note: Postgres
  enforces a unique index on a partitioned table only if it includes the
  partition key. The idempotency keys therefore also carry `occurredAt`,
  which every redelivery carries unchanged, so they still make the second
  copy a no-op.
- **WO-237.3 — Receiving and directed putaway.** Handheld receive (calls
  `purchasing`'s endpoint), `suggestPutaway()`, putaway tasks,
  `WarehouseRuleVersion` editor with propose/activate by two different
  users.
- **WO-237.4 — Picking and waves.** Demand → tasks, discrete, batch and zone
  strategies (data), `planWave()`, `sequencePicks()`, short-pick handling,
  `/admin/warehouse/waves` and the handheld pick flow. Permission
  `warehouse.operate`.
- **WO-237.5 — Replenishment and bin counts.** Min/max per (bin, variant) in
  rule data. Count tasks with frozen expected. Variance resolution with the
  second-resolver band and the same-transaction location `COUNT` movement.
  Adds `warehouse -> inventory` to `KNOWN_MODULE_COUPLINGS` with its
  justification. Permission `warehouse.variance.resolve`.
- **WO-237.6 — Packing, SSCC and shipping.** `Carton`, `CartonLine`,
  `SsccSerialBlock` (leasing endpoint on the brand tier, a local block on
  STANDALONE), GS1 check-digit function in `packages/shared`, label print,
  `ShipmentLoad`, ship-confirm, the `ShipmentPacked` and
  `WarehouseShipConfirmed` events, `StockTransfer.physicallyShippedAt`.
- **WO-237.7 — Offline handheld and the labour read-model.** Queued
  confirmations with the §4 ceiling. Server `recordOfflineConfirmation()`
  (unconditional, a separately named method, the R5 precedent) opening an
  `OFFLINE_OVERSHOOT` variance when a bin would go negative. Tasks-per-hour
  per user (read-only, no ranking of people on any screen).

## 6. Files likely affected

`apps/api/prisma/schema/warehouse.prisma` (+ migration);
`apps/api/src/modules/supply-chain/warehouse/*`; `modules.registry.ts`;
`module-packs.ts`; `scripts/check-module-boundaries.mjs` (one entry);
`core/events/domain-events.ts` (`ShipmentPacked`, `WarehouseShipConfirmed`,
`BinVarianceRaised`); `transfers.prisma` (one column);
`packages/shared/src/permissions.ts`; `packages/shared` (GS1 check digit);
`apps/web/src/app/admin/warehouse/*`; `nav-registry.ts`;
`apps/mobile` (warehouse flows).

## 7. Dependencies reused

`InventoryService.move()`, `StockMoved` (WO-236.1),
`PurchasingService.receiveGoods()` (via its endpoint), `fulfilment`'s
`Shipment` and `CourierProvider`, `documentNumber()`, `Setting`,
`AuditService`, `PermissionsResolverService.usersWithPermission()`,
`EmployeeOffboardingRegistry`, `LotAllocation` (to carry lots into bins).

## 8. Risks

- **Reconciliation drift** if a movement reason is added to
  `StockMovementReason` without a `classifyMovement()` row. Mitigation: the
  table test enumerates the Prisma enum and fails on an unclassified value.
- **`StockMoved` write amplification** (OD-7). Mitigation: measured in
  WO-236.1, with a named fallback.
- **A site switching `binManaged` off mid-life** would silently abandon bin
  truth. Mitigation: refused while any `BinStock.quantity ≠ 0`, unless a
  two-person "abandon bin tracking" action is used, audited evidence-class.

## 9. Acceptance criteria

1. With `warehouse` off, every existing inventory, orders, purchasing and
   transfers spec passes unchanged, and no warehouse route or nav entry
   exists.
2. After a randomised run of 5,000 mixed receipts, sales, cancellations,
   returns, transfers, adjustments and warehouse tasks at a bin-managed site,
   §1's equation holds for every variant. Every residual is either an OPEN
   `BinVariance` or an unreconciled movement younger than the lag window.
3. A redelivered `StockMoved` and a retried handheld confirmation each leave
   exactly one `BinMovement`.
4. A bin-count variance resolution moves `BinStock` and `VariantLocationStock`
   together or not at all (forced failure after the bin write rolls back
   both).
5. Two nodes minting SSCCs offline from their leased blocks produce zero
   collisions over 10,000 cartons each, and every SSCC passes the GS1 check
   digit.
6. A device that has been offline 4 h or holds 500 queued confirmations
   refuses a new one. On reconnect, every queued confirmation is accepted.
7. `pnpm lint && pnpm typecheck && pnpm test` pass, and the migration
   applies forward on a copy of production data.

## 10. Out of scope

Voice and pick-to-light; automated storage; engineered labour standards;
yard and dock-appointment management (doc 236 §14); slotting optimisation
beyond rule-driven putaway (a later read/recommendation in `planning`);
cross-docking as a distinct flow (receiving straight to staging is a putaway
rule today).

## Scope lenses

**0. The shop-scale five**

- The transaction, start to finish: receive (handheld → `purchasing` receive
  endpoint) → receiving bin (`StockMoved` reconcile) → putaway task → pick
  task → `Carton` → `ShipmentLoad` ship-confirm → `fulfilment` `Shipment`.
  Every step has a screen (WO-237.3–237.6).
- The other side of the same transaction: the supervisor's task board
  (`/admin/warehouse/tasks`, open tasks by zone and age), wave release
  (`/admin/warehouse/waves`), and the variance queue
  (`/admin/warehouse/variances`).
- What happens after "done": a return lands in a `RETURNS` bin through
  `StockMoved RETURN`. Cancellation of unpicked demand releases it.
  Picked-then-cancelled opens a `PUT_BACK` task. Shipped goods come back only
  as returns.
- The integrations a real business needs: label printers through the
  existing print path; HID scanners need nothing; carrier booking and labels
  through `fulfilment`'s `CourierProvider`; GS1-128 SSCC with a real
  company prefix (`gs1.company_prefix`).
- The policy layer: `WarehouseRuleVersion` (putaway, replenishment and pick
  strategy as validated data), wave cap, offline ceiling. Each change is
  proposed and activated by two different users and audited.

**1. The actor**

- The actor with three tables: warehouse workers and supervisors are `User`
  rows with `warehouse.operate` / `warehouse.manage`. No new person table.
  Carriers stay `CourierProvider` keys, not actors.
- The principal with no permission key: none. Every actor is a `User`
  checked by `PermissionsGuard`. The `StockMoved` subscriber runs as the
  system, behind no route.
- The grant that ends itself: `WarehouseTask.assignedToUserId`. On user
  deactivation, `warehouse` registers with `EmployeeOffboardingRegistry`.
  In the same transaction, ASSIGNED and OPEN tasks return to OPEN, and
  IN_PROGRESS tasks with `quantityDone > 0` become EXCEPTION for a
  supervisor.

**2. The authority**

- Whose rows, and which columns: every row carries `siteId` → `locationId`.
  Lists filter by the actor's location scope (WO-236.4 / `AdminScope`). No
  warehouse table holds a cost or price, so a handheld can never show
  margin.
- The threshold nobody approves alone: resolving a `BinVariance` whose value
  at weighted-average cost exceeds `Setting`
  `warehouse.variance_second_approval_minor` needs `secondResolverUserId`
  ≠ `resolvedByUserId`. The setting ships **unset**, and unset means every
  resolution needs two people (fail closed; canonical Ruling 16). It carries
  no default because a minor-unit amount is currency-specific (Law 1). The
  undo is a counter-adjustment by a different user.
- The toxic pair: counting a bin and resolving its variance.
  `BinVarianceService.resolve()` throws when the actor equals
  `BinVariance.countedByUserId`.
- Authority and blast radius: `WarehouseSite.binManaged` and rule
  activation are `warehouse.manage` actions with evidence-class audit
  (old/new value, canonical Ruling 9). The worst value, a putaway rule
  sending everything to one bin, is caught by `Bin.capacityUnits` checks
  and shows on the reconciliation screen.
- Audience is a capability: variance alerts go to
  `usersWithPermission('warehouse.variance.resolve')` scoped to the site.
  Zero holders escalates to `warehouse.manage` holders of the site. Many
  holders get one digest per hour each, never a ping per variance.

**3. The act in the world**

- Request or record: a task is a REQUEST (it may be cancelled or
  reassigned). A scan confirmation is a RECORD. Online it goes through the
  guarded `confirm()`. Offline it goes through
  `recordOfflineConfirmation()` (unconditional), which opens an
  `OFFLINE_OVERSHOOT` `BinVariance` instead of refusing, cleared by
  `warehouse.variance.resolve`.
- The movement with no address: every `BinMovement` names `siteId` and its
  bins. The one location-level write (a count correction) uses
  `WarehouseSite.locationId`. `defaultLocationId()` is reached on no path.
- Four hours down: handhelds queue under the §4 ceiling. With the server
  down, the last released wave's pick list is a printable PDF, and a
  "confirm from paper" screen (`warehouse.operate`) enters it afterwards. No
  double count is possible because `quantityPicked ≤ quantity` is
  predicate-written and `clientConfirmationId` is unique.

**4. The money**

- The unwritten posting rule: none. Bin movements change no location
  quantity and no value. The location-level `COUNT` movement goes through
  `inventory`'s existing path, which today posts nothing (a pre-existing gap
  named in doc 236 §2 and not fixed here). The reconciling report is §1's
  equation.
- Every column or none: undimensioned. `warehouse` writes no `JournalLine`.
  When count adjustments gain a posting rule, WO-236.6's
  `JournalLine.locationId` dimensions it.
- The period that already moved: n/a, because no journal is written. A late
  offline confirmation keeps its `occurredAt` and changes only bin
  quantities.
- The second legal entity: the GS1 company prefix is per legal entity. One
  deployment is one brand (Br1), so it is a `Setting`. A sub-brand that is a
  separate legal entity with its own prefix needs a `BrandPolicy` column
  (canonical Ruling 10), named here and built only when a second prefix is
  real.
- Dry run before live: `classifyMovement()`, `suggestPutaway()`,
  `planWave()` and `sequencePicks()` are pure. Their second read-only
  callers are the reconciliation screen and `POST
/admin/warehouse/waves/preview`.
- Click the number: every task-board count links to the filtered task list,
  and a site stock tile links to its `BinStock` rows.
  `VariantLocationStock` is authoritative for _how many_ and `BinStock` for
  _where_. The legitimate deltas are open outbound demand and movements
  inside the lag window; anything else is a `BinVariance`.

**5. The scale**

- Three silhouettes:
  - Solo with `warehouse` off: nothing.
  - Solo with `warehouse` on and `binManaged = false`: pack, SSCC and loads
    only.
  - A forty-branch chain: two DC sites, bin-managed.
  - A group: DCs inside brand or org nodes, or as site nodes (R27).

  `siteId` is NOT NULL everywhere.

- The absent collaborator:
  - `orderrouting` off: demand opens straight from `StockMoved` at the site.
  - `vendorcompliance` off: `ShipmentPacked` has no listener.
  - `fulfilment` off: ship-confirm still records, with no courier link.
  - `inventory` off: `warehouse` imports it for the count coupling, so Nest
    refuses to boot with a named error. A WMS with no stock ledger is
    meaningless, and the S4 preset matrix (WO-236.5) never pairs them that
    way.
- The second copy of the write: `BinMovement.stockMovementId` and
  `clientConfirmationId` (each unique with `occurredAt`);
  `WarehouseDemandLine.openedByStockMovementId @unique`; and a status
  predicate on task completion.
- The hundred-thousandth row: `BinMovement` reaches ~29 M a year at a busy
  site (monthly partitions). `BinStock` is ~150,000 rows for 100,000 SKUs
  over 50,000 bins. The task board issues two statements on
  `(siteId, status, priority)`. Reconciliation is a per-site batch read,
  never a page load.
- The adoption test: wave, load and carton numbers via `documentNumber()`;
  SSCC from node-leased `SsccSerialBlock`s; bin codes unique per site, never
  globally.

**6. The afterlife**

- The reversal document: a `PUT_BACK` task and a `REVERSAL` `BinMovement`
  carrying `reversesMovementId`, partial and repeatable until exhausted. A
  carton reopens before ship; after ship, only a return reverses.
- The undo fan-out of ship-confirm:
  - `orderrouting` status: deliberately irreversible, corrected by a return.
  - `fulfilment` `Shipment`: needs a human, through
    `CourierProvider.cancel()` on the shipment screen under
    `fulfilment.manage`.
  - A sent ASN: deliberately irreversible, corrected by a cancel/replace
    document per the retailer's guide on `vendorcompliance`'s ASN screen.
  - `StockTransfer.physicallyShippedAt`: cleared by the same reversal.
- The version stamp: `WarehouseTask.ruleVersionId` names the
  `WarehouseRuleVersion` that generated it, so a task's bin choice is
  explainable after the rules change.
- The erasure the ledger cannot obey: worker ids in `BinMovement.actorId`,
  `WarehouseTask.assignedToUserId` and `BinVariance.*UserId` are
  pseudonymised by the existing user-erasure path (canonical Ruling 1). No
  customer personal data is stored here; carton labels are fetched from
  `fulfilment` at print time.
- The failure path: a movement that cannot be reconciled and a malformed
  offline confirmation each land as an OPEN `BinVariance`, with its
  `payload`, on `/admin/warehouse/variances` under
  `warehouse.variance.resolve`. Resolving names the bin and is safe to
  repeat, because resolution is predicate-written on `status = 'OPEN'`.
