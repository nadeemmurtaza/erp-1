# 25 — Advance salary, and what it does to the books

An advance against salary is **a loan to an employee, not a payment of wages**.
Getting that one sentence wrong is the defect this document exists to prevent,
because the wrong version is easy, plausible, and self-concealing: book the
advance as salary expense in March, run payroll in April, and the same money is
an expense twice. The accounts balance. The bank balances. Only the profit is
wrong, and nothing reports it.

Correctly: an advance debits an **asset** — the company is owed it back — and is
extinguished by recovery from a later payroll, never by an expense entry.

## The chart does not have the accounts

`CHART_OF_ACCOUNTS`
(`apps/api/src/modules/accounting/chart-of-accounts.ts:20-32`) has thirteen
accounts. Not one of them is payroll: there is no salary expense, no salaries
payable, and no employee receivable. The scope rule requires this to be named
rather than assumed, so it is named. **This work order adds three:**

| Code | Name | Type | Why |
|---|---|---|---|
| `1300` | Employee Advances | ASSET | What the advance actually is — money owed back |
| `2300` | Salaries Payable | LIABILITY | Earned but not yet paid, at period end |
| `5200` | Salaries & Wages | EXPENSE | The real expense, recognised when earned |

`1300` is a control account: its balance must equal the sum of open advance
balances, and the reconciliation report proving that is part of the work order,
not a later idea.

## The posting rules, written out

The scope rule demands the event, the Dr/Cr codes and the idempotency key. All
three, for each of the two events:

**`hr.advance_disbursed`** — money leaves, an asset is created.

```
Dr  1300  Employee Advances      <amount>
    Cr  1000  Cash & Bank                    <amount>
```
`findPostedEntry('hr.advance', advanceId)` — the key that makes a redelivered
event a no-op, exactly as every other posting subscriber uses it.

**`hr.payroll_run_posted`** — expense recognised, advance recovered, net paid.

```
Dr  5200  Salaries & Wages       <gross>
    Cr  1300  Employee Advances            <recovered this run>
    Cr  1000  Cash & Bank  (or 2300)       <net paid>
```
`findPostedEntry('hr.payroll', payrollRunId)`.

The advance never touches `5200` on disbursement and never touches it on
recovery. `5200` is debited once, for the gross the person earned. That is the
whole correctness argument, and the acceptance test states it as: *disburse an
advance, run payroll recovering it, and total `5200` equals gross — not gross
plus the advance.*

## Schema — append to `hr.prisma`

```prisma
model SalaryAdvance {
  id         String @id @default(cuid())
  employeeId String
  /// Minor units, as every money column here is. The currency is the brand's
  /// (doc 19's unit carries the brand); a group with two currencies is the
  /// open gap named at the end of this document.
  amount     Int
  currency   String

  status     AdvanceStatus @default(REQUESTED)
  reason     String
  /// How it comes back: a fixed number of instalments from future payroll.
  instalments Int @default(1)
  /// Running balance in minor units. Derived from the recovery rows and
  /// reconciled against account 1300; stored for the list screen only, and
  /// the reconciliation report is the authority, not this column.
  outstanding Int

  requestedAt DateTime @default(now())
  approvedByUserId String?
  countersignedByUserId String?
  approvedAt  DateTime?
  disbursedAt DateTime?
  /// The period the disbursement posted into. Stored so a backdated request
  /// cannot silently re-open a closed period.
  postedPeriodId String?

  employee   Employee @relation(fields: [employeeId], references: [id])
  recoveries AdvanceRecovery[]

  @@index([employeeId, status])
  @@index([status])
}

enum AdvanceStatus { REQUESTED APPROVED REJECTED DISBURSED RECOVERING SETTLED WRITTEN_OFF }

/// One row per instalment actually recovered by a payroll run. The advance's
/// history, and what the 1300 reconciliation reads.
model AdvanceRecovery {
  id           String @id @default(cuid())
  advanceId    String
  payrollRunId String
  amount       Int
  occurredAt   DateTime @default(now())

  advance SalaryAdvance @relation(fields: [advanceId], references: [id])

  @@unique([advanceId, payrollRunId])
  @@index([payrollRunId])
}
```

`@@unique([advanceId, payrollRunId])` is what stops one payroll run recovering
the same instalment twice on a retry — the idempotency that matters most here,
because its failure takes money from someone's pay.

## Who may approve, and how much

Amount bands, a rank per band, and a quorum on the top band — the lens demands
all five, and a policy that cannot express them is not a policy. Bands are rows
in `BrandPolicy` (`organization.prisma:70`), never constants:

| Band | Approver | Quorum |
|---|---|---|
| ≤ one month's salary | the employee's `reportsTo` post | 1 |
| ≤ three months | a post outranking the requester by the policy's gap | 2 (countersigned) |
| above | the finance lead plus one | 2, and never the requester's own chain |

Three refusals, each with a spec: an approver may not approve their own advance;
may not approve outside their subtree; may not approve a band above their rank.

**The roster-of-two problem.** A branch whose entire management is two people
cannot supply a quorum of two that excludes the requester. The catalogue's
ruling 16 applies and is restated here because this is where it bites: *a control
short of people degrades into a named, counted, recorded exception — never into
silence and never into a wall.* The request is not blocked and not auto-approved;
it escalates to the parent unit's post (doc 24) and is recorded as a
`QUORUM_SHORTFALL` exception that the audit report counts.

## Scope lenses

**The actor with three tables** — an employee who is also a contractor is a
`TradingPartner` too; an advance is always against `Employee`, and the
counterparty case is refused rather than guessed.
**The principal with no permission key** — n/a: no non-`User` principal.
**The grant that ends itself** — approval authority comes from the posting and
ends with it (doc 21); an approver mid-decision who leaves releases to the post.
**Whose rows, and which columns** — advances are visible in the caller's subtree
only, and `amount` requires `hr.compensation.view`; a departmental list shows
that an advance exists without showing its size.
**The threshold nobody approves alone** — the table above, plus the same five
for the undo: a write-off needs the band's approver *and* the finance lead, never
the disbursement's approver alone.
**The toxic pair** — `hr.advance.approve` with `hr.payroll.run`: approve it, then
pay it. Refused together. Also `hr.advance.approve` with `hr.people.manage` —
invent an employee and advance them money.
**Authority and blast radius** — who may edit the bands, at which brand; the
worst value is a top band of infinity with quorum 1. The audit row carries the
old and new band table, not a field list.
**Request or record** — REQUEST for approval and disbursement. **RECORD** for a
recovery that payroll already applied: if the run paid out net of an advance, the
recovery happened, and the row is written unconditionally with a variance raised
rather than refused.
**The movement with no address** — the disbursement names the `orgUnitId` it was
paid from and the cash account's location; there is no default location.
**Four hours down** — advances are not requested on the trading path; a
disconnected branch queues the request and approves nothing, because approval
needs the rank data it cannot re-verify offline.
**The unwritten posting rule** — written out in full above: both events, both
Dr/Cr sets, both `findPostedEntry` keys, and the three accounts the chart lacks.
**Every column or none** — every `JournalLine` sets `organizationId`,
`retailBrandId` and `branchNodeId` from the employee's unit at disbursement, and
`costCentreId` from the unit when the unit's type `isOffice`. `counterpartyBrandId`
is null: an employee is not a brand.
**The period that already moved** — a backdated advance into a `CLOSED` or
`LOCKED` `FiscalPeriod` does not post there. It posts to the earliest open period
with its original date preserved on the document, and appears on the
entries-dated-outside-their-period report. `reverseEntry()` resolving the period
from `now` (`accounting.service.ts:112-113`) is the known trap and is the reason
this is stated rather than assumed.
**The second legal entity** — a second brand in a second country needs its own
`1300`/`2300`/`5200` in its own chart and its own numbering counter; the advance
document number uses `JournalEntryNumberCounter`'s existing per-brand key so the
series stays gapless.
**Dry run before live** — `PayrollService.previewRun(period)` computes gross,
recoveries and net over real rows, returns the outcome, holds no `prisma.` write
and no `publish(`, and has a second read-only caller in the reconciliation
report. A payroll that cannot be previewed will be run blind once and then never
trusted.
**Three silhouettes** — Solo: one approver, no bands, no quorum. Chain: bands and
a reporting line. Organization: quorum, shortfall escalation, per-brand accounts.
**The absent collaborator** — with accounting off, advances still record and post
nothing, and the screen says the ledger is not enabled rather than failing boot.
**The second copy of the write** — `findPostedEntry` per event and
`@@unique([advanceId, payrollRunId])` per recovery.
**The hundred-thousandth row** — 100k employees times twelve runs is the payroll
line volume; the run is chunked and each chunk is idempotent, so a failure
resumes rather than restarts.
**The reversal document** — a disbursement is reversed by a credit note-shaped
reversal entry referencing the original line, issuable for part (a partial
repayment in cash) and repeatedly until the advance is settled. Never a status
flag flip.
**The undo fan-out** — cancelling an approved-but-undisbursed advance reverses
nothing (nothing posted); reversing a disbursed one posts a reversal
(automatic), needs the write-off approvers (human, named screen), and leaves the
payroll runs that already recovered against it untouched (irreversible).
**The version stamp** — the advance stores the band table version it was approved
under, so a past approval is explainable from its own fields after the policy
changes.
**The erasure the ledger cannot obey** — `JournalLine` references the employee
through the entry's narration and `contactId`; the ledger cannot lose it. The
employee is pseudonymised (doc 20) and the financial record is retained under
statutory accounting retention — the period is a `BrandPolicy` value because it
differs by country, and it is the one retention figure this set of documents
must not hardcode.
**The failure path** — a failed posting lands in the outbox FAILED state with its
payload after `MAX_ATTEMPTS = 8`; it is listed on the operations screen, opened
with `accounting.manage`, and replayed there — safe because `findPostedEntry`
makes the replay a no-op if it actually succeeded.

## Work orders

**WO-25.1 — three accounts** added to `CHART_OF_ACCOUNTS`, with the migration
that seeds them into existing deployments.
**WO-25.2 — `SalaryAdvance` and `AdvanceRecovery`** schema.
**WO-25.3 — approval bands** in `BrandPolicy`, the three refusals, the
`QUORUM_SHORTFALL` exception and its escalation to doc 24.
**WO-25.4 — posting subscribers** for both events, each with its
`findPostedEntry` key and a spec proving double-delivery posts once.
**WO-25.5 — `previewRun()`**, pure, and the `1300` reconciliation report.
**WO-25.6 — permissions**: `hr.advance.request` (low), `hr.advance.approve`
(high), `hr.compensation.view` (high), `hr.payroll.run` (high).
**WO-25.7 — UI**: request, approval queue, advance detail with recovery history,
reconciliation report. Nav entry under the finance group.

## Acceptance

- Disburse 50,000 and recover it fully across two runs: total `5200` equals gross
  only, and account `1300` returns to zero. This is the test that catches the
  double-expense defect.
- `1300`'s balance equals the sum of `outstanding` across open advances, proven
  by the reconciliation report on seeded data.
- A redelivered `hr.advance_disbursed` posts exactly one entry.
- A payroll run retried mid-failure recovers each instalment once.
- An approver cannot approve their own advance, one outside their subtree, or one
  above their band — three specs.
- A two-person branch produces a counted `QUORUM_SHORTFALL`, not a block and not
  a silent approval.
- A backdated advance into a closed period posts to the earliest open period and
  appears on the outside-period report.

## Out of scope, and the gap this leaves open

Full payroll — gross-to-net, tax withholding, statutory deductions, payslips — is
**not** this document. It is named as its own work order and must not be stubbed:
this document defines only the advance and the two posting rules payroll must
honour when it arrives.

One gap is left deliberately open and recorded rather than hidden: **an advance
in a currency other than the brand's.** `JournalLine` sums minor units without
conversion and there is no `FxRate` table anywhere in this repository. A group
paying an employee in a second currency cannot be served by this design, and the
document says so instead of implying otherwise.
