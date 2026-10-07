# 37h. Hardening record: Assets, equipment and maintenance

Adversarial review of [37-assets-facilities-maintenance.md](./37-assets-facilities-maintenance.md) by the `harden:37:assets-facilities-maintenance` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The register the ledger never sees  — strong

**Question:** For a piece of equipment worth booking as a capital asset, which model instance carries its acquisition cost, depreciation method and net book value, and which GL account absorbs the periodic depreciation entry?

**Verified against:** CHART_OF_ACCOUNTS (chart-of-accounts.ts:20-32): 13 seeded accounts, 3 of type ASSET, none named Fixed Assets/Accumulated Depreciation; domain-events.ts has zero /depreciat/i matches; no Asset model among 115 Prisma models — all verified.

### Custody has no holder  — strong

**Question:** Name the field, on which model, that records who currently has physical custody of one specific device or vehicle, and what happens to that field when the holder leaves or the device moves branches.

**Verified against:** PosTerminal (pos.prisma:27-46) has no custodianUserId/assignment history; grep for AuditService across apps/api/src/modules/sales/pos hits only pos-receipts.service.ts, not the five files that touch PosTerminal — verified.

### Downtime that outranks the sale  — strong

**Question:** When equipment failure takes a branch's ability to trade, what event fires, what status does the object move to, and what query answers which of our 100+ locations are degraded right now?

**Verified against:** pos-shifts.service.ts:35-36 confirms openShift() gates solely on status !== 'ACTIVE'; domain-events.ts has zero matches for /downtime|asset|equipment|maintenance/i; Location.isActive (inventory.prisma:101) is the only cross-branch flag and nothing aggregates it — verified.

## Killed (0)

_Nothing was killed._


## Citations corrected (2)

- PosTerminalStatus cited as pos.prisma:12-18; the enum actually spans 12-20 (closing brace at line 20) — corrected in file.
- Location.isActive cited as inventory.prisma:100; the field is actually declared at line 101 — corrected in file.

## Not modelled in this repo today

- No Asset, Equipment, Maintenance, Downtime or Depreciation model anywhere in apps/api/prisma/schema/*.prisma.
- No Fixed Assets / Accumulated Depreciation account in CHART_OF_ACCOUNTS, and no posting rule that would write to one.
- No custody or assignment field on PosTerminal (the only physical-device model that exists today), and no equivalent model for a van, shop fitting or sewing machine at all.
- No domain event for asset downtime, maintenance state change, or equipment failure — openShift()'s ACTIVE-only gate is the sole place equipment health already blocks a transaction, and it emits nothing.
