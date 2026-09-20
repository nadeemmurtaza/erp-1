# 30h. Hardening record: Time: fiscal periods, shifts, timezones and backdating

Adversarial review of [30-time-periods-backdating.md](30-time-periods-backdating.md) by the `harden:30:time-periods-backdating` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### One clock, a hundred branches  — strong

**Question:** Name the field that holds a specific Location's own timezone, and identify each place that would otherwise use SHOP_TIME_ZONE/store.timezone to decide "today".

**Verified against:** SHOP_TIME_ZONE (packages/shared/src/constants.ts:76) verified as BRAND.locale.timeZone; Setting (core.prisma:153-158) verified as key/value with no location column; Location (inventory.prisma:76) verified to have no timezone field.

### The calendar every brand shares  — strong

**Question:** Name the column that would let one RetailBrand's fiscal period close while another's stays open, distinct from the JournalLine-dimensioning lens already in 07-money-integrity-gl.md.

**Verified against:** FiscalPeriod (accounting.prisma:91-108) verified to carry only fiscalYearId/name, unique on [fiscalYearId, name], no brand/org column; FiscalPeriodsService.closePeriod/lockPeriod (fiscal-periods.service.ts:89,109) verified to take only id.

### The day with no name  — solid

**Question:** Name the model or field for a Location's closeable business day, distinct from monthly FiscalPeriod and a single PosShift's window.

**Verified against:** PosShift (pos.prisma:65-80) verified to have openedAt/closedAt, terminalId, no locationId or day-level link; grep for model.*Day across pos.prisma/accounting.prisma returns nothing.

## Killed (0)

_Nothing was killed._


## Citations corrected (1)

- None required — all citations (SHOP_TIME_ZONE, Setting, Location, FiscalPeriod, FiscalPeriodsService.closePeriod/lockPeriod, RetailBrand, PosShift, the seven posting-rule subscribers, accounting.manage_periods permission) were verified against the current repo and matched exactly as written.
