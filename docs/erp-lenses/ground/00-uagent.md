# Ground brief: what this repository is today

This file is the shared factual basis for the lens catalogue in `docs/erp-lenses/`.
Every lens is answered against the system described here, not the system the
rulings describe. Facts with paths attached; the last section, the absences,
is the important one. No advice.

---

## Topology and editions

One schema, one image; the tier is an environment variable. `NODE_ROLE` is
`STANDALONE|BRANCH|BRAND|ORG`, default `STANDALONE`, `NODE_ID` default
`'main'`, validated at `apps/api/src/core/config/env.validation.ts:72,74`;
`:225` requires `PARENT_URL` for BRANCH, `:231` forbids it for ORG and
STANDALONE.

| Concept | Where | Notes |
|---|---|---|
| `Organization` | `apps/api/prisma/schema/organization.prisma:15` | `allowInterBrandTransfers`; one row per database, fetched with `findFirst()` by `OrganizationService.myScope()` (`organization.service.ts:58`). |
| `RetailBrand` | `organization.prisma:40` | `organizationId?`, `parentId?` self-relation, the only unbounded-depth hierarchy here. Not `Brand` (`catalog.prisma:46`), a product's maker. |
| `BrandPolicy` | `organization.prisma:70` | `allowBranchProductCreation`, `allowBranchLocalPurchasing`, `allowInterBranchTransfers`, all `@default(false)`. |
| `AdminScope` | `organization.prisma:106` | `{ userId, level ORG\|BRAND\|BRANCH, retailBrandId?, branchNodeId? }` — the whole super-admin mechanism, no role check. |
| `Node` | `organization.prisma:142` | Parent-side only. No `retailBrandId`, so `OrganizationService.listNodes()` (`:90`) cannot use `scopeFilterFor()`. |

`Location` (`inventory.prisma:76`) is where stock lives inside one database:
`code @unique`, `type STORE|WAREHOUSE|IN_TRANSIT`, `retailBrandId?`,
`originNodeId?`. Per-location truth is `VariantLocationStock`
(`inventory.prisma:156`, `@@id([variantId, locationId])`).
`NodesService.childRole` (`nodes.service.ts:34`) hardcodes ORG→BRAND→BRANCH;
`NodeRole` has only `BRANCH|BRAND`.

`transfers.prisma` holds `StockTransfer`, `StockTransferLine`,
`SettlementMode NONE|INTERNAL_PL|INVOICED`, `InterBranchInvoice`, two
counters. `replication.prisma` holds `ReplicationRecord`,
`ReplicationSequenceCounter`, `ReplicationCursor`, `ReplicationQuarantine`;
`apps/api/src/core/replication/replication.registry.ts` rejects FACT/DOWN and
POLICY/UP pairings. Two producers exist:
`catalog/product-replication.listener.ts`,
`orders/order-replication.listener.ts`.

Where the code assumes one place or one brand:

1. `InventoryService.defaultLocationId()` (`inventory.service.ts:166`) is
   `findFirstOrThrow({ where: { isDefault: true } })`, taken silently by
   `orders.service.ts:268` and `:700`, `purchasing.service.ts:358`,
   `stock-count.service.ts:201`, `work-orders.service.ts:159,198`,
   `product-import.service.ts:139`, `inventory.controller.ts:51`.
2. `Location.code @unique` is global, not `@@unique([originNodeId, code])`;
   `inventory.prisma:87-96` says the composite was deferred because Postgres
   NULLs weaken it. Same for `Product.slug`, SKU, barcode.
3. `Location.retailBrandId` is null in every deployment today, so
   `scopeFilterFor()` narrows to nothing real and
   `TransfersService.resolveTransferSettlement()` always returns `NONE`.
4. `GlReportsService` (`gl-reports.service.ts:15-26`) applies no AdminScope
   narrowing.

`ENTERPRISE-SCALE.md` marks L2 (branch-scoped reads) as enforced by
"nothing — gap" and L6 as "not built — planned".

---

## Identity, permissions and scope

`PERMISSION_CATALOG` (`packages/shared/src/permissions.ts`, 450 lines) holds
50 entries; `grep -c "key: '"` returns 50. The reports disagree — one states
36 with a split of 15 low / 15 medium / 4 high / 2 critical, the others 50 —
so the count is 50 and the split is unverified against it. Keys are flat dot
strings compared with `Array.includes`: no wildcard, hierarchy, resource id or
ABAC condition. `PermissionKey` is a literal union, so every
`@RequirePermission` site is compile-checked. Two taxonomies cover the same
keys: `category` (9 values) and `PERMISSION_GROUPS` (14).
`ADMIN_LOCKED_PERMISSIONS` (`:438`) is `['settings.manage',
'roles.manage_permissions']`.

Roles are data: `Role` (`core.prisma:307`) → `RoleGrant` (`:321`) →
`UserRoleAssignment` (`:336`), plus `UserPermission` GRANT/REVOKE overrides,
alongside the older enum-keyed `RolePermission`. `Role` carries name,
description, timestamps. `PermissionsResolverService.resolveForUser()`
(`core/auth/permissions.service.ts:29`) unions grants, applies overrides,
never reads `User.role`; it runs per request from `JwtStrategy.validate`
(`jwt.strategy.ts:39`), the JWT carrying sub/email/phone only.
`PermissionsGuard.canActivate` (`guards.ts:83`) is a pure OR. `USER_ROLES`
(`packages/shared/src/enums.ts:10`) is still
`['CUSTOMER','STAFF','TAILOR','ADMIN']`.

Scope is `AdminScope` and nothing else. `core/auth/scope.guard.ts` provides
`resolveScope()`, `assertCanManageAtScope()`, `scopeFilterFor()`, fail-closed
to `in: []`. It is not on `AuthenticatedUser` (`auth.constants.ts:22`); one
production caller builds a `ScopedActor`, `OrganizationController.actorFor()`
(`organization.controller.ts:33`). `assertCanManage` (`ownership.guard.ts`)
has one call site, `jobs.service.ts:324`.
`docs/implementation/access-control-identity/16-pbac-row-scoping.md:24-28` says these functions are
not wired into a live route; the controller contradicts it.

Customers and tailors are `User` rows; suppliers and partners are `Party` +
`PartyRoleAssignment` with no login; three key-hash patterns authenticate
outside the permission system — `TradingPartner.inboundApiKeyHash`
(`trading-partners.prisma:33`), `PosTerminal.deviceKeyHash` (`pos.prisma:27`),
`Node.inboundApiKeyHash`.

The seed trap (CLAUDE.md L210-212, L744-749): `seedPermissions()`
(`prisma/seed.ts:82`) writes grants only for permissions with zero existing
grants, and `seedRoles()` (`:128`) returns if any `Role` row exists — so a
permission added after first boot never gets a `RoleGrant`, and the resolver
reads only `RoleGrant`.

---

## Money, documents and the ledger

One writer: `AccountingService.postEntry()`
(`modules/money/accounting/accounting.service.ts`), called only by
`PostingRulesSubscriber` and `FiscalPeriodsService.closeFiscalYear()`. No
manual-journal endpoint; `accounting` is off unless listed in `MODULES`.
Seven posting rules, all `@OnDomainEvent`, each idempotent via
`findPostedEntry(source, sourceRef)`: `order.placed`, `payment.succeeded`,
`payment.refunded` (full reversal only), `supplier_bill.raised`,
`supplier_bill.paid` (realised FX to 4900/5900), `stock_variance.recorded`,
`transfers.inter_branch_transfer_invoiced`.

Three invariants are DB triggers in the
`20260917070552_add_accounting_ledger` migration:
`journal_line_balance_check`, `journal_line_immutable`,
`forbid_journal_entry_mutation()` (POSTED→REVERSED only).

`FiscalPeriod` is `OPEN|CLOSED|LOCKED`, but nothing rejects a posting dated
into a closed one: `resolveOpenPeriod(at)` falls back to the most recently
started OPEN period, else throws `'No open fiscal period to post into.'`.
`prisma/seed.ts` seeds `CHART_OF_ACCOUNTS` and no FiscalYear or FiscalPeriod;
nothing auto-creates them. `Account.code` is globally unique, no scope column.

Numbering: counter rows updated in the transaction (seven `*NumberCounter`
models, calendar-year keyed except `JournalEntryNumberCounter`, keyed by
`fiscalYearId`) and `pg_advisory_xact_lock` + MAX scan (PurchaseOrder,
GoodsReceipt, StockCount, Invoice, Quote). Only `JournalEntry.number` is
gapless, and `documentNumber()` never node-prefixes it.

Cost is one global weighted average per variant, `ProductVariant.costPrice`
(`catalog.prisma:183`), written only at `purchasing.service.ts:386` over the
*global* stock sum. The R16 currency triple exists on `SupplierBill` and
`JournalLine`; `convertToBase()` is `packages/shared/src/pricing.ts:260`; base
currency is `BRAND.locale.currency`, a compile-time constant.
`ConsolidationService` nets intercompany lines and reports
`unmatchedIntercompany()`. `GlReportsService` provides `trialBalance`,
`profitAndLoss`, `balanceSheet`, `cashFlow`, `agedReceivables`,
`agedPayables`.

---

## Operations

`InventoryService.move()` (`inventory.service.ts:198`) and
`postUnconditional()` (`:213`) delegate to `applyMovement()` (`:220`);
`moveMany()` (`:420`) sorts and loops. The guard is predicate-on-write
(`updateMany … quantity: { gte: -delta }`, `:268-278`); zero rows raise
`InsufficientStockError`. `ProductVariant.stock` is a denormalised SUM
recomputed in the same transaction (`:296-304`). `postUnconditional` omits the
predicate; on a negative result the reason becomes `POS_OFFLINE_VARIANCE` and
a `StockVariance` row plus `StockVarianceRecorded` event are written
(`:309-357`). Single writer holds for quantity only — nothing else writes
`variantLocationStock` — but not for cost (`purchasing.service.ts:386`),
`preferredSupplierId` (`:209`, `:233`) or
`catalog/product-import.service.ts:292`.

Callers: `orders.service.ts:284` (web sale), `:496` (till, via
`placeFromPos()`), `:701` (cancel/return), `orders/backorder.listener.ts:40`,
`purchasing.service.ts` (goods receipt),
`work-orders.service.ts:161,200,247`,
`transfers.service.ts:138,198,210,228,305`, `stock-count.service.ts:220`;
`stitching/` writes none. `dispatch()` creates a per-transfer `IN_TRANSIT`
`Location`; `receive()` books shortfall as `WRITE_OFF`.

`StockCount` (`inventory.prisma:191`) has no `locationId`:
`StockCountService.start()` snapshots every active variant from the global
`v.stock` and `complete()` posts every delta at `defaultLocationId(tx)`.
`StockVariance` comes only from oversell, never counting.
`PosShiftsService` X/Z reports are cash-movements only by the class's own doc
— sales tender is a `Payment` row. `BillOfMaterial` is `@unique` on
`variantId`: one BOM per variant, one level, `Math.ceil` per line.

Scale pressure: `InventoryService.list()` (`:109`), `getReorderSuggestions()`
(`:120`) and `getSlowMovers()` (`:147`) have no `take`/`skip`, while
`catalog.service.ts:73` and `product-admin.service.ts:66` paginate;
`getChainStatus()` fans out with no location filter; `moveMany` is a serial
loop inside a 20-second transaction (`transfers.service.ts:163,292`); and
`pos-catalog.service.ts.searchVariants` uses `contains … mode: 'insensitive'`
with no trigram or full-text index.

---

## Platform machinery

`core/events/domain-events.ts` holds roughly 40 names.
`EventBusService.publish(name, payload, tx)` writes one `OutboxEvent` row in
the caller's transaction; `dispatch()` fans out via `EventEmitter2.emitAsync`,
in-process only, `maxListeners: 50`. `core/events/outbox.dispatcher.ts` drains
on `@Interval(2000)`, `BATCH_SIZE = 25`, `MAX_ATTEMPTS = 8`, claiming with
`FOR UPDATE SKIP LOCKED`. At-least-once, no ordering across handlers; after 8
attempts status is `FAILED` and only the readiness probe counts it.
`OutboxEvent` (`core.prisma:361`) has no tenant, node or brand column.

Four extension points, each registered from the providing module's
`onModuleInit()`: `EntityEnrichmentRegistry` (one implementation per named
point — a second `register()` throws), `CheckoutValidatorRegistry`,
`CartLineValidatorRegistry`, `StockIntakeRegistry`. A disabled module yields
an empty result, not an error.

`core/audit/audit.service.ts` has one method, `record(...)`, writing
`AuditLog` (`core.prisma:220`); failures are logged, never thrown, and there
is no interceptor, diff capture or retention enforcement. 24 files reference
it. `Setting` (`core.prisma:153`) is `key @id` / `value Json`, globally
scoped, with a 30-second per-process cache and no cross-process invalidation.

`modules.registry.ts` has 26 `FEATURE_MODULES`; `register()` reads
`process.env.MODULES` before DI exists. Only `settings`, `users`, `addresses`
are `alwaysOn` (`:89-91`); `organization` (`:66`), `transfers` (`:87`),
accounting, pos, purchasing, production, parties, tradingpartners, tax,
marketing and identity-verification are off by default. `GET /meta` exposes
`{modules, packs, nodeRole}`.

Machine-enforced: `pnpm lint` runs `scripts/check-module-boundaries.mjs`
(depth, direction via `MODULE_PACKS`, independence, Prisma relation
crossings), and `apps/api` lint runs `scripts/check-route-permissions.mjs`,
requiring every route to carry `@RequirePermission`, `@Public` or
`@AuthenticatedOnly`. `KNOWN_VIOLATIONS` is empty, `KNOWN_SCHEMA_VIOLATIONS`
has one entry, `KNOWN_MODULE_COUPLINGS` has 10, and stale entries fail the
build. Convention only: handler idempotency, audit append-only, the
RETAIL-ERP rulings cited in comments.

---

## Surfaces and house rules

CLAUDE.md is 873 lines: seven laws L13-31, feature scope and its five lenses
L144-226, scale axes L229-284, no dead ends L376-420, definition of done
L680-705. `docs/implementation/00-HOUSE-RULES.md` is 495 lines (twelve rules
L53-307, interface rules L440-495).

A capability is reachable only in three places at once: a route folder under
`apps/web/src/app/(admin)/admin/(app)/` (28 today), an `ADMIN_NAV` entry in
`apps/web/src/components/admin/nav-registry.ts` (`navFor()` L364,
`landingFor()` L356), and a key in both `PERMISSION_CATALOG` and
`ROLE_PERMISSION_SEED`. POS (`apps/pos/src/app/`), the storefront and the
three-page customer dashboard have separate nav files and no registry
equivalent. CLAUDE.md L401-402 says `apps/pos` has none of `error.tsx`,
`global-error.tsx`, `not-found.tsx`; all three exist, so that claim is stale.

`WO-22-lens-workflow-results.md` holds thirty prior lenses, each shaped
Question / Why / Worked example / Done test / Breaks without. L482 records
that those sets are first draft, never grounded and never critiqued, that 31
of 41 agents failed, and that twelve Generate topics produced nothing.

---

## What does not exist yet

- **No rank, grade, level, band, seniority or step field, and no department or
  cost-centre dimension.** `grep '^model '` over
  `apps/api/prisma/schema/*.prisma` returns 115 models, none named Rank,
  Department, CostCenter, Approval or Delegation; `Product.featuredRank`
  (`catalog.prisma:124`) is sort order. The only scoping axes are brand and
  branch.
- **No `managerId`, org chart, approval limit or threshold, delegation,
  acting-for, temporary elevation, break-glass or separation-of-duties
  constraint.** `payments.approve` is a boolean with no amount ceiling.
- **No expiry or provenance on any grant** — `RoleGrant`,
  `UserRoleAssignment`, `UserPermission` and `AdminScope` carry `createdAt`
  and nothing else.
- **No `Product.scopeLevel` or `Product.originNodeId`;** `originNodeId` exists
  only on `Location`, `Order` (`orders.prisma:40`) and the replication tables.
  No `PurchaseOrder.scopeLevel`, no `Expense`, no `BomProductionRun`.
- **No franchisee and no service-account concept** — three ad-hoc key-hash
  patterns, no common principal type.
- **No `CostCentre` model,** and no posting rule sets `organizationId`,
  `branchNodeId` or `costCentreId`; only the inter-brand transfer rule sets
  `retailBrandId`.
- **No FxRate table, rate source, period-end revaluation or unrealised FX.**
  No CreditNote, DebitNote, payment terms, credit limits, statements, dunning,
  AP payment run or GRNI account. `Invoice`/`Quote` (`invoicing.prisma`) post
  nothing to the ledger.
- **No `postedByUserId` on `JournalEntry`, no draft state, no maker-checker,
  no accrual, prepayment, depreciation or payroll mechanism.** Five journals
  named by R15 are unbuilt: GoodsReceived/GRNI, `BomProductionRunPosted`,
  `PayrollPosted`, `ShiftClosed` (no such domain event exists) and transfer
  dispatch/receipt in-transit journals.
- **No cycle or partial count; no multi-level BOM explosion,** versioning,
  effectivity date, routing, labour or scrap model.
- **No module, service or model** for R21's shock propagation, R22's ranking
  objective, R24's liquidity schedule or R25's lead-time distribution.
  `Supplier.leadTimeDays` is a scalar; no OTIF or scorecard computation exists.
- **`SettlementMode.INTERNAL_PL` is never returned** by any code path.
- **No tenant id in `core.prisma`** — `Setting`, `AuditLog` and `OutboxEvent`
  are single-tenant.
- **Replication is dormant:** `ReplicationLogService.append()` is a no-op
  under STANDALONE, and only Product and Order have listeners.
- **Branch-scoped reads are enforced by nothing** (L2 in
  `ENTERPRISE-SCALE.md`); L6 is marked "not built — planned".
