# 48. Group currency translation for consolidated reporting

Lens 08 already forces a second `RetailBrand` to carry its own tax label,
number and currency. The day that ships, `ConsolidationService` inherits a
problem it was never built for: its P&L nets `JournalLine` rows across brands
by summing `debitMinor`/`creditMinor` raw, on the documented assumption that
those columns are "ALWAYS" one deployment's base currency. Two functional
currencies sitting side by side breaks that assumption silently — no lens
names the group's own presentation currency, how flow and stock accounts each
translate, or where the resulting imbalance goes.

## Lens: The group presentation currency is not any brand's functional currency

**Question:** When a UAE `RetailBrand` posts in AED and the Pakistani parent
posts in PKR (lens 08's own worked example), name the field or table holding
the *group's* presentation currency — the one `ConsolidationService.groupProfitAndLoss()`
and `GlReportsService`'s reports render in — and show it is not simply
`BRAND.locale.currency`, which is one deployment's own compile-time constant.
**Why:** `packages/shared/src/brand.ts:105` sets `currency: 'PKR'` once, for
the whole deployment. `JournalLine.baseAmountMinor` (`accounting.prisma:169-183`)
is documented as "ALWAYS posted in the deployment's own base currency" — a
single currency, by the schema's own words. `ConsolidationService.rawTotals()`
(`consolidation.service.ts:69-94`) does `journalLine.groupBy({ by: ['accountId'] }, _sum: { debitMinor, creditMinor })`
with no currency or `retailBrandId` split at all — it trusts every row already
shares one unit. Lens 08 gives a brand its own currency; nothing gives the
*org* one to report in once brands disagree.
**Worked example:** Narrow slice: lens 08 ships, the UAE brand posts
`baseAmountMinor` in AED, the Pakistani brand in PKR, and `groupProfitAndLoss()`
keeps summing both raw. Complete capability: a `groupPresentationCurrency`
resolved from the `Organization` row (`organization.prisma:15`, which today
has no currency field), every brand's totals translated into it before
`rawTotals()` sums them, and the group P&L states which currency its own
numbers are in.
**Done test:** `grep -n "currency" apps/api/prisma/schema/organization.prisma`
returns nothing today (verified: `Organization` has `id`, `name`,
`allowInterBrandTransfers`, timestamps only). The PR must add a currency field
reachable from `Organization` and a translation step inside
`ConsolidationService` between `rawTotals()`'s per-brand figures and the
values it returns.
**Breaks without:** `groupProfitAndLoss()` adds AED minor units to PKR minor
units as if both were the same currency — the group net income figure is
numerically wrong, with the balance-trigger-verified, per-entry-correct
`JournalLine` rows underneath it giving a reviewer no reason to doubt it.

## Lens: One rate model cannot serve both a flow account and a stock account

**Question:** For the same UAE brand's month-end consolidation, name the rate
source and effective date `groupProfitAndLoss()` (a flow statement) would use
versus the one `GlReportsService.balanceSheet()` (a stock statement) would
use, and show why `JournalLine.fxRateScaled` — one rate per line, snapshotted
once — cannot supply either.
**Why:** R16 (`RETAIL-ERP.md:444-459`) defines exactly one FX moment: a
document's own rate, "snapshotted onto the document at transaction time and
never re-derived" (House Rule 7). `JournalLine.fxRateScaled`
(`accounting.prisma:177-180`) is that same one-rate-per-line design, and no
`FxRate` table exists anywhere in the schema. Group translation needs two
*different* rates applied *after* the fact — a period-average rate across every
income/expense line `rawTotals()` already sums, and a single period-end spot
rate for whatever balance-sheet accounts exist — neither of which is "the
rate this line posted at."
**Worked example:** Narrow slice: reuse `convertToBase()`
(`packages/shared/src/pricing.ts:260`) with the UAE brand's latest
`fxRateScaled` to translate its whole trial balance. Complete capability: a
rate source keyed by `(currency, effectiveDate)`, an average-rate query over
`[from, to]` feeding `groupProfitAndLoss()`, and a separate closing-rate
lookup feeding `balanceSheet()`, with both dates and both resolved rates
recorded on the consolidation run itself.
**Done test:** `grep -rn "model FxRate\|averageRate\|closingRate" apps/api/prisma/schema/*.prisma`
returns nothing today. The PR must add the rate table and two distinct query
paths — one by date range, one by a single as-of date — not a single
`fxRateScaled` reused for both.
**Breaks without:** A UAE brand's revenue, earned evenly across the month,
gets valued at whatever single rate happened to sit on its last posted
`JournalLine` instead of the period's average, while its month-end payables
get valued at a stale mid-month rate instead of the closing spot rate — both
wrong, and in ways that will not visibly disagree with each other.

## Lens: The plug the balance trigger will not let through unnamed

**Question:** Name the equity account that would absorb the cumulative
translation adjustment (CTA) when a second-currency brand's balance sheet,
translated at closing spot for assets/liabilities and historical rate for
equity, does not net to zero — and show which of the thirteen seeded accounts
holds it today.
**Why:** `CHART_OF_ACCOUNTS` (`chart-of-accounts.ts:20-33`) seeds exactly one
`EQUITY` account, `3000 Retained Earnings`, used only by
`closeFiscalYear()`'s income-statement sweep — no CTA or other-comprehensive-
income account exists. The `journal_line_balance_check` constraint trigger
(`migration.sql:212-216`, deferred to end-of-transaction) refuses any entry
whose debits and credits do not net to zero, per entry, permanently — so a
translation adjustment with nowhere to post is not a rounding error a report
can shrug off, it is an entry the database will not accept at all.
**Worked example:** Narrow slice: translate the UAE brand's balance sheet at
one blended rate and hope it happens to balance. Complete capability: a
`4-Cumulative Translation Adjustment` equity account seeded alongside `3000`,
and a consolidation posting that books the imbalance from mixed-rate
translation to it explicitly, so `journal_line_balance_check` sees a
zero-sum entry.
**Done test:** `grep -n "CTA\|Translation Adjustment" apps/api/src/modules/money/accounting/chart-of-accounts.ts`
returns nothing today. The PR must add the account and a named posting path
(distinct from the seven existing posting rules) that writes to it.
**Breaks without:** The first time a translated balance sheet does not net to
zero, either the deferred trigger rejects the whole consolidation posting at
commit with no account to redirect the difference to, or — if consolidation
is done outside `AccountingService.postEntry()` entirely, as it is today,
read-only — the group balance sheet is published still out of balance, with
no line item showing why.

## Not modelled yet

- A group presentation currency distinct from any single brand's functional
  currency — `Organization` has no currency field, and `ConsolidationService`
  sums `baseAmountMinor` across brands with no per-brand currency awareness.
- Any `FxRate` table or rate source keyed by `(currency, date)` — R16's only
  rate is a document's own transaction-time snapshot; there is no
  period-average or period-end closing rate anywhere.
- A cumulative translation adjustment (or other comprehensive income) equity
  account — the seeded chart has exactly one `EQUITY` account, `3000
  Retained Earnings`, with no second account for a translation plug.

## Hardening record

**Kept (3):**

- *The group presentation currency is not any brand's functional currency* —
  cites `Organization` (`organization.prisma:15`, verified: `id`, `name`,
  `allowInterBrandTransfers`, timestamps, no currency field),
  `packages/shared/src/brand.ts:105` (`currency: 'PKR'`), and
  `ConsolidationService.rawTotals()` (`consolidation.service.ts:69-93`,
  verified: `groupBy({ by: ['accountId'] })` against `JournalLine`, no
  `retailBrandId` or currency split anywhere in the query or the loop below
  it). Distinct from the existing "Whose rows" lens (reporting scope by
  actor/tenant) — this is about a report's own *unit*, not who may see it.
- *One rate model cannot serve both a flow account and a stock account* —
  cites RETAIL-ERP.md R16 (`:444-459`, verified: "snapshotted onto the
  document at transaction time and never re-derived"),
  `JournalLine.fxRateScaled` (`accounting.prisma:180`, one rate per line),
  `convertToBase()` (`pricing.ts:260`, verified exists), and confirmed no
  `FxRate`/`averageRate`/`closingRate` model exists anywhere under
  `apps/api/prisma/schema`. Also confirmed `GlReportsService.balanceSheet()`
  exists at `gl-reports.service.ts:146`, so the flow-vs-stock method pairing
  in the question is real, not invented. Distinct from "The version stamp"
  (policy-rule versioning over time) — this is two rates needed
  *simultaneously* for one consolidation run, not one rule's history.
- *The plug the balance trigger will not let through unnamed* — cites
  `CHART_OF_ACCOUNTS` (`chart-of-accounts.ts:25`, verified: exactly one
  `EQUITY` row, `3000 Retained Earnings`) and the deferred constraint trigger
  `journal_line_balance_check`
  (`migrations/20260917070552_add_accounting_ledger/migration.sql:212-215`,
  verified: `CREATE CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED`).
  Distinct from "Row 4312 authority" (bulk-op per-row authority) and "The
  hundred-thousandth row" (volume) — this is about a specific missing ledger
  account, not row count or actor authority.

**Killed:** none. All three questions demand a named artifact (a field, a
table, an account code), each worked example is this repo's own entities
(`ConsolidationService`, `GlReportsService`, `CHART_OF_ACCOUNTS`), and each
done test is a `grep` verified above to return nothing today — none is
generic advice, a restatement, or a coding standard.

**Citations corrected:** none. Every path, line range, model name, method
name and constant checked below resolved exactly as the file claimed:
`brand.ts:105`, `accounting.prisma:169-183`, `consolidation.service.ts:69-94`,
`organization.prisma:15`, RETAIL-ERP.md R16 (`:444-459`), `pricing.ts:260`,
`chart-of-accounts.ts:20-33`, `migration.sql:212-216`,
`gl-reports.service.ts:146` (`balanceSheet`), and the absence of any
`currency` field on `Organization` and any `FxRate`-shaped model anywhere in
`apps/api/prisma/schema`.
