# 57 — Category velocity across days, not just within one window

`AnalyticsService.productsCategories(days)` already computes two things: a
top-10-category revenue snapshot for the whole window, and a
category-agnostic daily revenue series. Neither is "historical category
distribution... to track inventory sales trends over time" — that needs
**one category's own revenue or units, broken out day by day**, which is a
different shape of query, not a bigger window on the existing one. This
document adds exactly that shape, reusing every filter
`productsCategories()` already established (the same `VOID_STATUSES`
exclusion, the same shop-timezone day boundary) rather than inventing a
second, possibly-inconsistent definition of "a day's sales."

## 1. A velocity series is category × day, not category OR day

```ts
interface CategoryVelocitySeries {
  days: string[]; // shop-day keys, e.g. "2026-09-10".."2026-09-23"
  categories: Array<{
    categoryId: string | null;
    name: string;
    /** One value per entry in `days`, same order, 0 where no sale — never
     *  a sparse array a caller has to re-align against `days` itself. */
    revenueByDay: number[];
    unitsByDay: number[];
  }>;
}

async categoryVelocity(days: number = 14): Promise<CategoryVelocitySeries> {
  // GROUP BY category, shopDayExpr('placedAt', timeZone) — the identical
  // shop-day expression productsCategories()'s own seriesRows already
  // uses, extended with the category dimension productsCategories()
  // itself does not carry on its own daily series.
}
```

`days: number = 14` matches the promotional list's own stated example
window, expressed as a default parameter, never a hardcoded constant — the
same caller-supplied-window discipline doc 53's `windowDays` and the
existing `productsCategories(days)` already establish.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: a read over existing `Order`/
`Category` rows.
**Whose rows, and which columns** — scoped identically to
`productsCategories()`'s own existing branch/organization scope; no new
visibility boundary.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: a read, no write, no authority to bound.
**Audience is a capability, not an address** — n/a: a chart, not a
notification.
**Request or record** — n/a: a pure computed read over `Order`/`OrderItem`
rows already recorded.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a: no money fact of its own; reads figures `Order`'s own
posting (unchanged) already established.
**Dry run before live** — the function above already is the entire
computation; there is no separate preview to draw for a read with no
side effect.
**Three silhouettes** — Solo: a handful of categories, the chart is a
nice-to-have. Chain: a real per-branch merchandising signal. Organization:
many categories across brands — the per-category × per-day cell count
(next lens) is where this document's own indexing care actually pays for
itself.
**The absent collaborator** — n/a: `catalog`/`orders` are always-on
core modules; this read has no optional dependency to degrade against.
**The second copy of the write** — n/a: no write at all.
**The hundred-thousandth row** — a 14-day × top-10-category grid is at
most 140 cells per request, computed from an indexed `Order.placedAt` +
`OrderItem`/`Category` join — the same join `productsCategories()`
already performs, extended by one `GROUP BY` dimension, never an
unbounded query (the endpoint requires a bounded `days` parameter, capped
server-side, exactly the pagination/bounded-window discipline this
repository's own performance table already requires).
**The reversal document / The undo fan-out / The version stamp** — n/a:
nothing here is written or reversed.
**The erasure the ledger cannot obey** — n/a: no personal data; this is
an aggregate over product/category sales, never customer-identified.
**The failure path** — n/a beyond an ordinary query failure, surfaced as
the chart's own error state per the design system's "every state shipped"
rule.

## Work orders

**WO-57.1 — `categoryVelocity(days)`** read, reusing
`productsCategories()`'s own shop-day/void-status filters exactly, adding
the category dimension to the daily series.
**WO-57.2 — UI**: a multi-line (or small-multiples) chart on the existing
products/categories analytics screen — per the dataviz skill's own
categorical-colour discipline for the per-category series, never more
than a legible handful of lines at once (top 5-6 categories by revenue in
the window, "other" bucketed, rather than an unreadable line for every
category that ever sold one unit).

## Acceptance

- `categoryVelocity(14)`'s per-category daily totals sum to the identical
  category totals `productsCategories(14)` already reports for the same
  window — proven by a spec asserting both methods agree, since they read
  the same underlying facts through the same filters.
- The chart never renders more lines than the stated legible maximum;
  categories beyond it are bucketed into "other," never silently dropped
  from the total.
- A category with a zero-sale day shows a real zero in its series, never
  a gap that misaligns the day axis.

## Out of scope

Predictive trend-lines or forecasting over the velocity series — a real
AI feature with its own `09-ai-layer.md` scope lenses, not assumed as a
side effect of a historical chart. Per-branch category velocity
comparison in one view — named as a natural filter/breakdown on the same
underlying query, not built as a separate screen here.
