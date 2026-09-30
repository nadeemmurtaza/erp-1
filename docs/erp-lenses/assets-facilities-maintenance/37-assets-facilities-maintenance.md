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
**Why:** `CHART_OF_ACCOUNTS` (`apps/api/src/modules/money/accounting/chart-of-accounts.ts:20-32`)
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
`apps/api/src/modules/sales/pos/` that touch `PosTerminal` import `AuditService`.
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
**Why:** `PosTerminalStatus` (`pos.prisma:12-20`) has `PENDING/ACTIVE/SUSPENDED`,
and `PosShiftsService.openShift()` is the only place equipment state gates
trading — it requires `status === 'ACTIVE'`. `domain-events.ts`'s roughly
forty entries contain none matching `/downtime|asset|equipment|maintenance/i`.
`Location.isActive` (`inventory.prisma:101`) is the only branch-level status
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

## Hardening record

**Kept**

- **The register the ledger never sees** — verified: `CHART_OF_ACCOUNTS`
  (`chart-of-accounts.ts:20-32`) has exactly the 13 seeded accounts, three of
  type `ASSET` (1000/1100/1200), none named Fixed Assets or Accumulated
  Depreciation; `domain-events.ts` (281 lines total) has zero matches for
  `/depreciat/i`. Distinct from the existing "policy and rules: the version
  stamp" and "reporting: whose rows" lenses — this is about a missing
  postable account and event, not about who reads a report or which policy
  version applied.
- **Custody has no holder** — verified: `PosTerminal`
  (`pos.prisma:27-46`) has no `custodianUserId` or assignment history field;
  `grep -rn AuditService apps/api/src/modules/sales/pos` hits only
  `pos-receipts.service.ts`, none of the five files that actually touch
  `PosTerminal` (`pos.module.ts`, `pos-terminals.service.ts`,
  `pos-terminals.service.spec.ts`, `pos-terminals.controller.ts`,
  `dto/pos-terminal.dto.ts`). Distinct from "multi-entity topology: name the
  owner name the reader it refuses" — that lens is about which entity a
  record belongs to, this is about which *person* holds a physical object
  right now, independent of entity.
- **Downtime that outranks the sale** — verified:
  `pos-shifts.service.ts:35-36` does `if (terminal.status !== 'ACTIVE')
  throw BadRequestException(...)`, confirming `openShift()` is the sole
  trading gate on equipment status; `domain-events.ts` has zero matches for
  `/downtime|asset|equipment|maintenance/i`; `Location.isActive`
  (`inventory.prisma:101`) is the only cross-branch status flag and nothing
  aggregates it. Distinct from "resilience: four hours down the counter
  stays open" — that lens is about a payment-provider or infra outage
  degrading the whole system; this is about one physical object's failure
  being invisible above its own branch.

**Killed**

None. All three claimed lenses survived verification and are scoped
distinctly from the 5 CLAUDE.md lenses and the 30 prior-workflow lenses.

**Corrections**

- `PosTerminalStatus` cited as `pos.prisma:12-18`; the enum actually spans
  `12-20` (closing brace at 20) — corrected.
- `Location.isActive` cited as `inventory.prisma:100`; the field is actually
  declared at line `101` (`100` is a blank/comment line above it) —
  corrected.
- All other citations checked and confirmed as written: `chart-of-accounts.ts:20-32`
  (13 seeded accounts, 3 of type `ASSET`), `AccountingService.postEntry()`'s
  seven posting-rule subscribers plus year-end close (none posting
  capex/depreciation), 115 total Prisma models with none named `Asset`,
  `PosTerminal` field list at `pos.prisma:27-46`, `AuditLog` at
  `core.prisma:220`, the five pos-module files touching `PosTerminal`
  (none importing `AuditService`), `pos-shifts.service.ts`'s `ACTIVE`-only
  gate, and the zero-hit greps against `domain-events.ts` for
  `/depreciat/i`, `custodianId|assignedToUserId|AssetAssignment` (across all
  `*.prisma`), and `/downtime|asset|equipment|maintenance/i`.
