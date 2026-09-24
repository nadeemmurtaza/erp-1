# 53 — New-hire and joiner tracking, alongside active headcount

Doc 28's `JobApplication.convertedEmployeeId` and doc 20's
`Employee.joinedOn` already carry everything this dashboard indicator
needs — a hire is exactly the moment a conversion writes an `Employee`
row, and headcount is exactly a count of `EmploymentStatus.ACTIVE` rows.
This document is a single read, not a new capability, in the same spirit
as doc 45's order-count coverage note: name the query precisely enough
that nobody builds a second, competing "new hires" concept next to doc 28's
own conversion event.

## 1. "Recent" is a policy window, not a hardcoded number of days

```ts
async newHiresVsHeadcount(windowDays: number = 30): Promise<{
  recentHires: number;
  activeHeadcount: number;
  ratio: number; // recentHires / activeHeadcount, for "N% of the team is new"
}> {
  const since = subDays(new Date(), windowDays);
  const [recentHires, activeHeadcount] = await Promise.all([
    this.prisma.employee.count({ where: { joinedOn: { gte: since } } }),
    this.prisma.employee.count({ where: { status: 'ACTIVE' } }),
  ]);
  return { recentHires, activeHeadcount, ratio: activeHeadcount > 0 ? recentHires / activeHeadcount : 0 };
}
```

`windowDays` is a caller-supplied parameter (defaulting to 30), never a
hardcoded constant — the same "policy, not a magic number" discipline
`AnalyticsService.productsCategories(days)` already establishes elsewhere
in this codebase, reused here rather than inventing a fixed window.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: a read over doc 20/28's own existing
actors.
**Whose rows, and which columns** — scoped to the caller's subtree
exactly as every other headcount-adjacent figure in this document set
already is; the count itself needs no `hr.compensation.view`-level
permission (headcount is not a compensation figure), only the existing
org-visibility permission doc 20 already defines.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: a read with no write, no authority to bound.
**Audience is a capability, not an address** — n/a: a dashboard tile, not
a notification.
**Request or record** — n/a: neither: a pure count over existing rows.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a: no money or stock fact; headcount scoped per
`organizationId` exactly as `Employee` already is.
**Dry run before live** — the function above already is exactly this: a
pure read, one implementation for the dashboard tile and any future
export.
**Three silhouettes** — Solo: a handful of employees, the ratio is noisy
at small headcount and the tile says so rather than implying false
precision (a ratio computed from a denominator under, say, 5 is shown as
a raw count, not a misleadingly exact percentage). Chain: a real
operational signal per branch. Organization: cross-brand joiner-rate
comparison, meaningful at scale.
**The absent collaborator** — with doc 28 (recruitment) off, `joinedOn`
is still set directly by doc 20's own `Employee.create` path (unchanged),
so this tile still works — it counts by `joinedOn`, never by "arrived
through the recruitment pipeline specifically."
**The second copy of the write** — n/a: no write at all.
**The hundred-thousandth row** — a `COUNT()` over an indexed `[status]`
and a date-range filter on `joinedOn` (indexed alongside `Employee`'s
existing `[status]` index, extended if `EXPLAIN ANALYZE` shows a
sequential scan at real headcount volume) — cheap at every silhouette.
**The reversal document / The undo fan-out / The version stamp** — n/a.
**The erasure the ledger cannot obey** — n/a beyond doc 20's own existing
`Employee` erasure/pseudonymisation rule; this tile counts rows, it does
not display names.
**The failure path** — n/a beyond an ordinary query failure, handled the
same as any other dashboard tile's own error state (doc 4's design-system
rule: every state shipped, including this one's failure state).

## Work orders

**WO-53.1 — `newHiresVsHeadcount(windowDays)`** read, subtree-scoped.
**WO-53.2 — UI**: a tile on the existing HR/people dashboard (not a new
page), showing the count and ratio with the small-denominator caveat from
§ Three silhouettes.

## Acceptance

- The tile's `recentHires` count matches a direct query of `Employee`
  rows with `joinedOn` inside the window, proven by a spec computing both
  independently.
- A denominator under the stated small-headcount threshold renders as a
  raw count, never a misleadingly precise percentage.
- The tile is scoped to the caller's subtree exactly as every other
  headcount figure already is.

## Out of scope

Attrition/turnover tracking (the departure side of the same story) —
named as a natural companion metric, not built here; it would read
`Employee.leftOn` (doc 20) the identical way this document reads
`joinedOn`, but is a distinct enough question (a turnover rate has its own
denominator conventions) to deserve its own scoping pass rather than being
folded in as an afterthought.
