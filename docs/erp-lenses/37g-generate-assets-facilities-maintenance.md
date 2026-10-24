# 37g generate assets facilities maintenance

Output of the `gen:37:assets-facilities-maintenance` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Assets, equipment and maintenance

## File

docs/erp-lenses/37-assets-facilities-maintenance.md

## Lenses

### The register the ledger never sees

**Question:** For a piece of equipment worth booking as a capital asset, which model instance carries its acquisition cost, depreciation method and net book value, and which GL account absorbs the periodic depreciation entry?

**Grounding:** CHART_OF_ACCOUNTS (chart-of-accounts.ts:20-32, 13 seeded accounts, only 1000/1100/1200 typed ASSET, none named Fixed Assets/Accumulated Depreciation); AccountingService.postEntry() and its exactly seven posting-rule subscribers plus year-end close, none for capex/depreciation; no Asset model among the schema's 115 models.

### Custody has no holder

**Question:** Name the field, on which model, that records who currently has physical custody of one specific device or vehicle, and what happens to it when that person leaves or the device moves branches.

**Grounding:** PosTerminal (pos.prisma:27-46): id, code, label, locationId (bare scalar), deviceKeyHash, status, lastSeenAt - no custodianUserId or assignment history; AuditLog (core.prisma:220) exists but is unused by the pos module's PosTerminal touch points.

### Downtime that outranks the sale

**Question:** When equipment failure takes a branch's ability to trade, what event fires, what status does the object move to, and what query answers which of the 100+ locations are degraded right now?

**Grounding:** PosTerminalStatus enum (pos.prisma:12-18) and PosShiftsService.openShift()'s status === 'ACTIVE' requirement as the sole equipment-health gate on trading; domain-events.ts's ~40 events contain none matching downtime/asset/equipment/maintenance; Location.isActive (inventory.prisma:100) is the only branch-level status flag and is never aggregated.

## Absences

- No Asset, Equipment, Maintenance, Downtime or Depreciation model anywhere in apps/api/prisma/schema/*.prisma
- No Fixed Assets / Accumulated Depreciation account in CHART_OF_ACCOUNTS, and no posting rule that would write to one
- No custody or assignment field on PosTerminal (the only physical-device model that exists today), and no equivalent model for a van, shop fitting or sewing machine at all
- No domain event for asset downtime, maintenance state change, or equipment failure - openShift()'s ACTIVE-only gate is the sole place equipment health already blocks a transaction, and it emits nothing

