# Phase 10 — Admin master dashboard, analytics tree, finance and BOM

**Read `00-HOUSE-RULES.md` first.** Everything there applies. Where this brief
and the house rules disagree, **the house rules win** — say so in the PR.

Programme code **MD**. Work orders are numbered `WO-A.n` … `WO-E.n` so they
never collide with the `WO-1.x` / `WO-2.x` / `WO-4.x` in the other briefs.

## Why

The dashboard at `apps/web/src/app/(admin)/admin/(app)/page.tsx` is 566 lines of
client-rendered React with `Stat`, `BarList` and `Mini` declared inline, every
metric fetched ad hoc, and nothing clickable that leads anywhere useful. It is
one dense screen where the shop needs a navigable tree.

Two capabilities the business needs do not exist at all:

- **Expenses.** There is no `Expense` model anywhere in `prisma/schema/`. Without
  it there is no spend-by-category view, and no sales-vs-purchase-vs-expenses
  comparison — which is the single graph the owner asked for by name.
- **BOM / manufacturing.** There is no recipe model. Raw materials — fabric,
  buttons, thread, packaging — are not tracked, so a finished product's COGS
  cannot be derived from what actually went into it.

Phase 1 is merged and supplies the foundation this phase stands on: the
`StockMovement` ledger, `ProductVariant.costPrice` / `reorderPoint` /
`preferredSupplierId`, `OrderItem.unitCost` as the COGS snapshot, and the whole
`Supplier` → `PurchaseOrder` → `GoodsReceipt` → `SupplierBill` chain with landed
weighted-average costing.

## What Phase 10 delivers

- A dashboard of ~55 cards in 9 groups, every card defined as **data** and every
  card clickable through to a detail page.
- ~25 analytics detail pages served by **one** catch-all route and 25 config
  objects — not 25 hand-rolled layouts.
- A `finance` module: expense categories, expenses, recurrence, receipts, and
  per-order economics.
- A `bom` module: raw materials as real inventory, recipes, automatic COGS
  rollup, and production runs that consume raw stock and produce finished stock.
- One comparative chart of sales vs purchases vs expenses on a shared axis.

## Base branch

Branch from the tip of `claude/clothing-store-mobile-app-8z4o3p` (`a2a4a05` at
the time of writing). **Not `adb8808`** — that predates WO-1.8 (inventory and
purchasing screens), WO-1.9 (reports), the nested nav `children`, and the
`adminFetch` path fix, all of which this phase builds on.

## Work orders

One work order is one branch, pushed straight to `main` — no PR needed there;
`production` is the one that stays off-limits. Branch names follow
`<pack>/<type>/<slug>` (`00-HOUSE-RULES.md` §7): `web/feat/wo-a1-admin-ui-primitives`,
`core/feat/wo-b1-finance-expenses`, `core/feat/wo-c3-production-runs`. Every
module this phase adds — `finance` and `bom` — belongs to the **`core` pack**, so
none of it may be imported by a sector pack and none of it may name a garment
concept. See [`MULTI-SECTOR.md`](../MULTI-SECTOR.md).

| WO | Title | Depends on |
|---|---|---|
| A.1 | Admin UI primitives + URL-synced filters | — |
| A.2 | Charting library, theme, wrappers | A.1 |
| A.3 | Core metric registry (API) | — |
| A.4 | Card registry, `GET /admin/analytics/cards`, new `/admin` | A.1, A.2, A.3 |
| A.5 | Analytics detail-page shell + first six reports | A.1, A.2, A.4 |
| B.1 | `finance` module: expense categories and expenses | A.1 |
| B.2 | Recurring expenses and receipt upload | B.1 |
| B.3 | `OrderEconomics`: contribution per order | B.1 |
| B.4 | Expense metrics and three expense analytics pages | A.5, B.1 |
| B.5 | The comparative sales / purchases / expenses chart | A.4, B.1 |
| C.1 | `bom` module: raw materials as inventory items | A.1 |
| C.2 | Recipes and the COGS rollup | C.1 |
| C.3 | Production runs | C.2 |
| C.4 | BOM metrics, missing-BOM screen, raw-usage analytics | A.5, C.3 |
| D.1–D.6 | Orders / Purchasing / Products / Inventory / Customers / Workshop analytics | A.5 |
| E.1 | Navigation, landing, breadcrumbs | A.5, B.4, C.4 |
| E.2 | Retire superseded charts, add guards, update docs | all |

---

## Rules for this phase

Ten decisions, already taken. They are binding. An agent that wants to deviate
says so in the PR rather than quietly doing something else.

### D1 — A dashboard card is a registry entry, never a component

Mirror `nav-registry.ts`, which the codebase already proves out. One file,
`apps/web/src/components/admin/dashboard/card-registry.ts`, exports an ordered
group array and a flat card array. There is exactly **one** card component,
`metric-card.tsx`. Adding a card is one object literal.

```ts
export const DASHBOARD_GROUPS = [
  { key: 'sales',         label: 'Sales',               icon: 'TrendingUp',   href: '/admin/analytics/sales' },
  { key: 'orders',        label: 'Orders',              icon: 'ShoppingCart', href: '/admin/analytics/orders' },
  { key: 'purchasing',    label: 'Purchasing',          icon: 'Truck',        href: '/admin/analytics/purchasing' },
  { key: 'products',      label: 'Products',            icon: 'Package',      href: '/admin/analytics/products' },
  { key: 'inventory',     label: 'Inventory',           icon: 'Boxes',        href: '/admin/analytics/inventory' },
  { key: 'expenses',      label: 'Expenses',            icon: 'Wallet',       href: '/admin/analytics/expenses' },
  { key: 'manufacturing', label: 'BOM & Manufacturing', icon: 'Factory',      href: '/admin/bom' },
  { key: 'customers',     label: 'Customers',           icon: 'Users',        href: '/admin/analytics/customers' },
  { key: 'workshop',      label: 'Workshop & Users',    icon: 'Scissors',     href: '/admin/analytics/workshop' },
] as const;

export type ValueFormat = 'money' | 'integer' | 'percent' | 'percent-bps' | 'days' | 'text';

export interface DashboardCard {
  key: string;                              // stable; also the deep-link fragment
  group: DashboardGroupKey;
  label: string;
  metric: string;                           // key into the metrics map from the API
  format: ValueFormat;
  href: string;                             // {days} interpolated from the active range
  permissions?: readonly PermissionKey[];   // any one is enough
  module?: string;                          // hidden when the API module is off
  tone?: 'up-good' | 'up-bad' | 'neutral';  // drives colour AND aria text
  sparkline?: string;                       // key into the series map
  hint?: string;
}

export function cardsFor(
  permissions: readonly string[],
  enabledModules: readonly string[],
): DashboardCard[];
```

Enforced in review: no card declares a hex colour, a width or a chart type; no
card declares its own fetch. A card whose metric is missing renders an em-dash
with a `title` distinguishing *"you lack permission"* from *"module off"* —
**a zero and "you may not see this" must never look the same.**

### D2 — One request; the server batches by provider

```
GET /admin/analytics/cards?days=30&groups=sales,orders&series=revenue,orders&bucket=day
```

```ts
interface DashboardCardsResponse {
  days: number; from: string; to: string; generatedAt: string;
  /** Only keys the caller may see AND whose module is enabled. */
  metrics: Record<string, { value: number; previous: number | null; unit: 'paisa'|'count'|'bps'|'days' }>;
  series: Record<string, Array<{ t: string; v: number }>>;
}
```

`previous` is the same metric over the immediately preceding window of equal
length. **The delta percentage is computed client-side**, so the server never
has to know what "good" looks like.

N+1 is prevented structurally. Metrics come from **providers**, and a provider
that issues one query per metric fails review — `OrdersMetricsProvider` returns
nine metrics from a single `order.groupBy({ by: ['status'] })`.

Providers live in the module that owns the data and register into a core
registry, so `analytics` never imports a feature module:

```ts
// apps/api/src/core/metrics/metric-provider.ts
export interface MetricContext {
  from: Date; to: Date; prevFrom: Date; prevTo: Date;
  permissions: readonly string[];
}
export interface MetricValue {
  value: number; previous: number | null;
  unit: 'paisa' | 'count' | 'bps' | 'days';
}
export interface MetricProvider {
  id: string;
  keys: readonly string[];
  permissions: readonly string[];   // caller needs at least one; empty = analytics.view
  collect(ctx: MetricContext, wanted: readonly string[]): Promise<Record<string, MetricValue>>;
}
```

`MetricRegistryService` is `@Global` in `src/core/metrics/`. Each module ships
`<name>.metrics.ts` and registers in `onModuleInit()`. **A module disabled by
`MODULES` simply never registers** — its metrics are absent, its cards hide, and
there is no DI failure and no conditional import anywhere.

`collect()` runs providers with `Promise.all`, catches per provider (one failure
logs and omits only its keys; the dashboard still renders), and caches in-process
keyed on `(from, to, bucket, sorted permission fingerprint, sorted wanted keys)`.

### D3 — 25 detail pages are 25 config objects and one catch-all route

`analytics/[...slug]/page.tsx` looks the slug up in `report-registry.ts` and
renders `<AnalyticsDetailPage>`.

```ts
export interface AnalyticsReport {
  slug: string;                          // 'sales/revenue', no leading slash
  group: DashboardGroupKey;
  title: string; description: string;
  permissions: readonly PermissionKey[];
  module?: string;
  endpoint: string;                      // API path — decoupled from page path (D4)
  ranges?: readonly number[];
  filters?: readonly FilterSpec[];       // URL-synced, forwarded to the endpoint
  blocks: readonly ReportBlock[];
  parent?: string;                       // another slug, for breadcrumbs
}

export type ReportBlock =
  | { kind: 'kpis';       items: Array<{ label: string; path: string; format: ValueFormat; hint?: string }> }
  | { kind: 'timeseries'; title: string; path: string; x: string; chart: 'line'|'area'|'bar'|'stacked-bar';
      series: Array<{ key: string; label: string; format: ValueFormat }> }
  | { kind: 'share';      title: string; path: string; label: string; value: string; format: ValueFormat; drillTo?: string }
  | { kind: 'ranking';    title: string; path: string; label: string; value: string; format: ValueFormat; limit?: number; href?: string }
  | { kind: 'table';      title: string; path: string; columns: Array<{ key: string; header: string; format: ValueFormat; align?: 'left'|'right'; href?: string }> }
  | { kind: 'funnel';     title: string; path: string; label: string; value: string }
  | { kind: 'gauge';      title: string; path: string; value: string; target: string }
  | { kind: 'note';       text: string };
```

- `path` is a dot-path into the endpoint JSON (`totals.revenue`, `byCategory`).
- `href` is a **template string**, not a function: `/admin/products/{productId}`.
  Declarative and greppable.
- `drillTo` is another report slug — clicking a slice navigates there carrying the
  clicked key as a filter. **That is what makes the page tree a tree.**
- `format: 'money'` renders through `<Money>`. Division by 100 must never appear
  under `components/admin/analytics/`.

Next resolves static segments before catch-alls, so a report that outgrows the
config shape gets its own real route file at the same path and automatically
wins. **That is the designed escape hatch — use it rather than adding a ninth
block kind.**

### D4 — Who owns which endpoint

- **Read-only aggregation over existing tables → the `analytics` module**, at
  `/admin/analytics/*`. Cross-module *Prisma reads* are fine and already
  ubiquitous: `analytics.service.ts` reads `Order`, `Payment`, `Contact`,
  `StitchingJob`, `ProductVariant` and `OutboxEvent` today.
  `scripts/check-module-boundaries.mjs` inspects TypeScript import specifiers,
  not Prisma model access.
- **Anything needing a module's own business logic → that module's controller**
  (`/admin/finance/expenses/summary`, `/admin/bom/recipes/:id/cost`).

The registry's `endpoint` field decouples the two, so the owner's page tree
(`/admin/analytics/expenses/by-category`) can be served by
`/admin/finance/expenses/by-category` without either side bending.

### D5 — Raw materials are ProductVariants, marked by a bom-owned pointer

This is the load-bearing decision. The reasoning, because it will otherwise be
re-litigated:

`PurchaseOrderItem.variantId` is a foreign key to `ProductVariant`. **If a raw
material is not a `ProductVariant`, you cannot raise a purchase order for
fabric, cannot receive it, and therefore never obtain a landed weighted-average
cost** — which is the sole input to "COGS auto-calculates from raw material
costs". A separate raw-stock table would also break Rule 12 (one door to stock)
and duplicate `StockMovement`, `StockCount`, reorder points and slow-mover stats.

Equally, adding `isRawMaterial` to `Product`, or a new `ProductKind` value, edits
`catalog.prisma` — and a new `ProductKind` member would leak into `OrderItem.kind`
snapshots, cart types and every storefront query.

**The answer:** `bom.prisma` owns `RawMaterial` with a unique pointer at a
`ProductVariant`. The variant is an ordinary variant, so all of Phase 1 works on
fabric exactly as it works on a kurta. "Is this a raw material?" is answered by a
row in the module that cares. **`catalog.prisma` gains one back-relation field
and nothing else.**

Raw-material `Product` rows are created by the BOM module as `status: DRAFT`
(permanently — the storefront filters `status: ACTIVE`), `kind: UNSTITCHED`, in a
seeded hidden `Category` whose slug comes from
`SettingKey.BomRawMaterialCategorySlug` (default `raw-materials`). They will
appear in `/admin/products` as DRAFT rows; WO-C.1 mitigates that **purely in the
web layer** — the products page fetches the raw-material id set and badges or
hides those rows client-side. No catalog API change.

### D6 — Units: integer base units with a declared scale

`ProductVariant.stock` is `Int` and fabric is fractional. Solve it the way the
codebase already solves money (Rule 5): **store an integer count of a base unit
and scale at the UI boundary.** `RawMaterial.unitScale` is base units per display
unit.

| Material | `unit` | `unitScale` | `stock = 12500` means | `costPrice` means |
|---|---|---|---|---|
| Lawn fabric | `GAZ` | 1000 | 12.5 gaz | paisa per milli-gaz |
| Cotton | `METRE` | 1000 | 12.5 m | paisa per milli-metre |
| Buttons | `PIECE` | 1 | 12,500 buttons | paisa per button |
| Thread | `SPOOL` | 1 | 12,500 spools | paisa per spool |
| Interfacing | `GRAM` | 1 | 12.5 kg | paisa per gram |

Nothing existing changes. A PO for 10 gaz at Rs 350/gaz is
`quantityOrdered: 10000, unitCost: 35`. `weightedAverageCost()` works untouched
and cost precision *improves*.

Conversion lives in exactly one place, `packages/shared/src/units.ts` (Rule 11):
`toBaseUnits`, `fromBaseUnits`, `formatQuantity`, `UNIT_LABELS`. API and web both
import it. **A bare multiplication by the scale in a component is a review
rejection, exactly like a bare division by 100 for money.**

### D7 — Production reuses ADJUSTMENT + refType; it adds no enum values

`StockMovementReason` lives in `inventory.prisma`; adding `PRODUCTION_CONSUME` /
`PRODUCTION_OUTPUT` would edit another module's schema. It is also unnecessary —
`StockMovement` already carries `refType` / `refId` with a dedicated
`@@index([refType, refId])` for exactly this. Production movements are
`reason: 'ADJUSTMENT'`, `refType: 'BomProductionRun'`, `refId: <runId>`.

Safe against existing consumers: `inventory.cron.ts` computes sales stats from
`reason: 'SALE'` only, so production traffic cannot pollute slow-mover or
days-of-cover figures.

### D8 — Back-relation fields on another module's model are allowed

Rule 1 says *never add a **model** to another module's file.* It does not forbid
the back-relation half of a relation, which Prisma requires and which this
codebase already does freely — `catalog.prisma`'s `ProductVariant` carries
`purchaseOrderItems` (purchasing), `stockMovements` and `stockCountLines`
(inventory).

This phase adds exactly five, all one line, all **zero-SQL-change** (the foreign
key column lives on the child):

| File | Model | Field |
|---|---|---|
| `catalog.prisma` | `ProductVariant` | `rawMaterial RawMaterial?` |
| `catalog.prisma` | `ProductVariant` | `bomRecipe BomRecipe?` |
| `orders.prisma` | `Order` | `economics OrderEconomics?` |
| `purchasing.prisma` | `Supplier` | `expenses Expense[]` |
| `core.prisma` | `User` | `expensesCreated`, `bomRecipes`, `bomProductionRuns` |

### D9 — Charting: Recharts 3, behind a mandatory wrapper layer

**This overrides `04-finance.md` WO-4.5's "do not add a charting library" for
this phase, at the owner's instruction. State that override in every charting
PR** so the next agent does not "fix" it back.

| Criterion | Verdict |
|---|---|
| Next 15.5.23 + React 19.2.8 | Recharts 3 declares react 18-or-19 and ships ESM. The whole admin tree is client-rendered by design (`admin-shell.tsx:20-22`), so there is no SSR or hydration surface to defend. |
| Bundle | ~100 kB gz with d3 sub-deps — real, but confined. Imported only from `components/admin/charts/`, reachable only from the `(admin)` route group, which Next code-splits per route. **The storefront bundle does not change.** WO-A.2 adds a CI check enforcing it. |
| Theming | Plain props for stroke/fill/tick — no CSS-in-JS, no theme provider to fight. Series 1 stays `#0e8294`, the exact value `sales-chart.tsx` uses (darkened from `#0f8fa3` when `check-contrast.mjs` found the original under the WCAG AA text floor — see `brand.ts`). Grid stays `#e9e0cd`. |
| Accessibility | Weak on its own — which is why the wrapper is non-negotiable. |

Rejected: **visx** (primitives, not charts — with 25 charts to build you would
get 25 hand-rolled components again); **Chart.js** (canvas: no DOM, no screen
reader, no CSS theming); **Tremor** (a Tailwind component library on top of
Recharts, violating `02-admin-shell.md`'s "do not introduce a component library"
to reach the same charts).

**Fallback:** if `pnpm install` or `typecheck` fails against React 19.2.8, do
**not** downgrade React and do **not** use `--legacy-peer-deps`. Switch to
`@visx/scale` + `@visx/shape` + `@visx/axis` + `@visx/group` + `@visx/tooltip`,
keeping the identical wrapper API so no page changes. State which you used.

**No page or block ever imports `recharts` directly.**
`components/admin/charts/` exports exactly `<TimeSeriesChart>`,
`<ComparisonChart>`, `<CategoryBarChart>`, `<ShareChart>`, `<SparklineChart>`.
Every wrapper must render `role="img"` with a meaningful `aria-label`; render a
screen-reader-only `<table>` carrying the same numbers; distinguish series by
**dash pattern and marker as well as colour**; take money in **paisa** and format
internally; and render `<EmptyState>` for zero rows rather than an empty axis.

The four existing charts:

| File | Ruling |
|---|---|
| `gauge-chart.tsx` | **Keep.** Recharts has no real gauge; a `RadialBarChart` fake is worse than what exists. |
| `funnel-chart.tsx` | **Keep.** Recharts labels funnels poorly; this one is already accessible. |
| `sales-chart.tsx` | **Retire in WO-E.2.** Single-series line+area with a hand-rolled `niceStep` — exactly what a library is for. **Port `compactRupees()` (the thousands / lakh formatting) into `chart-theme.ts` first; that is a genuinely Pakistan-specific asset and must not be lost.** |
| `donut-chart.tsx` | **Retire in WO-E.2**, replaced by `<ShareChart>`. |

Retirement is a separate work order on purpose: nothing is deleted until its
replacement is in production use.

### D10 — Admin strings are English; EN+UR governs customer-facing data

Rule 6 and "every user-facing string has en and ur" are about **customer-facing
content rows** (`*Translation` models). All 26 existing admin pages are
English-only and the admin route group does not use `next-intl`.

This phase creates no customer-facing content, so `ExpenseCategory.name`,
`RawMaterial.name` and `BomRecipe.notes` are **plain columns**, exactly as Rule
6's second paragraph prescribes. Do not add `*Translation` siblings and do not
half-localise the admin. Say this in the first PR so a reviewer does not flag it.

---

## The corrected route tree

```
/admin                                          Master Dashboard (rebuilt)          new
├── /admin/analytics                            report index, from the registry     new
│
├── SALES
│   ├── /admin/analytics/sales/revenue                                              new
│   ├── /admin/analytics/sales/aov                                                  new
│   ├── /admin/analytics/sales/profit           gross profit + margin               new
│   └── /admin/analytics/sales/funnel           visits → cart → checkout → order    new
├── ORDERS
│   ├── /admin/analytics/orders/overview                                            new
│   ├── /admin/analytics/orders/fulfilment                                          new
│   └── /admin/orders?status=…                  existing list, now URL-filtered   WO-A.1
├── EXPENSES                                    [CORRECTED from /admin/expenses]
│   ├── /admin/analytics/expenses/overview                                          new
│   ├── /admin/analytics/expenses/by-category   drill: ?category=<key>              new
│   ├── /admin/analytics/expenses/trend                                             new
│   ├── /admin/finance/expenses                 master ledger, list + add/edit       new
│   ├── /admin/finance/expenses?paid=unpaid     [CORRECTED from ?status=PENDING]     new
│   └── /admin/finance/expenses/categories                                          new
├── PURCHASING
│   ├── /admin/analytics/purchasing/spend                                           new
│   ├── /admin/analytics/purchasing/suppliers                                       new
│   ├── /admin/purchase-orders?status=DRAFT|SENT  existing, now URL-filtered      WO-A.1
│   └── /admin/suppliers                                                       existing
├── PRODUCTS
│   ├── /admin/products                                                        existing
│   ├── /admin/analytics/products/top-sellers                                       new
│   ├── /admin/analytics/products/slow-sellers                                      new
│   └── /admin/analytics/products/categories                                        new
├── BOM & MANUFACTURING
│   ├── /admin/bom                              recipe master                       new
│   ├── /admin/bom?filter=missing | ?filter=incomplete-cost                         new
│   ├── /admin/bom/new  ·  /admin/bom/[id]      recipe editor                       new
│   ├── /admin/bom/raw-materials  ·  /[id]                                          new
│   ├── /admin/bom/production  ·  /production/new                                   new
│   └── /admin/analytics/inventory/raw-usage                                        new
├── INVENTORY
│   ├── /admin/analytics/inventory/valuation                                        new
│   ├── /admin/analytics/inventory/movements                                        new
│   ├── /admin/inventory?filter=low|out         existing, now URL-filtered        WO-A.1
│   └── /admin/inventory/reorder · /slow-movers · /counts                      existing
├── CUSTOMERS
│   ├── /admin/analytics/customers/overview · /retention · /top                     new
│   └── /admin/leads · /admin/contacts                                         existing
└── WORKSHOP & USERS
    ├── /admin/analytics/workshop/output                                            new
    └── /admin/stitching · /admin/users                                        existing
```

**Rulings where this differs from the originally proposed tree:**

1. `/admin/expenses` → **`/admin/finance/expenses`**. `NAV_GROUPS` already has a
   `finance` group and `04-finance.md` WO-4.5 fixes these paths; `/admin/expenses`
   would force a rename when Phase 4's P&L, margins and cash-flow screens land.
2. `?status=PENDING` on an expense → **`?paid=unpaid`**. `Expense` has no status
   column; unpaid is `paidAt IS NULL`.
3. `/admin/bom/:id` → **`/admin/bom/[id]`**. Next dynamic-segment syntax; the
   colon form is Express notation.
4. "Missing BOMs" is one filter among several →
   `?filter=missing|incomplete-cost|active|all`, all URL-synced.
5. There was no sidebar group for BOM. **Add one `NAV_GROUPS` entry,
   `manufacturing`, between `inventory` and `workshop`**, icon `Factory`. Do not
   overload `workshop` (the tailor queue) or `inventory`.
6. `/admin/analytics/inventory/raw-usage` sits in the INVENTORY group but its
   data is owned by `bom`. The page path stays where it is; `endpoint` points at
   `/admin/bom/raw-usage`. That is exactly what D4's decoupling buys.

**One blocker the proposal assumed away.** No admin list page reads its filter
from the URL. `orders`, `inventory`, `purchase-orders` and `products` all hold
filter state in `useState`; there is no `useSearchParams` anywhere in the admin
tree. The current dashboard already links `/admin/orders?status=PENDING` and it
**silently does nothing**. URL-synced filters are a hard prerequisite, not
polish — that is WO-A.1.

Also note: `apps/api/src/core/config/env.validation.ts:47-49` defaults `MODULES`
to a list that omits `purchasing`, while `.env.example:28` includes it.
Pre-existing drift; fix it in WO-B.1.

---

## The card inventory (~55 cards)

**Sales** — `sales.revenue` (money), `sales.aov` (money), `sales.gross_profit`
(money, `inventory.view_cost`), `sales.gross_margin_bps` (percent-bps,
`inventory.view_cost`), `sales.conversion_rate` (percent),
`sales.target_progress_bps`.

**Orders** — separate from Sales, as asked: `orders.total`, `orders.pending`
→ `/admin/orders?status=PENDING` ("not confirmed"), `orders.confirmed`,
`orders.processing`, `orders.ready_to_ship`, `orders.shipped`,
`orders.delivered`, `orders.cancelled` (tone `up-bad`), `orders.returned`
(`up-bad`), `orders.avg_fulfilment_days` (`up-bad`).

**Expenses** (`module: 'finance'`, `finance.view`) — `expenses.total`,
`expenses.largest_category_amount` + `_name`, `expenses.unpaid_count`,
`expenses.unpaid_amount`, `expenses.direct_share_bps`,
`expenses.vs_revenue_bps` (`up-bad`), `expenses.recurring_due_count`.

**Purchasing** (`purchasing.manage`) — `purchasing.open_pos` → `?status=DRAFT`,
`purchasing.awaiting_transit` → `?status=SENT`, `purchasing.partial`,
`purchasing.spend` (money, `inventory.view_cost`),
`purchasing.unpaid_bills_amount`, `purchasing.overdue_bills`,
`purchasing.top_supplier_share_bps`.

**Products** (`catalog.manage`) — `products.total`, `products.active`,
`products.draft`, `products.top_seller_units` + `_name`,
`products.slowest_seller_units` + `_name`, `products.out_of_stock_variants`
(`up-bad`), `products.low_stock_variants` (`up-bad`),
`products.no_sales_in_window`.

**Inventory** (`inventory.manage`) — `inventory.valuation` (money, plus
`inventory.view_cost`), `inventory.units_on_hand`, `inventory.out_of_stock`,
`inventory.low_stock`, `inventory.slow_movers`, `inventory.dead_stock`,
`inventory.movements_in_window`, `inventory.reorder_suggestions`.

**BOM & Manufacturing** (`module: 'bom'`, `bom.view`) — `bom.active_recipes`,
`bom.missing_recipes` (`up-bad`) → `/admin/bom?filter=missing`,
`bom.incomplete_cost_recipes` (`up-bad`) → `?filter=incomplete-cost`,
`bom.production_runs`, `bom.units_produced`, `bom.raw_material_value` (money,
`inventory.view_cost`), `bom.raw_materials_low_stock` (`up-bad`).

**Customers** (`crm.manage`) — `customers.total`, `customers.new`,
`customers.repeat`, `customers.repeat_rate_bps`, `customers.top_spender_ltv` +
`_name`, `customers.open_leads` → `/admin/leads`, `customers.follow_ups_due`
→ `/admin/contacts`.

**Workshop & Users** — `workshop.active_jobs` (`stitching.jobs.view_queue`) →
`/admin/stitching`, `workshop.jobs_completed`, `workshop.bottleneck_stage`
(text), `workshop.avg_job_days`, `workshop.staff_accounts` (`users.manage`) →
`/admin/users`, `workshop.active_tailors`.

**Sparkline series** — only these are computed, and only when requested:
`revenue`, `orders`, `expenses`, `purchases`, `units_produced`, `new_customers`.

---

## A live bug the rebuild must not inherit

**Every day in the dashboard revenue chart is labelled one day early.**

`analytics.service.ts:98` anchors the series at **local** midnight:

```ts
const startOfToday = new Date(now);
startOfToday.setHours(0, 0, 0, 0);          // 2026-08-29 00:00 PKT
```

and `fillDays()` then labels each bucket in **UTC**:

```ts
const date = day.toISOString().slice(0, 10);   // "2026-08-28"
```

Local midnight in UTC+5 is 19:00 UTC the previous day, so the label is a day
behind for the whole of Pakistan. A sale made on the 29th appears on the 28th.

It is why `crm.e2e-spec.ts:412` fails: the test compares the last bucket against
`new Date().toISOString().slice(0, 10)`, so it only passes between 00:00 and
05:00 PKT, when UTC is still on the previous date and the two errors cancel. A
test that passes only during a five-hour window overnight is worse than a failing
one, because it looks green in the morning.

**WO-A.4 and WO-D.1 rebuild exactly this code. Fix it there rather than porting
it forward:**

- Format bucket labels from the local date parts (`getFullYear` / `getMonth` /
  `getDate`), never `toISOString()`.
- Check the raw SQL alongside it — `date_trunc` groups in the database session's
  timezone, which must agree with whatever the labels use, or the buckets and
  their labels disagree by a day at the boundary.
- Put the shop's timezone in a setting (House Rule 4) rather than relying on the
  server's, so a deployment in another country is not silently wrong.
- Then assert the boundary: freeze the clock at 23:30 local and confirm the last
  bucket is today, not yesterday.

## Track A — Foundations

### WO-A.1 — Minimal admin UI primitives, with URL-synced filters

**Purpose.** Give the analytics tree a shared vocabulary, and make `?status=` /
`?filter=` actually work so a dashboard card can link to a filtered list.

**Depends on.** Nothing. This is first, and it is the critical path for
everything visual — staff it best.

**Created**
```
apps/web/src/components/admin/ui/{page-header,money,status-badge,empty-state,
                                  data-table,pagination,filter-bar,skeleton,index}.tsx|ts
apps/web/src/components/admin/ui/use-url-filters.ts
apps/web/src/app/(admin)/admin/(app)/error.tsx
apps/web/src/app/(admin)/admin/(app)/not-found.tsx
```
**Modified**
```
apps/web/src/components/admin/session.tsx                       + can(key: PermissionKey): boolean
apps/web/src/app/(admin)/admin/(app)/orders/page.tsx            filters -> URL
apps/web/src/app/(admin)/admin/(app)/inventory/page.tsx         filters -> URL
apps/web/src/app/(admin)/admin/(app)/purchase-orders/page.tsx   filters -> URL
apps/web/src/app/(admin)/admin/(app)/products/page.tsx          filters -> URL
```

Build to `02-admin-shell.md` WO-2.1 / 2.2 / 2.4 / 2.7 / 2.8 **exactly**, so
Phase 2 later *continues* rather than rewrites: `<Money value={349900} />` →
`Rs 3,499` wrapping `formatMoney`; `Column<T>` with `hideBelow`; real `<table>`
semantics with `<th scope="col">`; skeleton rows, not a spinner that collapses
the layout; `FilterBar` state in the query string via `useSearchParams` +
`router.replace`, with a 300 ms debounce on search.

**Out of scope — say so in the PR:** `Modal` / `ConfirmDialog` (WO-2.3),
migrating the other 22 pages (WO-2.5), the command palette (WO-2.6).

**New permissions / settings / events / endpoints.** None.

**Acceptance**
- [ ] `/admin/orders?status=PENDING` loads with the select pre-set and the list
      filtered; same for `?q=`.
- [ ] `/admin/inventory?filter=low|out` and
      `/admin/purchase-orders?status=DRAFT|SENT|PARTIAL` likewise.
- [ ] Changing a filter updates the URL without a history entry per keystroke
      (`router.replace`, debounced); Back leaves the page rather than walking the
      search box character by character.
- [ ] A filtered URL survives a hard refresh and can be pasted to a colleague.
- [ ] `const { can } = useAdminSession()` exists; `can('nonsense.key')` is a
      **TypeScript error**; the four call sites in `02-admin-shell.md` WO-2.8 are
      converted.
- [ ] `DataTable` is fully keyboard-navigable; `hideBelow` columns disappear at
      the stated breakpoint; empty renders `<EmptyState>`.
- [ ] Before/after screenshots of the four migrated pages show no visual drift.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass.

---

### WO-A.2 — Charting library, theme and wrappers

**Purpose.** One themed, accessible chart vocabulary for the whole back office.
**Depends on.** WO-A.1.

**Created**
```
apps/web/src/components/admin/charts/chart-theme.ts
apps/web/src/components/admin/charts/{time-series,comparison,category-bar,share,sparkline}-chart.tsx
apps/web/src/components/admin/charts/chart-data-table.tsx      the screen-reader fallback table
apps/web/src/components/admin/charts/index.ts
scripts/check-chart-imports.mjs
```
**Modified**: `apps/web/package.json` (+ `recharts`, exact pin), root
`package.json` (`lint` runs the new script), `pnpm-lock.yaml`.

`chart-theme.ts` holds the categorical ramp
`['#0e8294','#b8860b','#4a6fa5','#8a5a44','#5f7a4f','#7d5ba6']` (six hues, each
at least 3:1 on white and distinguishable in common dichromacies),
`GRID = '#e9e0cd'`, `SURFACE = '#ffffff'`, ink text at `#050505` with the
50–60% opacities the existing charts use, the dash-pattern ramp, and
**`compactRupees()` ported verbatim from `sales-chart.tsx`**.

`scripts/check-chart-imports.mjs` fails the build if `recharts` (or `@visx/*`
under the fallback) is imported outside `apps/web/src/components/admin/charts/`.
Model it on `scripts/check-module-boundaries.mjs` — same shape, same exit-code
behaviour, wired into the root `lint` script the same way.

**Acceptance**
- [ ] `pnpm build` succeeds; `next build` reports no new warnings.
- [ ] `pnpm lint` fails when a page imports `recharts`.
- [ ] Every wrapper renders `role="img"` + a meaningful `aria-label`, and a
      screen-reader-only `<table>` whose cells equal the plotted values.
- [ ] Two-series charts stay readable in greyscale — dash and marker differ, not
      just hue. Print the screenshot.
- [ ] A wrapper given an empty array renders `<EmptyState>`, not an empty axis.
- [ ] Money charts receive **paisa**; no division by 100 anywhere in
      `components/admin/charts/`.
- [ ] `<TimeSeriesChart>` renders the existing `salesSeries` payload at visual
      parity with `sales-chart.tsx`. Parity only — nothing is deleted until E.2.

---

### WO-A.3 — Core metric registry (API)

**Purpose.** The extension point that lets any module contribute a dashboard
number without `analytics` importing it.
**Depends on.** Nothing. Runs in parallel with A.1 and A.2.

**Created**
```
apps/api/src/core/metrics/metric-provider.ts            the interfaces from D2
apps/api/src/core/metrics/metric-registry.service.ts
apps/api/src/core/metrics/metrics.module.ts             @Global
apps/api/src/core/metrics/metric-window.ts              window + previous-window maths, bucketing
apps/api/src/core/metrics/metric-registry.service.spec.ts
```
**Modified**: `apps/api/src/core/core.module.ts` (+ `MetricsModule`),
`settings.defaults.ts`.

**New settings**
```ts
AnalyticsDashboardCacheSeconds: 'analytics.dashboard_cache_seconds',   // 60
AnalyticsDefaultRangeDays:      'analytics.default_range_days',        // 30
AnalyticsComparisonBucket:      'analytics.comparison_bucket',         // 'day'
```

**Behaviour that must be tested.** Providers run concurrently, and a throwing
provider is logged with only its keys omitted — the rest still returns. A
provider whose `permissions` the caller lacks is **never invoked**
(invoked-then-filtered leaks both work and timing). The cache key includes a
**sorted permission fingerprint**, so an ADMIN's cached cost figures can never
serve a STAFF request. `metric-window.ts` produces a `prevFrom`/`prevTo` window
with no overlap and no gap, tested across a month boundary and a leap day.

**Acceptance**
- [ ] Two providers claiming the same metric key **throws at boot**, naming both
      provider ids. Silent last-write-wins here would be a very expensive bug.
- [ ] `MetricRegistryService` is injectable in a module that imports nothing
      (prove it with a test module).
- [ ] The cache honours the setting; zero disables it.
- [ ] 100% unit coverage on `metric-window.ts`.

---

### WO-A.4 — Card registry, GET /admin/analytics/cards, and the new /admin

**Purpose.** Replace the 566-line dashboard with a grouped card grid driven
entirely by data.
**Depends on.** WO-A.1, A.2, A.3.

**Created**
```
apps/api/src/modules/analytics/analytics.metrics.ts     sales/orders/products/customers/workshop
apps/api/src/modules/analytics/dto/cards.dto.ts
apps/api/src/modules/inventory/inventory.metrics.ts
apps/api/src/modules/purchasing/purchasing.metrics.ts
apps/api/src/modules/analytics/analytics.metrics.spec.ts
apps/web/src/components/admin/dashboard/{card-registry.ts,metric-card.tsx,
                                         card-group.tsx,use-dashboard-metrics.ts,range-picker.tsx}
```
**Modified**
```
apps/api/src/modules/analytics/{analytics.controller,analytics.service,analytics.module}.ts
apps/api/src/modules/inventory/inventory.module.ts        register provider onModuleInit
apps/api/src/modules/purchasing/purchasing.module.ts      register provider onModuleInit
apps/web/src/app/(admin)/admin/(app)/page.tsx             REWRITTEN
apps/web/src/app/(admin)/admin/(app)/loading.tsx          card-grid skeleton
apps/web/src/lib/api-types.ts                             + DashboardCardsResponse
```

**Endpoint**
```
GET /admin/analytics/cards      @RequirePermission('analytics.view')
  query: days (7..365, default from setting), groups (csv), series (csv), bucket (day|week|month)
  200 -> DashboardCardsResponse (D2)
```

**New permissions.** None — reuses `analytics.view`, `inventory.view_cost`,
`orders.manage`, `catalog.manage`, `inventory.manage`, `purchasing.manage`,
`crm.manage`, `stitching.jobs.view_queue`, `users.manage`.

**Page structure of the new `/admin`.** `<PageHeader>` + `<RangePicker>`
(7/30/90/365, URL-synced `?days=`); the **needs-attention strip** — keep it, it
is the one genuinely good part of the current page, same six items rendered as
pills; nine `<CardGroup>` sections in `DASHBOARD_GROUPS` order, each heading
linking to the group index, collapse state in `localStorage` under
`yaseen.admin.dashboard.collapsed`, with an empty slot for the comparison chart
WO-B.5 fills. Grid `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5` —
**two columns on a phone, not one**, because staff scan these on phones.

`metric-card.tsx`: the **whole tile** is a `<Link>` with an `aria-label` reading
"{label}: {value}, {delta} versus the previous {n} days"; the delta carries an
arrow glyph **and** the words up/down, never colour alone; `tone: 'up-bad'`
inverts the colour but not the arrow; an absent metric renders an em-dash with a
`title` distinguishing permission from module-off; the loading shimmer is sized
from the registry so the grid does not reflow.

**Acceptance**
- [ ] **One** network request to `/admin/analytics/cards` per range change. More
      than one is a failure.
- [ ] Adding a card is one object literal plus, if the metric is new, one key in
      an existing provider. No new component, no new fetch.
- [ ] A STAFF user (no `inventory.view_cost`) sees the dashboard render fully
      with Gross profit / Gross margin / Inventory valuation / Purchasing spend as
      em-dashes, no console error, and **`sales.gross_profit` absent from the
      JSON** — not present-and-hidden.
- [ ] With `MODULES` excluding `purchasing`, the Purchasing group disappears
      entirely and the API boots clean.
- [ ] Every card navigates somewhere that exists, and where it carries a filter
      the destination arrives already filtered.
- [ ] `page.tsx` is under 150 lines, with the inline `Stat`, `BarList` and `Mini`
      helpers deleted.
- [ ] A test provider that throws does not blank the dashboard.
- [ ] axe on `/admin`: no colour-contrast and no link-name violations.

---

### WO-A.5 — Analytics detail-page shell, catch-all route, first six reports

**Depends on.** WO-A.1, A.2, A.4.

**Created**
```
apps/web/src/components/admin/analytics/report-registry.ts
apps/web/src/components/admin/analytics/analytics-detail-page.tsx
apps/web/src/components/admin/analytics/blocks/{kpis,timeseries,share,ranking,table,funnel,gauge}-block.tsx
apps/web/src/components/admin/analytics/resolve-path.ts + .spec.ts
apps/web/src/app/(admin)/admin/(app)/analytics/page.tsx              report index
apps/web/src/app/(admin)/admin/(app)/analytics/[...slug]/page.tsx
apps/api/src/modules/analytics/reports/{sales,orders}.reports.ts
```

**Endpoints** — controller-level `@RequirePermission('analytics.view')`, extras
noted per method.

| Method | Path | Extra perm | Response |
|---|---|---|---|
| GET | `/admin/analytics/sales/revenue` | — | `{ totals:{revenue,orders,aov}, series:[{t,revenue,orders}], byChannel, target:{amount,achieved,percentBps} }` |
| GET | `/admin/analytics/sales/aov` | — | `{ totals:{aov,median,basketSize}, series:[{t,aov}], distribution:[{bucket,orders}] }` |
| GET | `/admin/analytics/sales/profit` | `inventory.view_cost` | `{ totals:{revenue,cogs,grossProfit,grossMarginBps}, series, byProduct:[{productId,name,revenue,cogs,grossProfit,marginBps}] }` |
| GET | `/admin/analytics/sales/funnel` | — | `{ steps:[{key,label,count}], conversionBps, abandonedCarts, sources }` |
| GET | `/admin/analytics/orders/overview` | — | `{ totals:{total,...perStatus}, series:[{t,...perStatus}], byCity, byPaymentMethod }` |
| GET | `/admin/analytics/orders/fulfilment` | — | `{ avgDays, series:[{t,avgDays}], byStatus:[{status,avgHours,count}], ageing:[{bucket,count}] }` |

Gross profit here is the **direct** figure: revenue less
`Σ unitCost × quantity` over `OrderItem` joined to non-`CANCELLED`/`RETURNED`
orders. It is available today and **must not wait on WO-B.3**. `OrderEconomics`
later adds shipping, gateway and packaging to produce **contribution** — a
different number, clearly labelled as such.

**Acceptance**
- [ ] `/admin/analytics/sales/revenue` renders from a config under 40 lines.
- [ ] A seventh report requires one API method + one registry entry, no new route
      file. Demonstrate it in the PR body.
- [ ] A static route file at `analytics/sales/revenue/page.tsx` overrides the
      catch-all. Prove it, then delete the proof.
- [ ] An unknown slug renders `not-found.tsx`, not a blank page or a stack trace.
- [ ] A report the user lacks permission for is absent from `/admin/analytics`
      and renders a permission notice if reached directly — not a 403 crash.
- [ ] Range picker and every filter are URL-synced; a filtered report URL is
      shareable.
- [ ] `resolve-path.spec.ts` covers: missing path returns undefined, not a throw;
      array-index paths; interpolation with a missing key; interpolation must
      `encodeURIComponent`.
- [ ] No division by 100 anywhere in `apps/web/src/components/admin/analytics`.

---

## Track B — Finance and expenses

### WO-B.1 — finance module: expense categories and expenses

**Depends on.** WO-A.1 for the UI primitives. The API side is independent of
A.2–A.5.

**Created**
```
apps/api/prisma/schema/finance.prisma
apps/api/src/modules/finance/{finance.module,finance.service,finance.controller}.ts
apps/api/src/modules/finance/dto/{expense,expense-category}.dto.ts
apps/api/src/modules/finance/finance.spec.ts
apps/api/prisma/schema/migrations/<ts>_add_finance_expenses/migration.sql
apps/web/src/app/(admin)/admin/(app)/finance/expenses/page.tsx
apps/web/src/app/(admin)/admin/(app)/finance/expenses/categories/page.tsx
```
**Modified**
```
apps/api/src/modules/modules.registry.ts       one line: { name: 'finance', module: FinanceModule }
apps/api/prisma/schema/purchasing.prisma       Supplier: + expenses Expense[]
apps/api/prisma/schema/core.prisma             User: + expensesCreated Expense[] @relation("ExpenseCreator")
apps/api/prisma/seed.ts                        + seedExpenseCategories()
apps/api/src/core/settings/settings.defaults.ts
apps/api/src/core/config/env.validation.ts     MODULES default: add purchasing,finance
packages/shared/src/permissions.ts             + finance.view, finance.manage
.env.example / .env.production.example
apps/web/src/components/admin/nav-registry.ts  Finance > Expenses (+ Categories child)
```

**Schema** — `04-finance.md`'s model plus two columns the dashboard needs.

```prisma
// Finance: operational expenses and per-order economics.
// Deliberately NOT double-entry. If you find yourself wanting a JournalEntry
// model, stop - see docs/implementation/finance-accounting/04-finance.md.
// Money is integer paisa (Rule 5). Every report groups by incurredAt, never
// paidAt: October's rent paid in November is an October expense.

model ExpenseCategory {
  id       String  @id @default(cuid())
  key      String  @unique   // "rent", "salaries", "marketing", "packaging"
  /// Staff-only label. NOT a translation row - Rule 6's second paragraph, and D10.
  name     String
  /// Direct costs sit above the gross-profit line; operating below it.
  isDirect Boolean @default(false)
  isActive Boolean @default(true)
  order    Int     @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  expenses  Expense[]

  @@index([isActive, order])
}

enum ExpenseRecurrence { NONE WEEKLY MONTHLY QUARTERLY YEARLY }

model Expense {
  id          String @id @default(cuid())
  categoryId  String
  /// Paisa. Always positive - an expense is not a negative income.
  amount      Int
  currency    String @default("PKR")
  description String

  /// The date the cost BELONGS TO, which is not always when it was entered.
  incurredAt DateTime
  /// When money actually left. Null = unpaid. Cash flow is the only consumer.
  paidAt     DateTime?

  payee      String?
  supplierId String?
  reference  String?
  receiptUrl String?          // via the existing StorageDriver

  recurrence      ExpenseRecurrence @default(NONE)
  recurringFromId String?
  /// Period key of a generated instance, e.g. "2026-08". With recurringFromId
  /// this is what makes the cron idempotent at the DATABASE level.
  recurringPeriod String?

  createdById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  category      ExpenseCategory @relation(fields: [categoryId], references: [id])
  supplier      Supplier?       @relation(fields: [supplierId], references: [id], onDelete: SetNull)
  createdBy     User?           @relation("ExpenseCreator", fields: [createdById], references: [id], onDelete: SetNull)
  recurringFrom Expense?        @relation("ExpenseRecurrence", fields: [recurringFromId], references: [id], onDelete: SetNull)
  generated     Expense[]       @relation("ExpenseRecurrence")

  @@unique([recurringFromId, recurringPeriod])
  @@index([incurredAt])
  @@index([categoryId, incurredAt])
  @@index([paidAt])
  @@index([supplierId])
}
```

`@@unique([recurringFromId, recurringPeriod])` is the belt to WO-B.2's braces:
even if the cron runs twice, the database refuses the second rent row. "The
handler is idempotent" is not a strong enough guarantee when the failure mode is
silently doubling your costs.

**New permissions**
```ts
{ key: 'finance.view',   label: 'View expenses and finance reports', category: 'Finance' },
{ key: 'finance.manage', label: 'Record and edit expenses',          category: 'Finance' },
```
`ROLE_PERMISSION_SEED`: `finance.view` → **STAFF + ADMIN**;
`finance.manage` → **ADMIN only**.

**New settings.** `FinanceDefaultCurrency: 'finance.default_currency'` → `PKR`.
Categories are **seed data, not a setting** — staff edit them as rows.

**Seed categories** (upsert on `key`, idempotent): `rent`, `salaries`,
`utilities`, `marketing`, `transport`, `packaging`, `courier_charges`,
`gateway_fees`, `equipment_rent`, `repairs`, `misc`. `isDirect: true` on
**`packaging`, `courier_charges`, `gateway_fees`** only — they scale with orders
and belong above the gross-profit line.

**New domain event**
```ts
ExpenseRecorded: 'finance.expense_recorded',

export interface ExpenseRecordedPayload {
  expenseId: string; categoryKey: string; isDirect: boolean;
  amount: number; incurredAt: string; supplierId: string | null;
}
```
Published inside the create transaction with `tx`. No handler ships here — it
exists so that cache invalidation and future budget alerts are a new file, not
an edit.

**Endpoints**

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/admin/finance/expense-categories` | `finance.view` | `[{ id, key, name, isDirect, isActive, order, expenseCount }]` |
| POST / PATCH | `/admin/finance/expense-categories[/:id]` | `finance.manage` | |
| DELETE | `/admin/finance/expense-categories/:id` | `finance.manage` | 409 if referenced; offers deactivate |
| GET | `/admin/finance/expenses` | `finance.view` | `from,to,categoryId,paid,supplierId,q,page,pageSize` |
| POST / PATCH / DELETE | `/admin/finance/expenses[/:id]` | `finance.manage` | |
| GET | `/admin/finance/expenses/summary` | `finance.view` | `{ totals:{amount,count,directAmount,operatingAmount,unpaidAmount,unpaidCount}, byCategory, series }` |

**Acceptance**
- [ ] `pnpm db:seed` twice leaves exactly 11 categories with unchanged ids.
- [ ] `POST` with `amount: 1500` stores `1500` (paisa = Rs 15); a request sending
      `15.00` is rejected by `@IsInt()`, not silently truncated.
- [ ] An expense incurred 2026-10-05 and paid 2026-11-20 appears in **October's**
      summary and not November's.
- [ ] `finance.view` can GET but gets 403 on POST.
- [ ] A user with neither permission sees no Finance group at all.
- [ ] `node scripts/check-module-boundaries.mjs` passes.
- [ ] Migration SQL contains only `CREATE TYPE` / `CREATE TABLE` / `CREATE INDEX`
      / `CREATE UNIQUE INDEX` / `ADD CONSTRAINT ... FOREIGN KEY`.
- [ ] With `MODULES` excluding `finance`, the API boots and `/admin/finance/*`
      404s.

---

### WO-B.2 — Recurring expenses and receipt upload

**Depends on.** WO-B.1.
**Created**: `finance.cron.ts` + `.spec.ts`.
**Modified**: `finance.module.ts`, `finance.controller.ts`
(+ `POST /admin/finance/expenses/:id/receipt`), `finance.service.ts`,
`settings.defaults.ts`, the expenses page.

`@Cron('0 3 * * *')` — **daily, not monthly.** A daily idempotent check recovers
from a missed run; a monthly one silently skips a month if the container was
down that night. For each template with `recurrence != NONE`, compute the period
keys due since its `incurredAt` and create one instance per missing key. The
unique constraint turns a race or a retry into a caught `P2002`.

Receipts go through the existing `StorageDriver` (`src/core/storage/`),
following the product-image multipart pattern.

**New setting**: `FinanceRecurringRunHour: 'finance.recurring_run_hour'` → `3`.

**Acceptance**
- [ ] Running the cron twice creates the instances once. Assert row counts.
- [ ] A MONTHLY template with `incurredAt` three months ago generates exactly
      three instances on the first run and none on the second.
- [ ] A simulated `P2002` logs and continues; it does not crash the job.
- [ ] Deleting a template leaves its generated instances (`onDelete: SetNull`) —
      history is not rewritten.
- [ ] Upload accepts only images and PDF, caps size from the existing storage
      config, and stores a URL, not a blob.

---

### WO-B.3 — OrderEconomics: contribution per order

**Depends on.** WO-B.1.
**Created**: `finance.listener.ts` + `.spec.ts`, `order-economics.service.ts`,
migration `add_order_economics`.
**Modified**: `finance.prisma` (+ `OrderEconomics`, `04-finance.md`'s model
verbatim with `orderId String @id`), `orders.prisma`
(`Order: + economics OrderEconomics?`), `finance.module.ts`,
`domain-events.ts`, `settings.defaults.ts`.

**New settings**
```ts
FinancePackagingCostPerOrder: 'finance.packaging_cost_per_order',  // toMinor(50)
/** Basis points per provider (Rule 5). 250 = 2.5%. */
FinanceGatewayFeeBps:         'finance.gateway_fee_bps',           // { cod: 0, bank_transfer: 0, default: 250 }
```

**New event**: `OrderEconomicsComputed: 'finance.order_economics_computed'` with
`{ orderId, revenue, cogs, contribution }`.

`@OnDomainEvent(DomainEvent.OrderStatusChanged)` — compute on `DELIVERED`,
**recompute on `RETURNED`**. Idempotent via `upsert` keyed on `orderId`.

**Acceptance**
- [ ] Delivering writes exactly one row; replaying the event writes no second row
      and changes no value.
- [ ] Contribution equals revenue plus shipping income plus COD fee income, less
      COGS, shipping cost, gateway fee and packaging cost — asserted on a fixture
      with known integers.
- [ ] **Returning a delivered order zeroes both `revenue` and `cogs`.** Reversing
      revenue alone drives margin negative on every return — this is the single
      most common way this table lies.
- [ ] A CANCELLED order gets no row at all.
- [ ] `gatewayFee` is 0 for COD; otherwise `round(grandTotal * bps / 10000)`.
- [ ] `shippingCost` reads `Shipment.cost` when present and falls back to 0 **with
      the row flagged**, never to a guess.

---

### WO-B.4 — Expense metrics and the three expense analytics pages

**Depends on.** WO-A.5, WO-B.1.
**Created**: `finance.metrics.ts`.
**Modified**: `finance.module.ts`, `finance.controller.ts`, `card-registry.ts`
(+7 cards), `report-registry.ts` (+3 reports). **No new route files.**

| Method | Path | Perm | Response |
|---|---|---|---|
| GET | `/admin/finance/expenses/by-category` | `finance.view` | `{ total, rows:[{categoryId,key,name,isDirect,amount,shareBps,count,changeBps}] }` |
| GET | `/admin/finance/expenses/trend` | `finance.view` | `{ series:[{t,total,direct,operating,byCategory}], bucket }` |

Reports: `expenses/overview`; `expenses/by-category` with
`drillTo: 'expenses/trend'` and a table whose rows link to
`/admin/finance/expenses?categoryId={categoryId}`; `expenses/trend`.

**Acceptance**
- [ ] The Expenses group appears for a `finance.view` user and is entirely absent
      otherwise.
- [ ] **`expenses.vs_revenue_bps` uses the same revenue definition as
      `sales.revenue`** — same void-status exclusion, same `placedAt` date field.
      Assert equality in a test: two different "revenue" numbers on one screen
      destroys trust in all of it.
- [ ] Clicking a slice navigates to the ledger already filtered, and the ledger
      total equals the slice.
- [ ] A month with no expenses renders zeros and an `<EmptyState>`, never an
      error.

---

### WO-B.5 — The comparative sales / purchases / expenses chart

**Purpose.** The owner's headline request.
**Depends on.** WO-A.4, WO-B.1. (Purchasing shipped in Phase 1.)
**Created**: `apps/api/src/modules/analytics/reports/comparison.reports.ts`,
`apps/web/src/components/admin/dashboard/comparison-panel.tsx`.

```
GET /admin/analytics/comparison    @RequirePermission('analytics.view')
  query: days, bucket=day|week|month
  200 -> {
    bucket: 'day'|'week'|'month';
    buckets: Array<{ t: string; sales: number; purchases: number; expenses: number;
                     grossProfit: number|null;   // null without inventory.view_cost
                     net: number|null }>;        // null when either side is hidden
    totals: { sales; purchases; expenses; grossProfit: number|null; net: number|null };
  }
```

**Definitions — pin these down, they are the whole value of the chart:**

- **Sales** = sum of `Order.grandTotal` by `placedAt`, excluding CANCELLED and
  RETURNED. Deliberately **not** `OrderEconomics.revenue`, which only exists once
  an order is DELIVERED and would make the current week look empty.
- **Purchases** = sum of `GoodsReceiptItem.quantity * landedUnitCost` by
  `GoodsReceipt.receivedAt`. Deliberately **not** `PurchaseOrder.total` by
  `sentAt`: **a purchase order is an intention, a goods receipt is a cost.**
- **Expenses** = sum of `Expense.amount` by `incurredAt`.

Three raw SQL statements, one per source, run with `Promise.all`; bucket
boundaries come from `metric-window.ts` so all three share an identical axis.
Rendered by `<ComparisonChart>` — sales as an area, purchases and expenses as
stacked bars behind it, optional net line; bucket and range URL-synced. The same
panel is reused as the `overview/comparison` full report with a breakdown table.

**Acceptance**
- [ ] All three series share identical bucket boundaries; an empty bucket renders
      zero, not a gap or a skipped x-value.
- [ ] Every figure is an integer — assert `Number.isInteger` across the whole
      payload.
- [ ] With `MODULES` excluding `finance`, expenses is all zeros and the chart
      renders with a note explaining why — not an error, not a silently-missing
      series.
- [ ] Without `inventory.view_cost`, `grossProfit` and `net` are null, those
      series are hidden, and the chart says so.
- [ ] `bucket=month` over `days=365` returns 12–13 buckets, oldest first, with the
      partial current month clearly last.
- [ ] Daily buckets sum to monthly buckets sum to totals, to the paisa.

---

## Track C — BOM and manufacturing

### WO-C.1 — bom module: raw materials as inventory items

**Depends on.** WO-A.1. Independent of Track B.

**Created**
```
apps/api/prisma/schema/bom.prisma
apps/api/src/modules/bom/{bom.module,bom.service,bom.controller,raw-material.service}.ts
apps/api/src/modules/bom/dto/raw-material.dto.ts
apps/api/src/modules/bom/bom.spec.ts
apps/api/prisma/schema/migrations/<ts>_add_bom_raw_materials/migration.sql
packages/shared/src/units.ts + units.spec.ts
apps/web/src/app/(admin)/admin/(app)/bom/raw-materials/page.tsx
apps/web/src/app/(admin)/admin/(app)/bom/raw-materials/[id]/page.tsx
```
**Modified**
```
apps/api/src/modules/modules.registry.ts              { name: 'bom', module: BomModule }
apps/api/prisma/schema/catalog.prisma                 ProductVariant: + rawMaterial RawMaterial?
apps/api/prisma/seed.ts                               + seedRawMaterialCategory()
apps/api/src/core/settings/settings.defaults.ts
packages/shared/src/index.ts                          export * from './units'
packages/shared/src/permissions.ts                    + bom.view, bom.manage, bom.produce
.env.example + production, env.validation.ts    MODULES += bom
apps/web/src/components/admin/nav-registry.ts         new 'manufacturing' group + Factory icon
apps/web/src/app/(admin)/admin/(app)/products/page.tsx    badge/hide raw-material rows (web-only)
```

```prisma
// BOM: which raw materials go into a finished product, how much of each, and
// what that makes the product cost to produce.
//
// A raw material is NOT a new kind of thing. It is an ordinary ProductVariant
// with a RawMaterial marker row pointing at it, so purchase orders, goods
// receipts, the stock ledger, stock counts, reorder points and weighted-average
// costing all work on fabric exactly as they work on a kurta. See D5.
//
// QUANTITIES ARE INTEGER BASE UNITS, the same discipline money uses. unitScale
// says how many base units make one display unit: fabric is GAZ with unitScale
// 1000, so stock 12500 is 12.5 gaz and costPrice is paisa per milli-gaz.
// Convert only at the UI boundary, through @newax/shared's toBaseUnits /
// fromBaseUnits. A bare scale multiplication in a component is a bug.

enum RawMaterialUnit { GAZ METRE PIECE SPOOL GRAM MILLILITRE }

model RawMaterial {
  id String @id @default(cuid())

  /// The ProductVariant that carries stock, costPrice, supplier links and the
  /// movement ledger. One variant is at most one raw material.
  variantId String @unique

  /// Staff-only. Not a translation row (Rule 6, D10): nobody shopping sees this.
  name String
  /// "fabric" | "trim" | "packaging" | "consumable". Groups the raw-usage report.
  kind String @default("fabric")

  unit      RawMaterialUnit
  /// Base units per display unit. 1000 for continuous goods, 1 for countable.
  unitScale Int @default(1)

  notes    String?
  isActive Boolean @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  variant         ProductVariant      @relation(fields: [variantId], references: [id], onDelete: Cascade)
  components      BomComponent[]
  productionLines BomProductionLine[]

  @@index([isActive, kind])
  @@index([name])
}
```

`packages/shared/src/units.ts` (Rule 11): `toBaseUnits(display, scale)` (rounds),
`fromBaseUnits(base, scale)`, `formatQuantity(base, scale, unit)` showing only
the decimals the scale implies, and `UNIT_LABELS`.

**New permissions**
```ts
{ key: 'bom.view',    label: 'View bills of materials and raw stock',      category: 'Manufacturing' },
{ key: 'bom.manage',  label: 'Create and edit raw materials and recipes',  category: 'Manufacturing' },
{ key: 'bom.produce', label: 'Record a production run',                    category: 'Manufacturing' },
```
Seed: `bom.view` → STAFF + ADMIN; `bom.produce` → STAFF + ADMIN (shop-floor
work); `bom.manage` → **ADMIN only**.

**New settings**: `BomRawMaterialCategorySlug` → `raw-materials`;
`BomDefaultWastageBps` → `0`.

**Endpoints**

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/admin/bom/raw-materials` | `bom.view` | `q,kind,filter,page`. Stock in base **and** display units; `costPrice` only with `inventory.view_cost`. |
| GET | `/admin/bom/raw-materials/:id` | `bom.view` | Detail + recent `StockMovement` rows + recipes using it |
| POST | `/admin/bom/raw-materials` | `bom.manage` | Creates `Product` (DRAFT, UNSTITCHED, raw-materials category) + `ProductVariant` + `RawMaterial` in **one transaction** |
| PATCH | `/admin/bom/raw-materials/:id` | `bom.manage` | |
| POST | `/admin/bom/raw-materials/:id/deactivate` | `bom.manage` | 409 while an ACTIVE recipe references it |

**`unitScale` is effectively immutable.** Changing it silently reinterprets every
existing stock number and every historical cost. `PATCH` must reject a
`unitScale` change when `variant.stock != 0` or any `StockMovement` exists,
telling the user to create a new raw material instead. **Write this test first.**

**Acceptance**
- [ ] Creating a raw material yields a DRAFT `Product` in the raw-materials
      category, one variant with a generated SKU, and a `RawMaterial` row — and
      **the public storefront catalog endpoint does not return it** (assert
      against the endpoint, not by reading code).
- [ ] A PO can be raised for a raw material's variant, received, and `costPrice`
      updates via the existing `weightedAverageCost()` path **with no change to
      `purchasing.service.ts`**. This is the proof the whole design rests on —
      make it an integration test.
- [ ] `toBaseUnits(12.5,1000)` is 12500; `fromBaseUnits(12500,1000)` is 12.5;
      `formatQuantity(12500,1000,'GAZ')` is "12.5 gaz"; `toBaseUnits(0.0004,1000)`
      is 0 and the UI warns rather than silently storing nothing.
- [ ] Changing `unitScale` on a material with stock returns 409.
- [ ] No bare scale multiplication or division anywhere under the bom admin pages.
- [ ] `node scripts/check-module-boundaries.mjs` passes.
- [ ] With `MODULES` excluding `bom`, the API boots, `/admin/bom/*` 404s, and the
      Manufacturing nav group is absent.

---

### WO-C.2 — Recipes and the COGS rollup

**Depends on.** WO-C.1.

**Created**: `recipe.service.ts`, `cost-rollup.ts` + `.spec.ts`,
`bom.listener.ts` + `.spec.ts`, `dto/recipe.dto.ts`, migration
`add_bom_recipes`, plus `bom/page.tsx`, `bom/new/page.tsx`, `bom/[id]/page.tsx`,
`components/admin/bom/{recipe-editor,cost-breakdown}.tsx`.
**Modified**: `bom.prisma`, `catalog.prisma`
(`ProductVariant: + bomRecipe BomRecipe?`), `bom.module.ts`, `bom.controller.ts`.

```prisma
enum BomStatus { DRAFT ACTIVE ARCHIVED }

model BomRecipe {
  id String @id @default(cuid())

  /// The finished ProductVariant this recipe produces. One live recipe per variant.
  variantId String @unique

  status  BomStatus @default(DRAFT)
  version Int       @default(1)

  /// How many finished units one run yields. Lets a recipe be written per-dozen
  /// where that is how the workshop actually thinks.
  outputQuantity Int @default(1)

  /// Expected scrap, basis points (Rule 5). 500 = 5%. Per-component override wins.
  wastageBps Int @default(0)

  /// Paisa per finished unit. Not materials - stitching labour and overhead.
  labourCost   Int @default(0)
  overheadCost Int @default(0)

  /// CACHE. Paisa per finished unit at CURRENT raw costs. Recomputed on every
  /// recipe edit and every goods receipt touching a component. An ESTIMATE for
  /// the editor. It is NEVER the COGS of a sale - that is OrderItem.unitCost (Rule 7).
  rolledUpUnitCost Int      @default(0)
  /// False when any non-optional component's variant.costPrice is 0 (UNKNOWN, not free).
  costComplete     Boolean  @default(false)
  costComputedAt   DateTime?

  notes       String?
  createdById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  variant    ProductVariant     @relation(fields: [variantId], references: [id], onDelete: Cascade)
  createdBy  User?              @relation("BomRecipeCreator", fields: [createdById], references: [id], onDelete: SetNull)
  components BomComponent[]
  runs       BomProductionRun[]

  @@index([status])
  @@index([costComplete])
}

model BomComponent {
  id            String @id @default(cuid())
  recipeId      String
  rawMaterialId String

  /// BASE units of the raw material consumed per outputQuantity finished units.
  quantityBase Int
  /// Overrides BomRecipe.wastageBps for this line. Null = inherit.
  wastageBps   Int?
  isOptional   Boolean @default(false)
  note         String?
  order        Int     @default(0)

  recipe      BomRecipe   @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  rawMaterial RawMaterial @relation(fields: [rawMaterialId], references: [id], onDelete: Restrict)

  @@unique([recipeId, rawMaterialId])
  @@index([rawMaterialId])
}
```

**The rollup, exactly** — `cost-rollup.ts`, a pure function, trivially testable:

```
effectiveBps(c)     = c.wastageBps ?? recipe.wastageBps
componentBaseQty(c) = ceil(c.quantityBase * (10000 + effectiveBps(c)) / 10000)
componentCost(c)    = componentBaseQty(c) * rawMaterialVariant.costPrice     // integer paisa
materialCost        = sum of componentCost(c) over NON-OPTIONAL components
rolledUpUnitCost    = round(materialCost / recipe.outputQuantity) + labourCost + overheadCost
costComplete        = every non-optional component's costPrice > 0
```

`ceil` on quantity (you cannot consume 0.4 of a button, and rounding down
understates cost); `round` on the money division.

**No nesting in v1.** A `BomComponent.rawMaterialId` points at a `RawMaterial`,
and a `RawMaterial`'s variant may not also carry a `BomRecipe`. Enforce in
`recipe.service.ts` with a clear 400 naming the offending material.
Sub-assemblies turn a two-day work order into a two-week one; explicitly
deferred, and say so in the PR.

**Recompute on goods receipt** — Rule 3 in action, no new event needed:
```ts
@OnDomainEvent(DomainEvent.GoodsReceived)
async recomputeAffectedRecipes(payload: GoodsReceivedPayload): Promise<void>
```
`GoodsReceivedPayload` carries only `goodsReceiptId`; read `GoodsReceiptItem` via
Prisma for the variant ids, then `RawMaterial`, then recipes, then recompute.
Pure recompute is idempotent by construction, which is what at-least-once
delivery requires.

**Endpoints**

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/admin/bom/recipes` | `bom.view` | `filter=all\|active\|missing\|incomplete-cost`, `q`, `page` |
| GET | `/admin/bom/recipes/:id` | `bom.view` | Costs only with `inventory.view_cost` |
| POST / PATCH | `/admin/bom/recipes[/:id]` | `bom.manage` | PATCH recomputes the rollup in the same transaction |
| POST | `/admin/bom/recipes/:id/activate` | `bom.manage` | 400 unless at least one non-optional component |
| POST | `/admin/bom/recipes/:id/archive` | `bom.manage` | |
| GET | `/admin/bom/recipes/:id/cost` | `bom.view` + `inventory.view_cost` | Per-component breakdown |
| GET | `/admin/bom/recipes/:id/availability` | `bom.view` | `?quantity=` returns `{ canProduce, maxRuns, shortages }` |
| GET | `/admin/bom/missing` | `bom.view` | `{ missing, incompleteCost, counts }` |

**The "missing BOMs" query, precisely:**
```sql
SELECT v.id, v.sku, p.id AS "productId"
FROM "ProductVariant" v
JOIN "Product" p ON p.id = v."productId"
LEFT JOIN "BomRecipe"   r  ON r."variantId" = v.id AND r.status = 'ACTIVE'
LEFT JOIN "RawMaterial" rm ON rm."variantId" = v.id
WHERE v."isActive" = true
  AND p.status = 'ACTIVE'
  AND p.kind IN ('STITCHED', 'UNSTITCHED')
  AND r.id IS NULL
  AND rm.id IS NULL;
```
Second bucket, "incomplete cost": `costComplete = false`. **A recipe whose
rolled-up cost is a lie is more dangerous than no recipe, because it looks like
an answer.**

**Acceptance**
- [ ] Unit tests: a 2-gaz + 6-button + 1-spool recipe with known costs produces
      the exact expected integer; a 5% wastage line ceils; a zero-cost component
      sets `costComplete: false` and is visibly flagged, not silently treated as
      free.
- [ ] `outputQuantity: 12` divides material cost by 12 before adding per-unit
      labour.
- [ ] Receiving fabric updates every recipe using it — `rolledUpUnitCost` changed,
      `costComputedAt` moved. Fire the event twice; the value is identical.
- [ ] A component pointing at a raw material that itself has a recipe returns 400.
- [ ] A component pointing at the recipe's own output variant returns 400.
- [ ] `filter=missing` count equals the SQL above run by hand against seed data.
- [ ] `GET /admin/bom/recipes/:id` for a user without `inventory.view_cost`
      **omits** every cost field — absent, not zeroed.
- [ ] POST for a variant that already has a recipe returns 409.

---

### WO-C.3 — Production runs: consume raw, produce finished, update cost

**Purpose.** The step that makes BOM real.
**Depends on.** WO-C.2.

**Created**: `production.service.ts` + `.spec.ts`, `dto/production-run.dto.ts`,
migration `add_bom_production_runs`, `bom/production/page.tsx`,
`bom/production/new/page.tsx`.
**Modified**: `bom.prisma`, `core.prisma` (`User: + bomProductionRuns`),
`bom.module.ts` (`imports: [InventoryModule]`), `bom.controller.ts`,
`domain-events.ts`.

```prisma
model BomProductionRun {
  id     String @id @default(cuid())
  number String @unique          // "PR-2026-0001"

  recipeId  String
  variantId String

  runs             Int @default(1)   // how many times the recipe was run
  quantityProduced Int               // runs * recipe.outputQuantity

  /// SNAPSHOTS (Rule 7). A production run is history; a later cost change or a
  /// recipe edit must not rewrite what this batch cost to make.
  materialCost     Int
  labourCost       Int
  overheadCost     Int
  producedUnitCost Int               // round((material+labour+overhead)/quantityProduced)

  notes      String?
  operatorId String?
  producedAt DateTime @default(now())
  createdAt  DateTime @default(now())

  recipe   BomRecipe           @relation(fields: [recipeId], references: [id])
  variant  ProductVariant      @relation("BomProducedVariant", fields: [variantId], references: [id])
  operator User?               @relation("BomProductionOperator", fields: [operatorId], references: [id], onDelete: SetNull)
  lines    BomProductionLine[]

  @@index([producedAt])
  @@index([recipeId])
  @@index([variantId])
}

model BomProductionLine {
  id    String @id @default(cuid())
  runId String

  rawMaterialId String
  /// The raw material's variant, denormalised so the ledger join is direct.
  variantId     String

  quantityBase Int   // base units actually consumed, wastage included
  unitCost     Int   // snapshot of costPrice at run time, paisa per base unit
  lineCost     Int

  run         BomProductionRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  rawMaterial RawMaterial      @relation(fields: [rawMaterialId], references: [id])

  @@index([runId])
  @@index([rawMaterialId])
}
```
Add `producedRuns BomProductionRun[] @relation("BomProducedVariant")` to
`ProductVariant`.

**The transaction, in this exact order:**
```ts
await this.prisma.$transaction(async (tx) => {
  // 1. Load the ACTIVE recipe + components + each raw material's variant costPrice.
  // 2. Compute consumption per component (ceil with wastage) times runs.
  // 3. Consume: inventory.moveMany(negatives, tx)
  //      reason: 'ADJUSTMENT', refType: 'BomProductionRun', refId: run.id,
  //      unitCost: <raw costPrice>, actorId
  //    moveMany already sorts by variantId - that is what avoids deadlocks.
  //    InsufficientStockError propagates as a 400 naming the short material.
  // 4. producedUnitCost = round(materialCost / quantityProduced) + labour + overhead
  // 5. Produce: inventory.move({ delta: +quantityProduced, reason: 'ADJUSTMENT',
  //      refType: 'BomProductionRun', refId: run.id, unitCost: producedUnitCost }, tx)
  // 6. Weighted-average the finished variant's cost with the SAME shared helper
  //    purchasing uses - one costing rule for bought and made goods:
  //      newCost = weightedAverageCost(stockBefore, variant.costPrice,
  //                                    quantityProduced, producedUnitCost)
  //      tx.productVariant.update({ where: { id: variantId }, data: { costPrice: newCost } })
  // 7. events.publish(DomainEvent.BomProductionCompleted, payload, tx)   // pass tx
});
```

**Why step 6 is the keystone.** `orders.service.ts:175` already snapshots
`OrderItem.unitCost` from `variant.costPrice` at checkout, and analytics already
sums that for COGS. Writing `costPrice` through the same `weightedAverageCost()`
helper purchasing uses means **manufactured goods flow into COGS, gross profit
and margin with zero changes to `orders`, `analytics` or `reports`.** Do not
invent a second costing path for made goods.

**Deleting a run is not supported.** A run is ledger history. To correct one,
record a reversing adjustment through the normal inventory screen. DELETE
returns 405 with that message.

**New event**: `BomProductionCompleted: 'bom.production_completed'` with
`{ runId, number, recipeId, variantId, quantityProduced, producedUnitCost, operatorId }`.

**Backfill helper (opt-in, not a migration).** Variants manufactured before BOM
existed have `costPrice = 0`, overstating gross profit. Ship
`POST /admin/bom/recipes/:id/seed-cost-price` (`bom.manage` +
`inventory.view_cost`): sets `costPrice = rolledUpUnitCost` **only** where
`costPrice = 0` and `costComplete = true`, writes an `AuditLog` entry, and
returns what it changed. **A business decision is a button the owner presses, not
a migration that runs itself.**

**Endpoints**: `POST /admin/bom/production-runs` (`bom.produce`),
`GET /admin/bom/production-runs` and `/:id` (`bom.view`),
`POST /admin/bom/recipes/:id/seed-cost-price` (`bom.manage` + `inventory.view_cost`).

**Acceptance**
- [ ] A run of 10 units consuming 20 gaz leaves fabric stock 20000 base units
      lower, finished stock 10 higher, and writes one movement per component plus
      one for the output, all with `refType: 'BomProductionRun'` and the same
      `refId`.
- [ ] **Nothing writes `ProductVariant.stock` except `InventoryService.move()`.**
      Assert that a grep for `productVariant.update` under
      `apps/api/src/modules/bom` returns only the `costPrice` write from step 6 —
      no `stock` field anywhere in the module.
- [ ] Insufficient raw stock rolls the whole run back: no run row, no movements,
      no cost change. Verify inside a real transaction, not a mock.
- [ ] Two concurrent runs against a recipe with fabric for only one: exactly one
      succeeds, one gets a 400 naming the short material. **This is the Rule 10
      concurrency test and it is not optional.**
- [ ] `producedUnitCost` is an integer; `materialCost` equals the sum of
      `line.lineCost` exactly.
- [ ] Finished `costPrice` after producing 10 at cost 500 on top of 5 at cost 300
      equals `weightedAverageCost(5, 300, 10, 500)` — assert against the shared
      helper, not a re-derivation.
- [ ] **An order placed after the run snapshots the new `costPrice` into
      `OrderItem.unitCost`, and `/admin/analytics/sales/profit` reflects it. Test
      this end to end** — it is the whole point of the feature.
- [ ] Editing the recipe afterwards changes no historical run or line value.
- [ ] POST twice creates two runs (production is genuinely repeatable) — the UI
      requires a confirm step. Document it.

---

### WO-C.4 — BOM metrics, missing-BOM screen, raw-usage analytics

**Depends on.** WO-A.5, WO-C.3.
**Created**: `bom.metrics.ts`.
**Modified**: `bom.module.ts`, `bom.controller.ts`, `card-registry.ts` (+7),
`report-registry.ts` (+ `inventory/raw-usage`), `bom/page.tsx` (filters).

```
GET /admin/bom/raw-usage   @RequirePermission('bom.view')
  query: days, bucket, rawMaterialId?, kind?
  200 -> { series:[{ t, byMaterial: Record<rawMaterialId, number> }],       // base units
           totals:[{ rawMaterialId, name, unit, unitScale, consumedBase, consumedCost, runs, share }] }
  // cost fields only with inventory.view_cost
```

Sourced from `StockMovement` where `refType = 'BomProductionRun'` and
`delta < 0`, joined to `RawMaterial` — the `@@index([refType, refId])` makes this
cheap, which is why D7 chose `refType` over a new enum value.

**Acceptance**
- [ ] Raw-usage totals equal the sum of `BomProductionLine.quantityBase` over the
      same window — two independent paths to the same number, and they must agree.
- [ ] Quantities render in display units at the right precision ("12.5 gaz", not
      "12500" and not "12.500000001").
- [ ] `bom.missing_recipes` on the dashboard equals the row count on
      `/admin/bom?filter=missing`.
- [ ] With no runs ever recorded, every BOM card renders zero and raw-usage
      renders `<EmptyState>`.

---

## Track D — The remaining analytics pages

Each is one or a few API methods plus report-registry entries. **No new route
files.** Independently reviewable, all parallel once WO-A.5 has merged.

| WO | Reports | Endpoints (controller-level `analytics.view`, extras noted) |
|---|---|---|
| **D.1** | `orders/overview`, `orders/fulfilment` | Built in A.5; D.1 adds the ageing table, status-transition timing, by-city and by-payment breakdowns |
| **D.2** | `purchasing/spend`, `purchasing/suppliers` | spend (+`purchasing.manage`; costs need `inventory.view_cost`) returns `{ totals:{ordered,received,billed,unpaid}, series, byCategory }`; suppliers returns `{ rows:[{supplierId,name,spend,orders,onTimeRateBps,avgLeadDays,share}] }` |
| **D.3** | `products/top-sellers`, `products/slow-sellers`, `products/categories` | top-sellers returns `{ rows:[{productId,variantId,sku,name,units,revenue,cogs?,marginBps?}] }`; slow-sellers adds `daysSinceLastSale` and `ageDays` from `VariantSalesStat`; categories returns `{ rows:[{categoryId,name,revenue,units,productCount,share}], series }` |
| **D.4** | `inventory/valuation`, `inventory/movements` | valuation (`inventory.view_cost`) returns `{ totals:{units,value,unknownCostVariants}, byCategory, byKind, ageing }`; movements (`inventory.manage`) returns `{ series:[{t,in,out,byReason}], byReason, recent }` |
| **D.5** | `customers/overview`, `customers/retention`, `customers/top` | overview (+`crm.manage`) returns `{ totals, byCity, bySource, byStatus }`; retention returns `{ cohorts:[{cohort,size,retained}], repeatRateBps }`; top returns `{ rows:[{contactId,name,city,orders,lifetimeValue,avgOrderValue,lastOrderAt}] }` |
| **D.6** | `workshop/output` | (+`stitching.jobs.view_queue`) returns `{ series:[{t,started,completed}], byStage:[{stage,count,avgHours}], byTailor, bottleneck:{stage,avgHours} }` |

**Shared acceptance for D.1–D.6**
- [ ] Each report is a registry entry under 60 lines; **no new file under
      `app/(admin)/admin/(app)/analytics/`**.
- [ ] Every list-style report links its rows somewhere useful — a product, a
      supplier, a contact, an already-filtered order list.
- [ ] Every money field is integer paisa in the JSON and renders through `<Money>`.
- [ ] Every report has a defined empty state; none throws on a fresh database.
- [ ] Cost/margin columns are **absent from the JSON** for a caller without
      `inventory.view_cost`.
- [ ] A `LIMIT` on every ranking query. An unbounded `findMany` over `OrderItem`
      is a review rejection.
- [ ] Each raw SQL statement has an `EXPLAIN` in the PR body showing an index
      scan, or an explicit note on why a sequential scan is acceptable at this
      table size.

---

## Track E — Navigation and retirement

### WO-E.1 — Navigation, landing, breadcrumbs

**Depends on.** WO-A.5, B.4, C.4.
**Modified**: `nav-registry.ts`, `admin-shell.tsx`, `ui/page-header.tsx`.

- `NAV_GROUPS`: insert
  `{ key: 'manufacturing', label: 'Manufacturing', icon: 'Factory' }` between
  `inventory` and `workshop`. Add `Factory`, `TrendingUp`, `Receipt` to
  `ICON_MAP`. Extend the `AdminNavItem['group']` union.
- New entries: Insights → **Analytics** (`/admin/analytics`, `analytics.view`);
  Finance → **Expenses** (`/admin/finance/expenses`, `finance.view`) + child
  **Categories**; Manufacturing → **Bills of materials** (`/admin/bom`,
  `bom.view`) + children **Raw materials**, **Production**.
- **Wire up the `module` field**, which already exists in `AdminNavItem` and is
  currently unused: populate it (`finance`, `bom`, `analytics`) and extend
  `navFor()` to take the enabled-module list.
- Breadcrumbs from the nav registry plus the report registry's `parent` chain,
  per `02-admin-shell.md` WO-2.6.

**Acceptance**
- [ ] A TAILOR (no `analytics.view`) still lands on `/admin/stitching` and sees
      only Workshop.
- [ ] A `finance.view`-only user sees Finance but no Manufacturing.
- [ ] Disabling `bom` in `MODULES` removes the Manufacturing group with no code
      change.
- [ ] Breadcrumbs on `/admin/analytics/expenses/by-category` read
      Insights → Analytics → Expenses → By category, each a working link.
- [ ] A test walks both registries and asserts every `href` resolves to a real
      route or a known query-string variant of one.

### WO-E.2 — Retire superseded charts, add guards, update docs

**Depends on.** All of A–E.1.
**Deleted**: `sales-chart.tsx`, `donut-chart.tsx` — **only after
`compactRupees()` is confirmed ported into `chart-theme.ts`**.
**Kept**: `gauge-chart.tsx`, `funnel-chart.tsx`.
**Modified**: `reports/page.tsx` onto the chart wrappers;
`docs/implementation/finance-accounting/04-finance.md`; `docs/implementation/README.md`;
`CONTRIBUTING.md`.

**Acceptance**
- [ ] No reference to `sales-chart` or `donut-chart` remains in `apps/web/src`.
- [ ] `recharts` is imported only from `components/admin/charts/`.
- [ ] No `permissions.includes(` remains in `apps/web/src`
      (`02-admin-shell.md` exit criterion 3, achieved by A.1's `can()`).
- [ ] No division by 100 remains under `components/admin` or the analytics route.
- [ ] `04-finance.md` carries a dated note that WO-4.5's "do not add a charting
      library" was deliberately overridden, with the reason — so the next agent
      does not "fix" it back.
- [ ] Full DoD: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, seed
      twice.

---

## Dependency table

| WO | Depends on (must be **merged**) | Parallel with |
|---|---|---|
| A.1 | — | A.3, B.1\*, C.1\* |
| A.2 | A.1 | A.3, B.1, C.1 |
| A.3 | — | A.1, A.2 |
| A.4 | A.1, A.2, A.3 | B.1, C.1 |
| A.5 | A.1, A.2, A.4 | B.1–B.3, C.1–C.2 |
| B.1 | A.1 | A.2–A.5, C.1–C.2 |
| B.2 | B.1 | everything else |
| B.3 | B.1 | A.5, C.\*, D.\* |
| B.4 | A.5, B.1 | C.\*, D.\* |
| B.5 | A.4, B.1 | C.\*, D.\* |
| C.1 | A.1 | A.2–A.5, B.\* |
| C.2 | C.1 | A.\*, B.\*, D.\* |
| C.3 | C.2 | B.\*, D.\* |
| C.4 | A.5, C.3 | B.\*, D.\* |
| D.1–D.6 | A.5 | each other, B.\*, C.\* |
| E.1 | A.5, B.4, C.4 | — |
| E.2 | all of A–E.1 | — |

\* B.1 and C.1 touch `nav-registry.ts`; A.1 does not. They can start before A.1
merges but will conflict with E.1 on that file — keep each branch's nav edit to
the single entry it owns.

**High-conflict files across branches — coordinate merges.** All are append-only
by design; keep additions grouped at the end of their section so a merge is a
concatenation: `packages/shared/src/permissions.ts` (B.1, C.1);
`settings.defaults.ts` (A.3, B.1, B.2, B.3, C.1); `domain-events.ts` (B.1, B.3,
C.3); `modules.registry.ts` (B.1, C.1); `nav-registry.ts` (B.1, C.1, E.1);
`card-registry.ts` (A.4, B.4, C.4); `report-registry.ts` (A.5, B.4, B.5, C.4,
D.1–D.6); the four env example files (B.1, C.1).

## Sequencing

**Step 1 — day one, three agents in parallel.** WO-A.1 (web primitives + URL
filters), WO-A.3 (core metric registry), WO-C.1 (raw materials). **A.1 is the
critical path for everything visual — start it first and staff it best.**

**Step 2.** WO-A.2 (charts) once A.1 merges; WO-B.1 (finance) in parallel.

**Step 3.** WO-A.4 — the new dashboard. This is the moment the owner sees the
change, so ship it as soon as A.1 + A.2 + A.3 are in. It renders every card
Phase-1 data can already answer; finance and BOM cards appear later **without
touching this work order**, which is the whole point of the registry.

**Step 4.** WO-A.5 — the detail-page shell. After this merges, **Track D becomes
six independent parallel work orders** and is the cheapest work in the programme.

**Step 5.** Tracks B and C run as two independent chains
(B.1 → B.2/B.3 → B.4/B.5, and C.1 → C.2 → C.3 → C.4). They share no files except
the append-only registries. Two agents, one chain each.

**Step 6.** WO-E.1 then WO-E.2, last, once nothing is still being added.

**Order to demo to the owner:** A.4 (the dashboard), then B.5 (the comparison
chart), then C.3 (the BOM that actually deducts stock), then the detail pages
fill in behind. That front-loads the three things they described as the point of
the exercise.

---

## Migration safety register

Every new table is additive. **No** rename, drop, type change, or NOT NULL
without default anywhere in this phase.

| Migration | Contains | Risk |
|---|---|---|
| `add_finance_expenses` | `CREATE TYPE ExpenseRecurrence`; `CREATE TABLE ExpenseCategory, Expense`; indexes; FKs to `Supplier`, `User` | None. The `Supplier.expenses` / `User.expensesCreated` back-relations are **Prisma-level only** — the FK column lives on `Expense`. |
| `add_order_economics` | `CREATE TABLE OrderEconomics`, `orderId` PK + FK to `Order` | None. `Order.economics` is a back-relation; **no ALTER TABLE on Order**. |
| `add_bom_raw_materials` | `CREATE TYPE RawMaterialUnit`; `CREATE TABLE RawMaterial`; unique index on `variantId` | None. `ProductVariant.rawMaterial` is a back-relation. |
| `add_bom_recipes` | `CREATE TYPE BomStatus`; `CREATE TABLE BomRecipe, BomComponent` | None. |
| `add_bom_production_runs` | `CREATE TABLE BomProductionRun, BomProductionLine` | None. |

**The check to run after every `prisma migrate dev`:** open the generated
`migration.sql` and confirm it contains only `CREATE TYPE`, `CREATE TABLE`,
`CREATE INDEX`, `CREATE UNIQUE INDEX`, and
`ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`. **Any DROP, RENAME, ALTER
COLUMN or SET NOT NULL means something is wrong — stop and report it rather than
editing the SQL by hand.**

Things touching existing state that need explicit attention:

1. **Seed data.** New `ExpenseCategory` rows and one hidden raw-materials
   `Category`. Both upsert on a natural key. **Run `pnpm db:seed` twice and diff
   row counts and ids.**
2. **Permissions.** Five new rows. `seedPermissions()` grants defaults **only**
   for permissions it has just created for the first time — deliberate, because
   an admin's revocation must never be undone. **Therefore test on a fresh
   database as well as an existing seeded one**; on an existing DB, verify the new
   permissions appear in `/admin/settings` and can be granted by hand.
3. **Settings.** About ten new keys, seeded with defaults on first boot. Additive.
4. **`env.validation.ts` MODULES default** gains `purchasing,finance,bom`. Only
   affects deployments that do not set `MODULES` explicitly — but all four env
   example files must be updated in the same PR, or a fresh clone boots with the
   module missing and 404s nobody can explain.
5. **`ProductVariant.costPrice` gains a second writer.** Until now only
   `purchasing.service.ts` wrote it; WO-C.3 adds BOM production. Both go through
   `weightedAverageCost()`. Call it out in the PR body so a reviewer looks for it.
6. **Nothing in this phase modifies `StockAdjustment`.** It is legacy, superseded
   by `StockMovement`, and removing it is somebody else's work order. Do not
   touch it.

---

## Phase 10 definition of done

On top of the house rules' checklist, every PR:

- [ ] States which decision (D1–D10) it implements, and flags any deviation.
- [ ] Adding a card required **only** a registry entry (or says why not).
- [ ] Adding a report required **only** a registry entry (or says why not).
- [ ] The dashboard still makes **one** request per range change.
- [ ] Every money value in request, response, column and test is integer paisa.
- [ ] Every raw-material quantity is integer base units, converted only through
      `@newax/shared`.
- [ ] Every new route has `@ApiOperation` and `@RequirePermission`.
- [ ] Cost/margin data is **absent from the payload** — not merely hidden in the
      UI — for callers without `inventory.view_cost`.
- [ ] Screenshotted with a **STAFF** account and an **ADMIN** account. The
      some-but-not-all-permissions case is where these screens break.
- [ ] `check-module-boundaries.mjs` and `check-chart-imports.mjs` pass.
- [ ] `pnpm db:seed` run twice, still idempotent.
- [ ] Branch pushed straight to `main` — no PR needed for `main`. **Never push
      to or merge into `production`**; that stays the owner's call.

### Phase exit criteria — the end-to-end proof

Runnable once C.3 and B.5 have merged:

1. Create a raw material (lawn fabric, GAZ, scale 1000). Raise a PO for 100 gaz
   at Rs 350/gaz and receive it. Confirm `costPrice` lands via the untouched
   `weightedAverageCost()` path.
2. Build a recipe: 1 kameez = 2.5 gaz lawn + 6 buttons + 1 spool thread. Confirm
   `rolledUpUnitCost` matches hand arithmetic and `costComplete` is true.
3. Record a production run of 10 units. Confirm raw stock drops by exactly 25 gaz
   / 60 buttons / 10 spools, finished stock rises by 10, and every movement
   carries `refType: 'BomProductionRun'`.
4. Enter expenses across three categories. Open `/admin` and confirm the
   comparison chart shows sales, purchases and expenses on one axis for the same
   window.
5. Click any card and land on its detail page with the range preserved.

### A note on running the checks

On Windows, `turbo run` currently fails with `spawn UNKNOWN`; run per-package
(`cd apps/api && pnpm test`) until that is fixed. `pnpm --filter @newax/web build`
also fails at the `.next/standalone` symlink step with `EPERM` — that is a
Windows permissions issue, not a code defect; the compile itself succeeds. Do not
"fix" either by weakening a check.
