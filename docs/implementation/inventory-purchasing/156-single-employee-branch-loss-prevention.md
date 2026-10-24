# 156 — Loss prevention at a single-employee branch: honest about the limit, real about what closes the gap

> **Status: shipped (2026-09-25), WO-156.1–156.7.** `StockVariance.posShiftId`
> is written inline inside `InventoryService.postUnconditional()`'s own
> transaction (`inventory.service.ts`), stronger than this doc's own
> post-hoc `attributeToShift()` sketch — no separate call, no risk of a
> variance left unattributed. The self-resolution refusal is in
> `StockVarianceService.resolve()`. `SpotCheckPolicy`/`SpotCheck`/
> `SpotCheckLine` exist (`inventory.prisma`), driven by
> `SpotCheckService.maybeTriggerDueChecks()` on `InventoryCron`'s hourly
> tick, with counting UI at `/admin/inventory/spot-checks` and a barcode
> entry screen at `/admin/inventory/spot-checks/[id]`. Variance history by
> shift is at `/admin/inventory/variances/by-shift`.
> `suspiciousTrafficReport()` is `SuspiciousTrafficService.report()`
> (`/admin/analytics/suspicious-traffic`), correlating a new
> `CameraPeopleCountRegistry` extension point (no provider registered —
> `FaceMatchProvider`, doc 30, does face-match for attendance, not
> people-counting, so this degrades honestly to "not available" exactly as
> this document requires) against distinct `POS_SALE` `StockMovement`
> refs, never a second, duplicated stock read. This brief is kept as the
> design record and the acceptance criteria to re-verify against, not as a
> to-do list.

Stated plainly, because overselling this would be worse than not building
it: **no software can technically prevent a lone, unsupervised employee
with physical custody of the goods from handing them to a customer with
no sale rung up.** The register cannot force someone to use it. What a
real system *can* do — and what this repository already has half-built —
is shrink the time between the loss happening and someone finding out,
make the loss attributable to a specific person instead of "someone,
sometime," and make continuing to do it a bad bet because the odds of a
fast, targeted, unpredictable check catching it are visibly high. This
document is that system, built from real gaps found in what already
exists, not a promise of fraud-proofing.

## What already exists, cited rather than re-specified

- **`StockVariance`** (`inventory.prisma`) — already the detective
  mechanism: a variance opens when `postUnconditional()` drives a
  location negative, or when a `StockCount` finds a mismatch
  (`StockVarianceReason.COUNT`), and doc 01's own controller comment
  confirms a real financial consequence already exists: resolving a
  variance "never reverses the shrinkage journal it already posted" —
  shrinkage is already a real, GL-posted fact, not a number sitting in a
  spreadsheet.
- **`StockCount`/`StockCountService`** (WO-1.7, done) — a real cycle-
  count mechanism, assignable to a specific `User` via `assignedTo`,
  already exists.
- **`PosShift`** — already tracks `openedByUserId`/`closedByUserId` and
  reconciles *cash* (`closingCashMinor` vs. the running `CashMovement`
  total) per shift.
- **Doc 31's cash-drawer discipline** — the drawer kicks "once, per
  completed cash tender — never on a card tender, never twice," already
  raising the bar for pocketing cash without at least *opening the
  drawer* through a real sale.
- **Doc 30's camera integration point** — `FaceMatchProvider` already
  gives this repository a live camera feed at a location, today used for
  attendance.

## The three real gaps found, checked against the actual code

**1. A `StockVariance` has no link to who had custody when it happened.**
`StockVariance` is `variantId`/`locationId`-scoped only — a branch with
one employee for the last three months has no way to know *which week*
a loss occurred, because nothing connects a variance to a `PosShift`. A
lone employee is, today, accountable to "this branch, sometime" — the
weakest possible accountability.

**2. The same person can cause a variance and resolve it.**
`StockVarianceController.resolve()` is gated by `inventory.manage` alone
— confirmed in code, no check comparing the resolver to anyone with
custody of the location. A sole branch employee who happens to hold
`inventory.manage` (plausible, since they may be the only staff member
with any admin access at all) can write off their own shrinkage with a
one-line note and nothing stops them. This is the identical toxic-pair
gap this repository's own discipline already closes everywhere else
(`closeShift()` vs. `openedByUserId`, doc 63's self-approval refusal) —
just never applied here.

**3. Counts are manual and predictable, never random.**
`StockCount` has no scheduling of its own — every count is an admin
action, initiated when someone remembers to. A monthly (or less
frequent) count gives a month of undetected exposure, and a predictable
count ("we always count on the 1st") gives an employee a known-safe
window every day but that one.

## 1. Link a variance to the shift that had custody — accountability, not just detection

```prisma
// additive — inventory.prisma
model StockVariance {
  // existing fields unchanged
  posShiftId String?  // the OPEN shift at this location when the
                        // variance's own underlying movement/count happened —
                        // resolved from PosShift.status=OPEN at StockVariance.createdAt,
                        // written once, never reassigned after the fact
}
```

```ts
async attributeToShift(variance: StockVariance): Promise<void> {
  const shift = await this.prisma.posShift.findFirst({
    where: { terminal: { locationId: variance.locationId }, status: 'OPEN', openedAt: { lte: variance.createdAt } },
    orderBy: { openedAt: 'desc' },
  });
  if (shift) await this.prisma.stockVariance.update({ where: { id: variance.id }, data: { posShiftId: shift.id } });
}
```

A branch's own variance history is now queryable by shift — "every
variance opened while this specific employee had the till open" — the
single most direct fix for "the owner will not know" turning into "the
owner sees, per shift, exactly what didn't reconcile."

## 2. Close the self-resolution gap — the toxic pair this repository already refuses everywhere else

```ts
async resolve(id: string, resolvedByUserId: string, resolutionNote: string): Promise<StockVariance> {
  const variance = await this.findWithShift(id);
  if (variance.posShiftId) {
    const shift = await this.prisma.posShift.findUniqueOrThrow({ where: { id: variance.posShiftId } });
    if (shift.openedByUserId === resolvedByUserId || shift.closedByUserId === resolvedByUserId) {
      throw new ForbiddenException('The employee whose shift is linked to this variance cannot resolve it themselves.');
    }
  }
  // ...existing resolution logic, unchanged otherwise.
}
```

At a genuinely single-employee branch, this means: **that employee
cannot clear their own variance at all** — resolution requires someone
else (a branch-cluster manager, the owner, doc 44's own action hub
surfacing it to whoever holds `inventory.manage` above that one branch)
to look at it. This is the direct, mechanical fix for "the owner will
not know about the sale" — an unresolved, un-self-clearable variance
sitting open is exactly a fact the owner now cannot fail to see.

## 3. Unpredictable spot-checks — shrinking the window from a month to days, and removing the "safe day"

```prisma
model SpotCheckPolicy {
  id             String @id @default(cuid())
  organizationId String
  locationId     String?  // null = applies to every single-employee location
  minSkusPerCheck Int    @default(5)
  frequencyDays   Int    @default(3)  // an EXPECTED cadence, not a fixed schedule
}
```

```ts
@Cron('0 * * * *') // checked hourly, but only sometimes fires — the point is unpredictability
async maybeTriggerSpotCheck(): Promise<void> {
  for (const policy of await this.activePolicies()) {
    // A policy that expects a check roughly every N days but fires at a
    // RANDOMIZED time within that window, never the same day-of-week
    // twice running — a predictable "always the 1st" schedule is
    // precisely what this document names as the weaker alternative.
    if (this.dueForRandomCheck(policy)) {
      await this.createSpotCheck(policy, this.randomSkuSample(policy.minSkusPerCheck));
    }
  }
}
```

A spot check is a *small* `StockCount` (a handful of SKUs, not the whole
shop), completable in minutes on the POS/mobile device — small enough
that "we didn't have time" is never a credible excuse for skipping it,
and frequent/unpredictable enough that a lone employee cannot safely bet
on any specific day being clear.

## 4. Camera-count vs. transaction-count — a real, new correlation this repository's own existing pieces already make possible

```ts
async suspiciousTrafficReport(locationId: string, date: Date): Promise<{
  cameraFootTraffic: number | null;  // from doc 30's own FaceMatchProvider feed, where a people-counting capability exists on the vendor side
  posTransactionCount: number;       // AnalyticsService's own existing order count for this location/day
  ratio: number;
}> {
  // A camera reporting 60 people entered while the till recorded 12
  // transactions is not proof of anything on its own — it is a SIGNAL
  // for a human to look at the footage for that day, never an automated
  // accusation. Named explicitly: this is a REPORT, never itself a
  // disciplinary action.
}
```

This is additive to doc 30's own camera integration — it does not require
a new hardware capability, only a people-counting feature the same
camera vendor may already expose, correlated against a number this
repository already computes.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: no new actor; every action is by an
existing `User`.
**Whose rows, and which columns** — a `StockVariance`'s own
`posShiftId` link is visible to whoever already sees the variance
(`inventory.manage`); the suspicious-traffic report is scoped to the
same location/organization visibility every other analytic in this
repository already enforces.
**The threshold nobody approves alone** — restated as this document's own
central mechanism: a variance above a configurable value cannot be
resolved by the shift's own opener/closer, full stop — not merely
requiring a second approver, an outright refusal, since the entire
point is that the one person with an incentive to hide it is the one
person this control removes from the decision.
**The toxic pair** — restated as §2's own entire purpose: shift-
opener/closer vs. variance-resolver, the identical self-dealing pattern
`closeShift()`'s own existing `closedByUserId` check and doc 63's
self-approval refusal already close everywhere else in this repository,
finally closed here too.
**Authority and blast radius** — who may configure `SpotCheckPolicy`'s
own frequency (too infrequent defeats the purpose; too frequent is an
operational burden) is gated by `inventory.spot-checks.manage`, a real
trade-off decision worth auditing old/new value.
**Audience is a capability, not an address** — an unresolved variance
past a configurable age escalates to doc 44's own action hub, resolved
to whoever holds `inventory.manage` scoped ABOVE the affected branch
(never the branch's own single employee, by construction, since they are
excluded from resolving it at all) — the direct fix for "the owner will
not know."
**Request or record** — a spot check's own count entry is a REQUEST
(refusable — an implausible count); once a `StockVariance` is opened
from a mismatch, it is a RECORD, unchanged from today's existing
behavior.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a beyond what `StockVariance`'s own existing shrinkage-
journal posting already answers, unchanged by this document.
**Dry run before live** — `suspiciousTrafficReport()` is a pure read,
callable on demand or on a schedule, with no write of its own.
**Three silhouettes** — Solo: precisely the case this document names —
one employee, one branch, the owner not present daily; this is where
every mechanism here earns its keep. Chain: the same mechanism scales
per branch, with `SpotCheckPolicy` per location and a cluster manager as
the resolver above each branch's own staff. Organization: cross-brand
loss-prevention reporting, aggregating variance-per-shift-per-employee
across many branches.
**The absent collaborator** — with `SpotCheckPolicy` unconfigured for a
location, no random checks fire there — an explicit, visible gap in
coverage, never a silent one, since the policy's own absence is itself
queryable.
**The second copy of the write** — n/a beyond what `StockVariance`/
`StockCount`'s own existing idempotency already provides; this document
adds a link and a check, not a new write path.
**The hundred-thousandth row** — `StockVariance.posShiftId` is indexed
alongside the table's own existing indexes; volume is bounded by real
variance frequency (ideally low), never unbounded.
**The reversal document / The undo fan-out** — n/a beyond what
`StockVariance`'s own existing "resolving never reverses the shrinkage
journal" answer already states — this document does not change that.
**The version stamp** — a `SpotCheckPolicy` change (frequency, SKU count)
applies to future scheduling only; a check already in progress is
unaffected.
**The erasure the ledger cannot obey** — `PosShift.openedByUserId`/
`closedByUserId` already hold a person; this document adds no new
personal-data column, only a foreign key to an already-existing row.
**The failure path** — a `maybeTriggerSpotCheck()` run that fails to
create a check for one location logs and continues to the next, never
silently skipping every location because one failed.

## Work orders

**WO-156.1 — schema**: `StockVariance.posShiftId`, `SpotCheckPolicy`,
forward-only migration.
**WO-156.2 — `attributeToShift()`**, called wherever a `StockVariance` is
currently created (both the oversell path and the stock-count path).
**WO-156.3 — the self-resolution refusal** in
`StockVarianceService.resolve()`.
**WO-156.4 — `maybeTriggerSpotCheck()`** cron + a fast, small-count UI on
the POS/mobile surface.
**WO-156.5 — `suspiciousTrafficReport()`**, wired to doc 30's own camera
feed where a people-counting capability exists on the vendor side —
degrading to "not available" honestly where it does not, never a
fabricated number.
**WO-156.6 — permissions**: `inventory.spot-checks.manage`, seeded above
individual branch staff.
**WO-156.7 — UI**: a per-branch, per-shift variance-history view; the
spot-check completion flow; the suspicious-traffic report on the branch
analytics screen.

## Acceptance

- A `StockVariance` created at a single-employee location is correctly
  attributed to that location's own open shift, proven by a spec.
- That shift's own opener/closer cannot resolve the resulting variance —
  the call is refused, proven by a spec.
- A configured `SpotCheckPolicy` produces checks at unpredictable times
  within its own stated frequency window, never the identical day-of-
  week twice running, proven by a spec sampling many scheduled runs.
- `suspiciousTrafficReport()` degrades to an explicit "no camera people-
  count available" state rather than a fabricated ratio when the
  underlying capability doesn't exist.

## Out of scope

Physical/hardware anti-theft measures (EAS security tags, exit-gate
alarms) — real, valuable, complementary controls entirely outside this
repository's own reach; named here so this document is not mistaken for
a complete answer. Automated, AI-driven video analysis that itself
flags a suspected fraudulent transaction in real time — a materially
larger, higher-false-positive-risk capability than the count-based
correlation this document builds; not attempted here. Any claim that
this system prevents the fraud outright — explicitly declined throughout
this document; the goal is faster detection, clear accountability, and a
credible deterrent, never a guarantee.
