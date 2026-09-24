# 48h harden gap

Output of the `harden:gap:48` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Group currency translation for consolidated reporting

## File

docs/erp-lenses/gap-48/48-gap-group-currency-translation-for-consolida.md

## Kept

### The group presentation currency is not any brand's functional currency

**Question:** Name the field/table holding the group's presentation currency that ConsolidationService.groupProfitAndLoss() and GlReportsService's reports render in, and show it is not BRAND.locale.currency.

**Citations:** organization.prisma:15 (Organization has no currency field, verified), brand.ts:105 (single deployment currency), consolidation.service.ts:69-93 (rawTotals groupBy with no currency/brand split, verified)

**Strength:** strong

### One rate model cannot serve both a flow account and a stock account

**Question:** Name the rate source/effective date groupProfitAndLoss() (flow) vs balanceSheet() (stock) would each use, and show why JournalLine.fxRateScaled cannot supply either.

**Citations:** RETAIL-ERP.md R16 :444-459 (verified), accounting.prisma:180 (fxRateScaled one rate per line), pricing.ts:260 (convertToBase exists), gl-reports.service.ts:146 (balanceSheet exists), no FxRate model anywhere (verified)

**Strength:** strong

### The plug the balance trigger will not let through unnamed

**Question:** Name the equity account absorbing the cumulative translation adjustment and show which of the 13 seeded accounts holds it today.

**Citations:** chart-of-accounts.ts:25 (only 3000 Retained Earnings, verified), migration.sql:212-215 (deferred constraint trigger journal_line_balance_check, verified)

**Strength:** strong

## Killed

## Corrections

## Absences

- No lens killed — all three citations verified exactly as claimed against organization.prisma, brand.ts, accounting.prisma, consolidation.service.ts, RETAIL-ERP.md, pricing.ts, chart-of-accounts.ts, and the migration.sql trigger.

