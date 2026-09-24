# 76 — A POS-side dashboard screen: the figures exist, the screen doesn't

"Low Stock counters broken down by specific product variants," "Total
Customers," and "Daily Sales" are each already computed today —
`AnalyticsService.summary()` (`apps/api/src/modules/analytics/
analytics.service.ts`) already returns `lowStockVariants`, `totalCustomers`,
and `today`'s sales figure in one call, and `ProductLowStock`/
`ProductReorderPointReached` (`inventory.service.ts`,
`inventory.listener.ts`) already fire per-variant. What does not exist is
a **screen inside `apps/pos`** showing any of it — `apps/pos/src/app`
today has exactly five routes (`shift`, `receipt`, `till`, `terminal`,
`returns`, `login`), none of them a dashboard. A cashier or floor manager
on the till app has no glance-view of these figures without switching to
the separate admin web app. This document is the missing screen, not a
new data source.

## 1. One read, reusing `AnalyticsService.summary()`'s own figures, scoped to the till's own location

```ts
async posDashboardSnapshot(locationId: string): Promise<{
  dailySales: { revenue: number; orderCount: number };
  totalCustomers: number;
  lowStockVariants: Array<{ variantId: string; productName: string; variantLabel: string; stock: number; reorderPoint: number }>;
}> {
  // Delegates to AnalyticsService's own existing summary()/lowStockVariants
  // computation, filtered to this till's own locationId — never a second,
  // POS-specific low-stock query reimplementing reorderPoint comparison.
}
```

`lowStockVariants` is scoped to `locationId` here (a floor manager cares
about *this branch's* shelf, not the organization's aggregate) — the same
`VariantLocationStock`-scoped read `AnalyticsService`'s own inventory
screens already perform elsewhere, applied to this endpoint's own
narrower, single-location caller.

## 2. Doc 31's own hardware/PWA foundation is where this screen lives

`apps/pos` is already a PWA (doc 31's own stated foundation); this screen
is a sixth route (`/dashboard`) inside it, gated behind whatever
permission the till's own logged-in role already carries for viewing
store-level figures (`pos.dashboard.view`, distinct from
`inventory.view_cost` — this screen shows counts and revenue, never
per-item cost/margin) — reachable from the till's own existing navigation,
never a second app.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: the viewer is the till's own logged-in
`User`; no new actor kind.
**Whose rows, and which columns** — scoped to the till's own `locationId`
exclusively — never an organization-wide read surfaced on a single
till, per the standing "no implicit all-branches read" rule.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: a read, no write.
**Audience is a capability, not an address** — n/a: a pull screen, not a
notification (a low-stock notification is doc 44's/`inventory.listener.ts`'s
own existing concern, unchanged).
**Request or record** — n/a: a pure read over already-computed figures.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a: no new money or stock fact; reads existing figures
unchanged.
**Dry run before live** — n/a: no computed rule to preview.
**Three silhouettes** — Solo: one till, the dashboard is that shop's own
whole picture. Chain: a real per-branch glance a floor manager checks
between customers, without walking to the back office. Organization:
unaffected — this screen is deliberately single-location, never a
cross-brand rollup on a till.
**The absent collaborator** — with `inventory`'s low-stock signal or
`crm`'s customer count module off, that section of the screen simply
omits its own tile (`MOD-1`), never a broken layout.
**The second copy of the write** — n/a: no write at all.
**The hundred-thousandth row** — `lowStockVariants` is already bounded
(a finite low-stock list per location, per `AnalyticsService`'s own
existing query); no new unbounded read.
**The reversal document / The undo fan-out / The version stamp** — n/a.
**The erasure the ledger cannot obey** — n/a: no personal data; counts
and totals only.
**The failure path** — a failed fetch shows the screen's own retry state,
never a silently blank dashboard the cashier mistakes for "no low stock."

## Work orders

**WO-76.1 — `posDashboardSnapshot(locationId)`** read, delegating to
`AnalyticsService`'s own existing computations, scoped to one location.
**WO-76.2 — UI**: a `/dashboard` route in `apps/pos`, three tiles (Daily
Sales, Total Customers, Low Stock by variant), reachable from the till's
own existing nav, satisfying Law 4's seven widths and the 48×48 POS
touch-target rule exactly as every other `apps/pos` screen already must.
**WO-76.3 — permission**: `pos.dashboard.view`, seeded to the till-operator
and floor-manager roles that should see it.

## Acceptance

- The screen renders only figures for its own till's `locationId`, never
  another branch's.
- With `crm` off, the "Total Customers" tile does not render; the rest of
  the screen renders normally.
- `pnpm check:overflow` reports zero violations on the new route at all
  seven widths.

## Out of scope

A configurable/customizable tile layout — this screen ships the three
named metrics in a fixed layout; a drag-to-rearrange dashboard is a
distinct, larger UI capability not requested here.
