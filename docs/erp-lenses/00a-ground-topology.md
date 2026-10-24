# 00a. Ground: Topology, editions and the scale machinery

Reconnaissance report from the `ground:topology` agent of workflow `wf_0cc0602e-66b`, recorded verbatim.
It is the raw input to [00-uagent.md](00-uagent.md), which merges all six into one map. Read this one when you
want the unsummarised detail for this area.

## Facts

All paths relative to the worktree root.

## The five "where/which" concepts (all read from schema files)

**Organization** — `apps/api/prisma/schema/organization.prisma:15`. Fields: `id`, `name`, `allowInterBrandTransfers Boolean @default(false)`, timestamps, `retailBrands RetailBrand[]`. Its own doc comment says at most one row per database, and only an ORG-tier deployment has one — a BRAND-tier deployment knows its org only through `PARENT_URL`. `OrganizationService.myScope()` (`apps/api/src/modules/organization/organization.service.ts:58`) fetches it with `findFirst()` — a singleton assumption in code.

**RetailBrand** — `organization.prisma:40`. `organizationId String?`, `parentId String?` (self-relation `RetailBrandHierarchy`, arbitrary nesting depth = sub-brands), `slug @unique`, `isActive`. Relations: `policy BrandPolicy?`, `locations Location[]`, `adminScopes AdminScope[]`. Distinct from `Brand` in `catalog.prisma:46`, which is the *maker* of a product. This deployment's own brand is never a row here — it is `packages/shared/src/brand.ts` (Br1, build-time).

**BrandPolicy** — `organization.prisma:70`, `retailBrandId @unique`, three flags all `@default(false)`: `allowBranchProductCreation`, `allowBranchLocalPurchasing`, `allowInterBranchTransfers`. R9's fourth switch (`org.allow_inter_brand_transfers`) lives on `Organization` instead.

**AdminScope** — `organization.prisma:106`. `userId`, `level AdminScopeLevel (ORG|BRAND|BRANCH)`, `retailBrandId String?`, `branchNodeId String?` → `Node`. `@@unique([userId, level, retailBrandId, branchNodeId])`, which the file's own comment says is real protection only at BRANCH level (Postgres composite uniques exempt NULL rows). This is the entire "super admin" mechanism: an ORG-level row, no role check. Read by `resolveScope()`, `assertCanManageAtScope()`, `scopeFilterFor()` in `apps/api/src/core/auth/scope.guard.ts`.

**Node** — `organization.prisma:142`. `nodeId @unique`, `role NodeRole (BRANCH|BRAND)`, `label`, `url`, `inboundApiKeyHash @unique`, `status NodeStatus (ACTIVE|SUSPENDED)`, `lastSeenAt`. **Recorded on the parent only** — a deployment's own identity is `NODE_ROLE`/`NODE_ID` env vars, validated in `apps/api/src/core/config/env.validation.ts:72,74` (`z.enum(['STANDALONE','BRANCH','BRAND','ORG']).default('STANDALONE')`, `NODE_ID` default `'main'`; line 225 requires `PARENT_URL` for BRANCH, line 231 forbids it for ORG/STANDALONE). `Node` has **no `retailBrandId` column** — `OrganizationService.listNodes()` (`organization.service.ts:90`) explicitly cannot use `scopeFilterFor()` because of that.

**Location** — `apps/api/prisma/schema/inventory.prisma:76`. `code @unique`, `type LocationType (STORE|WAREHOUSE|IN_TRANSIT)`, `retailBrandId String?`, `originNodeId String?`, `isDefault`, `isActive`, `address Json?`. A Location is a physical (or in-transit) place stock lives inside one database; a Node is a separate deployment/database. `VariantLocationStock` (`inventory.prisma:156`) is `@@id([variantId, locationId])`; `StockMovement.locationId` (`inventory.prisma:36`) is still nullable for one release (expand/contract).

**Transfers** — `transfers.prisma`: `StockTransfer` (sourceLocationId / destinationLocationId / inTransitLocationId, all bare scalars), `StockTransferLine`, `SettlementMode (NONE|INTERNAL_PL|INVOICED)` — `INTERNAL_PL` is deliberately never derived — `InterBranchInvoice` (`sourceRetailBrandId`/`destinationRetailBrandId` as bare scalars), plus `TransferNumberCounter` and `InterBranchInvoiceNumberCounter`.

**Replication** — `replication.prisma`: `ReplicationRecord` (`originNodeId`, `sequence BigInt`, `entity`, `entityId`, `dataClass FACT|POLICY`, `direction UP|DOWN`, `op UPSERT|DELETE`, `payload`, `schemaVersion`, `occurredAt`; `@@unique([originNodeId, sequence])`), `ReplicationSequenceCounter`, `ReplicationCursor` (`@@id([peerNodeId, direction])`; own side uses the literal `'parent'`), `ReplicationQuarantine`. Code in `apps/api/src/core/replication/`: `replication.registry.ts` rejects any FACT/DOWN or POLICY/UP pairing; `replication-log.service.ts`, `replication-apply.service.ts`, `replication-cursor.service.ts`, `replication-quarantine.service.ts`, `replication-sync.agent.ts`, `replication.controller.ts`, `node-credential.service.ts`. Only two producers exist: `apps/api/src/modules/catalog/product-replication.listener.ts` and `apps/api/src/modules/orders/order-replication.listener.ts`.

## Rulings that constrain feature scope
R1 (one schema/image, tier is env var), R2 (facts up / policy down / ledgers as deltas only), R4 (in-transit is a Location; inter-brand in-transit belongs to the org tier), R5 (`postUnconditional()` + `StockVariance`, never a flag on `move()`), R7 (box is cache, branch cloud is record), R9 (policy switches are rows, receiving tier enforces, violations quarantined not dropped), R10 (three admin levels = one permission catalogue + AdminScope, never a role check), R13 (purchasing/manufacturing/expenses tier-scoped via `scopeLevel` + `originNodeId`), R14 (Solo/Chain/Organization are three configurations; every tier concept invisible in Solo; upgrade is never a migration), R26 (online stock = sum of branch allotments; fulfilment names a branch). Also `ENTERPRISE-SCALE.md` Br1 (one deployment = one brand), L1–L6, and its own honest table: L2 branch-scoped reads = "**nothing** / not enforced — gap"; L6 = "not built — planned".

## Things that do not exist
- **No rank model, no department model, no cost-centre, no job-title/grade model** anywhere in `apps/api/prisma/schema/*.prisma` (grep for `department|costCenter|rank` returns only `Product.featuredRank`).
- **No `Product.scopeLevel` and no `Product.originNodeId`** — R8 and R13's uniform `scopeLevel`/`originNodeId` pattern are unbuilt. `originNodeId` exists only on `Location`, `Order` (`orders.prisma:40`) and the replication tables.
- **No `PurchaseOrder.scopeLevel`, no `Expense` model, no `BomProductionRun`** (R13 lists them as specified/unbuilt).
- Roles are data: `Role`, `RoleGrant`, `UserRoleAssignment`, `Permission`, `UserPermission` in `core.prisma:241-348`, unlimited in count. A legacy `enum UserRole { CUSTOMER STAFF TAILOR ADMIN }` still exists at `core.prisma:4`.
- `organization` and `transfers` are entries in `apps/api/src/modules/modules.registry.ts:66,87` — togglable modules, off by default.

## Where the code assumes one location / one brand
1. `InventoryService.defaultLocationId()` — `apps/api/src/modules/inventory/inventory.service.ts:166`: `tx.location.findFirstOrThrow({ where: { isDefault: true } })`. Callers that silently take it: `orders.service.ts:268` and `:700`, `purchasing.service.ts:358`, `stock-count.service.ts:201`, `work-orders.service.ts:159,198`, `product-import.service.ts:139`, `inventory.controller.ts:51`. With 100+ locations every one of these posts to MAIN.
2. `Location.code @unique` (`inventory.prisma:79`) — global, not `@@unique([originNodeId, code])`. The comment states the composite was deliberately not applied because two NULLs would weaken it; R6 point 2 is therefore unbuilt for `Location.code`, `Product.slug`, SKU and barcode.
3. `StockCount` (`inventory.prisma:191`) has **no `locationId`** — a count is deployment-wide, and `stock-count.service.ts:201` resolves the default location when posting variance.
4. `Location.retailBrandId` is null for every deployment today (its own comment), so `scopeFilterFor()` narrowing by `retailBrandId` matches nothing real, and `TransfersService.resolveTransferSettlement()` always resolves `NONE`.
5. `OrganizationService.myScope()` `organization.findFirst()` — one Organization row per database, by construction.
6. `GlReportsService` (`apps/api/src/modules/accounting/gl-reports.service.ts:15-26`) applies **no AdminScope narrowing at all**; no posting rule sets `retailBrandId`/`branchNodeId` today, so the five GL reports are deployment-wide reads.
7. `NodesService.childRole` (`nodes.service.ts:34`) hardcodes a two-level parent→child map (ORG→BRAND, BRAND→BRANCH) — there is no deeper node hierarchy than three tiers, and `NodeRole` has only `BRANCH|BRAND`.

## Where a narrow build goes wrong here

- Any feature that assumes a location picker will silently write to the MAIN location: eight call sites go through InventoryService.defaultLocationId() with no caller-supplied locationId, including order fulfilment, goods receipt, stock counts and product import.
- A 'departments' or 'ranks' lens has nothing to attach to — there is no Department, cost-centre or rank model in any .prisma file; only Role/RoleGrant/UserRoleAssignment (unlimited rows) and a legacy four-value UserRole enum in core.prisma:4.
- Per-brand scoping looks implemented but is inert: Location.retailBrandId is null everywhere, no posting rule sets JournalLine.retailBrandId, so scopeFilterFor() and consolidation.service.ts have no real data to filter and settlement always resolves NONE.
- Natural-key uniqueness is still global (Location.code @unique, Product.slug, SKU, barcode). Two branches creating stock independently collide; R6 point 2's composite unique is explicitly deferred pending a NULL-safe expression index.
- Replication is dormant machinery: ReplicationLogService.append() is a no-op under STANDALONE, and only Product and Order have listeners. A lens that assumes 10000 products or 100 locations already sync across nodes would be describing unbuilt work (ENTERPRISE-SCALE.md marks L6 and NODE_ROLE checks 'not built — planned').
- L2 (branch-scoped reads) is documented as enforced by 'nothing'. Any lens about 100+ locations must treat cross-location read isolation as an open hole, not a property.
- NodesService.childRole hardcodes exactly three tiers (ORG->BRAND->BRANCH) and NodeRole has only two values; a deeper corporate hierarchy (region, division, cluster) has no representation. RetailBrand.parentId is the only unbounded-depth hierarchy in the topology, and it nests brands, not places.
