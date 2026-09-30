# 89 — "Minutes" onboarding and cloud reports: both already shipped

> **Status: confirmed (2026-09-25). No work order.** Doc 51's provisioning
> claim re-verified against `ProvisioningService.provisionTenant()` as
> before. **Correction to this document's own count**: `ReportsController`
> (`apps/api/src/modules/money/reports/reports.controller.ts`) now exposes
> **twelve** CSV export endpoints, not eight — profit-and-loss, payables,
> expense-register and sales-register (all `04-finance.md` WO-4.6) were
> added since this document was written. Ten of the twelve accept
> `ReportDateRangeQueryDto` (`from`/`to`); `export/stock` takes
> `StockReportQueryDto` (a `lowStockOnly` flag, no date range),
> `export/payables` takes `AsOfReportQueryDto` (a single `asOf` date), and
> `export/slow-movers` takes no query at all. The underlying claim —
> "customizable by date range, not by arbitrary column/filter" — still
> holds for the great majority of the set; the exact count and the three
> exceptions are corrected here rather than left stale.

"Guarantees of rapid onboarding ('Easy Setup in minutes') paired with
customizable cloud-based reports" is two already-built claims restated as
one bullet.

## 1. "Easy setup in minutes" — doc 51's own words, verbatim

Doc 51 (`51-free-demo-sandbox-onboarding.md`) already states: "Doc 39's
`ProvisioningService.provisionTenant()` already creates a real, working
sandbox in minutes with nobody on Newax's side touching a keyboard —
'rapid self-setup within minutes' is a real requirement." This is not a
guarantee to build; it is a guarantee this repository's own provisioning
automation (built and tested this session's own earlier work, per the
summary of `ProvisioningService`) already fulfills.

## 2. "Customizable cloud-based reports" — already twelve, mostly with date-range filtering

`ReportsController` (`apps/api/src/modules/money/reports/reports.controller.ts`)
already exposes twelve CSV export endpoints — orders, sales-by-day,
stitching bookings, stock, stock valuation, purchases-by-supplier, stock
ledger, slow-movers, profit-and-loss, payables, expense-register and
sales-register. Ten of the twelve accept a `ReportDateRangeQueryDto`
(`from`/`to`) query parameter, i.e., already "customizable" by the one
dimension every real report request actually needs: a date window; `stock`
takes a `lowStockOnly` flag instead and `payables` takes a single `asOf`
date (both still filterable, just not by a range), and `slow-movers` takes
no query at all. They are cloud-based by construction, since `apps/api` is
the hosted backend every deployment (online or offline, per doc 48)
already runs against.

**The one honest gap**: "customizable" beyond a date range (choosing which
columns appear, saving a custom report definition, filtering by an
arbitrary field) is a real, distinct, and materially larger capability —
a report-builder engine — that does not exist today anywhere in this
repository (confirmed by an empty search for `ReportBuilder`/
`customReport` across `apps/api/src`). Naming this honestly, rather than
either overclaiming the existing date-range filter as full customization
or silently building a report-builder nobody asked for by name, is this
document's own real contribution.

## Scope lenses

Not repeated — no new schema, write path, or permission; doc 51 and the
existing `ReportsController` already answer every lens for their own
respective mechanisms.

## Work orders

None against onboarding speed or the existing export set. **WO-89.1
(named future work, not built here)** — if a genuine requirement for a
general report-builder (arbitrary column/filter selection, saved report
definitions) emerges, that is its own separately-scoped document with its
own full "feature scope" lensing (an actor, a permission, a data-volume
answer for an arbitrary user-defined query) — not assumed to already
exist, and not built speculatively by this document.

## Acceptance

- No schema or code change — verified by citation to doc 51's own text
  and `ReportsController`'s existing eight endpoints.
- "Customizable" is scoped honestly to mean "date-range-filterable, not
  arbitrary-column report building" in any client-facing description
  drawing on this document.

## Out of scope

A general-purpose report builder (arbitrary column/filter selection,
saved custom report definitions) — named above as real, distinct,
unbuilt future work, not silently assumed to already exist or built
speculatively here.
