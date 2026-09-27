# 167 — Bank facility management

`receivables` (doc 145) tracks **customer** credit — money the business is
owed. Nothing in this repository answers the mirror concern: what the
business itself owes a **bank** against a facility limit — a term loan,
running finance, an overdraft, or a letter-of-credit/bank-guarantee limit.
This document is that mechanism, promoted from
`GAP-ANALYSIS-BANK-FACILITY-MANAGEMENT.md` (which now points here) into a
real, numbered work order.

> **Status (2026-09-27): built, WO-167.1–167.6.** `Bank`/`BankFacility`/
> `BankFacilityDrawdown`/`BankFacilityRepayment`/`BankFacilityMarkupAccrual`
> (`bank-facilities.prisma`) in a new `bankfacilities` module, `core`-packed
> but `offByDefault: true` like `settlements`/`receivables`/`wallet` — a real
> capability every deployment can reach, off until a client actually has a
> bank facility to track. `BankFacilitiesService.recordDrawdown()`/
> `.approveDrawdown()`/`.postDrawdown()`/`.recordRepayment()`/
> `.postMonthlyMarkupAccruals()`/`.utilizationOf()`/`.listUpcomingRenewals()`
> are all built and tested. A drawdown's maker-checker pair mirrors
> `CreditNotesService.create()`/`.approve()`/`.issue()` exactly: at or below
> `FinanceFacilityDrawdownApprovalThresholdMinor` (a `Setting`, default
> Rs 10,000) a single actor's own drawdown posts immediately; above it,
> `postDrawdown()` refuses without a prior `approveDrawdown()` call by
> someone other than the requester, checked again at post time, never
> trusted from the request step alone. Utilization is never a stored,
> driftable counter — `utilizationOf()` sums posted drawdowns minus repaid
> principal at read time, the same discipline doc 150's
> `bundleAvailableStock()` already applies, and `recordDrawdown()` refuses
> outright, before ever creating a row, a drawdown that would push
> utilization past the facility's own limit. Three new GL accounts (`2500
> Bank Loan Payable`, `2600 Accrued Markup Payable`, `5800 Markup Expense`):
> a drawdown posts Dr Cash & Bank / Cr Bank Loan Payable through
> `BankFacilityDrawdownPosted`; a repayment posts against principal,
> accrued markup, or both through `BankFacilityRepaymentRecorded`; the
> monthly markup-accrual cron posts Dr Markup Expense / Cr Accrued Markup
> Payable through `BankFacilityMarkupAccrued` — three new domain events,
> `bankfacilities` never imports `accounting`, matching every other posting
> rule in this repository. Permissions `finance.facilities.view`
> (read-only), `.manage` (register banks/facilities, record drawdowns and
> repayments), `.approve_drawdown` (the checker half) are seeded to `ADMIN`
> and enforced per-route, `view` alone reaching every `GET`. WO-167.6's UI is
> a facility list (`/admin/bank-facilities`, status filter, a utilization/
> limit summary strip, a register-facility dialog that can also register a
> new bank inline) and a facility detail screen
> (`/admin/bank-facilities/:id`, drawdown/repayment recording, drawdown
> approve/post, a markup-accrual history), reachable from the Finance nav
> group.
>
> **One honest deviation from this document's own text**, the identical
> reasoning doc 49's own build already states for the same reason: `Bank`/
> `BankFacility` carry no `organizationId` — this codebase's real
> multi-tenancy boundary is the deployment itself, not a column on every
> table (`RETAIL-ERP.md` R7), and no sibling model this document mirrors
> (`SettlementProvider`, `CreditNote`) carries one either. ADR-063.

## 1. A facility limit is independent of any drawdown against it

`Bank`/`BankFacility` are deliberately their own actor and their own table
— never `Contact`/`Party` (a bank is not a customer or a supplier) and
never folded into `receivables` (a facility limit is not a credit note).

```prisma
// bank-facilities.prisma — additive

model Bank {
  id       String  @id @default(cuid())
  name     String  @unique
  isActive Boolean @default(true)

  facilities BankFacility[]
}

enum BankFacilityType { TERM_LOAN RUNNING_FINANCE OVERDRAFT LETTER_OF_CREDIT BANK_GUARANTEE }
enum BankFacilityStatus { ACTIVE CLOSED }

model BankFacility {
  id                String             @id @default(cuid())
  bankId            String
  key               String             @unique
  label             String
  facilityType      BankFacilityType
  limitMinor        Int
  markupRateBps     Int
  isFloatingRate    Boolean            @default(false)
  securityReference String?
  startDate         DateTime
  maturityDate      DateTime
  status            BankFacilityStatus @default(ACTIVE)

  bank       Bank                        @relation(fields: [bankId], references: [id])
  drawdowns  BankFacilityDrawdown[]
  repayments BankFacilityRepayment[]
  accruals   BankFacilityMarkupAccrual[]
}
```

## 2. Utilization is computed, never stored — the same discipline doc 150 already establishes for bundle stock

```ts
async utilizationOf(facilityId: string): Promise<number> {
  // posted drawdowns minus repaid principal — never a maintained counter
  // that could drift from the components' own real rows.
}
```

`recordDrawdown()` calls this before ever creating a `BankFacilityDrawdown`
row: a drawdown that would push utilization past `limitMinor` is refused
outright — surfaced before an over-limit drawdown is allowed to post, never
discovered after the fact.

## 3. A drawdown is a REQUEST/RECORD pair; a repayment and a markup accrual are RECORDs

A drawdown mirrors `CreditNotesService`'s own create/approve/issue shape —
at or below the configured threshold it posts immediately; above it,
`postDrawdown()` refuses without a prior, different approver. A repayment
is a RECORD: the bank has, in fact, already been repaid this amount, so
`recordRepayment()` never refuses on business grounds, only validates that
at least one of `principalMinor`/`markupMinor` is positive. The monthly
markup-accrual cron mirrors `AssetDepreciationCron` exactly: one row per
`(facilityId, periodStart)`, idempotent, posting Dr Markup Expense / Cr
Accrued Markup Payable on the outstanding balance independent of whether
any repayment happens that month.

## 4. Renewal/covenant tracking is a read, not a flag

```ts
async listUpcomingRenewals(): Promise<BankFacilityWithUtilization[]> {
  // active facilities whose maturityDate falls within
  // FinanceFacilityRenewalAlertDays (default 60) — computed at read time,
  // the same "don't let a real deadline silently pass" discipline doc 56's
  // overdue-invoices counter already applies to a different kind of
  // deadline, never a stored, driftable "renewal due" column.
}
```

## Scope lenses

**The actor with three tables** — `Bank` is its own actor, deliberately
not `Contact`/`Party`/`User`: a lending institution the business borrows
from, not a customer, supplier, or principal that authenticates.
**The principal with no permission key** — n/a: `Bank` never authenticates
or acts; every write is made by an admin `User` through the existing
permission model.
**The grant that ends itself** — `Bank.isActive = false` stops new
facilities being registered against it; already-registered facilities are
untouched, the identical shape `SettlementProvider.isActive` already
establishes.
**Whose rows, and which columns** — every route requires
`finance.facilities.view` at minimum; registering a bank/facility and
recording drawdowns/repayments requires `finance.facilities.manage`.
**The threshold nobody approves alone** — a drawdown above
`FinanceFacilityDrawdownApprovalThresholdMinor` needs
`finance.facilities.approve_drawdown` from someone other than whoever
recorded it, the identical shape `CreditNotesService`/`SettlementsService`
already establish for their own thresholds.
**The toxic pair** — none: `approveDrawdown()`/`postDrawdown()` refuse the
requester's own approval per-instance (`drawdown.createdById === actorId`),
the same "per-instance check, not a role-level `TOXIC_PERMISSION_PAIRS`
refusal" shape `tasks.close`/`tasks.assign` and doc 49's own
reconcile/approve_writeoff pair already establish — one ADMIN legitimately
holds both permissions; only the same actor on the same drawdown is
refused.
**Authority and blast radius** — who may register a bank/facility (finance
admin, `finance.facilities.manage`); the worst value is a misconfigured
`markupRateBps` silently over- or under-accruing markup for months —
mitigated by the monthly accrual amount being visible on the facility
detail screen every month it posts, not hidden inside a lump-sum figure.
**Audience is a capability, not an address** — n/a: this document sends no
notification of its own; an upcoming renewal surfaces on a screen gated by
`finance.facilities.view`, never a hardcoded email.
**Request or record** — a drawdown is a REQUEST (refusable: over-limit,
or above-threshold with no approval); a repayment and a markup accrual are
RECORDs — the bank has already been repaid, or markup has already accrued,
and this repository does not get to disagree.
**The movement with no address** — n/a beyond `Bank`/`BankFacility`'s own
organization-wide scope (this repository's real tenancy boundary is the
deployment itself, per the deviation noted above); a facility is not
branch-scoped stock or cash.
**Four hours down** — n/a beyond what `EventBusService`'s own outbox
already guarantees: a drawdown/repayment/accrual recorded while briefly
unreachable is retried by the same at-least-once delivery every other
posting rule in this repository already relies on.
**Click the number** — every figure the facility list/detail screens show
(limit, utilized, available, a markup accrual amount) links to the exact
drawdown/repayment/accrual rows that produced it — the detail screen's own
three tables, never a lump-sum figure with no drill-down.
**The unwritten posting rule** — write it out: a drawdown posts Dr `1000
Cash & Bank` / Cr `2500 Bank Loan Payable`; a repayment posts Dr `2500` for
its principal component and/or Dr `2600 Accrued Markup Payable` for its
markup component, Cr `1000` for the total; the monthly accrual posts Dr
`5800 Markup Expense` / Cr `2600`. Idempotency key: `findPostedEntry(source,
drawdownId | repaymentId | \`${facilityId}:${monthKey}\`)`.
**Every column or none** — undimensioned beyond `Bank`/`BankFacility`'s own
organization-wide scope, per the deviation noted above — matching
`SettlementBatch`'s identical, already-accepted deviation.
**The period that already moved** — a drawdown/repayment/accrual dated
into a closed period posts to the next open period, identical to every
other late-arriving fact in this document set (R15).
**The second legal entity** — a second `RetailBrand`/legal entity holds its
own `Bank`/`BankFacility` rows and its own facility relationships, never
shared — the same posture doc 49's own `SettlementProvider` already takes.
**Dry run before live** — n/a as a dedicated preview: `utilizationOf()` and
`listUpcomingRenewals()` are already pure reads a caller can check before
recording a drawdown; `recordDrawdown()`'s own limit-breach refusal is the
live check, not a separate simulated one, the same posture
`bundleAvailableStock()` already takes for bundle sale eligibility.
**Three silhouettes** — Solo: at most one or two facilities, a nice-to-
have. Chain: real borrowing against several facilities across banks,
utilization genuinely matters operationally. Organization: multiple
facilities across brands/entities, the total-borrowing summary (the list
screen's own metric strip) starts to matter for treasury oversight.
**The absent collaborator** — with no `Bank`/`BankFacility` rows
registered, nothing about ordinary accounting changes at all — this
mechanism is purely additive, and `bankfacilities` off in `MODULES` means
the three new GL accounts sit unused rather than unreachable (seeded
unconditionally, per `seedChartOfAccounts()`'s own standing rule).
**The second copy of the write** — `postDrawdown()`/`recordRepayment()`/
the accrual cron each publish through `findPostedEntry`-keyed idempotency;
`@@unique([facilityId, periodStart])` makes a repeated cron tick a no-op
the same way `AssetDepreciationPosting` already guarantees for a different
periodic liability.
**The hundred-thousandth row** — bounded and small: facility count tracks
real bank relationships (a handful per deployment even at Organization
scale), drawdowns/repayments/accruals track borrowing activity, not
transaction volume.
**The reversal document** — a drawdown or repayment recorded in error is
corrected the same way any other posted journal entry in this repository
is corrected today: a new, opposite-signed repayment/drawdown, never an
edit to an already-posted row — no `reverseEntry()`-style mechanism is
invented here, since none of this document's own writes are refundable in
the sense a `CreditNote` is.
**The undo fan-out / The version stamp** — n/a beyond what an ordinary
`JournalEntry` correction already answers; a facility's own `markupRateBps`
change (a bank revising its rate) takes effect only for accruals posted
after the change — an already-posted accrual is never retroactively
recomputed.
**The erasure the ledger cannot obey** — n/a: `Bank`/`BankFacility` and
their drawdowns/repayments/accruals carry no personal data; `createdById`
on a drawdown/repayment is the same actor-reference shape every other
audited write in this repository already carries.
**The failure path** — a drawdown/repayment/accrual whose event publish
fails mid-transaction rolls back entirely (the whole `$transaction` body,
row creation included) — never a recorded row with no corresponding GL
fact, the same "half-written" failure shape this document set refuses
everywhere else.

## Work orders

**WO-167.1 — schema**: `Bank`, `BankFacility`, `BankFacilityDrawdown`,
`BankFacilityRepayment`, `BankFacilityMarkupAccrual`.
**WO-167.2 — chart of accounts**: `2500 Bank Loan Payable`, `2600 Accrued
Markup Payable`, `5800 Markup Expense`.
**WO-167.3 — `BankFacilitiesService`**: `recordDrawdown()`/
`approveDrawdown()`/`postDrawdown()` (the maker-checker pair, limit-breach
refusal), `recordRepayment()`, three domain events and their
`posting-rules.subscriber.ts` handlers.
**WO-167.4 — markup-accrual cron**: monthly, idempotent per
`(facilityId, periodStart)`.
**WO-167.5 — permissions + settings**: `finance.facilities.view/.manage/
.approve_drawdown`, `FinanceFacilityDrawdownApprovalThresholdMinor`,
`FinanceFacilityRenewalAlertDays`.
**WO-167.6 — UI**: a facility list (utilization summary, register-facility
dialog with inline bank registration) and a facility detail screen
(drawdown/repayment recording, drawdown approve/post, markup-accrual
history), reachable from the Finance nav group.

## Acceptance

- A drawdown that would push a facility's utilization past its own limit
  is refused outright — no row is ever created for it.
- A drawdown at or below the configured threshold posts immediately; one
  above it cannot post without a prior approval from someone other than
  whoever recorded it, proven by a spec.
- A repayment posts against principal, accrued markup, or both, each as
  its own general-ledger line.
- The monthly markup-accrual cron posts exactly once per facility per
  calendar month regardless of how many times it runs.
- With no `Bank`/`BankFacility` rows registered, nothing about ordinary
  accounting changes.

## Out of scope

Covenant-clause tracking beyond a maturity date (financial ratios, minimum
balance requirements, reporting obligations a facility agreement might
impose) — this document tracks the limit, utilization and maturity a
facility agreement states in numbers; a full covenant-compliance engine is
a materially larger, separately-scoped capability. Multi-currency
facilities — `limitMinor`/drawdowns/repayments are in the deployment's own
single currency, matching this repository's existing single-currency
posture everywhere else; a foreign-currency facility is a real, separate
design question (revaluation, FX gain/loss on a loan balance) this
document does not open. Automatic markup-rate updates for a floating-rate
facility from a market-rate feed — `isFloatingRate` only names the value
as one an admin re-enters when the bank revises it; wiring a live rate
feed is a real, separate integration this document does not assume.
