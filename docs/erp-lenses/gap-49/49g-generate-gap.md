# 49g generate gap

Output of the `gen:gap:49` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Financial close as a managed process, not a status flip

## File

docs/erp-lenses/gap-49/49-gap-financial-close-as-a-managed-process-not.md

## Lenses

### The lock with no checklist

**Question:** Before FiscalPeriodsService.lockPeriod() is allowed to run, what is the row — task name, the branch or department it belongs to, a completedAt/completedByUserId pair — that a close-task list must show as all-complete, and where does lockPeriod() or closePeriod() query it?

**Grounding:** apps/api/src/modules/accounting/fiscal-periods.service.ts closePeriod() (line 89) and lockPeriod() (line 109) check only FiscalPeriod.status transitions and nothing else; no Task/CloseTask/Checklist model exists in apps/api/prisma/schema/*.prisma.

### One lock, every brand at once

**Question:** Which column would let RetailBrand X's period be reconciled and locked on its own close calendar while RetailBrand Y, in another timezone with a different close cadence, stays OPEN — and until that column exists, what does calling lockPeriod() on the single FiscalPeriod row actually close?

**Grounding:** accounting.prisma:91-106 FiscalPeriod has fiscalYearId/startsOn/endsOn/status only, no retailBrandId or branchNodeId; AccountingService.resolveOpenPeriod() resolves one deployment-wide OPEN period.

### The task that cites no row

**Question:** For a close-task like 'branch cash reconciled', which row does marking it complete point to as evidence — a specific PosShift.id with overShortMinor resolved to zero, or a StockCount.id for that location — and given today's schema, what could that task actually cite per branch?

**Grounding:** inventory.prisma:191-212 StockCount has no locationId (deployment-wide count); PosShiftsService's own doc states its X/Z report is cash-movements only; ConsolidationService.unmatchedIntercompany() (consolidation.service.ts:63) is a read-only report nothing calls before lock.

## Absences

- A CloseTask/checklist model gating lockPeriod()/closePeriod() on completed reconciliation tasks per branch or department
- A scope column (retailBrandId/branchNodeId) on FiscalPeriod so a group with several brands can close them on different calendars instead of one global period
- An evidence linkage from a close-task's completion to a real PosShift or location-scoped StockCount row (StockCount also lacks a locationId to serve as that evidence)
- A per-brand close calendar/cadence field on RetailBrand

