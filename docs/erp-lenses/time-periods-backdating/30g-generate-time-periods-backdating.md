# 30g generate time periods backdating

Output of the `gen:30:time-periods-backdating` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Time: fiscal periods, shifts, timezones and backdating

## File

docs/erp-lenses/time-periods-backdating/30-time-periods-backdating.md

## Lenses

### One clock, a hundred branches

**Question:** Name the field that holds a specific Location's own timezone, and identify each place — SHOP_TIME_ZONE, resolveOpenPeriod, the store.timezone Setting — that this feature would otherwise use to decide "today" for a location in a different zone.

**Grounding:** packages/shared/src/constants.ts:76 (SHOP_TIME_ZONE = BRAND.locale.timeZone, one compile-time constant), core.prisma:153 (Setting has no location/branch column), inventory.prisma:76 (Location has no timezone field)

### The calendar every brand shares

**Question:** Name the column that would let one RetailBrand's fiscal period close while another RetailBrand's stays open, and which posting-rule subscriber would need to resolve its period through it instead of resolveOpenPeriod()'s deployment-wide lookup.

**Grounding:** accounting.prisma:91-108 (FiscalPeriod has only fiscalYearId, unique on [fiscalYearId, name]), fiscal-periods.service.ts:89,109 (closePeriod/lockPeriod take only an id), organization.prisma:40 (RetailBrand rows)

### The day with no name

**Question:** Name the model or field that represents one Location's business day as a closeable unit, distinct from the monthly FiscalPeriod and a single PosShift's open/close window, and state which day a shift straddling midnight belongs to.

**Grounding:** accounting.prisma:94-95 (FiscalPeriod.name is monthly, e.g. "2026-01"), pos.prisma:65-85 (PosShift has openedAt/closedAt and terminalId, no locationId, no day-level link); grep for BusinessDay/DayClose returns nothing in the schema

## Absences

- No per-Location timezone field anywhere (Location, RetailBrand, Node all lack one); SHOP_TIME_ZONE and the store.timezone Setting are each a single deployment-wide value
- No brand-scoped or org-scoped column on FiscalPeriod/FiscalYear — one shared calendar for every RetailBrand
- No BusinessDay/DayClose model or field — nothing sits between a single PosShift and a calendar-month FiscalPeriod
- No expiresAt or dated-authority field on any grant (AdminScope, RoleGrant, UserPermission) that could bound how far back an actor may backdate a fact

