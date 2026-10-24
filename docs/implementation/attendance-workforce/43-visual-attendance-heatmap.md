# 43 — The attendance heatmap: a calendar-grid read over doc 22's own data

This document introduces no new write. Doc 22's `AttendanceEvent` (and, once
built, doc 42's `Timesheet`) already record everything a month-at-a-glance
attendance view needs — presence, absence, leave, exception. What is
missing is the one read path and the one screen that turns per-punch rows
into a calendar a manager can scan in five seconds, which is a real,
distinct piece of work even though it touches no table this repository
does not already have.

## 1. A day's attendance state is a pure classification, not a stored column

```ts
type DayAttendanceState = 'PRESENT' | 'ABSENT' | 'ON_LEAVE' | 'PARTIAL' | 'EXCEPTION' | 'HOLIDAY' | 'NO_DATA';

/** Reads doc 22's AttendanceEvent + doc 22's own LeaveRequest read (via
 *  payroll, per the existing WO-22.6 wiring) for one employee, one day.
 *  Pure over already-loaded rows — the same "dry run before live"
 *  discipline every computed classification in this document set follows. */
function classifyDay(events: AttendanceEventLite[], onLeave: boolean, isHoliday: boolean): DayAttendanceState { /* ... */ }
```

Nothing here is stored: recomputing last month's heatmap after a punch is
corrected must show the correction immediately, which a cached/materialised
state column would not, and the volume (one classification per employee
per day) is cheap enough over `AttendanceEvent`'s own existing
`[employeeId, occurredAt]` index that a stored column would be optimizing a
problem that does not exist yet.

## 2. The grid is a density map over a org-unit or a roster, one month at a time

```ts
interface AttendanceHeatmapResponse {
  month: string; // "2026-09"
  rows: Array<{
    employeeId: string;
    employeeName: string;
    days: Record<string /* "01".."31" */, DayAttendanceState>;
  }>;
  legend: Record<DayAttendanceState, { label: string; colorToken: string }>;
}
```

`colorToken` names a token from `packages/shared/src/theme-colors.ts` —
never a hex literal in the response or the component, per Law 1 and the
design system's own colour-is-a-token rule. The dataviz palette (categorical,
not sequential — these are discrete states, not a continuous density
scale, however "heatmap" the name suggests) follows the same accessible,
colour-plus-label discipline `common/status-badge.tsx` already establishes
for every other status pill in this codebase: colour is never the only
signal, each cell's `aria-label` states the day and the state in words.

## Scope lenses

**The actor with three tables / The principal with no permission key / The
grant that ends itself** — n/a: a read-only report over existing actors.
**Whose rows, and which columns** — the heatmap is scoped to the caller's
subtree exactly as doc 22's own attendance data already is; an
`EXCEPTION` cell's underlying reason is visible only to
`hr.attendance.reconcile`, the grid itself shows only that an exception
exists.
**The threshold nobody approves alone / The toxic pair** — n/a: no write,
no authority to bound.
**Authority and blast radius** — n/a.
**Audience is a capability, not an address** — n/a: a report, not a
notification.
**Request or record** — the read itself is neither; it classifies records
doc 22 already wrote, refusing nothing, inventing nothing.
**The movement with no address** — n/a.
**Four hours down** — n/a: a report over historical data, not a trading-
path write.
**Click the number** — restated as this document's own reason to exist:
every cell is clickable through to the day's actual `AttendanceEvent` rows
— a heatmap that cannot be drilled into is exactly the "dashboard with no
drill-down" `CLAUDE.md`'s own lens warns against, worse here because the
whole value of a density map is spotting an anomaly and then checking it.
**The unwritten posting rule / Every column or none / The period that
already moved / The second legal entity** — n/a: no money fact, no new
scoping beyond what doc 22 already applies.
**Dry run before live** — `classifyDay()` above already is exactly this:
pure, no write, one implementation for both the grid and any future export.
**Three silhouettes** — Solo: a small enough roster that a manager already
knows who was in; the heatmap is a nice-to-have, not load-bearing. Chain: a
branch manager's real daily tool. Organization: cross-branch density
comparison, month volume (next lens) starts to matter.
**The absent collaborator** — with doc 22's attendance module off, the
heatmap screen does not render (no nav entry, per `MOD-1`'s layout-closes-
over-absence rule) rather than showing an empty or broken grid.
**The second copy of the write** — n/a: no write at all.
**The hundred-thousandth row** — a month × a large roster is at most a few
thousand cells per request, computed from already-indexed
`AttendanceEvent` rows; never an unbounded query — the endpoint takes a
required month and org-unit, never "all time, all branches."
**The reversal document / The undo fan-out / The version stamp** — n/a: no
write to reverse or version.
**The erasure the ledger cannot obey** — n/a beyond what doc 22 already
states for the underlying events; the heatmap reads, it does not retain
anything of its own.
**The failure path** — a classification that cannot resolve (missing
roster data for an employee mid-transfer) renders `NO_DATA`, visibly
distinct from `ABSENT`, never conflated with it.

## Work orders

**WO-43.1 — `classifyDay()`** pure function + the month-grid aggregation
query, bounded and indexed per §2's own note.
**WO-43.2 — UI**: the calendar-grid component, accessible per §2's own
colour-plus-label rule, drill-down to a day's real attendance rows.
**WO-43.3 — permissions**: reuses doc 22's existing `hr.attendance.reconcile`
for exception detail; the grid itself needs only the subtree-scoped
attendance-view permission doc 22 already defines, no new key.

## Acceptance

- Correcting a punch (doc 22's own reconcile action) changes the heatmap's
  next read with no cache to invalidate, proven by a spec that classifies
  before and after a correction.
- Every cell's colour has a corresponding text label reachable without
  colour vision, proven by an accessibility check on the legend and the
  per-cell `aria-label`.
- With doc 22 off, no heatmap nav entry renders.
- A month's grid for a 40-branch roster returns from indexed queries only,
  proven by `EXPLAIN ANALYZE` showing no sequential scan.

## Out of scope

A year-at-a-glance or multi-month view — one month at a time keeps the
grid legible at every one of the seven widths (`SPA-4`); a longer trend
belongs to a line chart, not this grid. Predictive absentee flagging — a
real AI feature with its own scope lenses (`09-ai-layer.md`'s own rules),
not assumed as a side effect of a density map.
