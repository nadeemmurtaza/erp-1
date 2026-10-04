# Supply-chain operations — document set

The retail vertical extended into a full-spectrum retail and supply-chain
operating system: warehouses with bins and waves, order routing across
DCs and stores, EDI and compliance for suppliers selling into large
retailers, and multi-plant manufacturing. One Core, one commit; every
capability is a module a deployment either boots or does not.

> **Status: Planned (2026-10-04).** Nothing here is built. Design only.
> Decision record: [ADR-088](../decisions/ADR-088-supply-chain-operations-eight-core-capability-modules-node-tier-is-not-site-function.md) (Proposed).
> Requested by the owner: retail chains (profile 1), multi-warehouse chains
> needing WMS + OMS (profile 2), suppliers complying with retailers' EDI,
> OTIF and chargeback programs (profile 3), and, added the same day,
> multi-plant manufacturers (profile 4). RFID phantom-inventory detection is
> in scope at lower priority.

## Read in this order

| File | What it is |
|---|---|
| [`236-supply-chain-operations-architecture.md`](./236-supply-chain-operations-architecture.md) | **Start here.** The three big calls: no new pack, eight capability modules; a node's tier is not its site's function (DCs and plants); EDI as its own module behind a gateway. Proposed rulings R27–R30, the profiles as `MODULES` presets, the phased roadmap, open decisions, and what must be verified against real retailer documents |
| [`237-warehouse-management.md`](./237-warehouse-management.md) | `warehouse`: sites, zones, bins, a bin sub-ledger under `VariantLocationStock`, receiving, putaway, picking and waves, packing with SSCC, loads |
| [`238-order-routing-omnichannel-fulfilment.md`](./238-order-routing-omnichannel-fulfilment.md) | `orderrouting`: per-line fulfilment requests, routing policy, split shipments, ship-from-store, click and collect, endless aisle |
| [`239-supply-network-sourcing-rules.md`](./239-supply-network-sourcing-rules.md) | `supplynetwork`: regions, lanes and sourcing rules (make / transfer / buy / subcontract / fulfil-from) that routing and MRP both read |
| [`240-edi-gateway.md`](./240-edi-gateway.md) | `edi`: partners, interchanges, acknowledgements, canonical documents and the `EdiGateway` extension point; buy-side via `tradingpartners` |
| [`241-retailer-vendor-compliance.md`](./241-retailer-vendor-compliance.md) | `vendorcompliance`: retailer programs, versioned policies with provenance, retailer POs, ASN timing, OTIF, deductions and disputes, sell-through |
| [`242-multi-plant-manufacturing.md`](./242-multi-plant-manufacturing.md) | `bom` multi-level and production orders, `manufacturing` (work centers, routings, operations), MRP and capacity in `planning`, inter-plant transfers, plant costing, contract manufacturing |
| [`243-quality-inspection-holds.md`](./243-quality-inspection-holds.md) | `quality`: inspection plans and lots, holds through a hold `Location`, release, non-conformance |
| [`244-rfid-phantom-inventory.md`](./244-rfid-phantom-inventory.md) | `inventory` phantom-stock suspects (works with no hardware), and `rfid` evidence from readers |

## Words that must not blur

| Word | Means here | Never means |
|---|---|---|
| **Pack** | A sector's worth of modules (`module-packs.ts`) | A capability. None of these eight modules is a pack. |
| **Profile** | A documented `MODULES` preset for a kind of customer | A code path, a flag, or a deployment type a company is locked into |
| **Node** | A deployment with its own database in the chain topology (`RETAIL-ERP.md` Part 1) | A building |
| **Site** | A place goods live (a store, a DC, a plant) — one or more `Location` rows | A node; a site may sit inside a node or be one |
| **Bin** | A slot inside a WMS site, tracked by `warehouse`'s sub-ledger | A `Location` |
| **Fulfilment request** | `orderrouting`'s instruction to one location to fulfil part of an order | `fulfilment`'s `Shipment` (the parcel that leaves) |
| **Sourcing rule** | `supplynetwork`'s answer to "how is SKU X supplied at destination Y" | `planning`'s `SPLIT_PO_ALTERNATE_SUPPLIER` candidate action (R22, `action-ranking.ts`), which proposes a one-off response to a shock; `RETAIL-ERP.md` Part 5's planned `SourcingAlternative` model was never built |
| **Retailer** | A customer whose compliance program we follow (`vendorcompliance`) | `RetailBrand`, which is our own brand |
