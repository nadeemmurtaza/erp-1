# 40h harden gap

Output of the `harden:gap:40` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

ESG — the file's title promises it, the content never delivers it

## File

docs/erp-lenses/gap-40/40-gap-esg-the-file-s-title-promises-it-the-con.md

## Kept

### The metric with nowhere to live

**Question:** For one disclosed ESG metric at one Location for one period, what table/column holds the raw reading at capture time?

**Strength:** strong

**Citations:** Verified: grep for emission|carbon|sustainab|esg|energy|waste across apps/api/prisma/schema and packages/shared/src is empty; Location (inventory.prisma:76-113) has only address Json?; Setting (core.prisma:153-158) is a single global key/value row with no locationId.

### Whose shipment, whose emissions

**Question:** For a Scope 3 transport figure, which row carries physical activity data (distance/mode/weight) rather than money?

**Strength:** strong

**Citations:** Verified: GoodsReceipt/PurchaseOrder only carry freightCost/dutyCost/otherCost as Int money fields; grep for distance|carrier|transportMode across the schema is empty; StockTransfer (transfers.prisma:41-80) carries only location IDs.

### The disclosure period has no lock

**Question:** What stops a filed ESG figure being edited after the fact, the way FiscalPeriod status + forbid_journal_line_mutation() lock a posted JournalLine?

**Strength:** strong

**Citations:** Verified: FiscalPeriodStatus enum (accounting.prisma:80-84), FiscalPeriod model (91-108), lockPeriod() (fiscal-periods.service.ts:109-115), forbid_journal_line_mutation() (migration.sql:221), and PERMISSION_CATALOG's 50 keys with zero esg/sustainab entries.

## Killed

## Corrections

- Claimed GoodsReceipt.freightCost/dutyCost/otherCost at purchasing.prisma:104-106; actual location is 153-155 (104-106 is PurchaseOrder's own copy of the same three fields, one step earlier in the PO -> GoodsReceipt chain). Fixed in the lens text.
- Claimed FiscalPeriod.status at accounting.prisma:80-98 as one span; actual: enum FiscalPeriodStatus is at 80-84 and the FiscalPeriod model (which has the status field) is at 91-108 — two separate blocks. Fixed in the lens text.

## Absences

