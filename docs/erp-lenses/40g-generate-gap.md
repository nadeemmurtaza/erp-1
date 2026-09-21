# 40g generate gap

Output of the `gen:gap:40` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

ESG — the file's title promises it, the content never delivers it

## File

docs/erp-lenses/40-gap-esg-the-file-s-title-promises-it-the-con.md

## Lenses

### The metric with nowhere to live

**Question:** For one disclosed ESG metric (energy, waste diverted, water) at one Location for one period, what table and column holds the raw reading at the point it was taken — not a number retyped into a report once a year?

**Grounding:** grep for emission|carbon|sustainab|esg|energy|waste across apps/api/prisma/schema and packages/shared/src returns nothing; Location (inventory.prisma:76-113) has only address Json?; Setting (core.prisma:153-158) is a global key/value with no locationId column at all.

### Whose shipment, whose emissions

**Question:** For a disclosed transport/Scope-3 figure, which row carries the physical activity data (distance, mode, weight) the calculation multiplies against, as opposed to money?

**Grounding:** GoodsReceipt.freightCost/dutyCost/otherCost (purchasing.prisma:104-106) are Int minor-currency fields; StockTransfer (transfers.prisma:41) has sourceLocationId/destinationLocationId/inTransitLocationId but no distance/carrier/transportMode field (grep confirmed).

### The disclosure period has no lock

**Question:** Once an ESG figure for a location/period is filed, what stops it being edited afterward, the way FiscalPeriod.status and the forbid_journal_line_mutation() DB trigger stop a posted JournalLine from changing?

**Grounding:** FiscalPeriod (accounting.prisma:80-98, OPEN|CLOSED|LOCKED) plus fiscal-periods.service.ts's lockPeriod() and the migration's immutability trigger exist for GL; the 50-key PERMISSION_CATALOG (packages/shared/src/permissions.ts) has zero esg.*/sustainability.* keys.

## Absences

- No environmental or social metric/unit/fact table anywhere in apps/api/prisma/schema (energy, waste, water, emissions have no column at all, per-location or otherwise)
- No shipment-level physical activity data (distance, mode, weight) on StockTransfer or GoodsReceipt — only money fields (freightCost, dutyCost, otherCost)
- No ESG reporting period, lock, or permission key — FiscalPeriod's OPEN/CLOSED/LOCKED lifecycle and its DB-enforced immutability have no sustainability counterpart

