# Gap analysis: Bank Facility Management

> **Superseded (2026-09-27): built as
> [`167-bank-facility-management.md`](./167-bank-facility-management.md).**
> Every question this gap report named — the actor, the facility itself,
> drawdown/repayment, markup accrual, utilization/limit-breach alerts,
> renewal tracking, reporting — is answered and built there. This report
> is kept as the historical record of the gap as it stood before doc 167;
> read doc 167 for the current, built mechanism.

**What this is.** A roadmap reference, not a work order: this capability
does not exist at all in this repository, and this document records why,
what it would need to answer, and where it would sit — so a future scoping
pass starts from an inventory instead of a blank page. Nothing here is
built, scheduled, or scoped as a numbered work order; that happens when
someone actually picks this up, per `CLAUDE.md`'s own "Feature scope:
build the whole capability" discipline and this domain folder's own
numbered-document convention.

Confirmed, by direct search of the schema and code (2026-09-26): **nothing
in this category exists in this repository.** No model, service,
controller, permission, or UI references any of the following, under any
name:

- Bank loan / financing facility (term loan, running finance, demand
  finance)
- Overdraft facility and its running limit/utilization
- Letter of credit (import or export) as a treasury facility — distinct
  from the "Customer L/C" / "Vendor L/C" sales/purchase-side gap already
  noted in `GAP-ANALYSIS-ERP-FEATURE-COMPARISON.md`, this is the *bank's
  own facility limit* the LCs draw against
- Bank guarantee
- Facility limit, drawdown, markup/interest accrual, or repayment schedule
- Covenant tracking or facility renewal/expiry alerts

This is a genuinely separate capability from what exists today:

- `receivables` (doc 145, built) tracks **customer** credit — money the
  business is owed. Bank Facility Management is the mirror concern for
  the business's own **borrowing** — money the business owes a bank
  against a facility limit — and needs its own actor (`Bank`, not
  `Contact`), its own ledger postings (interest expense, principal
  repayment), and its own limit/utilization tracking.
- `accounting`'s `Account`/`JournalEntry`/`JournalLine` (chart of
  accounts, GL) is the correct posting target once a facility mechanism
  exists — a bank loan disbursement and its repayments are ordinary GL
  facts — but nothing today models the facility itself: its limit, its
  markup rate, its drawdown/repayment schedule, or its utilization.
- `AssetDepreciationSchedule`/`AssetDepreciationPosting` (Fixed Assets,
  built) is the closest existing *shape* to copy — a schedule row plus a
  posting-per-period row — but it is not reusable as-is: a facility needs
  drawdowns and repayments in both directions, a running utilized-vs-limit
  balance, and markup accrual, none of which depreciation's one-directional
  schedule models.

## What a real build would need to answer

Not scoped here — this is a gap report, not a design:

1. **The actor** — a `Bank`/`BankFacility` model, not a `Contact`/`Party`
   (a bank is a financial institution the business borrows from, not a
   customer or supplier).
2. **The facility itself** — limit, markup/interest rate (fixed or
   floating), tenor, currency, security/collateral reference, start and
   maturity dates.
3. **Drawdown and repayment** — each a REQUEST/RECORD pair like every
   other money-moving mechanism in this codebase (this repo's own
   "Request or record" scope lens): a drawdown increases utilization and
   posts a GL entry; a repayment decreases it and posts the reverse.
4. **Markup accrual** — a scheduled job (like `AssetDepreciationCron`)
   posting periodic interest expense against the outstanding balance.
5. **Utilization and limit-breach alerts** — a running balance versus the
   facility's own limit, surfaced before an over-limit drawdown is allowed
   to post, not discovered after the fact.
6. **Renewal/covenant tracking** — an expiry date and a named screen that
   surfaces an approaching renewal, the same "don't let a real deadline
   silently pass" discipline this codebase already applies elsewhere
   (subscription renewals, API key expiry).
7. **Reporting** — a facility-wise utilization report and a consolidated
   "total borrowing across all facilities" figure, since a business
   commonly holds more than one facility across more than one bank.

None of this exists today, at any level — schema, service, or UI. It would
be a new, real module (likely `finance` or a new `treasury`/`banking`
module), not an extension of anything currently built.
