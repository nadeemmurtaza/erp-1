# 218 — Staff management and analytics

> **Status: Planned.** Modules: `hospitality-staff`, `hospitality-insights`.
> Two jobs, two pages: *who is working where*, and *how is the day going*.

## 1. Staff: use HR, don't copy it

Employees, positions, ranks, shifts, attendance and leave already exist
(docs 19–22). This pack **reads** them; it owns no HR fact.

`StaffZoneAssignment` (`employeeId`, `zoneId`, `shiftId?`, `from`, `to`,
`role`: `WAITER` `RUNNER` `KITCHEN` `HOUSEKEEPING` `MANAGER`) is the only new
fact: *who covers which zone, when*.

* Assignment screen (*Staff → Today*): drag/assign staff to zones for the
  shift. Defaults are cloned from the previous same weekday.
* **Ends itself**: an assignment ends at shift end; on `hr.posting_ended` or
  deactivation, open assignments close in the same transaction, and any item
  assigned to that person returns to the zone's pool (unclaimed, not silently
  reassigned — the doc 23 rule).
* Clock-in state comes from `attendance` via event/extension point; if
  `attendance` is absent, a manual "on shift" toggle exists, with its own
  audit row.
* **Cover**: a manager can assign temporary cover; it expires on its own.

## 2. Performance, honestly

Per staff member, per period, from events only: items acknowledged, median
time-to-acknowledge, median time-to-resolve, orders served, escalations
received, voids/comps. Shown to the person and their manager; **not** a
ranking leaderboard by default (a per-outlet `Setting`), and never an
automatic input to payroll or review — a signal, like docs 26/27 treat tasks.

## 3. Management dashboards

All fed by **read models built from events** (`hospitality-insights` never
queries other modules' tables), pre-aggregated into daily and hourly rows so
a page is a handful of indexed reads at the hundred-thousandth row.

| Page | Answers | Tiles |
|---|---|---|
| **Today** (default) | How is service going now? | open orders, waiting requests, avg wait, tables occupied, revenue so far |
| **Sales** | What sold? | revenue by hour/section/item, avg order value, top and bottom items, void/comp rate |
| **Service** | How fast are we? | time-to-acknowledge/resolve by kind and zone, SLA breaches, escalations |
| **Spaces** | Which places work? | turn time per table, scans per tag, unused/dead tags, room-service share |
| **Guests** | Who orders how? | session→order conversion, QR vs NFC split, peak scan times, language mix, repeat sessions |
| **Staff** | See §2 | |

* **Click the number**: every tile links to the exact orders/requests behind
  it, pre-filtered, and sums back to the tile.
* **Authoritative revenue** is the core `Order`/ledger. The Sales page shows
  its own figure *and* the reconciling difference with the enumerated legitimate
  causes (open tabs, comps, voids, room charges not yet settled) so a gap is
  never "discovered in a meeting".
* Cost and margin columns are hidden unless the viewer holds
  `hospitality.analytics.margin`.
* **Dry run**: not applicable — insights are read-only; a derived metric is
  recomputed from events if its definition changes, and each tile states the
  definition version it uses.
* Export CSV for each page (same permission, same row filters, row-capped
  at 100,000 with an async job above that).

## 4. Overview first, depth on click

Default view is **Today**: five tiles and one list of what needs attention.
Detail pages hang one level down; none is on the nav's first level except
*Today* (Laws 3, 7).

## 5. Performance parameters

| Parameter | Exact value | Why |
|---|---|---|
| Aggregation lag | ≤ 60 s from event to tile | Managers act on "now"; 60 s is invisible to them and lets a batch aggregator coalesce writes |
| Raw event retention for insights | 400 days; daily rollups kept indefinitely | Year-on-year comparison needs 13 months; rollups are tiny |
| Dashboard page budget | ≤ 8 queries, all index-served | Stated target; checked in review per Performance rules |

## 6. Permissions

`hospitality.staff.assign`, `hospitality.analytics.view`,
`hospitality.analytics.margin`, `hospitality.analytics.export`. A manager of
one outlet sees only that outlet's rows on every list, export and drill-down.

## 7. Acceptance criteria

1. Deactivating an employee mid-shift returns their open items to the zone's pool within one transaction, none lost.
2. Every dashboard tile's drill-down sums to the tile.
3. A one-outlet manager cannot read another outlet's numbers via the API (test).
4. Reconciliation diff for a day equals the sum of listed causes exactly, or the page says "unexplained" in red.
5. Today loads with ≤ 8 queries at 5 million stored orders.

## 8. Work orders

218.1 zone assignment + shift binding · 218.2 event→read-model projector ·
218.3 Today + Service pages · 218.4 Sales + reconciliation · 218.5 Spaces +
Guests pages · 218.6 staff performance · 218.7 CSV exports.
