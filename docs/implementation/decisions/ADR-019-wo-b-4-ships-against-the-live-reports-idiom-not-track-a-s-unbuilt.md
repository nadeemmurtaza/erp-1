# ADR-019 — WO-B.4 ships against the live reports idiom, not Track A's unbuilt registry

[← Decision log](../DECISIONS.md)


### Context
`10-admin-dashboard.md`'s WO-B.4 ("Expense metrics and the three expense
analytics pages") is specced to modify `card-registry.ts` (+7 cards) and
`report-registry.ts` (+3 reports) — a dashboard-card and report-catalog
architecture the same document's Track A (WO-A.4, WO-A.5) was meant to build
first: a backend `MetricProvider`/`MetricRegistryService` registry, a
`GET /admin/analytics/cards` endpoint, a frontend `DASHBOARD_GROUPS` +
`DashboardCard[]` catalog, and a catch-all `analytics/[...slug]/page.tsx`
report shell. Before starting this work order, a repository-wide search (`git
log --all`, and a grep for `card-registry`, `report-registry`,
`MetricProvider`, `MetricRegistryService`, `DashboardCard`,
`ReportDefinition` across `apps/api/src` and `apps/web/src`) confirmed none
of Track A was ever built — no commit, no file, no partial scaffold. Track B
itself (WO-B.1 through B.3 — expenses, recurring expenses, OrderEconomics)
was built this session and is real and merged; only the registry
infrastructure WO-B.4 assumes as a prerequisite is missing.

What already exists and is live: two hand-authored admin screens
(`/admin/reports`, `/admin/insights`) that call plain REST endpoints
(`analytics.controller.ts`, `reports.controller.ts`) directly via
`adminFetch`, rendered through shared primitives (`Section`, `SectionRail`,
`Tabs`, `MetricStrip`) and four existing inline-SVG chart components
(`sales-chart.tsx`, `donut-chart.tsx`, `gauge-chart.tsx`, `funnel-chart.tsx`).
No card or report in this codebase, today, is reached through a catalog —
every one is a concretely authored page and a concretely authored endpoint.
The one registry that is real is `nav-registry.ts` (sidebar entries only,
gated by permission and module).

### Options Considered
1. **Build a minimal slice of WO-A.4/A.5 first**, then WO-B.4 on top of it as
   specced. Rejected: this would introduce a whole new architectural layer —
   a metric-provider registry, a card catalog, a catch-all report route — as
   a side effect of a small expense-analytics request, which is exactly the
   speculative-infrastructure pattern the house rules forbid ("no
   unnecessary abstractions," "what real boundary justifies its existence?").
   Two screens do not justify a catalog; the catalog was speculative even
   when the doc proposed it, and building it now, unrequested and unused
   anywhere else, would be worse.
2. **Ship WO-B.4's actual acceptance criteria against the live idiom**:
   extend `finance.controller.ts`/`finance.service.ts` with the two
   endpoints the doc's own route table names (`expenses/by-category`,
   `expenses/trend`), and add a hand-authored expense-analytics screen using
   the same primitives and chart components every other admin screen already
   uses. Chosen.
3. **Skip WO-B.4 entirely**, wait for a future work order to build Track A
   properly. Rejected: nothing about the acceptance criteria (a by-category
   breakdown, a trend, a revenue-comparison figure, click-through to the
   filtered ledger, an empty-state) requires the registry — they are ordinary
   endpoint-and-screen requirements that the rest of this app already
   satisfies without one.

### Decision
Deliver WO-B.4 as two new endpoints on the existing `finance` module and one
new admin screen, following this repository's actual, live "one page, one
endpoint" idiom — not the unbuilt Track A registry the source document
assumes. `expenses/overview`, the third "report" the doc names, is the same
by-category data presented as this screen's summary section, not a third
endpoint or a registry entry.

One genuine shared-architecture fix rides along, because the acceptance
criteria require it and not doing it would recreate the exact "revenue three
ways, no stated authority" trap `CLAUDE.md`'s "Click the number" lens warns
against: the "does this order count as revenue" definition
(`VOID_ORDER_STATUSES` — status not `CANCELLED`/`RETURNED`, dated by
`placedAt`) is extracted from `analytics.service.ts` into
`core/common/sales-revenue.ts`, so `finance`'s new `vsRevenueBps` figure and
`analytics`'s dashboard revenue are provably the same computation, not two
copies that happen to agree today. `analytics.service.ts` now imports it
instead of holding its own copy of the constant; this is an import from
`core/`, which every module may already depend on, not a `finance` ↔
`analytics` module coupling.

### Reasoning
The house rules' own scoping method ("Feature scope: build the whole
capability") asks what a named feature cannot work without, not what a
stale plan happened to name as its file list. WO-B.4's real ask —
expense-by-category, expense trend, a revenue comparison, reachable and
correct — is fully satisfiable by the pattern already proven at
`/admin/reports` and `/admin/insights`. Building a registry only WO-B.4
would use is scaffolding, the same trap `CLAUDE.md` already tracks by name
(`seedPermissions()` vs. `seedRoles()`) for a different kind of
unused-infrastructure debt.

### Consequences
- A future Track A, if ever built, will need to migrate `finance`'s two new
  endpoints and its new screen into the card/report catalog the same way it
  would migrate `/admin/reports` and `/admin/insights` — this is not a
  bigger migration than doing nothing here would have left, since none of
  the three used a catalog to begin with.
- `expenses.vs_revenue_bps` lives as a field on the `by-category` response,
  not as a named metric in a provider registry — there is no registry for it
  to be named in yet.
- `VOID_ORDER_STATUSES` has exactly one owner now (`core/common/
  sales-revenue.ts`); a future third consumer (WO-B.5's comparative chart is
  the next likely one) imports the same constant rather than adding a third
  copy.

### Status
**Accepted.**
