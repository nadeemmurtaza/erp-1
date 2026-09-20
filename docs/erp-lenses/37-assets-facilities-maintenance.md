# 37. Assets, equipment and maintenance

A corporate group owns hundreds of tills, vans, shop fittings and sewing
machines across 100+ locations. Today every one of them is either an
untracked physical object or, at best, a `PosTerminal` row with a status
flag and no owner, no cost, and no downtime signal. A narrow build adds a
list page; the whole capability links that object to the ledger, to a
person, and to the branch's ability to trade.

## Lens: The register the ledger never sees

**Question:** For a piece of equipment worth booking as a capital asset,
which model instance carries its acquisition cost, depreciation method and
net book value, and which GL account absorbs the periodic depreciation
entry?
**Why:** `CHART_OF_ACCOUNTS` (`apps/api/src/modules/accounting/chart-of-accounts.ts:20-32`)
seeds exactly 13 accounts; only 1000/1100/1200 are type `ASSET` and none is
named Fixed Assets or Accumulated Depreciation. `AccountingService.postEntry()`
has exactly seven posting-rule subscribers plus year-end close — none posts
capex or depreciation. No model named Asset exists among the schema's 115
models.
**Worked example:** Narrow slice: an "Assets" admin page listing `PosTerminal`
rows with a manually-typed purchase price nobody reconciles. Complete
capability: an Asset model (cost, method, life, `currentLocationId`) posting
Dr Depreciation Expense / Cr Accumulated Depreciation each period-close,
reaching `GlReportsService.balanceSheet()`.
**Done test:** `CHART_OF_ACCOUNTS` contains a row with `type: 'ASSET'` whose
name matches Fixed Asset/Equipment/Accumulated Depreciation, and
`domain-events.ts` carries an event name matching `/depreciat/i` with a
subscriber in `posting-rules.subscriber.ts`.
**Breaks without:** Every till, van, fitting and machine a Solo, SME or Org
edition owns is invisible to `balanceSheet()` — capex leaves cash through a
`SupplierBill` (if bought that way) but the asset and its declining value
never post, so the one statement all three editions share is wrong for any
deployment that owns hardware, which is all of them.

## Lens: Custody has no holder

**Question:** Name the field, on which model, that records who currently has
physical custody of one specific device or vehicle — and what happens to
that field when the person who held it leaves or the device moves branches.
**Why:** `PosTerminal` (`apps/api/prisma/schema/pos.prisma:27-46`) has `id`,
`code`, `label`, `locationId` (a bare scalar), `deviceKeyHash`, `status`,
`lastSeenAt` — no `custodianUserId`, no assignment history. `AuditLog`
(`core.prisma:220`) exists but none of the five files under
`apps/api/src/modules/pos/` that touch `PosTerminal` import `AuditService`.
Since no Asset model exists at all (prior lens), the same absence covers a
van or a sewing machine.
**Worked example:** Narrow slice: a "Devices" list showing `PosTerminal.locationId`
and `status`. Complete capability: a custodian field or an
`AssetAssignment(assetId, userId, fromDate, toDate)` history, so "which
devices does user X still hold" is one query, not a manual join nobody
built.
**Done test:** `grep -n "custodianId\|assignedToUserId\|AssetAssignment"`
across `apps/api/prisma/schema/*.prisma` — zero today; the PR must add the
field or model and a query in `pos-terminals.service.ts` answering it.
**Breaks without:** An offboarding or fraud review at 100+ locations asks
"which card-handling devices did this terminated employee hold keys to,"
and the honest answer is "none — `locationId` is not a person," a finding
in any audit of hardware that stores payment data.

## Lens: Downtime that outranks the sale

**Question:** When equipment failure takes a branch's ability to trade,
what event fires, what status does the object move to, and what query
answers "which of our 100+ locations are degraded right now"?
**Why:** `PosTerminalStatus` (`pos.prisma:12-18`) has `PENDING/ACTIVE/SUSPENDED`,
and `PosShiftsService.openShift()` is the only place equipment state gates
trading — it requires `status === 'ACTIVE'`. `domain-events.ts`'s roughly
forty entries contain none matching `/downtime|asset|equipment|maintenance/i`.
`Location.isActive` (`inventory.prisma:100`) is the only branch-level status
flag and nothing surfaces it across locations.
**Worked example:** Narrow slice: an admin manually flips a terminal to
`SUSPENDED` when it breaks. Complete capability: an `asset.downtime_started`/`_ended`
domain event on status change, and a query grouping suspended equipment by
`locationId` for an area manager's dashboard.
**Done test:** `grep -i "downtime\|maintenance" apps/api/src/core/events/domain-events.ts`
— zero today; PR must add the event and a subscriber or list endpoint
grouping affected locations.
**Breaks without:** A broken till or sewing machine at any one of 100+
locations is invisible above that branch — `openShift()`'s rejection is a
4xx response nobody aggregates, so an area or ops manager learns about
degraded trading capacity only when someone calls.

## Not modelled yet

- No `Asset`, `Equipment`, `Maintenance`, `Downtime` or `Depreciation` model
  anywhere in `apps/api/prisma/schema/*.prisma`.
- No Fixed Assets / Accumulated Depreciation account in `CHART_OF_ACCOUNTS`,
  and no posting rule that would write to one.
- No custody or assignment field on `PosTerminal` (the only physical-device
  model that exists today), and no equivalent model for a van, shop fitting
  or sewing machine at all.
- No domain event for asset downtime, maintenance state change, or
  equipment failure — `openShift()`'s `ACTIVE`-only gate is the sole place
  equipment health already blocks a transaction, and it emits nothing.
