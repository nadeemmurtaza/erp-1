# ADR-088 — Supply-chain operations (WMS, order routing, EDI and vendor compliance, multi-plant manufacturing): eight core capability modules and no new pack; a node's tier is not its site's function; EDI is its own module behind a gateway extension point

[← Decision log](../DECISIONS.md)

### Context

The owner confirmed a new mandate (2026-10-04): the retail vertical becomes a
full-spectrum retail and supply-chain operating system, globally, serving
four customer profiles on one Core:

1. retail chains running their own stores (largely built; see
   `RETAIL-VERTICAL-COVERAGE-MATRIX.md`);
2. large multi-warehouse chains needing a real WMS (receiving, putaway,
   bins, pick paths, waves) and a real OMS (split shipments across DCs and
   stores, ship-from-store, endless aisle, click and collect);
3. suppliers and manufacturers selling wholesale into large retailers and
   complying with those retailers' EDI (850/855/856/810/820/852/997), OTIF
   windows and chargeback programs;
4. multi-plant manufacturers (folded into the same program by the owner,
   relayed by the coordinator the same day): routings, work centers,
   multi-level BOM and MRP, inter-plant transfers, quality checkpoints,
   plant-level costing, capacity planning, sourcing rules, and contract
   manufacturing.

Lower priority: RFID-driven phantom-inventory detection.

The full design is the document set in
[`supply-chain-operations/`](../supply-chain-operations/README.md), docs
236–244, with the architecture and roadmap in
[`236-supply-chain-operations-architecture.md`](../supply-chain-operations/236-supply-chain-operations-architecture.md).
This entry records the irreversible calls only.

Verified state that forced each call (read in code on 2026-10-04, not
inherited from older gap documents):

- `module-packs.ts`'s own header: business models "are NOT packs and never
  appear here. They are capability modules in core." `MULTI-SECTOR.md`'s
  taxonomy says the same.
- `NodeRole` (`organization.prisma`) is `BRANCH | BRAND`; `NODE_ROLE` in
  `env.validation.ts` adds `STANDALONE | ORG`. Its consumers are replication
  topology and policy resolution only (`ReplicationController`,
  `BranchPolicyRegistry`, the drill-down `Node` registry). `LocationType`
  already has `WAREHOUSE` and `PRODUCTION`.
- R26 as built (`planning/online-stock.service.ts`) is single-database,
  whole-order and single-location. `onlineStockFor()` sums every
  `VariantLocationStock` row, `IN_TRANSIT` buckets included. Order
  cancellation (`orders.service.ts` ~L996–1006) and return restock
  (`returns.service.ts` ~L255) both restock at
  `order.locationId ?? defaultLocationId()`. That cannot represent an order
  split across locations.
- No `StockMoved` domain event exists, although `RETAIL-ERP.md` Part 5 names
  one. There are no transfer dispatch/receive events either.
- `Lot`/`SerializedUnit` are sub-ledgers beneath `VariantLocationStock`, with
  their own single writers called alongside `move()` (ADR-069).
- `18-trading-partner-network.md` WO-18.5 defers EDI "until a real partner
  names the standard". `tradingpartners` is a NEWAX-to-NEWAX JSON fact
  protocol (ADR-087), not ANSI X12, and has no concept of a retailer's
  compliance program.
- Two manufacturing stacks coexist by design (ADR-020): `bom` (`BomRecipe`,
  flat by rule, plus `BomProductionRun` with cost snapshots, lots genealogy,
  tier scope and an UP replication listener) and `production`
  (`BillOfMaterial`, `WorkOrder`). Neither has routings, work centers, MRP,
  quality or capacity.
- `GoodsReceived`, `BomProductionCompleted`, adjustments and write-offs post
  nothing to the ledger. `JournalLine` has no location dimension.
  `costCentreId` exists with no backing model.

### Options Considered

**A. Packaging: how many packs, how many modules**

- A1. One "supply-chain" sector pack holding everything. Rejected: none of
  this is a sector, because a grocer and an apparel brand both need a WMS.
  It would also violate `module-packs.ts`'s own rule, and one pack would make
  WMS, OMS, EDI and manufacturing impossible to drop independently.
- A2. Three packs (WMS, OMS, EDI). Rejected for the same "not a sector"
  reason. Classifying them as packs would also forbid two modules that must
  cooperate (WMS packing data feeding EDI ASNs) from even coupling through
  core, while buying no enforcement the independence check does not already
  give core modules.
- A3. Fold everything into existing modules (`inventory`, `fulfilment`,
  `tradingpartners`, `bom`). Rejected:
  - `fulfilment` is hard-imported by `orders` (checkout's shipping quote), so
    anything placed in it loads in every Solo shop.
  - `tradingpartners`' fact protocol is the opposite philosophy from a
    retailer-dictated document standard.
  - `inventory` would gain a second writer's worth of WMS concepts.
- A4. **New core-classified capability modules, one per real boundary, each
  survivably absent and independently droppable (chosen).**

**B. Node topology for DCs and plants**

- B1. Add `WAREHOUSE` and `PLANT` to `NodeRole`. Rejected. Every consumer of
  `NodeRole` would either branch on the new values (an `if (role === …)`
  conditional the rules forbid) or treat them exactly like `BRANCH`, which
  makes them behaviourless.
- B2. Amend R7 to define a separate warehouse-execution database layered
  over the branch database. Rejected: it creates a second record for stock,
  breaking D5 and R2.
- B3. **A node's tier (`NodeRole`) and its site's function (`LocationType`
  plus the modules it boots) are separate axes (chosen).** A DC or plant is
  a `Location`. It sits inside an existing node by default (R13's org
  warehouse precedent), or becomes a `BRANCH`-tier site node when it needs
  its own database or offline box.

**C. EDI**

- C1. Extend `tradingpartners` with doc 18's `EdiTranslator` and an
  `ediFormat` column. Rejected as the whole answer. Translation is the
  smallest part of retailer EDI. Envelopes and control numbers, functional
  acknowledgements, transport (AS2, VAN mailbox, full-service provider),
  document deadlines, and the compliance rules and money behind them have no
  home in a NEWAX-to-NEWAX protocol.
- C2. EDI as core platform code (`apps/api/src/core/edi`). Rejected: it owns
  tables, screens, permissions and credentials, and must be absent from a
  Solo shop's boot.
- C3. **A new `edi` module (transport, translation, interchange log) that
  speaks only domain events carrying retailer-neutral canonical documents,
  plus a new `vendorcompliance` module that owns the retailer relationship
  as a compliance program (chosen).** `tradingpartners` becomes a buy-side
  consumer of the same events, which finally realises doc 18 WO-18.5.

### Decision

**A — zero new packs; eight new `core`-classified capability modules.**

| Module             | Owns                                                                                                                                                                 | Brief |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `warehouse`        | sites, zones, bins, a bin sub-ledger under `VariantLocationStock`, warehouse tasks, waves, packing, SSCC cartons, loads                                              | 237   |
| `orderrouting`     | per-line fulfilment requests across locations, routing policy (pure `decide` / `apply`), split shipments, ship-from-store, click-and-collect handover, endless aisle | 238   |
| `supplynetwork`    | regions, lanes, sourcing rules (make / transfer / buy / subcontract / fulfil-from) as versioned policy                                                               | 239   |
| `edi`              | EDI partners, interchanges, control numbers, acknowledgements, the `EdiGateway` provider extension point                                                             | 240   |
| `vendorcompliance` | retailer programs, versioned compliance policies with provenance, retailer PO obligations, OTIF, deductions and disputes, sell-through                               | 241   |
| `manufacturing`    | work centers, calendars, routings, operation execution, in-plant dispatch, subcontract operations                                                                    | 242   |
| `quality`          | inspection plans and lots, holds and release through a hold `Location`, non-conformance                                                                              | 243   |
| `rfid`             | reader registration, EPC decode, count sessions emitting observed-count evidence                                                                                     | 244   |

Existing modules gain additive work, each justified in its brief:

- `bom` gains multi-level structure and a production-order lifecycle whose
  completions record the existing `BomProductionRun`.
- `planning` gains MRP and rough-cut capacity as drafts-only engines.
- `inventory` gains a `StockMoved` event, a `QUALITY_HOLD` location type
  and a phantom-stock suspect queue.
- `orders` gains restock-from-ledger, `pickupLocationId` and an `EDI`
  channel.
- `fulfilment` gains a `PICKUP` shipping-method kind.
- `accounting` gains a `JournalLine.locationId` dimension, a `CostCentre`
  model and the new posting rules.
- `tradingpartners` becomes the buy-side consumer of EDI events.

The four profiles are documented `MODULES` presets (the convention in
`MULTI-SECTOR.md`'s "Commercial-tier module conventions"). They are
orthogonal and freely combined. A company can be a store chain, a vendor to
another retailer and a multi-plant manufacturer in one deployment. No code
path names a profile.

**B — `NodeRole` stays tier-only. R7 needs no amendment.** A DC is a
`WAREHOUSE` `Location` and a plant is a `PRODUCTION` `Location`. Each lives
inside the node that owns it, or in a `BRANCH`-tier site node of its own.
Four rulings are proposed for the owner to insert into `RETAIL-ERP.md`
(text in doc 236 §3; this work did not edit that file):

- **R27.** Tier is not function. A site node may be parented by the ORG
  node. New column `Node.ownerScope ScopeLevel @default(BRAND)`, NOT NULL
  per canonical Ruling 4; null `retailBrandId` keeps ADR-023's meaning.
- **R28.** Routing decides where; only the node holding the goods records
  the stock fact. Cross-node available-to-promise is derived, never a write
  to another node's location stock. This is R26 at multi-node scale.
- **R29.** Sub-location granularity (bins) is a sub-ledger beneath
  `VariantLocationStock`, never a `Location` (the ADR-069 precedent).
  High-frequency operational facts may be node-local.
- **R30.** A quality hold is a `Location`, not a flag (the ADR-010
  precedent). Available-to-promise excludes it.

**C — EDI is the `edi` module behind an `EdiGateway` extension point.
Retailer requirements are versioned data with provenance. No retailer name
or rule appears in application code.** The shape (full text in doc 240 §3):

- `EdiGateway`, selected by the new `EDI_GATEWAYS` env allowlist (empty by
  default, the same idiom as `COURIER_PROVIDERS`). A gateway is either:
  - native (it translates with `EdiTranslator` over `EdiMapProfile` rows,
    plus optional `EdiMapExtension` code keyed by a profile's
    `extensionKey`); or
  - full-service (the provider maps documents and keeps up with retailer
    changes, and we exchange canonical JSON with it).
- Canonical, retailer-neutral and standard-neutral document types live in
  `packages/shared`. They cover X12 and EDIFACT/EANCOM alike.
- Retailer compliance rules live in `vendorcompliance` as
  `CompliancePolicyVersion` rows. Each row is effective-dated and carries
  `guideTitle`, `guideVersion`, `guideRetrievedOn`, `enteredByUserId` and
  `verifiedByUserId`.
- Adding Walmart, Target or Amazon is therefore a row set (plus, at most, one
  `EdiMapExtension` file when a guide demands structure data cannot
  express). It is never an `if` in code.

**The doc 18 WO-18.5 deferral is lifted by the owner's mandate for the
framework only.** Building any retailer's profile still requires that
retailer's current published implementation guide, obtained by a real
customer. The repository ships no retailer profile with invented values.

### Reasoning

- **A.** "Every module is independent" is enforced for `core` and pack
  modules alike by the INDEPENDENCE check. Core classification loses no
  enforcement and keeps `module-packs.ts`'s own definition of a pack true.
  Each module boundary passes three tests:
  - a deployment exists that wants one module without the other (a store
    chain wants routing without bins; a single-DC web shop wants bins
    without routing; a small vendor wants EDI without manufacturing);
  - the actors differ;
  - every cross-module flow is already expressible as a domain event or a
    read-only `PrismaService` read (the `planning` / `reports` precedent).

  The new `KNOWN_MODULE_COUPLINGS` entries are exactly the same-transaction
  writes into `inventory` the list was made for: `warehouse`,
  `orderrouting`, `quality`, and the existing pattern for `bom`.

- **B.** One writer per invariant holds unchanged. `InventoryService.move()`
  remains the only writer of location stock. The `warehouse` module is the
  only writer of the bin sub-ledger. `quality` holds goods by moving them
  into a hold `Location` through `move()`.

  A DC or plant behaves exactly like a branch at the replication layer:
  authoritative for its own facts, a read-only cache of policy. So nothing
  at that layer needs a new enum value. What genuinely differs is
  governance (an org-owned site), which is a column, not a role.

  R26's literal text ("decrements that branch's allotment through `move()`")
  is correct in one database and would break R2 across databases. R28
  states the multi-node form before any code depends on the ambiguity.

- **C.** Keeping transport and translation in `edi`, and compliance and
  money in `vendorcompliance`, lets a retail chain use EDI with its own
  suppliers without enabling any vendor-compliance code. Putting the
  extension point at the gateway level means "maintain retailer maps
  ourselves" and "buy a full-service provider" are two implementations of
  one interface, not two architectures. Provenance on every policy row means
  a chargeback dispute can cite which version of which guide a rule came
  from. This is compliance-adjacent work, where a guessed default is worse
  than an empty field.

### Consequences

- **Benefits.**
  - Every profile composes from the same commit.
  - A Solo shop boots none of the eight modules and sees none of them (R14).
  - Bins, routing, EDI and manufacturing each degrade to absent rather than
    broken.
  - Existing single-database behaviour (R26, transfers, production runs)
    keeps working unchanged until a work order deliberately extends it.
- **Costs.**
  - Eight modules, 67 new tables (counted from docs 237–244's schemas; most
    are small policy or mapping tables) and 31 new permission keys across the
    program, each seeded to a role in its own work order.
  - One outbox row per stock movement once `StockMoved` ships. Its write
    amplification is measured in SC0.1, with a cursor-tail fallback named.
  - Multi-node DC and plant sites depend on unbuilt replication work
    (WO-20.4 StockMovement replication, cross-node transfers). Until then a
    DC or plant runs as a `Location` inside a brand or org node.
- **Proposed rulings.** R27–R30 are proposed, not inserted. The owner
  decides whether they go into `RETAIL-ERP.md`; doc 236 §8 lists every
  document of record that would change.
- **Open decisions, each with a recommendation in doc 236 §9:**
  - OD-1: the canonical manufacturing stack. The recommendation is `bom`,
    with `production` frozen, not deleted. This touches ADR-020's posture.
  - OD-2: the customer tax-invoice document. It is a prerequisite for EDI 810.
  - OD-3: an `OrderIntakeRegistry` extension point versus per-channel
    couplings. It interacts with ADR-084's proposed `HospitalityOrderSink`.
  - OD-4: revenue recognition timing for EDI orders.
  - OD-5: the first EDI gateway and transport, which implies a dependency
    decision.
  - OD-6: approval of R27–R30.
  - OD-7: accepting `StockMoved`'s cost.
  - OD-8: org-owned site governance.
- **Needs verification, never invented:** every retailer-specific value, as
  listed in doc 236 §10. That covers implementation guides, transports, ASN
  deadlines, label specs, OTIF definitions, fine schedules, dispute windows,
  and whether 852 or 820 arrive by EDI at all.

### Parameters

Exact values with reasoning live in each brief's Parameters table. These
are the ones that decide behaviour under load or attack:

| Parameter                              | Value                                                                       | Applies to                   | Brief |
| -------------------------------------- | --------------------------------------------------------------------------- | ---------------------------- | ----- |
| EDI outbound retry delay               | `min(30 s × 2^(n−1), 900 s)`                                                | `EdiOutboundDocument` sender | 240   |
| EDI outbound give-up                   | 24 h, then `DEAD_LETTER` (replayable)                                       | same                         | 240   |
| EDI deadline alert                     | 60 min before a document's `dueBy` if not transport-acknowledged            | same                         | 240   |
| EDI inbound rate limit                 | 600 requests / 60 s per source IP                                           | inbound gateway route        | 240   |
| EDI raw interchange cap                | 256 MiB, stored through `StorageDriver`, parsed in 5,000-segment chunks     | inbound                      | 240   |
| Canonical payload inline cap on events | 256 KiB, else a storage key                                                 | `EdiDocument*` events        | 240   |
| RFID upload batch                      | 2,500 EPCs per request (stays under the platform's 100 KiB JSON body limit) | `rfid` ingestion             | 244   |
| RFID device rate limit                 | 60 requests / 60 s per device credential                                    | same                         | 244   |
| Handheld offline ceiling               | 500 queued confirmations or 4 h, whichever comes first                      | `warehouse` offline tasks    | 237   |
| BOM depth guard                        | 20 levels                                                                   | `bom` multi-level explode    | 242   |
| Max split shipments per order          | 3 (Setting `orderrouting.max_splits`)                                       | routing decide               | 238   |

### Status

Proposed (2026-10-04). Nothing built. Decisions A–C await the owner's
approval of doc 236; the open decisions OD-1 to OD-8 await the owner
individually.
