# 60 — Headcount growth: the trend doc 53 named and deferred

Doc 53's own "Out of scope" section already names this exact gap:
"Attrition/turnover tracking (the departure side of the same story)...
would read `Employee.leftOn` (doc 20) the identical way this document
reads `joinedOn`, but is a distinct enough question... to deserve its own
scoping pass rather than being folded in as an afterthought." This is
that scoping pass — net headcount growth, month over month, from joins
and departures both, not a second joiner-counting mechanism next to
doc 53's own.

## 1. Net growth is joiners minus leavers, per month, from rows doc 20 already writes

```ts
interface HeadcountGrowthSeries {
  months: string[]; // "2026-01".."2026-09"
  joiners: number[];
  leavers: number[];
  netGrowth: number[];   // joiners[i] - leavers[i]
  endOfMonthHeadcount: number[]; // the running total, for the trend line
}

async headcountGrowth(months: number = 12): Promise<HeadcountGrowthSeries> {
  // GROUP BY month on Employee.joinedOn for joiners, Employee.leftOn for
  // leavers — the identical two columns doc 20 already defines, doc 53
  // already reads one half of. endOfMonthHeadcount is a running total,
  // never re-counted from scratch per month (an O(n) scan, not O(n²)).
}
```

`endOfMonthHeadcount` is computed as a running sum, not a fresh `COUNT()`
per historical month-end (which would need a point-in-time snapshot this
repository does not keep) — the same "derive from an event log, never
assume a snapshot exists" discipline doc 23's cycle-time reconstruction
from `TaskTransition` already establishes, applied here to headcount
instead of task state.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: a read over doc 20's own existing
`Employee` rows.
**Whose rows, and which columns** — scoped to the caller's subtree
exactly as doc 53's own tile; needs no `hr.compensation.view`-level
permission (headcount, not compensation).
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: a read, no write.
**Audience is a capability, not an address** — n/a: a chart, not a
notification.
**Request or record** — n/a: a pure read over `joinedOn`/`leftOn`, both
already-recorded facts.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a: no money or stock fact; scoped per `organizationId`
exactly as `Employee` already is.
**Dry run before live** — the function above already is the entire
computation, pure, over already-loaded rows.
**Three silhouettes** — Solo: near-flat, low-volume trend, informative
mostly as a novelty. Chain: a real per-branch staffing-trend signal.
Organization: cross-brand comparison, and the running-total computation's
own correctness (next lens) matters most at this volume.
**The absent collaborator** — n/a: `Employee`/doc 20 are the foundation
every HR document in this set already depends on; no optional module to
degrade against here.
**The second copy of the write** — n/a: no write at all.
**The hundred-thousandth row** — a 12-month series over
`joinedOn`/`leftOn`, both indexed (`Employee.status` already indexed per
doc 20; `joinedOn`/`leftOn` gain their own index once real volume
justifies it, per `EXPLAIN ANALYZE`) — cheap relative to headcount size,
never an unbounded historical scan (the endpoint requires a bounded
`months` parameter).
**The reversal document / The undo fan-out / The version stamp** — n/a.
**The erasure the ledger cannot obey** — n/a beyond doc 20's own stated
rule; this is an aggregate count, never a name.
**The failure path** — n/a beyond an ordinary query failure, surfaced as
the chart's own error state.

## Work orders

**WO-60.1 — `headcountGrowth(months)`** read, running-total computation,
subtree-scoped.
**WO-60.2 — UI**: a trend chart on the HR dashboard, joiners/leavers as a
paired bar series with net growth and end-of-month headcount as a line —
per the dataviz skill's own form heuristic for a paired-comparison-plus-
running-total shape.

## Acceptance

- `endOfMonthHeadcount` for the most recent month matches doc 20's own
  live `ACTIVE` count exactly, proven by a spec comparing the running
  total's final value against a direct live count.
- `netGrowth[i]` equals `joiners[i] - leavers[i]` for every month, by
  construction, proven by a spec.
- The series is bounded by the requested `months` parameter, never an
  unbounded "since the company began" scan by default.

## Out of scope

Voluntary-vs-involuntary departure classification — `Employee.leftOn`
(doc 20) records that someone left, not why; a reason taxonomy is a real,
separate HR capability this document does not assume exists.
