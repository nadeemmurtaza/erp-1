# 147 — Depreciation and GL posting for asset value: doc 79's own named, unbuilt gap

Doc 79 (employee asset management) built `Asset`/`AssetAssignment` for
physical custody tracking and named its own boundary explicitly: "a real,
separately-scoped fixed-asset accounting capability if ever requested;
this document tracks physical custody only, never books a depreciation
entry." Confirmed: no depreciation schedule, no periodic GL posting for
asset value exists anywhere in `accounting`/`finance`. This document is
that separately-scoped capability doc 79 already deferred.

## 1. A depreciation schedule, computed once at acquisition, posted periodically

```prisma
// additive — accounting.prisma, referencing doc 79's own Asset model
enum DepreciationMethod { STRAIGHT_LINE  DECLINING_BALANCE }

model AssetDepreciationSchedule {
  id               String  @id @default(cuid())
  assetId          String  @unique  // doc 79's Asset.id
  method           DepreciationMethod
  acquisitionCostMinor Int          // Asset.purchaseCost, snapshotted here — never re-read live
  salvageValueMinor   Int @default(0)
  usefulLifeMonths    Int
  /// DECLINING_BALANCE only.
  decliningRateBps    Int?
  startDate           DateTime

  postings AssetDepreciationPosting[]
}

/// One row per period posted — the same "snapshot at write time, never
/// re-derived" discipline PayRunLine/OrderEconomics already establish.
model AssetDepreciationPosting {
  id           String   @id @default(cuid())
  scheduleId   String
  periodStart  DateTime
  periodEnd    DateTime
  amountMinor  Int
  postedAt     DateTime @default(now())

  schedule AssetDepreciationSchedule @relation(fields: [scheduleId], references: [id])

  @@unique([scheduleId, periodStart])
}
```

```ts
function monthlyDepreciation(schedule: AssetDepreciationSchedule, monthIndex: number): number {
  // STRAIGHT_LINE: (acquisitionCostMinor - salvageValueMinor) / usefulLifeMonths, flat every month.
  // DECLINING_BALANCE: remainingBookValue * decliningRateBps / 10_000, floored so book value
  // never drops below salvageValueMinor.
}
```

## 2. Posting is a cron, through the identical `findPostedEntry()` idempotency key every other posting rule already uses

```ts
@Cron('0 2 1 * *') // first of each month
async postMonthlyDepreciation(): Promise<void> {
  for (const schedule of await this.activeSchedules()) {
    const amount = monthlyDepreciation(schedule, currentMonthIndex(schedule));
    if (amount === 0) continue; // fully depreciated — no zero-amount postings
    await this.accounting.post({
      source: 'AssetDepreciation',
      sourceRef: `${schedule.id}:${periodKey}`, // findPostedEntry()'s own idempotency key — a re-run this month is a no-op
      lines: [
        { account: 'DepreciationExpense', debitMinor: amount },
        { account: 'AccumulatedDepreciation', creditMinor: amount },
      ],
    });
    await this.prisma.assetDepreciationPosting.create({ data: { scheduleId: schedule.id, periodStart, periodEnd, amountMinor: amount } });
  }
}
```

`AccumulatedDepreciation` and `DepreciationExpense` are new accounts in
whatever chart of accounts this deployment already runs — the existing
`accounting` module's own chart-of-accounts mechanism, never a parallel
posting system.

## 3. Write-off and disposal reuse doc 79's own `AssetStatus`, closing the schedule rather than deleting it

```ts
async disposeAsset(assetId: string, disposalDate: Date, saleProceedsMinor?: number): Promise<void> {
  // Posts the remaining book value (acquisitionCost - accumulated depreciation
  // so far) as a loss/gain against the actual sale proceeds, then sets
  // doc 79's own Asset.status = RETIRED. The schedule's own rows are
  // never deleted — they remain the audit trail of what was posted and
  // when, per this repository's own "a record is never erased, only
  // superseded" discipline.
}
```

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: a scheduled posting process, not an
actor; who may create a depreciation schedule is gated by
`finance.assets.depreciate`.
**Whose rows, and which columns** — `AssetDepreciationSchedule`/
`Posting` inherit doc 79's own `Asset`'s `organizationId` scoping.
**The threshold nobody approves alone** — disposing an asset with a
material remaining book value (a real loss/gain to the P&L) requires
`finance.assets.dispose`, distinct from `.depreciate`, mirroring the
create/approve split every other money-adjacent mechanism in this
document set already establishes.
**The toxic pair** — n/a.
**Authority and blast radius** — who may set a schedule's own
`usefulLifeMonths`/`method` (a real accounting-policy decision) is gated
and audited old/new value — restated because a shortened useful life
inflates monthly expense and directly moves reported profit.
**Audience is a capability, not an address** — n/a: a scheduled posting
job, not a notification (though a failed monthly run surfaces to doc
44's own action hub as a stalled item, reusing that registry rather than
a bespoke alert).
**Request or record** — creating a schedule is a REQUEST (refusable —
`usefulLifeMonths` must be positive, `salvageValueMinor` cannot exceed
acquisition cost); once a period is posted, `AssetDepreciationPosting`
is a RECORD, immutable, per every other posting in this repository.
**The movement with no address** — n/a: a depreciation posting carries
no stock movement; it inherits the asset's own existing
organization/location scope.
**The unwritten posting rule** — stated explicitly in §2 above: Dr
`DepreciationExpense`, Cr `AccumulatedDepreciation`, keyed by
`findPostedEntry('AssetDepreciation', '{scheduleId}:{periodKey}')`.
**Every column or none** — every posting sets `organizationId` and
whatever `costCentreId` the originating `Asset` itself carries (per doc
79's own future extension, if assets ever gain a cost-centre field) —
declared undimensioned otherwise, never silently defaulted.
**The period that already moved** — a depreciation run for a `CLOSED`
fiscal period is refused and posts into the current open period instead,
identical to every other posting rule's own answer to this lens.
**The second legal entity** — a schedule is scoped to one `Asset`, itself
scoped to one legal entity via `organizationId`; a shared asset across
brands is out of scope, named below.
**Dry run before live** — `monthlyDepreciation()` is a pure function
(schedule + month index in, an amount out, no write) — a "preview this
year's depreciation schedule" report calls it directly across 12 months
with no posting side effect.
**Three silhouettes** — Solo: a handful of assets, depreciation posted
mostly for accountant-facing correctness. Chain: real equipment fleets
across branches, where monthly posting volume (next lens) first matters.
Organization: cross-brand asset depreciation reporting, `organizationId`-
scoped exactly as everything else.
**The absent collaborator** — with `finance`/`accounting` off, no
depreciation posts at all — doc 79's own asset-custody tracking is
entirely unaffected, since it never depended on this module.
**The second copy of the write** — `@@unique([scheduleId, periodStart])`
plus `findPostedEntry()`'s own idempotency key together make a re-run of
the monthly cron for an already-posted period a guaranteed no-op.
**The hundred-thousandth row** — `AssetDepreciationPosting` grows one row
per asset per month — bounded and small even at Organization scale
relative to transaction-volume tables.
**The reversal document** — `disposeAsset()`'s own write-off posting is
the reversal document R18-style discipline requires: it names the
specific schedule, posts the exact remaining book value, never a blanket
"zero out this asset" adjustment.
**The undo fan-out** — reversing a mistaken disposal restores
`AssetStatus` to `ASSIGNED`/`AVAILABLE` (doc 79's own enum) but does NOT
automatically resume the depreciation schedule mid-stream without a
human review, since the schedule's own posted history already reflects
the (now-incorrect) disposal — named explicitly as a manual correction
step, never automated.
**The version stamp** — a schedule's own `method`/`usefulLifeMonths` are
fixed at creation; changing accounting policy for a specific asset
creates a new schedule period (a policy-change adjustment), never
silently rewrites already-posted history.
**The erasure the ledger cannot obey** — n/a: schedules and postings
carry no personal data.
**The failure path** — a monthly posting run that fails partway (one
asset's posting errors) logs and continues to the next asset, never
aborting the whole batch — a stalled schedule surfaces to doc 44's action
hub per "Audience is a capability" above.

## Work orders

**WO-147.1 — schema**: `AssetDepreciationSchedule`,
`AssetDepreciationPosting`, `DepreciationMethod`, new
`DepreciationExpense`/`AccumulatedDepreciation` chart-of-accounts entries,
forward-only migration.
**WO-147.2 — `monthlyDepreciation()`** pure function, both methods.
**WO-147.3 — the monthly posting cron**, idempotent via
`findPostedEntry()`.
**WO-147.4 — `disposeAsset()`**, write-off posting + `AssetStatus`
transition.
**WO-147.5 — permissions**: `finance.assets.depreciate`,
`finance.assets.dispose`.
**WO-147.6 — UI**: a depreciation schedule form on doc 79's own asset
detail screen, a depreciation-schedule preview report, a disposal action.

## Acceptance

- Re-running the monthly cron for an already-posted period posts nothing
  further, proven by a spec.
- `monthlyDepreciation()` never returns a value that would drop book
  value below `salvageValueMinor`, proven by a spec.
- Disposing an asset posts exactly the remaining book value as a single
  loss/gain entry, proven by a spec.
- A depreciation run for a closed fiscal period posts into the current
  open period instead.

## Out of scope

Tax-basis depreciation distinct from book depreciation (many
jurisdictions allow accelerated tax depreciation different from
accounting-book depreciation) — a real, jurisdiction-specific complexity
named honestly as unbuilt, following the same "get real requirements
first" caution doc 15's own FBR/PRA work already applies; this document
ships book depreciation only.
