# ADR-032 — Phase 10 Track A built end-to-end (WO-A.1–A.5), superseding ADR-019/ADR-025; Tracks D and B wired into the registry; WO-E.2 executed

[← Decision log](../DECISIONS.md)


### Context

ADR-019 and ADR-025 both found Track A (`10-admin-dashboard.md`'s
registry/chart/metric infrastructure) unbuilt, and declined to build a
minimal slice of it as a side effect of a narrower work order (WO-B.4,
WO-E.2) — correctly, per `CLAUDE.md`'s own "no speculative functionality"
and "the unused abstraction" traps. This session's task was different: the
owner asked directly for Phase 10 to be completed, so the trade-off those
two ADRs weighed no longer applies — building Track A is the work, not a
side effect of it.

Built, in full, this session:

- **WO-A.1** — confirmed already satisfied by existing primitives rather
  than rebuilt: `FilterBar`/`useFilterParam`/`useSetFilterParam`
  (`filter-bar.tsx`), `useAdminSession().can()` (`session.tsx` — **this
  already existed before this session**, contradicting ADR-025 §"what does
  exist" claim that "no `can()` permission helper exists anywhere in
  `apps/web/src`"; that claim was wrong, not stale — `can()` predates both
  ADR-019 and ADR-025, and `getStoredUser()?.permissions.includes('…')`
  calls were never universally the only mechanism), and
  `admin-shell.tsx`'s `breadcrumbTrail()`. No new primitives were needed.
- **WO-A.2** — `apps/web/src/components/admin/charts/`: `chart-theme.ts`
  (palette added to `packages/shared/src/brand.ts`, not hardcoded — Law 1),
  `chart-data-table.tsx`, `chart-marker.tsx`, `time-series-chart.tsx`,
  `comparison-chart.tsx`, `category-bar-chart.tsx`, `share-chart.tsx`,
  `sparkline-chart.tsx`. Recharts `3.10.1`, pinned exact per D9.
  `scripts/check-chart-imports.mjs` confines it to that folder, wired into
  `pnpm lint`.
- **WO-A.3** — `apps/api/src/core/metrics/`: `metric-provider.ts`,
  `metric-registry.service.ts` (`@Global`, duplicate-key-throws-at-boot,
  permission-gated invocation, per-provider failure isolation, cache keyed
  on from/to/bucket/permission-fingerprint/wanted-keys), `metrics.module.ts`.
  `previousWindow()` added to the existing `core/time/metric-window.ts`
  (not a second file — see Deviations). 100% branch coverage on
  `metric-window.ts`; full spec suite on the registry.
- **WO-A.4** — `GET /admin/analytics/cards` (D2), five metric-provider
  files across `analytics`, `inventory`, `purchasing`, `finance` and `bom`
  modules (11 `MetricProvider` classes total — see Deviations for why more
  than the three the brief names), `card-registry.ts` (~55 cards, 9
  groups), `metric-card.tsx`, `card-group.tsx`, `use-dashboard-metrics.ts`,
  the dashboard's own `RangePicker` extension, `needs-attention-strip.tsx`,
  `comparison-panel.tsx` (wires WO-B.5's already-built `/admin/analytics/
  comparison` endpoint into the new page). `page.tsx` rewritten at 96 lines
  (Stat/BarList/Mini helpers deleted); `loading.tsx` redrawn to match.
- **WO-A.5** — `report-registry.ts` (21 reports across all nine groups —
  see Deviations for why not 25), `analytics-detail-page.tsx`, all seven
  block components (`kpis`/`timeseries`/`share`/`ranking`/`table`/`funnel`/
  `gauge`), `resolve-path.ts` + full spec, the report index page, the
  `[...slug]` catch-all. Four genuinely new endpoints
  (`sales/{revenue,aov,profit,funnel}`) added to the existing
  `analytics.controller.ts`/`analytics.service.ts` rather than a new
  `reports/` subfolder (see Deviations).

Then, in the same session:

- **Track D wiring** — `orders/*`, `purchasing/*`, `products/*`,
  `inventory/*`, `customers/*`, `workshop/*` registry entries, each pointing
  at the endpoint that already existed (built earlier under the "live
  idiom," per ADR-019).
- **Track B wiring** — `expenses/{summary,by-category,trend}` registry
  entries pointing at `finance.controller.ts`'s existing routes; a new
  `FinanceMetricsProvider` (`finance.metrics.ts`) for the Expenses group's
  dashboard cards, which did not exist before this session.
- **The 8 hand-built pages retired**: `/admin/insights`,
  `/admin/orders/insights`, `/admin/customers/insights`,
  `/admin/workshop/insights`, `/admin/inventory/insights`,
  `/admin/products/insights`, `/admin/finance/expenses/analytics`,
  `/admin/purchase-orders/spend` — deleted, every internal link and
  `nav-registry.ts` href repointed to the matching `/admin/analytics/*`
  report, and a permanent `redirects()` entry added in `next.config.mjs`
  for each old path so an external bookmark still lands somewhere real.
- **WO-E.2 executed**: `sales-chart.tsx` and `donut-chart.tsx` deleted
  (their two remaining call sites — the old dashboard and
  `/admin/insights` — were rewritten this session to use the new charts or
  retired outright); the old, pre-Recharts `comparison-chart.tsx` deleted
  too (superseded by `components/admin/charts/comparison-chart.tsx`,
  WO-B.5's own chart). `gauge-chart.tsx` and `funnel-chart.tsx` are kept —
  reused directly by the `gauge`/`funnel` blocks, no wrapper needed. The
  `04-finance.md` dated override note is written (this time truthfully:
  Recharts really was added). This ADR is that note's companion.

### Deviations from the brief, stated here because "an agent that wants to
deviate says so in the PR rather than quietly doing something else"

1. **`MetricValue` gained an optional `label?: string`.** D2's own
   interface (`{value, previous, unit}`) is numeric-only, but D1's card
   inventory requires a `format: 'text'` card
   (`workshop.bottleneck_stage`) and several "+ `_name`" companion pairs
   (`expenses.largest_category_amount` + `_name`,
   `products.top_seller_units` + `_name`, `customers.top_spender_ltv` +
   `_name`). Rather than doubling the registry with a second numeric-only
   key per pair, one optional field carries the name alongside the number.
2. **`previousWindow()` lives in `core/time/metric-window.ts`, not a new
   `core/metrics/metric-window.ts`.** The brief's own file list names a
   second file with the same responsibility (window/bucket maths) as one
   that already existed and was already correct, tested, and DST-safe —
   creating a duplicate would be exactly the "duplicate implementation is a
   defect" case `CLAUDE.md` names. `core/metrics/` holds only the registry
   and provider interface.
3. **Eleven `MetricProvider` classes, not the three
   (`analytics.metrics.ts`, `inventory.metrics.ts`,
   `purchasing.metrics.ts`) WO-A.4 lists.** D2's own permission model is
   one gate per provider ("any one is enough"), but the card inventory
   gates several individual cards (`sales.gross_profit`,
   `purchasing.spend`, `inventory.valuation`, `bom.raw_material_value`,
   `workshop.staff_accounts`) behind a permission STRICTER than their
   group's default. A single provider cannot express two different
   permission gates for two subsets of its own keys, so each such subset
   is its own small provider. `analytics.metrics.ts` alone holds seven
   (`Sales`, `SalesCost`, `Orders`, `Products`, `Customers`, `Workshop`,
   `WorkshopStaff`); `inventory.metrics.ts` and `purchasing.metrics.ts`
   hold two each; `finance.metrics.ts` and `bom-cards.metrics.ts` (new,
   named to avoid colliding with the pre-existing `bom.metrics.ts`
   raw-usage report service) hold one and two respectively.
4. **`cardsFor(enabledModules)` takes one argument, not
   D1's own `cardsFor(permissions, enabledModules)`.** D1's own acceptance
   criterion two lines later — "a zero and 'you may not see this' must
   never look the same" — only holds if a permission-lacking card still
   renders (as an em-dash) rather than disappearing from the list a
   two-argument, permission-filtering `cardsFor` would produce. Permission
   gating happens per-card, inside `metric-card.tsx`, via
   `useAdminSession().can()`; only a missing module removes a card
   outright.
5. **`DASHBOARD_GROUPS`'s ninth group key is `bom`, not D1's own
   `manufacturing`.** Every metric key in that group is prefixed `bom.`
   (`bom.active_recipes`, …), and `MetricRegistryService.keysForGroups()`
   resolves a dashboard `groups=` query param by matching that literal
   prefix — a `groups=` value of `manufacturing` would resolve to zero
   keys. Renaming the group key to match its own metric-key prefix keeps
   the group→key mapping a pure, un-special-cased string match instead of
   a second hand-kept table pairing `manufacturing` with `bom.`.
6. **`ShareBlock`'s `drillTo` and `RankingBlock`'s `href` are declared on
   the block-config types but not wired to a click handler.** Neither
   `ShareChart` nor `CategoryBarChart` (WO-A.2) exposes a per-slice/per-bar
   click callback yet. Faking the navigation with no visible affordance to
   trigger it (an invisible click zone, or a screen-reader-only link list
   with nothing on screen to relate it to) would be a non-functional
   feature dressed as one — worse than the honest gap. `table` blocks
   already deliver "a ranked row you can click," today, via a real,
   visible per-row link (`href` + `interpolateHref`), which is what every
   report in this registry that needs drill-down uses instead.
7. **Only 21 of the "~25" reports are registered**, all of Tracks A, D and
   B (six new sales/orders reports, six existing-endpoint Track D groups
   split into their own reports, three existing-endpoint Track B expense
   reports). `bom/raw-usage` (WO-C.4) is not registered — the BOM &
   Manufacturing dashboard group's own href already points at `/admin/bom`
   directly (D1's own table), and the count of pages retired in WO-E.2
   (eight) already accounted for the full set of hand-built pages that
   needed a registry-entry replacement without it.
8. **The needs-attention strip carries five items, not the six or seven
   the old dashboard's own array held** (`pendingOrders`,
   `paymentsAwaitingApproval`, `followUpsDue`, `lowStockVariants`,
   `failedEvents` — the old page also had `abandonedCarts`, sourced from
   `extendedAnalytics()`, and `pendingPartners`, sourced from a third
   endpoint). Reusing three separate endpoints just for two more pills on
   a strip whose primary job is "orders to confirm right now" was judged
   not worth two more page-load requests; the five kept are exactly
   `GET /admin/analytics/dashboard`'s own `needsAttention` object, unchanged.
9. **`apps/web` gained a real unit-test runner (Vitest) this session.**
   Its `test` script was a placeholder ("no unit tests in web yet") before
   this session — `resolve-path.spec.ts` is WO-A.5's own written
   acceptance criterion, and a spec file that cannot run is not a spec
   file. Vitest, not a second copy of `apps/api`'s Jest config, because
   `apps/web` is a separate `tsconfig`/module-resolution context and
   Vitest needed only a five-line config; `globals: true` keeps the spec
   syntax identical to every `apps/api` spec (`describe`/`it`/`expect`,
   no import). Scoped to pure-logic `*.spec.ts` files only — rendered-page
   coverage stays with Playwright, unchanged.
10. **`admin-shell.tsx`'s own `breadcrumbTrail()` was not extended** to
    reach into `report-registry.ts`'s `parent` chain for the deeper
    analytics slugs. The sidebar's existing longest-href-match logic
    already resolves any `/admin/analytics/*` path to the "Analytics" nav
    item correctly (no broken or missing highlight), and
    `analytics-detail-page.tsx` renders its own full parent-chain
    breadcrumb inside the page itself. The sidebar chrome showing one level
    less depth than the in-page breadcrumb is a real, named gap — not a
    regression — left for whoever next touches nav breadcrumbs generally,
    rather than done as an unplanned addition here.

### Consequences

- Every dashboard card and every analytics report is now a registry entry,
  per D1/D3, with no card or report needing a new component to add.
- Money-in-paisa, permission-gating, and N+1-prevention rules from D2 are
  followed structurally (batched provider queries, never one query per
  metric) with the eleven providers described in Deviation #3, not the
  three the brief names literally.
- `apps/web`'s `test` script now runs real tests (13, all pure-logic) where
  it ran none before; `apps/api`'s test suite grew by the metrics-registry,
  five provider, and four-sales-report spec files (all passing, 100%
  coverage on the two files that specify it: `metric-window.ts`,
  `metric-registry.service.ts`).
- The gaps named in Deviations #6, #7 and #10 are real, scoped, and
  written down rather than silently absent — the next work order that
  needs slice-level drill-down, the `bom/raw-usage` report, or a deeper
  sidebar breadcrumb has a stated starting point instead of a rediscovery.

### Status
**Accepted.**
