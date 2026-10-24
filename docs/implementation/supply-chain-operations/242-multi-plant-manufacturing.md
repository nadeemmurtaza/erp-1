# 242 — Multi-plant manufacturing: multi-level BOM, production orders, routings and work centers, MRP and capacity, inter-plant transfers, plant costing, contract manufacturing

> **Status: Planned (2026-10-04). Nothing built.** Folded into this program
> by the owner the same day as the rest (relayed by the coordinator, who
> verified the gaps below directly in `bom`). Architecture and node
> topology: [doc 236](./236-supply-chain-operations-architecture.md) §3 (a
> plant is a `PRODUCTION` `Location`, inside a node or as a site node; R27).
> Decision record: ADR-088. **OD-1 (doc 236 §9) must be confirmed first:**
> this brief builds on the `bom` stack and freezes `production`.

## Objective

A manufacturer with one or many plants:

- defines multi-level products (sub-assemblies made at one plant and
  consumed at another);
- plans what to make, buy, transfer or subcontract, where and when (MRP);
- sees which plant has free capacity;
- releases production orders that follow a routing of operations across
  work centers, with quality checkpoints;
- records good and scrap output per operation;
- moves semi-finished goods between plants;
- costs each plant's output from real operation times and rates, with
  variances on the books;
- tracks lots made by a named contract manufacturer as such.

## Existing state (verified, 2026-10-04; gaps confirmed absent by grep, not inherited)

| Capability                                         | State                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recipe structure                                   | `BomRecipe` is one live recipe per variant (`variantId @unique`) and **flat by rule**: `recipe.service.ts` refuses a component whose variant has its own recipe.                                                                                                                 |
| Production record                                  | `BomProductionRun` is a one-shot completion. It consumes and credits stock through `move()` in one transaction (`bom -> inventory`), snapshots material, labour and overhead cost, links lots (doc 71), carries `scopeLevel` / `originNodeId` / `locationId`, and replicates UP. |
| Second stack                                       | `production`'s `BillOfMaterial` / `WorkOrder` (DRAFT → RELEASED → COMPLETED), used by the reorder and stitching-cascade listeners (ADR-020: both stacks kept)                                                                                                                    |
| Routing, work centers, operation sequence          | **Absent**                                                                                                                                                                                                                                                                       |
| Multi-level BOM, MRP explosion                     | **Absent**                                                                                                                                                                                                                                                                       |
| Inter-plant WIP transfer                           | `transfers` is location-type agnostic. **Untested** between `PRODUCTION` locations, with no plant-specific treatment.                                                                                                                                                            |
| Quality checkpoints                                | **Absent** (doc 243)                                                                                                                                                                                                                                                             |
| Plant cost centres, overhead allocation, plant GL  | **Absent**. `JournalLine.costCentreId` exists with no backing model. There is no location dimension. `BomProductionCompleted` **posts nothing**.                                                                                                                                 |
| Capacity across plants                             | **Absent**. `planning` does shock propagation (R20–R26) only.                                                                                                                                                                                                                    |
| Sourcing rules ("which plant serves which region") | **Absent**. Doc 239 provides them.                                                                                                                                                                                                                                               |
| Make-vs-buy, contract manufacturing                | **Absent**. Nothing marks a lot as made by a third party.                                                                                                                                                                                                                        |

## 1. Who owns what

| Concern                                                                                                     | Owner                              | Why there                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Multi-level structure, alternate recipe per plant, production orders, completions → runs, variance on close | **`bom`** (extended)               | Structure and "what to make / what was made" stay with the stack that already holds cost snapshots, lots genealogy and replication. A production order is the REQUEST; the existing `BomProductionRun` stays the RECORD. |
| Work centers, calendars, rates, routings, operation execution, in-plant dispatch, subcontract operations    | **`manufacturing`** (new)          | "How and where on the floor, and when" is wanted only by routed plants. A bakery runs `bom` alone.                                                                                                                       |
| MRP, rough-cut capacity across plants                                                                       | **`planning`** (extended)          | Same posture as R20–R22 (ADR-066): a read and recommendation engine whose "accept" creates drafts in the owning module. Its first tables are **caches** (safe to delete and recompute).                                  |
| Sourcing rules: make / buy / transfer / subcontract                                                         | **`supplynetwork`** (doc 239)      | One network vocabulary for routing and planning                                                                                                                                                                          |
| Quality checkpoints                                                                                         | **`quality`** (doc 243)            | Also used by DCs with no plant                                                                                                                                                                                           |
| Inter-plant transfer                                                                                        | **`transfers`** (reused unchanged) | Already location-type agnostic. R12 settlement modes cover pricing.                                                                                                                                                      |
| Plant P&L, cost centres, posting rules                                                                      | **`accounting`** (extended)        | Postings are event subscribers (R15)                                                                                                                                                                                     |

**Why `manufacturing` does not write runs itself.** Its final operation's
completion publishes `OperationCompleted`. `bom` records the run in its own
transaction, idempotent by `BomProductionRun.sourceOperationLogId @unique`.
No coupling is added, and with `manufacturing` off a production order is
completed by hand on `bom`'s screen exactly as runs are recorded today. The
cost is a few seconds of eventual consistency between "operation done" and
"stock credited", which is acceptable because no sale waits on it.

## 2. Design

**Multi-level structure (`bom`).**

- **Nesting.** The no-nesting refusal is lifted. A component whose variant
  has its own recipe is a sub-assembly.
- **Validation.** `assertAcyclic()` (DFS) and a depth guard (§4) run on every
  recipe save. Low-level codes are computed and cached per variant for MRP.
- **Cost roll-up.** `rollUpCost()` becomes recursive. A sub-assembly
  contributes its actual weighted-average `costPrice` when stock exists, else
  its own rolled-up estimate, and the editor shows which.
- **Alternate recipes per plant.** `BomRecipe.variantId @unique` becomes
  `@@unique([variantId, plantKey])`, with `plantKey String @default("")`.
  `""` is the recipe for every plant, a plant's `locationId` its alternate,
  and the column is NOT NULL to avoid the composite-unique NULL trap.

**Production orders (`bom`).** A `BomProductionOrder` holds recipe and
version, plant `locationId`, planned and completed quantities, due date,
source (MANUAL, MRP, ORDER, REORDER), an optional parent order (pegging a
sub-assembly to the order consuming it), and an optional routing id.

- **Release.** Runs `checkMaterialAvailability()` (pure, a warning, never a
  block) and snapshots `standardUnitCost` from the roll-up. It publishes
  `BomProductionOrderReleased`, and `manufacturing` opens the operation queue.
- **Completion.** Each partial completion records a `BomProductionRun`
  (backflush at completion, the existing semantics) with `productionOrderId`
  set.
- **Close.** Computes variance = Σ run actual cost − standard × quantity, and
  publishes `BomProductionOrderClosed`.

**Routings and operations (`manufacturing`).**

- A `Routing` (per recipe, version and plant) is an ordered list of
  `RoutingOperation`s. Each names a `WorkCenter`, setup minutes, run seconds
  per unit, and optionally a `quality` inspection plan, a subcontract party,
  or both.
- **Operation execution.** Start, pause and complete, with good and scrap
  quantities and labour and machine minutes. Each is written as an
  `OperationLog`, a node-local fact (R29), and recorded offline from a plant
  tablet under the same ceiling as doc 237.
- **Costing.** The final operation's good quantity, with labour and machine
  minutes × the active `WorkCenterRateVersion`, becomes the run's labour and
  overhead cost snapshot. This replaces the recipe's flat per-unit figures
  when a routing exists.
- **Dispatch list.** Per work center, released operations ordered by due date
  then priority. Finite-capacity scheduling is WO-242.10.

**MRP and capacity (`planning`).**

- **Explosion.** `explodeRequirements()` is pure. It nets gross demand
  against supply level by level (low-level code order) and offsets by lead
  time:
  - **demand:** open order lines not yet shipped, accepted retailer POs
    (already orders), `VariantForecast`, safety stock (`reorderPoint`);
  - **supply:** promisable on-hand per location, open POs, open production
    orders, in-transit transfers;
  - **lead time:** supplier R25 distribution mean, else `leadTimeDays`;
    routing time at the plant's calendar; lane `transitDays`;
  - **sourcing:** `resolveSourcing(PRODUCTION | REPLENISHMENT)`.

  The output is planned orders per (variant, location, bucket), each citing
  the rule and the demand it pegs to.

- **Persistence and accept.** Results are stored in cache tables
  `MrpRun` / `MrpPlannedOrder`. "Accept" publishes `PlannedOrderAccepted`,
  and the owning module creates the draft:
  - `bom`: a DRAFT `BomProductionOrder`;
  - `purchasing`: a `PurchaseRequisition` (existing, with approval);
  - a planned **transfer** stays a recommendation, because `transfers` has no
    draft status (named gap, WO-242.6).
- **Rough-cut capacity.** `roughCutCapacity()` (pure) loads planned and
  released operations onto work-center calendars per week, flags overloads,
  and, where another plant has a routing for the recipe and a `MAKE_AT` rule,
  proposes moving the load as a ranked candidate action (R22's ranking,
  extended).

**Inter-plant transfers.** A sub-assembly made at plant A is a stocked
variant there. Plant B's need becomes a `StockTransfer` between two
`PRODUCTION` locations through `transfers` unchanged, valued at weighted
average (R12). It settles `NONE` or `INTERNAL_PL` inside one legal entity and
`INVOICED` across brands (R17 eliminates on consolidation). WO-242.7 adds the
tests the coordinator found missing.

**Plant costing (`accounting`).**

- **Dimensions.** `JournalLine.locationId` (WO-236.6), plus a new `CostCentre`
  model backing the existing `costCentreId` (code, name, optional
  `locationId`, optional parent).
- **New accounts:** `5160` Production Variance, `5170` Labour & Overhead
  Absorbed (credit-balance contra-expense), `5180` Scrap & Quality Write-off.
- **The rules below are pure-function account selection** (canonical
  Ruling 3), and every line carries `locationId` = the plant.

| Event                                                     | Journal                                                                                                                                                  | Key                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `BomProductionCompleted` (existing event, unposted today) | Dr 1200 Inventory (output at `producedUnitCost × qty`) · Cr 1200 Inventory (materials at `materialCost`) · Cr 5170 (labour + overhead + subcontract fee) | `findPostedEntry('bom.production_completed', runId)` |
| `BomProductionOrderClosed`, variance ≠ 0                  | Dr/Cr 5160 · Cr/Dr 1200                                                                                                                                  | `('bom.production_order_closed', orderId)`           |
| `QualityDispositionRecorded` (scrap)                      | Dr 5180 · Cr 1200                                                                                                                                        | doc 243                                              |

The plant P&L is a query over `JournalLine` filtered by `locationId` or cost
centre. Under- and over-absorption is a report: actual plant expenses
(posted with that cost centre) against 5170.

**Contract manufacturing and make-vs-buy.**

- **Choice of source.** Through `supplynetwork`'s `SUBCONTRACT_TO` /
  `MAKE_AT` / `BUY_FROM` rules, with `sharePct` for split sourcing.
- **Subcontract production order.** A `BomProductionOrder` at a `Location` of
  type `SUBCONTRACTOR` (additive in WO-236.2, never promisable) representing
  our stock held at the contractor. `manufacturing.SubcontractorSite` maps
  `partyId` ↔ `locationId`.
- **Materials.** Go out by transfer.
- **Completion.** The run is recorded at that location with
  `BomProductionRun.producedByPartyId` (additive bare scalar; null =
  in-house). Every lot it outputs is thereby traceable to the contractor
  through `Lot.outputOfRuns`. Finished goods come back by transfer.
- **Fee.** The agreed fee is snapshotted as `subcontractCostMinor` on the
  run. The contractor's invoice is a `SupplierBill`.

## 3. Schema

**`bom.prisma` (additive):**

- `BomRecipe.plantKey String @default("")`, replacing `variantId @unique`
  with `@@unique([variantId, plantKey])`.
- `BomRecipe.lowLevelCode Int?` (cache).
- `BomProductionOrder` (below).
- `BomProductionRun.productionOrderId String?`, `sourceOperationLogId
String? @unique`, `producedByPartyId String?`, `subcontractCostMinor Int
@default(0)`.

```prisma
model BomProductionOrder {
  id String @id @default(cuid())
  number String @unique                  // documentNumber(), node-prefixed
  recipeId String; recipeVersion Int; variantId String
  locationId String                      // the plant — scope column, NOT NULL
  quantityPlanned Int; quantityCompleted Int @default(0)
  status String @default("DRAFT")        // DRAFT | RELEASED | IN_PROGRESS | COMPLETED | CLOSED | CANCELLED
  dueDate DateTime?; source String; sourceRef String?
  parentOrderId String?                  // pegging: this sub-assembly feeds that order
  routingId String?                      // manufacturing, bare scalar
  standardUnitCost Int?                  // snapshot at release
  releasedByUserId String?; closedByUserId String?; varianceSecondApproverUserId String?
  createdAt DateTime @default(now()); releasedAt DateTime?; closedAt DateTime?
  @@index([locationId, status])
}
```

**`manufacturing.prisma` (new):**

```prisma
model WorkCenter { id String @id @default(cuid()); locationId String; code String; name String; kind String; unitsPerHour Int?; efficiencyBps Int @default(10000); isActive Boolean @default(true); @@unique([locationId, code]) }
model WorkCenterCalendar { id String @id @default(cuid()); workCenterId String; weekday Int; shifts Json; exceptions Json? ; @@unique([workCenterId, weekday]) }
model WorkCenterRateVersion { id String @id @default(cuid()); workCenterId String; labourMinorPerHour Int; machineMinorPerHour Int; overheadMinorPerHour Int; effectiveFrom DateTime; proposedByUserId String; activatedByUserId String?; status String @default("DRAFT") }
model Routing { id String @id @default(cuid()); recipeId String; version Int; locationId String; status String @default("DRAFT"); @@unique([recipeId, locationId, version]) }
model RoutingOperation { id String @id @default(cuid()); routingId String; sequence Int; workCenterId String; setupMinutes Int @default(0); runSecondsPerUnit Int; inspectionPlanId String?; subcontractPartyId String?; @@unique([routingId, sequence]) }
model OperationLog {                     // node-local fact (R29); partition by month if > 10 M rows/year measured
  id String @id @default(cuid())
  productionOrderId String; operationId String; workCenterId String
  status String; startedAt DateTime?; completedAt DateTime?
  qtyGood Int @default(0); qtyScrap Int @default(0); labourMinutes Int @default(0); machineMinutes Int @default(0)
  operatorUserId String?; clientConfirmationId String? @unique; occurredAt DateTime
  @@index([productionOrderId])
  @@index([workCenterId, status])
}
model SubcontractorSite { id String @id @default(cuid()); partyId String @unique; locationId String @unique }
```

**`planning` (first tables, both caches):** `MrpRun` (id, startedAt,
inputs hash, horizon, status) and `MrpPlannedOrder` (runId, kind, variantId,
locationId, quantity, dueDate, ruleId, peggedDemand Json, acceptedAt?,
acceptedByUserId?).

**`accounting.prisma`:** `CostCentre` (id, code @unique, name, locationId?,
parentId?). Three chart accounts in `chart-of-accounts.ts`.

## 4. Parameters (exact)

| Parameter                     | Value                                                                                                                | Why this number                                                                                                                                                                           | Enforced in                                        | On failure                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| BOM depth guard               | **20 levels**                                                                                                        | Far deeper than any recipe the repository's sectors need. It bounds recursion if a data error slips past cycle detection, and keeps explosion time linear in practice.                    | `assertAcyclic()` on save; `explodeRequirements()` | Save refused naming the path; MRP marks the variant "structure error" |
| MRP horizon and buckets       | **182 days** (26 weeks): daily buckets for days 1–28, weekly after                                                   | Covers two quarters of supplier lead times. Daily precision matters only inside the next four weeks of execution, and weekly buckets after that cut bucket count from 182 to 50 per item. | `explodeRequirements()`                            | n/a                                                                   |
| MRP run bar                   | **10,000 variants × 26 weeks in ≤ 5 min** on the bench fixture                                                       | Overnight batch is the norm. Five minutes allows a daytime re-run after a big order.                                                                                                      | WO-242.6 acceptance                                | Run is chunked by low-level code; no single transaction               |
| Plant-tablet offline ceiling  | **500 confirmations or 4 h**                                                                                         | Same reasoning and number as doc 237 §4 (canonical Ruling 2)                                                                                                                              | `apps/mobile` / `apps/pos` plant flow              | Device stops accepting new confirmations                              |
| Variance second-approval band | `Setting` `bom.variance_second_approval_minor`, **unset = every close with non-zero variance needs a second person** | Fail closed, and no currency literal (Law 1)                                                                                                                                              | `BomProductionOrderService.close()`                | Close waits for a second user                                         |

## 5. Work orders

Each ships backend, minimum screen, nav entry, permission grants and tests.

- **WO-242.1 — Multi-level structure.** Lift the nesting refusal,
  `assertAcyclic()`, depth guard, low-level codes, recursive `rollUpCost()`,
  `plantKey` alternates, and a multi-level tree view in the recipe editor.
- **WO-242.2 — Production orders.** `BomProductionOrder`, release, partial
  completions recording runs, close with variance, and screens under
  `/admin/bom/orders`. Permission `bom.orders.release`; closing reuses
  `bom.manage`.
- **WO-242.3 — Production posting.** The `BomProductionCompleted` and
  `BomProductionOrderClosed` posting rules, accounts 5160/5170/5180, and
  `locationId` on the lines. Needs WO-236.6.
- **WO-242.4 — Work centers and routings.** `manufacturing` schema,
  `/admin/manufacturing/work-centers` (calendars, rates with propose/activate
  by two users), `/routings`. Registry (`offByDefault`), `MODULE_PACKS`.
  Permissions `manufacturing.view`, `manufacturing.manage`.
- **WO-242.5 — Operation execution.** The operation queue from
  `BomProductionOrderReleased`, the plant-tablet start/complete flow with
  the offline ceiling, `OperationCompleted`, `bom`'s run-recording
  subscriber (idempotent), operation-time costing, and the dispatch list.
  Permission `manufacturing.operate`.
- **WO-242.6 — MRP.** `explodeRequirements()` (pure, table-tested on a
  three-level, two-plant fixture), `MrpRun` / `MrpPlannedOrder`, the
  planner screen (planned orders with pegging and rule citations),
  `PlannedOrderAccepted` → `bom` drafts and `purchasing` requisitions.
  Transfer recommendations shown, not drafted. Needs WO-239.2. Permissions
  `planning.mrp.run`, `planning.mrp.accept`.
- **WO-242.7 — Inter-plant transfers.** Tests for `transfers` between
  `PRODUCTION` locations in each settlement mode, WAC valuation of
  sub-assemblies, R17 elimination across brands, plus a "transfers between
  plants" filter on the transfers screen.
- **WO-242.8 — Plant costing.** `CostCentre`, the plant P&L report
  (drill-down to `JournalLine`), and the under/over-absorption report.
- **WO-242.9 — Contract manufacturing.** `SubcontractorSite`, subcontract
  production orders at `SUBCONTRACTOR` locations, `producedByPartyId` and
  `subcontractCostMinor` on runs, a lot-provenance view ("made by"), and the
  subcontract fee's bill matching. Needs WO-236.2's `SUBCONTRACTOR` type.
- **WO-242.10 — Rough-cut capacity and finite dispatch.**
  `roughCutCapacity()`, cross-plant load-move candidates (R22 ranking), and
  finite sequencing of the dispatch list.

## 6. Files likely affected

`bom.prisma`, `apps/api/src/modules/supply-chain/bom/*`; `manufacturing.prisma`
(new), `supply-chain/manufacturing/*` (new); `planning` (new cache tables,
`mrp.ts`, `capacity.ts`); `accounting.prisma`, `chart-of-accounts.ts`,
`posting-rules.subscriber.ts`; `transfers` specs; `domain-events.ts`;
`permissions.ts`; `apps/web/src/app/admin/{bom,manufacturing,planning}/*`; a
plant-tablet flow in `apps/mobile`; `nav-registry.ts`.

## 7. Dependencies reused

`BomRecipe`, `BomProductionRun`, `ProductionService` (runs), `cost-rollup.ts`,
`Lot` genealogy (doc 71), `InventoryService` through `bom -> inventory`,
`transfers` and R12 settlement, `PurchaseRequisition`, `VariantForecast`,
`SupplierLeadTimeObservation` (R25), R22's ranking, `documentNumber()`,
`supplynetwork` (doc 239), `quality` (doc 243).

## 8. Risks

- **Two manufacturing stacks** (OD-1). Mitigation: `production` is frozen,
  not extended. The production-order screen tells a user whose variant has a
  `BillOfMaterial` but no `BomRecipe` which stack it is on. Conversion is a
  separate ADR.
- **Backflush at completion leaves no WIP on the books** for an order open at
  month end. Material physically consumed is still in `1200` until the run.
  Named: issue-to-WIP (account `1210`) is a later work order, not this one.
- **Lifting the nesting rule** changes `rollUpCost()` for every recipe.
  Mitigation: single-level recipes are byte-identical before and after
  (acceptance 1).

## 9. Acceptance criteria

1. Every existing `bom` and `production` spec passes. A single-level
   recipe's rolled-up cost is byte-identical before and after WO-242.1.
2. A recipe cycle (A → B → A) and depth 21 are both refused on save, naming
   the path.
3. A three-level product across two plants explodes into planned orders whose
   quantities and dates are asserted, each citing its sourcing rule and
   pegged demand. Re-running on the same snapshot is byte-identical.
4. Accepting a planned MAKE order creates exactly one DRAFT production order.
   Accepting a BUY order creates exactly one requisition. Repeat accepts
   create nothing.
5. Completing the final operation records exactly one run, even when
   `OperationCompleted` is redelivered. The run's labour and overhead equal
   minutes × the active rates.
6. A production run posts a balanced entry exactly once, with `locationId` =
   the plant. Closing an order with variance posts 5160 exactly once. The
   trial balance stays zero.
7. A transfer of a sub-assembly from plant A to plant B moves it at weighted
   average. Across brands it is `INVOICED` and eliminated on consolidation.
8. A lot produced at a `SUBCONTRACTOR` location shows the contractor as
   "made by", and `SUBCONTRACTOR` stock never counts in ATP.
9. `pnpm lint && pnpm typecheck && pnpm test` pass, and the migrations apply
   forward on a copy of production data.

## 10. Out of scope

Product lifecycle management and engineering change orders beyond recipe
versioning; process manufacturing specifics (potency, co-products and
by-products), which are named for a later brief; maintenance management for
work-center machines; advanced planning and scheduling optimisation beyond
rough-cut and finite sequencing; issue-to-WIP accounting (`1210`, named in
Risks).

## Scope lenses

**0. The shop-scale five**

- The transaction, start to finish: structure → MRP → accept → draft
  production order → release → operations (with inspection) → completions
  record runs → close with variance → transfer to the consuming plant.
- The other side: the planner screen, the dispatch list per work center, the
  variance review on close, and the plant P&L.
- What happens after "done": a completed run is corrected by a reversing
  adjustment (existing rule). A closed order's variance is reversed only by
  `AccountingService.reverseEntry()` plus a re-close. Scrap is dispositioned
  through `quality`.
- The integrations a real business needs: none external are required. Plant
  tablets use `apps/mobile`, and machine data collection (OPC UA and similar)
  is out of scope, named here.
- The policy layer: routings, work-center rates (two-person activation),
  sourcing rules (doc 239), the variance band.

**1. The actor**

- The actor with three tables: operators and planners are `User`
  (`manufacturing.operate`, `planning.mrp.*`). Contract manufacturers are an
  existing `Party` (role `MANUFACTURER`, already in `PartyRoleName`) linked
  through `SubcontractorSite.partyId`, and billing through their `Supplier`.
- The principal with no permission key: none. Plant tablets authenticate
  users, and machines do not post.
- The grant that ends itself: `OperationLog.operatorUserId` on an open
  operation. On deactivation (`EmployeeOffboardingRegistry`), the operation
  returns to the work-center queue in the same transaction, and recorded
  quantities stay.

**2. The authority**

- Whose rows, and which columns: every order, work center and operation names
  the plant `locationId`, and lists are scoped by location (WO-236.4).
  Operators' screens show no rates or costs; rates need
  `manufacturing.manage`.
- The threshold nobody approves alone: closing an order with non-zero
  variance above the band needs a second user (`varianceSecondApproverUserId`).
  Work-center rate activation needs a second user. The undo is a reversal by
  a different user.
- The toxic pair: proposing and activating a work-center rate.
  `WorkCenterRateService.activate()` throws when the actor equals
  `proposedByUserId`. Rates move inventory value, so one person must not be
  able to set them alone.
- Authority and blast radius: the worst rate value inflates every subsequent
  run's cost. It is caught by the variance report on the next close and by
  evidence-class audit of old and new rates.
- Audience is a capability: overload flags go to `planning.mrp.run` holders.
  Variance approvals go to `bom.manage` holders scoped to the plant. Zero
  holders escalates to `manufacturing.manage`. Many holders get a daily
  digest.

**3. The act in the world**

- Request or record: a production order is a REQUEST (release may be
  refused, and it may be cancelled). An operation completion and a run are
  RECORDS, never refused. A completion exceeding the planned quantity is
  recorded, and the order shows the over-run.
- The movement with no address: every run names the plant `locationId`, or
  the `SUBCONTRACTOR` location. `defaultLocationId()` is reached only by a
  hand-recorded run on a single-location deployment, as today.
- Four hours down: tablets queue completions under the ceiling. With the
  server down, paper travellers per order are printable at release and
  entered on the "confirm from paper" screen, which cannot double count
  because `clientConfirmationId` is unique.

**4. The money**

- The unwritten posting rule: written out in §2 (5160/5170/5180 added), keyed
  per run and per order.
- Every column or none: production lines set `locationId` = the plant and
  `costCentreId` = the plant's cost centre, plus `retailBrandId` /
  `branchNodeId` as other rules do. `counterpartyBrandId` is set only on
  cross-brand transfers (R17).
- The period that already moved: a late run (offline tablet) posts to the
  current open period with `producedAt` retained (R15 invariant 3). The
  variance close follows `reverseEntry()`'s period-from-now rule, which the
  test asserts.
- The second legal entity: plants of two brands are two legal entities.
  Their transfers are `INVOICED` and eliminated (R17), and each brand's
  `documentNumber()` series and fiscal periods are independent.
- Dry run before live: `explodeRequirements()`, `roughCutCapacity()`,
  `rollUpCost()` and the posting-amount functions are pure. Their second
  callers are the planner's "simulate" (no accept), the recipe editor's cost
  preview, and a replay of last month's runs through the posting function.
- Click the number: the plant P&L drills to `JournalLine`, then the run, then
  the operation logs. The authoritative production quantity is the run (not
  operation sums); operation sums may legitimately exceed it by scrap, which
  is shown.

**5. The scale**

- Three silhouettes:
  - A one-plant workshop: `bom` alone, production orders by hand.
  - A routed plant: + `manufacturing`.
  - A multi-plant group: plants inside the brand or org node, or as site
    nodes (R27), with MRP at brand or org (Part 4: intelligence runs at ORG
    and BRAND only).

  `locationId` is NOT NULL on every new row.

- The absent collaborator: `manufacturing` off means orders complete by hand.
  `quality` off means no checkpoints. `supplynetwork` off means MRP sources
  from `preferredSupplierId` and the recipe's own plant. `planning` is always
  on. All degrade on events.
- The second copy of the write: `BomProductionRun.sourceOperationLogId
@unique`, `OperationLog.clientConfirmationId @unique`,
  `MrpPlannedOrder.acceptedAt` predicate, and status predicates on release
  and close.
- The hundred-thousandth row: operation logs reach ~5 per order × 200 orders
  a day per plant ≈ 365,000 a year per plant, partitioned only past a
  measured 10 M a year. `MrpPlannedOrder` is a cache, replaced per run.
- The adoption test: production order numbers via `documentNumber()`. Work
  center codes are unique per plant, routing versions per (recipe, plant).

**6. The afterlife**

- The reversal document: a run is reversed by an adjustment through the
  existing inventory screen. A close is reversed by `reverseEntry()` and a
  re-close. A planned-order accept is reversed by cancelling the draft it
  created.
- The undo fan-out of a completion:
  - Stock credit: needs a human, through an adjustment.
  - Posting: reverses automatically via `reverseEntry()` when the run is
    reversed.
  - Lot creation: deliberately irreversible (genealogy is history).
  - Quality lot: dispositioned in `quality`.
- The version stamp: runs stamp `recipeVersion` and the rate version used,
  and orders stamp `standardUnitCost`. Any run's cost is explainable from its
  own fields.
- The erasure the ledger cannot obey: operator ids on operation logs and runs
  are pseudonymised by the existing path (canonical Ruling 1). There is no
  customer data.
- The failure path: a run that cannot be recorded from `OperationCompleted`
  (for example, the recipe was archived) lands as a production-order
  exception on `/admin/bom/orders` under `bom.manage`, with the event payload
  and a "record run" action that is idempotent by `sourceOperationLogId`.
