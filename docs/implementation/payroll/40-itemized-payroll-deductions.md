# 40 — Itemized statutory deductions on the pay run

`payroll.prisma`'s own comment on `PayRunLine.deductions` already names this
document's job: "not its own table yet... because no jurisdiction-specific
rule has been requested — a JSON line-item bag is honest about that, a
hardcoded tax bracket would not be." A request now exists. This document
promotes that JSON bag into a real, itemized model, the same way doc
15/15.6 promoted tax from "a rate exists" to a fiscal-authority integration
once the requirement was real, and for the identical reason: **do not
guess the jurisdiction's actual withholding rules; build the structure that
makes filling them in later a data problem, not a schema migration.**

**Advance-salary recovery is not part of this document.** It already has
its own real model (`AdvanceRecovery`, doc 25) and its own posting rule
against account `1300`. Folding it into a generic "deductions" bag would
undo doc 25's own central argument — an advance is an asset recovered, not
an expense — so `PayRunLine.deductionsMinor` continues to exclude advance
recoveries entirely; a pay-run line shows both figures side by side, never
summed into one number that hides which is which.

## 1. A deduction type is a row, not a hardcoded tax bracket

```prisma
// payroll.prisma — additive

enum DeductionCategory {
  STATUTORY_TAX
  INSURANCE_PREMIUM
  PENALTY
  OTHER
}

/// Rows, not an enum of amounts — the same reasoning LeaveType/Rank already
/// use in this document set: one jurisdiction's tax withholding table has
/// nothing in common with another's, and a client's own insurance premium
/// schedule is theirs to define, not this codebase's to assume.
model DeductionType {
  id             String            @id @default(cuid())
  organizationId String
  key            String            /// "income-tax", "health-insurance", "late-attendance-penalty"
  label          String
  category       DeductionCategory
  isActive       Boolean           @default(true)

  lineItems PayRunLineDeduction[]

  @@unique([organizationId, key])
}

/// One row per deduction actually applied to one pay-run line — what turns
/// PayRunLine.deductions from an opaque JSON total into a real, queryable,
/// auditable breakdown.
model PayRunLineDeduction {
  id              String @id @default(cuid())
  payRunLineId    String
  deductionTypeId String
  amountMinor     Int
  /// Free text for the one case a fixed schema can't express — "3 days'
  /// late arrival at Rs 500/day" — never required, never load-bearing.
  note            String?

  payRunLine    PayRunLine    @relation(fields: [payRunLineId], references: [id], onDelete: Cascade)
  deductionType DeductionType @relation(fields: [deductionTypeId], references: [id])

  @@index([payRunLineId])
  @@index([deductionTypeId])
}
```

`PayRunLine.deductionsMinor` stays exactly as it is — the sum
`PayRunLineDeduction` rows must equal, enforced the same predicate-on-write
way every other derived total in this repository is (House Rule 10), never
trusted to two independently-maintained numbers agreeing by convention.
`PayRunLine.deductions: Json` is removed once every write path produces
`PayRunLineDeduction` rows instead — a real migration with a backfill, not
a column left to rot unused beside its replacement.

## 2. A penalty is a request; a statutory tax and an insurance premium are policy, applied automatically

Not every deduction category enters a pay run the same way:

- **`STATUTORY_TAX`** is computed by a jurisdiction-specific
  `TaxWithholdingProvider` (the same extension-point shape `PaymentProvider`
  already uses) from the employee's `CompensationRate` and whatever bracket
  table the actual jurisdiction requires — deliberately not specified here
  for the same reason doc 15's FBR fields are not: get the real withholding
  rules from a tax accountant or the authority's own tables before writing
  one, never from a guess. With no provider registered, `STATUTORY_TAX`
  lines are simply never generated — the pay run still runs, net of every
  other deduction, and the missing line is visible on the preview rather
  than silently assumed to be zero forever.
- **`INSURANCE_PREMIUM`** is a recurring, policy-driven amount per employee
  (a `CompensationRate`-adjacent setting, not computed fresh each run) —
  applied automatically every pay run it is active for, the same way
  `LeaveAccrualRun` applies leave accrual automatically.
- **`PENALTY`** is the one category a human enters deliberately, against a
  specific pay run, with a reason — never automatic, because an automatic
  penalty is exactly the kind of silent, undiscoverable deduction an
  employee has every right to dispute before it reaches their pay.

## Scope lenses

**The actor with three tables** — n/a: every deduction is against the
existing `User`/`PayRunLine`, no new actor.
**The principal with no permission key** — n/a.
**The grant that ends itself** — n/a.
**Whose rows, and which columns** — a `PayRunLineDeduction` is visible to
the employee it belongs to and to `hr.compensation.view`, exactly the
existing visibility boundary doc 19/25 already draw around pay figures;
`note` on a `PENALTY` line is visible to the same audience, never a wider
one, since it may describe a disciplinary matter.
**The threshold nobody approves alone** — a manually-entered `PENALTY`
above a configured amount needs a second approver, mirroring doc 25's own
advance-approval bands, since a punitive deduction is exactly the kind of
act that needs a check before it reaches someone's net pay.
**The toxic pair** — `hr.payroll.deduction.manage` (who can add a penalty
line) with `hr.payroll.run` (who can post the run it lands in): the same
person adding a penalty and then running the pay run that applies it is
refused together, the identical shape doc 25 already draws around
`hr.advance.approve`/`hr.payroll.run`.
**Authority and blast radius** — who may define a `DeductionType` (HR/
finance admin, org-wide) versus who may apply a `PENALTY` line to a
specific run (a manager, within their subtree); the worst value is a
`STATUTORY_TAX`-category type manually misapplied as a `PENALTY` — the
category is fixed at creation and never editable per-application, so a
type cannot silently change what kind of deduction it represents run to
run.
**Audience is a capability, not an address** — n/a beyond the existing
pay-slip visibility every payroll document already scopes.
**Request or record** — a `PENALTY` line is a REQUEST (needs the threshold
approval above before the run can move past `DRAFT`); a `STATUTORY_TAX`/
`INSURANCE_PREMIUM` line, once the run is `POSTED`, is a RECORD of what was
actually withheld — a later correction to the tax table never rewrites a
posted line, it only changes the next run's computation.
**The movement with no address** — n/a: no stock or cash movement beyond
what the pay run itself already posts.
**Four hours down** — n/a: payroll deductions are computed at run-build
time, not on a trading path with an offline mode of its own.
**Click the number** — a pay-slip's total deductions figure links to the
exact `PayRunLineDeduction` rows summed into it, each naming its
`DeductionType` — the direct fix for the JSON bag's own opacity, which is
this document's whole reason to exist.
**The unwritten posting rule** — unchanged from doc 19/25:
`deductionsMinor` still feeds `hr.payroll_run_posted`'s existing Dr `5200`/
Cr split exactly as today; this document adds detail underneath an
already-correct total, it does not change what posts.
**Every column or none / The period that already moved** — unchanged,
inherited from doc 19's own posting rule.
**The second legal entity** — `DeductionType` scoped per `organizationId`;
a second legal entity's tax/insurance categories are its own rows, never
shared.
**Dry run before live** — `PayrollService.previewRun()` (doc 25's own
pure function) is extended to include the itemized `PayRunLineDeduction`
breakdown in its output, not just the total — one implementation, the same
preview and live paths both already share.
**Three silhouettes** — Solo: perhaps one `INSURANCE_PREMIUM` type, no
`STATUTORY_TAX` provider configured, deductions rarely itemized beyond
unpaid leave. Chain: a jurisdiction's real tax provider wired in, penalty
lines a real operational tool. Organization: multiple `DeductionType`
catalogues if brands span jurisdictions, each with its own provider.
**The absent collaborator** — with no `TaxWithholdingProvider` registered,
`STATUTORY_TAX` lines are simply never generated (named in §2); with
`accounting` off, deductions still compute and appear on the pay slip,
they just post nothing, exactly as every other payroll figure already
degrades.
**The second copy of the write** — a re-run of the same pay-run build
(idempotent, doc 19's own guarantee) regenerates the same
`PayRunLineDeduction` set rather than appending a second copy — enforced
by deleting and rebuilding a `DRAFT` run's deduction rows atomically, never
accumulating.
**The hundred-thousandth row** — deduction rows scale with pay-run lines ×
active deduction types; bounded by `[payRunLineId]` and cascade-deleted
with their line, so retention follows `PayRunLine`'s own policy rather than
inventing a second one.
**The reversal document** — a wrongly-applied `PENALTY` on a still-`DRAFT`
run is simply deleted (nothing posted yet); on a `POSTED` run it is
reversed through doc 19's existing `PayRunAdjustment` path, never an
in-place edit of a posted line.
**The undo fan-out** — removing a `DeductionType` does not retroactively
alter `PayRunLineDeduction` rows already posted under it (deliberately
irreversible — those are historical fact); it only stops the type being
selectable on future runs (`isActive: false`, automatic).
**The version stamp** — a `PayRunLineDeduction` stores the amount actually
applied, never a live reference to a rate that could change; a later edit
to an insurance premium's amount affects only future runs.
**The erasure the ledger cannot obey** — `PayRunLineDeduction.note`
survives an employee's erasure under the same statutory payroll-record
retention basis doc 20/25 already state, pseudonymised where the note
itself names the person redundantly.
**The failure path** — a `TaxWithholdingProvider` call that fails during
run preview surfaces on the preview screen as "tax not computed, provider
error" rather than silently zeroing the line — the same non-silent-failure
discipline `09-ai-layer.md`'s own AI-call rule already requires, applied
here to a payroll computation instead of a generated draft.

## Work orders

**WO-40.1 — schema**: `DeductionCategory`, `DeductionType`,
`PayRunLineDeduction`; migration removing `PayRunLine.deductions: Json`
once every write path is moved over, with a backfill converting existing
JSON bags into rows under an `OTHER`-category type.
**WO-40.2 — `TaxWithholdingProvider` interface**, no implementation shipped
until real jurisdiction rules are confirmed (per §2's own caution).
**WO-40.3 — `PayRunService` changes**: build itemized deduction rows
instead of a JSON bag; `previewRun()` returns the itemized breakdown.
**WO-40.4 — penalty entry flow**: manual `PENALTY` line with the
value-threshold second-approval gate.
**WO-40.5 — permissions**: `hr.payroll.deduction.manage`,
`hr.payroll.deduction.approve` (the threshold), reusing existing
`hr.compensation.view` for visibility.
**WO-40.6 — UI**: pay-slip itemized breakdown (replacing the current
single "deductions" total), penalty entry screen, deduction-type catalogue
admin.

## Acceptance

- The sum of a `PayRunLine`'s `PayRunLineDeduction` rows equals its
  `deductionsMinor`, proven under a concurrent-build race the same way
  every other derived total in this repository is.
- A `PENALTY` above the value threshold cannot be applied without a second
  approver; the same person cannot add it and then run the pay run.
- Re-building a `DRAFT` run regenerates its deduction rows without
  duplication.
- With no `TaxWithholdingProvider` registered, a pay run still completes,
  with `STATUTORY_TAX` simply absent from the breakdown, never a crash.
- A pay-slip's total deductions figure drills down to the exact rows that
  produced it.

## Out of scope

Any specific jurisdiction's actual tax brackets, insurance-scheme rules or
statutory rates — named exactly like doc 15's own FBR caution, and for the
identical reason: guessed compliance content is worse than none. Multi-
currency deductions — inherits doc 25's own named, open gap on FX. A
self-service employee portal for disputing a penalty — the pay slip shows
the itemized line and its reason; a formal dispute workflow is a real,
separate feature this document does not assume.
