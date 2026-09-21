# 48g generate gap

Output of the `gen:gap:48` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Group currency translation for consolidated reporting

## File

docs/erp-lenses/48-gap-group-currency-translation-for-consolida.md

## Lenses

### The group presentation currency is not any brand's functional currency

**Question:** When a UAE RetailBrand posts in AED and the Pakistani parent posts in PKR, name the field or table holding the group's presentation currency that groupProfitAndLoss() and GlReportsService's reports render in, and show it is not simply BRAND.locale.currency.

**Grounding:** packages/shared/src/brand.ts:105 (currency: 'PKR' compile-time constant), accounting.prisma:169 (baseAmountMinor documented ALWAYS in deployment base currency), consolidation.service.ts rawTotals() ~L69-94 (journalLine.groupBy by accountId only, no currency/retailBrandId split), organization.prisma (Organization has no currency field, confirmed by grep)

### One rate model cannot serve both a flow account and a stock account

**Question:** For the same UAE brand's month-end consolidation, name the rate source and effective date groupProfitAndLoss() (a flow statement) would use versus GlReportsService.balanceSheet() (a stock statement), and show why JournalLine.fxRateScaled cannot supply either.

**Grounding:** accounting.prisma:177-180 (fxRateScaled, one rate per line, default 1000000), R16/House Rule 7 (rate snapshotted once, never re-derived), no FxRate table anywhere in schema, pricing.ts:260 convertToBase()

### The plug the balance trigger will not let through unnamed

**Question:** Name the equity account that would absorb the cumulative translation adjustment when a second-currency brand's translated balance sheet does not net to zero, and show which of the thirteen seeded accounts holds it today.

**Grounding:** chart-of-accounts.ts:25 (only one EQUITY account, 3000 Retained Earnings, confirmed by grep), migration.sql journal_line_balance_check deferred constraint trigger (verified cited elsewhere in ground truth), closeFiscalYear() as 3000's only user

## Absences

- A group presentation currency distinct from any single brand's functional currency - Organization has no currency field, and ConsolidationService sums baseAmountMinor across brands with no per-brand currency awareness
- Any FxRate table or rate source keyed by (currency, date) - R16's only rate is a document's own transaction-time snapshot; there is no period-average or period-end closing rate anywhere
- A cumulative translation adjustment (or other comprehensive income) equity account - the seeded chart has exactly one EQUITY account, 3000 Retained Earnings, with no second account for a translation plug

