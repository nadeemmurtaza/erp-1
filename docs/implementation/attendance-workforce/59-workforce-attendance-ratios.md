# 59 — Present / on-leave / absent, as a ratio against total headcount

Doc 43's `classifyDay()` already classifies one employee's one day into
`PRESENT`/`ABSENT`/`ON_LEAVE`/`PARTIAL`/`EXCEPTION`/`HOLIDAY`/`NO_DATA` —
the entire classification this document needs already exists. What is
missing is the aggregate: **today's ratio across the whole roster**, the
single number a manager glances at before the calendar-grid heatmap ever
loads. This document is that aggregate, computed from doc 43's own
function, never a second classification scheme.

## 1. A ratio is one query over `classifyDay()`'s own output

```ts
async attendanceRatioToday(orgUnitId?: string): Promise<{
  totalHeadcount: number;
  present: number; onLeave: number; absent: number; exception: number;
  presentPct: number; onLeavePct: number; absentPct: number;
}> {
  const roster = await this.rosterFor(orgUnitId); // active employees in scope
  const classifications = await Promise.all(roster.map((e) => this.classifyDay(e, today)));
  // tally, divide by roster.length — the same classifyDay() doc 43 already
  // built, called once per employee, never a re-derived count.
}
```

`totalHeadcount` is the denominator — restated because doc 20's own
`EmploymentStatus.ACTIVE` count is precisely it, never a headcount figure
this document derives independently and risks disagreeing with doc 53's
own headcount tile.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: a read over doc 20/22's own existing
actors.
**Whose rows, and which columns** — scoped to the caller's subtree,
identical to doc 43's own scoping; an individual employee's classification
underneath the ratio is visible only per doc 22's existing per-employee
visibility, the ratio tile itself shows only aggregate counts.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: a read, no write, no authority to bound.
**Audience is a capability, not an address** — n/a: a dashboard tile, not
a notification.
**Request or record** — n/a: a pure aggregation over doc 22's own already-
recorded facts.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a: no money or stock fact.
**Dry run before live** — `attendanceRatioToday()` is itself already the
entire computation, pure, over already-loaded rows.
**Three silhouettes** — Solo: a small roster where the ratio is noisy at
low headcount, the same small-denominator caveat doc 53 already states,
reused here rather than re-invented. Chain: a real per-branch daily
signal. Organization: cross-branch ratio comparison, volume (next lens)
matters.
**The absent collaborator** — with doc 22 off, the tile does not render
(`MOD-1`).
**The second copy of the write** — n/a: no write.
**The hundred-thousandth row** — a `COUNT`/classification pass over one
day's roster, bounded by headcount, never a historical scan — today only,
by design; a historical ratio trend is doc 60's own territory, not this
tile's.
**The reversal document / The undo fan-out / The version stamp** — n/a.
**The erasure the ledger cannot obey** — n/a beyond doc 22's own stated
rule; the ratio shows counts, never names.
**The failure path** — n/a beyond an ordinary query failure, surfaced as
the tile's own error state.

## Work orders

**WO-59.1 — `attendanceRatioToday(orgUnitId)`**, calling doc 43's own
`classifyDay()` per roster member, never a parallel classification.
**WO-59.2 — UI**: a ratio tile (present/on-leave/absent as percentages of
headcount) on the HR dashboard and doc 44's manager action hub context,
linking through to doc 43's own heatmap for the day's detail.

## Acceptance

- `presentPct + onLeavePct + absentPct` (plus any `EXCEPTION`/`NO_DATA`
  share) accounts for the full roster, proven by a spec summing all
  categories to `totalHeadcount`.
- The tile's `totalHeadcount` matches doc 20's own `ACTIVE` employee count
  exactly, never an independently-derived figure.
- A small roster's ratio carries the same low-denominator caveat doc 53
  already established, reused rather than re-invented.

## Out of scope

Historical (non-"today") ratio trends — doc 60 is where a month-over-month
or day-over-day trend belongs; this tile is a single, current-day
snapshot.
