# 236 — Supply-chain operations: architecture, rulings and roadmap

> **Status: Planned (2026-10-04). Nothing built.** Decision record:
> [ADR-088](../decisions/ADR-088-supply-chain-operations-eight-core-capability-modules-node-tier-is-not-site-function.md)
> (Proposed). This is the architecture brief for the program; docs 237–244
> are the capability briefs it spawns, each in house format with its own
> schema, work orders, acceptance criteria and scope lenses. It sits beside
> [`RETAIL-ERP.md`](../RETAIL-ERP.md), which stays the document of record
> for Organization ▸ Brand ▸ Branch. Where this brief proposes a change to
> that document (§3, §8), the change is **proposed, not made**. The owner
> decides whether it goes in.

## 1. Objective and the four profiles

The owner confirmed this session that NEWAX's retail vertical becomes a
full-spectrum retail and supply-chain operating system, globally, on one
Core, for these customer profiles:

| #   | Profile                                                                | What they need that is not built                                                                                                                                                       |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Retail chain** with its own branded stores                           | Little. See `RETAIL-VERTICAL-COVERAGE-MATRIX.md`. Click and collect and ship-from-store are named in `RETAIL-ERP.md` Part 5 (`fulfilment`) but not built.                              |
| 2   | **Multi-warehouse retail chain**                                       | A real WMS (receiving, putaway, bins, pick paths, waves, packing) and a real OMS (split shipments across DCs and stores, ship-from-store, endless aisle)                               |
| 3   | **Supplier / manufacturer / distributor selling into large retailers** | EDI with retailers (850, 855, 856, 810, 820, 852, 997), OTIF windows, chargeback and deduction disputes. This company may run no stores at all.                                        |
| 4   | **Multi-plant manufacturer** (folded in by the owner the same day)     | Routings and work centers, multi-level BOM and MRP, inter-plant transfers, quality checkpoints, plant costing, capacity planning across plants, sourcing rules, contract manufacturing |

Lower priority, same program: RFID-driven phantom-inventory detection.

**The profiles are orthogonal.** An apparel brand that runs its own stores,
wholesales to a department-store chain and owns two stitching units is
profiles 1 + 3 + 4 in one deployment. `MULTI-SECTOR.md` already ruled the
same way for business models ("A shop is not 'a B2B shop' — it enables the
capabilities its trade needs"). Nothing in this design makes any two
profiles exclusive.

## 2. Existing state (verified in code, 2026-10-04)

| What                         | Where                                                                                                               | Finding                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pack vs capability           | `apps/api/src/modules/module-packs.ts` header                                                                       | "Business models … are NOT packs … They are capability modules in core." A pack exists "only where a vertical owns genuine domain data that core cannot express."                                                                                                                                                                                                             |
| Independence                 | `scripts/check-module-boundaries.mjs`                                                                               | INDEPENDENCE applies to every pair of modules, core included. `KNOWN_MODULE_COUPLINGS` holds 24 entries: same-transaction writes, "checkout cannot commit without this number" reads, and two channels funnelling into `OrdersService` (`pos -> orders`, `accounts -> orders`).                                                                                               |
| Node tier                    | `organization.prisma` `NodeRole { BRANCH BRAND }`; `env.validation.ts` `NODE_ROLE ∈ STANDALONE, BRANCH, BRAND, ORG` | Tier and replication topology only. `NODE_ROLE=BRANCH` requires `PARENT_URL`, and its comment assumes the parent is a brand. ADR-023 makes a node with null `retailBrandId` fail closed on `BrandPolicy`.                                                                                                                                                                     |
| Site function                | `inventory.prisma` `LocationType { STORE WAREHOUSE IN_TRANSIT PRODUCTION }`                                         | A DC is representable as `WAREHOUSE` and a plant as `PRODUCTION` today. `Location` has no parent, no bin concept, and `code @unique`.                                                                                                                                                                                                                                         |
| Stock writer                 | `InventoryService.move()` / `postUnconditional()` / `moveMany()`                                                    | Keyed on `(variantId, locationId)`. Recomputes `ProductVariant.stock` as a cross-location SUM inside the write transaction. Canonical Ruling 5 names that as the instance its lens was written from.                                                                                                                                                                          |
| Sub-ledger precedent         | `Lot`/`LotStock`/`SerializedUnit`, ADR-069                                                                          | A sub-ledger beneath `VariantLocationStock`, with its own single writer called alongside `move()`, never inside it                                                                                                                                                                                                                                                            |
| Order stock commitment       | `orders.service.ts` ~L384                                                                                           | Web orders decrement at `defaultLocationId()` **at placement**. `VariantLocationStock` therefore means _available_, not physical on-hand.                                                                                                                                                                                                                                     |
| Restock on cancel and return | `orders.service.ts` ~L996–1006, `returns.service.ts` ~L255                                                          | Both restock at `order.locationId ?? defaultLocationId()`, so an order split across locations would restock to the wrong place                                                                                                                                                                                                                                                |
| R26 as built                 | `planning/online-stock.service.ts`                                                                                  | `onlineStockFor()` sums **every** `VariantLocationStock` row, `IN_TRANSIT` buckets included. `assignFulfillingBranch()` reassigns a **whole order** to **one** location inside **one** database.                                                                                                                                                                              |
| Shipments                    | `orders.prisma` `Shipment`, `fulfilment.prisma` `ShipmentItem`                                                      | Partial shipments exist (`ShipmentItem`). A shipment records no ship-from location.                                                                                                                                                                                                                                                                                           |
| Domain events                | `core/events/domain-events.ts`                                                                                      | No `StockMoved` (named in `RETAIL-ERP.md` Part 5, never built). No transfer dispatch or receive event.                                                                                                                                                                                                                                                                        |
| Replication                  | `core/replication/`, `replication.prisma`                                                                           | Real: log, cursors, registry, quarantine, agent. Registered entities include `Order`, `Product`, `GoodsReceipt`, `BomProductionRun` and `Expense`. Several `apply()` paths still throw ("consolidation not built"). `StockMovement` and `StockTransfer` are not replicated.                                                                                                   |
| EDI                          | `18-trading-partner-network.md` WO-18.5; `tradingpartners`                                                          | Deferred "until a real partner names the standard". `tradingpartners` is a JSON fact protocol between NEWAX nodes (ADR-087), not X12 or EDIFACT, with no transport for a VAN or AS2                                                                                                                                                                                           |
| Customer invoice             | `invoicing.prisma` `Invoice`                                                                                        | Keyed to `tradingPartnerId`, never posted to the GL. The AR ledger keys `Contact`/`Order` (`receivables.prisma` header)                                                                                                                                                                                                                                                       |
| Manufacturing                | `bom.prisma`, `production.prisma`, ADR-020                                                                          | Two stacks. `BomRecipe` is flat by rule ("Sub-assemblies are explicitly deferred"). `BomProductionRun` is a one-shot completion record with cost snapshots, lots genealogy, tier scope and an UP replication listener. `WorkOrder` (production) has a DRAFT/RELEASED/COMPLETED lifecycle over `BillOfMaterial`. Neither has routings, work centers, MRP, quality or capacity. |
| Ledger coverage              | `posting-rules.subscriber.ts`                                                                                       | No rule for `GoodsReceived` (no GRNI account), `BomProductionCompleted`, adjustments, counts or write-offs. `JournalLine` has no `locationId`. `costCentreId` has no backing model. The chart (`chart-of-accounts.ts`) has one `1200 Inventory` account and no WIP, overhead-absorbed, variance or deduction accounts.                                                        |
| Quality                      | schema-wide                                                                                                         | Absent. `planning`'s `supplierScorecard().defectRatePct` is honestly `null` because no defect field exists (ADR-066).                                                                                                                                                                                                                                                         |
| Review-queue idiom           | `MarkdownSuggestion`, `VariantForecast`, `StockVariance`, `SpotCheck` (inventory)                                   | The shape phantom-stock suspects should copy                                                                                                                                                                                                                                                                                                                                  |

## 3. Node topology: DCs and plants, and the proposed rulings R27–R30

The question was whether `R7` ("the box is a cache, the branch cloud DB is
the record, the till has the last word") needs amending for a warehouse or
DC node type, and, by the coordinator's addition, for a manufacturing plant.
Both questions are one decision: _what kinds of node can a `Node` be?_

**Decision: `NodeRole` stays a tier, never a function. R7 is not amended.**

`NodeRole` answers "where do I sit in the replication tree, and who
governs me". Every consumer of it reads it for exactly that: `env.validation.ts`
(who may have a `PARENT_URL`), `ReplicationController` (authenticating a
child), `BranchPolicyRegistry` (which policy row governs a child) and the
drill-down `Node` registry (R19). A DC and a plant behave identically to a
store at every one of those points. Each is authoritative for its own facts
(receipts, picks, production runs, quality decisions), holds a read-only
cache of policy, and pushes facts up. So:

- Adding `WAREHOUSE` or `PLANT` to `NodeRole` would produce values that are
  either behaviourless (every consumer treats them as `BRANCH`) or carry
  `if (role === 'PLANT')` branches. The second is exactly the conditional
  the extension-point rule forbids.
- A site's function is not single-valued. A store with a micro-fulfilment
  back room, a plant with a factory outlet, or a DC that kits bundles each
  needs several functions under one node. `LocationType` composes, while
  `NodeRole` would force a false single choice.
- Function is already expressed twice, in the right places: the site's
  `Location.type` (`WAREHOUSE`, `PRODUCTION`, both existing) and the
  `MODULES` it boots (a plant boots `bom`, `manufacturing`, `quality`,
  `warehouse`; a store boots `pos`). R1 already makes both env and data,
  never code.

**Where a DC or plant lives.** Two placements, both admissible under R1, R2,
R7 and R13 without amendment:

| Placement                                                                                                                                                                                                                       | When                                                                                                               | What it costs                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. A `WAREHOUSE` or `PRODUCTION` `Location` inside an existing node** (the brand master, or the org node for central purchasing, per R13's "org warehouse `Location`")                                                        | **The default, and the only placement Tranches W, O, E and M need**                                                | The site's operations depend on that node's availability. There is no offline box for it unless the node itself has one.                                                                    |
| **B. A `BRANCH`-tier site node** of its own, whose principal `Location` is `WAREHOUSE` or `PRODUCTION`, optionally with a box (R7 unchanged, read as "the device on the floor has the last word": a handheld instead of a till) | A site that must keep scanning through an internet outage, or must hold its own database for scale or jurisdiction | Depends on replication work that is not built: `StockMovement` replication (WO-20.4), cross-node transfers (R3/R4), consolidation (WO-20.6). It also needs R27 below for an org-owned site. |

**The four rulings proposed for `RETAIL-ERP.md`.** This work does not edit
that file; the owner decides (OD-6). Text as it would be inserted after R26:

> **R27. A node's tier is not its site's function.** `NodeRole` names a tier
> (`BRANCH`, `BRAND`; `ORG` and `STANDALONE` by env). A store, a DC and a
> plant that hold their own database are all `BRANCH`-tier _site nodes_.
> Their function is their `Location.type` and the modules they boot. A site
> node may be parented by the ORG node when the organization, not a brand,
> owns it (a central DC under R13, a plant serving several brands). The
> parent records this as `Node.ownerScope ScopeLevel @default(BRAND)`,
> NOT NULL (canonical Ruling 4). `ORG` means "governed by organization
> policy, and `BrandPolicy` does not apply". `Node.retailBrandId` null keeps
> ADR-023's meaning, "not yet badged, fail closed", and is never overloaded
> to mean "org-owned". The admin chip row (R19) labels a site from its
> principal location type ("Store", "DC", "Plant"). The enum is never
> renamed.
>
> **R28. Routing decides where; only the node holding the goods records the
> stock fact.** R26 holds as written inside one database. Across databases,
> the node taking an order may _allocate_ a line to another node's location.
> The allocation is a request the holding node accepts or rejects, and that
> holding node alone records the stock movement, which flows up as a fact.
> Available-to-promise for another node's location is derived:
> replicated `VariantLocationStock` minus open allocations not yet
> reflected in a replicated movement. It is never a `move()` against a
> location this node does not hold. No node writes another node's location
> stock.
>
> **R29. A bin is a sub-ledger, not a `Location`.** Granularity finer than a
> `Location` (bins, slots, pallet positions) is a sub-ledger beneath
> `VariantLocationStock`, with its own single writer, exactly as `Lot`
> (ADR-069) is. `Location` stays the unit of ownership, replication, R2
> classification and `InventoryService.move()`'s invariant. Operational
> facts finer than a location (bin movements, warehouse tasks, operation
> logs, RFID reads) may be declared **node-local**. They are FACT-class, but
> deliberately not registered with `ReplicationRegistry`, because what the
> tiers above need reaches them as other registered facts
> (`StockMovement`, `BomProductionRun`, quality decisions).
>
> **R30. A quality hold is a `Location`, not a flag.** Goods awaiting
> inspection or rejected sit in a `Location` of type `QUALITY_HOLD`, moved
> there and back through `InventoryService.move()`, for the same reason
> ADR-010 made in-transit a `Location`. Every existing ledger, aggregate
> and report then sees held stock for free. Available-to-promise, online
> stock (R26) and routing (R28) count only location types a shared
> predicate marks promisable.

Why nothing more is needed: one writer per invariant is preserved at every
level.

- `InventoryService.move()` remains the only writer of location stock.
- `warehouse` is the only writer of the bin sub-ledger (doc 237 §3 shows
  how the cross-ledger equality is kept without a second writer of either).
- `quality` holds goods by moving them, not by flagging them.
- `orderrouting` moves stock only between locations in its own database
  (R28).

## 4. Packaging: eight capability modules, no new pack

**Zero new packs.** None of this is a sector: a grocer, a pharmacy chain and
an apparel brand all need bins, routing, EDI and plants. Classifying any of
them as a pack would contradict `module-packs.ts`'s own definition. It
would also buy no enforcement the INDEPENDENCE check does not already apply
to core modules, and it would forbid two modules that must cooperate
(WMS packing feeding EDI ASNs) from even meeting in core.

**Eight new `core`-classified modules, each with a real boundary.** Each
passes the same three tests:

1. A deployment exists that wants it without its neighbour.
2. Its actors differ.
3. Every flow into and out of it is a domain event or a read-only
   `PrismaService` read (the `reports` / `planning` precedent).

| Module             | Folder                        | Owns                                                                                                                                                                                                                                                                 | Wanted alone by                                                                          | Not wanted by                                           |
| ------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `warehouse`        | `supply-chain/warehouse/`     | `WarehouseSite`, `WarehouseZone`, `Bin`, `BinStock`, `BinMovement`, `WarehouseDemandLine`, `WarehouseTask`, `PickWave`, `WarehouseRuleVersion`, `Carton`/`CartonLine` (SSCC), `SsccSerialBlock`, `ShipmentLoad`, `BinVariance`                                       | a single-DC web shop; a vendor packing SSCC cartons                                      | a store chain doing ship-from-store with no bins        |
| `orderrouting`     | `sales/orderrouting/`         | `LocationRoutingProfile`, `RoutingPolicyVersion`, `FulfilmentRequest`, `FulfilmentRequestLine`, `PickupHandover`                                                                                                                                                     | a store chain doing click and collect                                                    | a single-location shop                                  |
| `supplynetwork`    | `supply-chain/supplynetwork/` | `SupplyRegion`, `SupplyLane`, `SourcingRuleSet`, `SourcingRule`                                                                                                                                                                                                      | a manufacturer planning plants (MRP); a chain routing orders                             | a single-location shop                                  |
| `edi`              | `system/edi/`                 | `EdiPartner`, `EdiPartnerChange`, `EdiMapProfile`, `EdiInterchange`, `EdiInboundDocument`, `EdiOutboundDocument`, `EdiControlNumberCounter`                                                                                                                          | a chain exchanging EDI with its own suppliers (buy side), with no vendor-compliance code | anyone not trading by EDI                               |
| `vendorcompliance` | `sales/vendorcompliance/`     | `RetailerProgram`, `CompliancePolicyVersion`, `RetailerShipTo`, `RetailerItem`, `RetailerPurchaseOrder`(+lines), `RetailerPoChange`, `OtifObservation`, `RetailerRemittance`, `Deduction`, `DeductionEvidence`, `RetailerSellThroughBatch`(+lines, + weekly roll-up) | a supplier selling into large retailers                                                  | a retail chain buying by EDI                            |
| `manufacturing`    | `supply-chain/manufacturing/` | `WorkCenter`, `WorkCenterCalendar`, `WorkCenterRateVersion`, `Routing`, `RoutingOperation`, `OperationLog`, `SubcontractorSite`                                                                                                                                      | a multi-plant or routed single plant                                                     | a bakery that only needs recipes and runs (`bom` alone) |
| `quality`          | `supply-chain/quality/`       | `InspectionPlan`, `InspectionCharacteristic`, `InspectionLot`, `InspectionResult`, `QualityHoldSite`, `NonConformance`                                                                                                                                               | a DC doing inbound AQL inspection; a plant                                               | a shop with no inspection                               |
| `rfid`             | `supply-chain/rfid/`          | `RfidReader`, `RfidZone`, `RfidCountSession`, `RfidSessionEpc`, `RfidObservedCount`                                                                                                                                                                                  | a chain with tagged stock                                                                | everyone else                                           |

**Why not fewer:**

- **WMS and OMS as one module.** OMS decides _where_ across locations; WMS
  decides _how_ inside one. A store chain routes with no bins, and a
  single-DC shop bins with no routing.
- **EDI and vendor compliance as one module.** A chain receiving ASNs from
  its own suppliers needs EDI and none of the retailer-compliance money
  machinery.
- **Quality inside manufacturing.** A retail DC inspects inbound goods with
  no plant.
- **Supply network inside routing.** MRP needs sourcing rules in a supplier
  deployment with no customer-order routing.

**Why not more:**

- Packing lives in `warehouse`, usable at a site with `binManaged = false`,
  so a small vendor's SSCC labels never need a second carton model.
- BOPIS, ship-from-store and endless aisle are one fulfilment-request
  lifecycle in `orderrouting`.
- MRP and rough-cut capacity are drafts-only engines in the existing
  `planning` module (ADR-066's posture), not a ninth module.
- Multi-level BOM and the production-order lifecycle extend `bom`, the stack
  that already carries cost snapshots and lots genealogy (OD-1).

**Why not fold into existing modules** (the option the request asked to
weigh):

- `fulfilment` is hard-imported by `orders` (`modules.registry.ts` note:
  checkout always needs `ShippingService.quote()`), so routing placed there
  would load in every Solo shop. That breaks R14's invisibility rule and
  makes routing impossible to drop. `RETAIL-ERP.md` Part 5 assigned "click &
  collect, ship-from-store, endless aisle" to `fulfilment`; that assignment
  predates `fulfilment` being built as a checkout-coupled shipping and
  returns module. This is the new evidence for departing from it, and the
  departure is recorded in §8.
- `inventory` gaining bins would put a second writer's worth of concepts
  inside the ledger primitive. ADR-069 kept even lots as an alongside
  writer.
- `tradingpartners`: see §5.

## 5. EDI: its own module behind a gateway

Three facts decide this:

- `tradingpartners` is a NEWAX-to-NEWAX JSON protocol whose whole design is
  "send data, not documents" (ADR-087).
- Retailer EDI is the opposite. The retailer dictates the document, version,
  segment usage, identifiers, transport, acknowledgement and deadlines, and
  then fines deviations.
- Doc 18 WO-18.5's sketch (an `EdiTranslator` in front of `tradingpartners`
  plus an `ediFormat` column) covers only format translation.

So:

- **`edi`** owns transport, translation and the interchange record, and talks
  to the rest of the system only through domain events carrying canonical,
  retailer-neutral and standard-neutral documents
  (`EdiDocumentReceived`, `EdiDocumentRequested`, `EdiDocumentSent`,
  `EdiDocumentAcknowledged`, `EdiDocumentFailed`). Canonical types live in
  `packages/shared` so no module imports another to read them.
- **`vendorcompliance`** owns the sell-side relationship with a retailer as a
  _compliance program_: versioned rules with provenance, POs as obligations,
  ASN deadlines, OTIF, deductions and disputes.
- **`tradingpartners`** becomes the **buy-side** consumer. A supplier's
  inbound 856 or 810 is mapped onto the existing `PartnerFactInbox`
  (`sale.dispatched`), so `purchasing`'s existing applier (WO-213.2) handles
  a NEWAX fact and an X12 ASN identically. Doc 18's `ediFormat` column is
  replaced by `TradingPartner.ediPartnerId` (bare scalar), because format
  alone is not enough: transport, identifiers and control numbers come with
  it.

The extension point shape and the "Walmart vs Target vs Amazon is data, not
code" mechanism are in doc 240 §3 and doc 241 §3.

**On the doc 18 deferral.** WO-18.5 said not to start EDI because a product
list names it "in the abstract". The owner's mandate (a named customer
profile whose business cannot run without it) is the new evidence that
lifts the deferral **for the framework**. It does not lift it for any
specific retailer. Doc 241's acceptance requires every
`CompliancePolicyVersion` to cite the guide it came from, and the repository
ships none (§10).

## 6. How the modules talk

**New domain events** (each both a `DomainEvent` constant and a
`DomainEventPayloads` entry; every handler idempotent):

| Event                                                                                                         | Published by                                    | Consumed by                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StockMoved`                                                                                                  | `inventory` (inside the movement's transaction) | `warehouse` (classify every movement at a WMS site: demand, inbound, removal; doc 237 §1)                                                                                     |
| `FulfilmentRequestCreated` / `…StatusChanged`                                                                 | `orderrouting`                                  | `warehouse` (pick demand at a WMS site), `notify` (pickup ready)                                                                                                              |
| `WarehouseShipConfirmed`                                                                                      | `warehouse`                                     | `orderrouting` (request shipped), `transfers` (records `StockTransfer.physicallyShippedAt`, one additive column; doc 237 §3), `vendorcompliance` (ship time for ASN and OTIF) |
| `ShipmentPacked`                                                                                              | `warehouse`                                     | `vendorcompliance` (SSCC carton hierarchy for the 856)                                                                                                                        |
| `BinVarianceRaised`                                                                                           | `warehouse`                                     | `notify`                                                                                                                                                                      |
| `SourcingRulesActivated`                                                                                      | `supplynetwork`                                 | `orderrouting`, `planning` (cache invalidation)                                                                                                                               |
| `EdiDocumentReceived` / `Sent` / `Acknowledged` / `Failed`                                                    | `edi`                                           | `vendorcompliance` (sell side), `tradingpartners` (buy side)                                                                                                                  |
| `EdiDocumentRequested`                                                                                        | `vendorcompliance`, `tradingpartners`           | `edi`                                                                                                                                                                         |
| `RetailerPurchaseOrderAccepted`                                                                               | `vendorcompliance`                              | `orderrouting` (if on)                                                                                                                                                        |
| `DeductionRecorded` / `DeductionResolved`                                                                     | `vendorcompliance`                              | `accounting`                                                                                                                                                                  |
| `BomProductionOrderReleased` / `Closed`                                                                       | `bom`                                           | `manufacturing` (create operation queue), `accounting` (variance on close)                                                                                                    |
| `OperationCompleted`                                                                                          | `manufacturing`                                 | `bom` (final operation's good quantity records a `BomProductionRun`), `quality` (in-process inspection lot)                                                                   |
| `QualityDecisionRecorded` / `QualityDispositionRecorded`                                                      | `quality`                                       | `accounting` (scrap write-off), `notify`. `planning`'s R25 defect rate reads `InspectionLot` read-only instead (WO-243.5)                                                     |
| `RfidCountObserved`                                                                                           | `rfid`                                          | `inventory` (phantom-stock suspects)                                                                                                                                          |
| `PlannedOrderAccepted`                                                                                        | `planning`                                      | `bom` (draft production order), `purchasing` (`PurchaseRequisition`)                                                                                                          |
| _Existing, newly consumed:_ `GoodsReceived`, `BomProductionCompleted`, `OrderPlaced`, `ShipmentStatusChanged` | as today                                        | `quality` (safety-net hold), `accounting` (production posting, doc 242), `orderrouting` (route on placement), `vendorcompliance` (delivery evidence for OTIF)                 |

**New `KNOWN_MODULE_COUPLINGS` entries.** Each is a same-transaction write
into `inventory`, the exact case the list exists for:

| Entry                       | The write that must commit together                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `warehouse -> inventory`    | a bin-count correction and the location-level `COUNT` movement it implies (doc 237 WO-237.5)                                                                         |
| `orderrouting -> inventory` | reversing stock at a line's provisional location and committing it at the routed one, with the `FulfilmentRequestLine` write (the `planning -> inventory` precedent) |
| `quality -> inventory`      | moving goods into or out of a `QUALITY_HOLD` location, with the `InspectionLot` decision                                                                             |

Plus one channel entry, **only if the owner rejects OD-3**:
`vendorcompliance -> orders` (the `accounts -> orders` precedent).
`edi`, `supplynetwork`, `manufacturing` and `rfid` add none.

**New extension points.**

- `EdiGateway` and `EdiMapExtension` (module-local in `edi`, `EDI_GATEWAYS`
  allowlist).
- `RfidReaderDriver` (module-local in `rfid`, `RFID_DRIVERS` allowlist).
- `OrderIntakeRegistry` in `core/extension-points/` (OD-3).

Putaway, pick-path and routing objectives are **data plus pure functions**
(canonical Ruling 3: `decide` is pure, `apply` is the single writer). A
strategy registry is added only when a second strategy needs code rather
than different weights.

**Read-only cross-module reads.** These go through `PrismaService`, writing
only their own tables:

- `orderrouting` reads `VariantLocationStock` and `supplynetwork`'s rules.
- `planning` reads `bom`, `manufacturing`, `supplynetwork`, `quality` and
  `vendorcompliance` sell-through.
- `vendorcompliance` reads `Shipment`/`ShipmentEvent` for delivery
  evidence.

## 7. Profiles as `MODULES` presets

Documentation, exactly as `MULTI-SECTOR.md`'s "Commercial-tier module
conventions" are. No code reads a profile name. `users`, `settings` and
`addresses` stay always-on as `modules.registry.ts` already makes them.

```bash
# Profile 1 — retail chain doing click and collect and ship-from-store
MODULES=catalog,cart,orders,payments,inventory,purchasing,crm,accounting,pos,transfers,organization,fulfilment,orderrouting,supplynetwork,tax

# Profile 2 — multi-DC chain with WMS, routing, inbound QC and EDI with its own suppliers
MODULES=catalog,cart,orders,payments,inventory,purchasing,crm,accounting,pos,transfers,organization,fulfilment,orderrouting,supplynetwork,warehouse,quality,edi,tradingpartners,tax

# Profile 3 — supplier selling into large retailers, no stores
MODULES=catalog,orders,payments,inventory,purchasing,crm,accounting,receivables,fulfilment,warehouse,edi,vendorcompliance,quality,tax

# Profile 4 — multi-plant manufacturer
MODULES=catalog,orders,inventory,purchasing,accounting,transfers,bom,manufacturing,quality,supplynetwork,warehouse,tax

# 1 + 3 + 4 in one deployment — the union, nothing else
```

`planning` is always on (ADR-066), so MRP is present wherever `bom` has
data (R20's manifest-awareness).

## 8. Documents this changes (proposed amendments, not made in this work)

| Document                                                                 | Amendment                                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RETAIL-ERP.md`                                                          | Insert R27–R30 (§3). Part 5: `fulfilment`'s row loses "click & collect, ship-from-store, endless aisle" to `orderrouting`; add the eight modules. R26 gains a pointer to R28. Part 7 gains a pointer to §12 below. |
| `ENTERPRISE-SCALE.md`                                                    | L-rules: a bin is not a `Location` (R29); enforcement table gains `StockMoved` reconciliation and the promisable-location predicate. The S4 gap gains the four presets of §7 as its CI matrix.                     |
| `MULTI-SECTOR.md`                                                        | Capability table gains the eight modules. "Commercial-tier module conventions" gains the four presets. `KNOWN_MODULE_COUPLINGS` list in the prose gains the three entries.                                         |
| `18-trading-partner-network.md`                                          | WO-18.5's status: framework built by docs 240 and 241. `ediFormat` replaced by `TradingPartner.ediPartnerId`.                                                                                                      |
| `integrations-connectivity/213-partner-fact-exchange.md`                 | Out-of-scope line "EDI/e-invoicing translation" now points to doc 240.                                                                                                                                             |
| `resilience-scalability/144-supply-chain-resilience-planning-engine.md`  | `onlineStockFor()` must use the promisable-location predicate. `assignFulfillingBranch()` is superseded for per-line routing by `orderrouting`; kept, not deleted.                                                 |
| `RETAIL-VERTICAL-COVERAGE-MATRIX.md`                                     | Gains a "supply-chain operations" section scoring docs 237–244.                                                                                                                                                    |
| `docs/implementation/README.md`                                          | A "Numbers 236–244" paragraph pointing at this folder.                                                                                                                                                             |
| `module-packs.ts`, `modules.registry.ts`, the four `.env*.example` files | One line per new module (`core`, `offByDefault`); `EDI_GATEWAYS`, `RFID_DRIVERS`                                                                                                                                   |
| `CLAUDE.md`                                                              | None. The three-axes table already says "a `Location` row on the movement; at chain scale, a node". R27 refines it without contradicting it.                                                                       |

## 9. Open decisions for the owner

Each has a recommendation; none is decided by this document alone.

**OD-1 — the canonical manufacturing stack.**

- **Background.** ADR-020 kept `bom` and `production` side by side.
  Multi-level structure, production orders, routings and MRP must attach to
  one of them, or the duplication triples.
- **Recommendation.** Build on `bom`. It already carries cost snapshots,
  lots genealogy (doc 71), tier scope and an UP replication listener.
  **Freeze** `production`: kept working for its two listeners (reorder and
  stitching cascade), not extended, not deprecated in code, and not deleted.
- **Later.** A separate ADR plans conversion of `BillOfMaterial` rows to
  `BomRecipe`s for a deployment that wants the new stack. Until then, a
  deployment should enable one stack. This does not supersede ADR-020's
  "production stays as-is"; it adds "and gains nothing new".

**OD-2 — the customer tax-invoice document. A prerequisite for EDI 810,
which is how a vendor gets paid.**

- **Background.** `Invoice` is keyed to `TradingPartner` and posts nothing,
  while AR keys `Contact`/`Order`.
- **Option a.** Extract R18's `invoicing` module (`RETAIL-ERP.md` Part 5
  named it) owning a `Contact`-keyed, gapless, posted customer invoice.
- **Option b.** Generalise the existing `Invoice` expand-only
  (`contactId` added, `tradingPartnerId` relaxed to nullable) inside
  `tradingpartners`.
- **Recommendation.** Option a, as its own brief, sequenced before WO-241.6.
  Option b would make `vendorcompliance` depend on `tradingpartners` to get
  paid.

**OD-3 — order intake for EDI orders.**

- **Option a.** `vendorcompliance -> orders` coupling (the `accounts -> orders`
  precedent).
- **Option b.** A core `OrderIntakeRegistry` that `orders` registers into and
  every channel calls.
- **Recommendation.** Option b. Four channels already funnel into
  `OrdersService` (POS, B2B accounts, EDI, and ADR-084's proposed
  hospitality sink). One seam stops the coupling list from growing one
  channel at a time, and ADR-084's `HospitalityOrderSink` should become its
  second caller rather than a second seam.

**OD-4 — revenue recognition for EDI orders.**

- **Background.** `OrderPlaced` posts revenue at placement for every channel.
  A retailer PO accepted today may ship in three weeks.
- **Recommendation.** For `channel = EDI`, post revenue and COGS on ship
  confirmation, not placement.
- **Who decides.** This is an accounting-policy call for the owner and their
  accountant (IFRS 15 / local GAAP "transfer of control"). It is not a
  technical one.

**OD-5 — the first EDI gateway and transport.**

- **Options.** A full-service EDI provider (they map, they track retailer
  changes, we exchange canonical JSON), native X12 over a VAN mailbox
  (SFTP), or native X12 over AS2. Each native transport needs a dependency
  (an SFTP client, or S/MIME for AS2) answered under
  `.claude/rules/dependencies.md`.
- **Recommendation.** Do not build a transport speculatively. Build whichever
  the first real customer and their retailer actually require, and keep the
  others as interface-only.

**OD-6 — approve R27–R30** for insertion into `RETAIL-ERP.md`.

**OD-7 — accept `StockMoved`'s cost.**

- **Cost.** One outbox row per stock movement, roughly doubling
  inventory-write rows.
- **Recommendation.** Accept, measured in WO-236.1, because `RETAIL-ERP.md`
  Part 5 already planned the event and `warehouse` needs every movement at a
  WMS site.
- **Fallback.** If the measurement fails WO-236.1's bar, `warehouse` tails
  `StockMovement` by `(createdAt, id)` with a 10-minute overlap window and
  `BinMovement.stockMovementId @unique` for idempotency.

**OD-8 — governance of an org-owned site node (R27).**

- **Question.** Which policy rows govern it? Org-level switches live in
  `Setting` (`org.allow_inter_brand_transfers`), and canonical Ruling 10
  forbids faking per-scope settings.
- **Recommendation.** An `OrgPolicy` row beside `BrandPolicy`, added only
  when the first org-owned site node is real.

## 10. Needs verification — never invented in this repository

This is compliance-adjacent work (fines, legal delivery windows, tax
invoices). For every item below the design provides **a field with
provenance, and no default**:

1. **Each retailer's EDI implementation guides.** Which documents are
   mandatory, X12 or EDIFACT version, segment and element usage, qualifier
   choices, `HL` hierarchy, ISA/GS or UNB identifiers. These are usually
   published inside the retailer's supplier portal, not publicly, and they
   change.
2. **Transport per retailer.** AS2 direct, a specific VAN, or a portal web
   form. Also whether that retailer accepts a full-service provider.
3. **Document timing rules.** When an ASN is due relative to ship or
   arrival, when a 997 is due, and when an 855 is due.
4. **Label specifications.** GS1-128 SSCC content and placement, and any
   retailer-specific label zones.
5. **OTIF definitions.** The on-time window, measured against which date
   (must-arrive-by, appointment, ship); in-full at which level (unit, case,
   line); the measurement data source; exemptions. It is publicly reported
   that at least one large US retailer runs an OTIF program with fines
   expressed as a percentage of cost of goods. The current rates, windows
   and exemptions must come from that retailer's current supplier
   documentation, never from this document.
6. **Chargeback and deduction reason codes and amounts**, dispute windows,
   and the dispute submission channel (usually a portal). No dispute API is
   assumed.
7. **Whether 852 and 820 arrive by EDI at all.** Some retailers provide
   sell-through and remittance only through their own portals or data
   feeds. Doc 241 therefore accepts a file import beside EDI for both.
8. **The supplier's GS1 Company Prefix** (from GS1 membership), needed for
   every SSCC.
9. **Revenue recognition policy** (OD-4).
10. **Country e-invoicing mandates** (for example Peppol or national
    clearance models) are a different obligation from retailer EDI and are
    out of scope here (`RETAIL-ERP.md`'s `fiscal`).

## 11. The five pillars

| Pillar              | How this program touches it                                                                                                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proper architecture | Eight independent modules, three same-transaction couplings into `inventory`, everything else events and read-only reads; no pack, no conditional on profile; R27–R30 keep one writer per invariant                                                                   |
| Scalable systems    | Bins as a sub-ledger, not 50,000 `Location` rows each read by every location picker. Available-to-promise is a read-time indexed query (Ruling 5). Node-local high-frequency facts. Row-count estimates per brief. Partitioning named with measured triggers.         |
| Secure by design    | Every route `@RequirePermission`. Device-credential principals for handhelds and RFID readers. EDI partner credential changes need two people. Retailer data scoped by `RetailerProgram`. Pickup codes hashed and reset-guarded.                                      |
| Stable & reliable   | Store first, apply second for every inbound EDI document. Idempotency keys on every inbound fact. Durable outbound sender with dead letters and replay. Handheld offline under a bounded ceiling (canonical Ruling 2). Reconciliation queues instead of silent drift. |
| Observable          | Structured `Logger` in every service. EDI message monitor and dead-letter screen. Deadline alerts to permission holders. Evidence-class audit on money and policy changes (canonical Ruling 9). No APM is claimed (ADR-017 stays open).                               |

## 12. Roadmap — tranches

One work order = one branch = one PR, named `core/<type>/<module>/<slug>`.
A tranche needs only the tranches it names. The owner picks which profile to
serve first, from the first real customer. The graph allows any of W, O, E
or M to start once SC0 is done.

```
SC0 ──┬── W (warehouse) ───────────────┬── E4 (ASN needs SSCC cartons)
      ├── O (supplynetwork, routing) ──┤
      ├── E0–E3, E5–E8 (EDI, compliance)┘
      ├── Q (quality) ── needs W2 for receiving inspection at a WMS site, M3 for in-process
      ├── M (manufacturing) ── M5 (MRP) needs O1 (sourcing rules)
      ├── R (RFID, phantom stock) ── R1 needs only SC0.1
      └── N (site nodes) ── needs RETAIL-ERP WO-20.4 / WO-20.6; nothing above waits for N
```

**Tranche SC0 — the floor everything stands on.** _Cheap, and each item is
a defect or gap already present._

- `WO-236.1` `StockMoved` event from `InventoryService` inside the
  movement's transaction. **Bar:** p95 latency of `move()` measured before
  and after on the existing inventory spec fixture at 10,000 movements must
  not regress by more than 15%, else OD-7's fallback.
- `WO-236.2` A promisable-location predicate in `packages/shared`
  (`isPromisableLocationType`: `STORE`, `WAREHOUSE` yes; `IN_TRANSIT`,
  `PRODUCTION`, `QUALITY_HOLD`, `SUBCONTRACTOR` no). Additive
  `LocationType.QUALITY_HOLD` (R30, doc 243) and `LocationType.SUBCONTRACTOR`
  (our stock held at a contract manufacturer, doc 242), in one migration.
  `onlineStockFor()` uses the predicate. This fixes it summing in-transit
  stock. Storefront availability display reads `ProductVariant.stock`
  (`InventoryService`'s own comment: "the live number the storefront checks
  against"), which is the sum across **all** locations. Once a deployment
  holds non-promisable stock (in transit, held, at a contractor), that
  display switches to the promisable read. Commits are already safe, because
  `move()`'s guard checks the committing location. The display is what
  overstates.
- `WO-236.3` **Restock from the ledger.** Order cancellation and return
  inspection restock each `(variant, location)` the order's own
  `StockMovement` rows (`refType = 'Order'`) net-committed, instead of
  `order.locationId ?? defaultLocationId()`. Byte-identical for every
  single-location order. Required before any split routing.
- `WO-236.4` L2 branch-scoped inventory reads (`ENTERPRISE-SCALE.md`'s gap
  #1, design in `16-pbac-row-scoping.md`). Required before DC or plant staff
  get inventory access in a shared database.
- `WO-236.5` S4 pack-absence boot CI over the four §7 presets plus today's
  default.
- `WO-236.6` `JournalLine.locationId` (additive, bare scalar), set by every
  posting rule whose source fact names a location. Plant and DC P&L depend
  on it.
- `WO-236.7` `OrderIntakeRegistry` (if OD-3 goes that way).

**Tranche W — warehouse** (doc 237): `WO-237.1`–`237.7`.

**Tranche O — supply network and order routing** (docs 239, 238):
`WO-239.1`–`239.3`, then `WO-238.1`–`238.7`. `WO-238.7` (multi-node routing,
R28) waits on Tranche N.

**Tranche E — EDI and vendor compliance** (docs 240, 241): OD-2's invoicing
brief (E0), `WO-240.1`–`240.6`, `WO-241.1`–`241.9`. `WO-241.5` (856) needs
`WO-237.6` (cartons).

**Tranche Q — quality** (doc 243): `WO-243.1`–`243.5`.

**Tranche M — manufacturing** (doc 242): `WO-242.1`–`242.10`. `WO-242.6`
(MRP) needs `WO-239.2`.

**Tranche R — phantom stock and RFID** (doc 244): `WO-244.1` (no hardware)
first, then `WO-244.2`–`244.4`.

**Tranche N — site nodes for DCs and plants** (this doc):

- `WO-236.8` R27: `Node.ownerScope`, org-parented `BRANCH` nodes,
  `BranchPolicyRegistry` skipping `BrandPolicy` for `ownerScope = ORG`,
  `env.validation.ts` comment and test, and chip labels by site type.
- `WO-236.9` is **not new work**. It is the dependency on `RETAIL-ERP.md`
  WO-20.4 (`StockMovement` fact-up) and cross-node transfers (R3/R4), named
  here so no one assumes a DC node works before they land.
- `WO-236.10` A site-node box (R7 reused) for a DC or plant that must scan
  offline.

## 13. Program acceptance (architecture-level; each brief has its own)

- `pnpm lint` passes with exactly the three new `KNOWN_MODULE_COUPLINGS`
  entries of §6 (four if OD-3 goes to coupling), each carrying its
  justification comment.
- `MODULES` set to each §7 preset boots, serves `/health`, and passes
  `/meta`. Removing any one of the eight new modules from a preset still
  boots (S4, WO-236.5).
- No string `WAREHOUSE`/`PLANT` is added to `NodeRole`. A grep for
  `role === ` against `NodeRole` values in new code returns nothing.
- A grep for any retailer's name across `apps/*/src` and `packages/*/src`
  returns nothing. `pnpm check:rebrand`'s spirit applied to third parties:
  retailer identity is data.
- A Solo deployment (`NODE_ROLE=STANDALONE`, default `MODULES`) shows no nav
  entry, no route and no table read from any of the eight modules (R14).

## 14. Out of scope (named and sequenced, not silently skipped)

- Transportation management: carrier tendering, freight audit, routing
  guides for collect shipments (X12 753/754), dock appointment booking with
  carriers. This is the next brief after doc 241 if a profile-3 customer
  ships collect.
- Yard management.
- Labour management standards (engineered labour). Doc 237 records task
  timings only.
- Country e-invoicing and fiscal clearance (`fiscal`, `RETAIL-ERP.md`
  Tranche 6).
- A shared EDI relay on `apps/platform` (ADR-087's Option 3, still
  sequenced).
- Voice picking and pick-to-light hardware.
- Automated storage and retrieval.
- Demand-planning collaboration (CPFR) with retailers beyond ingesting
  sell-through.
- Product lifecycle management and engineering change orders, beyond BOM
  versioning (doc 242).
