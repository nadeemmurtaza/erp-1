# 74 — Paid / Pending / Deductions / Net Payout: one aggregation over `PayRun`

`PayRun`/`PayRunLine` (`apps/api/prisma/schema/payroll.prisma`, lines
131-189) already carry every figure this widget needs: `PayRunStatus`
(`DRAFT`/`APPROVED`/`POSTED`), and per-line `grossMinor`, `deductionsMinor`,
`netMinor`. No dashboard tile today sums them — a grep across
`apps/api/src/modules/payroll` and `analytics.service.ts` for
`totalNet`/`netPay`/a payroll summary aggregate found nothing. This is the
missing read, not a new payroll fact.

## 1. The four figures, mapped onto `PayRunStatus` and the current period

```ts
interface PayrollFinancialOverview {
  paidThisMonth: number;      // Σ netMinor, PayRun.status = POSTED, postedAt in current calendar month
  pendingSalaries: number;    // Σ netMinor, PayRun.status IN (DRAFT, APPROVED) for the current period
  totalDeductions: number;    // Σ deductionsMinor across the same POSTED-this-month runs
  netPayout: number;          // paidThisMonth (== Σ netMinor already nets out deductions; kept as its own field for the tile's own label, not a second calculation)
  deductionsByCategory: Record<string, number>; // see §2
}

async payrollFinancialOverview(organizationId: string): Promise<PayrollFinancialOverview> {
  // Two GROUP BY queries over PayRunLine joined to PayRun.status/postedAt —
  // never a per-employee loop, never a re-derived netMinor (it is already
  // frozen at build time per PayRunLine's own doc comment: "computed once
  // at build time and frozen").
}
```

`pendingSalaries` reads `DRAFT`/`APPROVED` runs regardless of period,
because an unpaid run does not age out of relevance the way a closed one
does — the same "open items don't need a window" reasoning doc 69's order-
lifecycle tile already applies to its own `pending` bucket.

## 2. "Specifically for taxes and insurance" is a breakdown, not a bespoke split

`PayRunLine.deductions` is today a JSON bag of `{code, amountMinor}` lines
(`payroll.prisma` line 178's own comment: "not its own table yet... because
no jurisdiction-specific rule has been requested"). Doc 40 already
specifies the direct fix — `DeductionType`/`DeductionCategory`, including a
named `INSURANCE_PREMIUM` category — as its own separately-scoped work
order, not yet implemented in the live schema. Until doc 40 ships, this
widget's `deductionsByCategory` groups by the JSON bag's own existing
`code` field (whatever codes a client has actually configured, e.g.
`"income-tax"`, `"health-insurance"`); once doc 40 ships, the identical
query regroups by `DeductionType.category` instead — a one-line query
change, never a second deductions model built to unblock this tile early.

## Scope lenses

**The actor with three tables / The principal with no permission key / The
grant that ends itself** — n/a: a read over existing `PayRun`/`PayRunLine`
rows.
**Whose rows, and which columns** — gated by the same
`payroll.runs.view`-level permission `PayRun`'s own admin screen already
requires; a manager without payroll visibility never sees this tile, not
even a redacted total.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: a read, no write; this document changes no approval
path.
**Audience is a capability, not an address** — n/a: a dashboard tile, not
a notification.
**Request or record** — n/a: a pure aggregation over `PayRun`'s own
already-classified writes (a `POSTED` run is a RECORD, `DRAFT`/`APPROVED`
are its own REQUEST states, both already correctly classified by doc 19).
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a beyond what `PayRun`'s own GL posting already states
(payroll posts through its own existing rule, scoped per
`organizationId`/`scopeLevel`, unchanged by this read).
**Dry run before live** — the function above is already the entire
computation, pure, over already-committed rows.
**Three silhouettes** — Solo: one or two `PayRun`s a month, the tile is a
quick confirmation. Chain: a real per-branch payroll-liability signal
(`pendingSalaries` spiking at one branch is worth a manager's attention).
Organization: cross-brand payroll rollup, where `scopeLevel`-aware scoping
(next lens) matters.
**The absent collaborator** — with `payroll` off, the tile does not render
(`MOD-1`).
**The second copy of the write** — n/a: no write.
**The hundred-thousandth row** — bounded by one month's `PayRunLine` rows,
already indexed via `PayRun`'s own `[status, periodStart]` index; no new
index required.
**The reversal document / The undo fan-out / The version stamp** — n/a:
reads `PayRunAdjustment`'s own existing reversal path unchanged (an
adjustment's `amountMinor` is included in the same month's totals it
posts into, never double-counted against the original run).
**The erasure the ledger cannot obey** — n/a: an aggregate total, never a
per-employee figure exposed by this tile.
**The failure path** — n/a beyond an ordinary query failure, surfaced as
the tile's own error state.

## Work orders

**WO-74.1 — `payrollFinancialOverview(organizationId)`** read, two
`GROUP BY` queries over `PayRun`/`PayRunLine`.
**WO-74.2 — UI**: a four-figure tile (Paid This Month, Pending Salaries,
Total Deductions, Net Payout) on the HR/payroll dashboard, with a
deductions-by-category breakdown on click — the "click the number" rule
applied to a payroll total.

## Acceptance

- `paidThisMonth` matches the sum of `netMinor` across `POSTED` runs
  `postedAt` in the current month, proven by a spec.
- `deductionsByCategory`'s values sum to `totalDeductions` exactly, proven
  by a spec.
- With no `PayRun` rows at all, every figure reads zero, never `NaN` or an
  error.

## Out of scope

A payroll cost forecast (projected pending salaries against future
periods) — this tile reports what already exists as `DRAFT`/`APPROVED`
rows, never a projection of runs not yet built.
