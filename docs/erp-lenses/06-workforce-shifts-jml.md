# 06. Workforce, shifts and joiner-mover-leaver

Staff are a physical fact before they are a login: someone opens a till at a
named terminal, is scoped to a branch, and one day moves, is promoted, or
leaves. This codebase already tracks the login (`User`, `Role`,
`AdminScope`) and the till (`PosShift`) as separate, unconnected concerns,
each missing the columns and events the other side of a person's lifecycle
needs. At 100+ locations and 100+ roles those gaps stop being paperwork and
start being live authority nobody meant to leave open.

## Lens: The leaver keeps the keys

**Question:** When `isActive` flips to `false` on a `User`
(`users-admin.service.ts` `update()`), name every other row keyed to that
`userId` that must change in the same transaction — and say which of
`AdminScope`, `UserRoleAssignment`, and any OPEN `PosShift` this migration
leaves untouched today.

**Why:** `users-admin.service.ts:250-254` is the whole deactivation
transaction: it flips `User.isActive` and revokes open `RefreshToken` rows.
It never touches `UserRoleAssignment` (core.prisma:336, no `expiresAt`) or
`AdminScope` (organization.prisma:106, no `expiresAt` either), and cannot
touch `PosShift` even if it tried — `PosShift.openedByUserId` (pos.prisma:68)
is a bare scalar, not a relation. `PermissionsResolverService.resolveForUser`
never reads `isActive`; it unions whatever roles are still assigned.

**Worked example:** Narrow slice: mark an area manager `isActive: false` on
their last day, call the leaver flow done. Complete capability: the same
transaction also removes their `UserRoleAssignment` rows, removes their
`AdminScope` rows, and force-closes any `PosShift` where `openedByUserId`
matches them, posting the same closing `CashMovement` a normal
`closeShift()` would.

**Done test:** `grep -n "isActive" apps/api/src/modules/users/users-admin.service.ts`
shows only a `RefreshToken.updateMany` beside the `User.update`. The PR must
add `UserRoleAssignment`/`AdminScope` writes, or a `PosShift` closure, to
that same transaction — not a separate cron.

**Breaks without:** A terminated area manager's still-live access token
keeps ORG/BRAND-level `AdminScope`, reaching every one of the 100+ locations
until the token expires, and their open till shift's cash float never
reaches a Z-report — that terminal's reconciled cash is wrong permanently.

## Lens: Branch means database, not location

**Question:** For a role confined to one of the 100+ `Location` rows in a
single Org-tier database (a floor manager, a branch cashier), which column
actually carries that scope — `AdminScope.branchNodeId` (→ `Node`) or
something keyed to `Location.id` — and what happens when the deployment has
no `Node` rows at all?

**Why:** `AdminScope`'s BRANCH level (organization.prisma:106-120) stores
`branchNodeId`, a foreign key into `Node` (organization.prisma:142), whose
own doc comment says it is recorded only for a genuinely separate child
*deployment* — a BRANCH/BRAND node role, not a row inside this one. Everything
staff actually touch — `PosTerminal.locationId`, `Location` itself
(inventory.prisma:76) — is keyed to `Location`, never `Node`. An Org-tier
database holding 100+ Locations with no separate per-branch deployments
therefore has zero `Node` rows, so `AdminScope` has no id it can put in
`branchNodeId` to name any one of them.

**Worked example:** Narrow slice: give a floor manager `inventory.manage`
plus a BRANCH-level `AdminScope` row, call them "scoped to their branch".
Complete capability: state which id `branchNodeId` actually holds in this
deployment, and if `Node` is empty, say explicitly that `scopeFilterFor()`
narrows to nothing and the manager is scoped to every Location, not one.

**Done test:** `grep -n "branchNodeId" apps/api/prisma/schema/organization.prisma`
shows the relation targets `Node`. On a single-database Org deployment with
100+ Locations and no child deployments, `Node` has zero rows, so no
BRANCH-level `AdminScope` row can resolve to a specific Location there.

**Breaks without:** Every branch-scoped permission (`inventory.manage`,
`transfers.manage`, `pos.operate`) silently becomes deployment-wide once
100+ Locations live in one database instead of 100+ separate node
deployments — a cashier hired for one store keeps `pos.operate` on all 100
stores' terminals.

## Lens: The column with no producer

**Question:** `JournalLine.costCentreId` (accounting.prisma:188) already
exists as a column. Name the domain event, the posting rule, and the
`User`/`PosShift`/roster field that would supply a value for it when a
labour cost needs to land against a branch — and if none exists, say so.

**Why:** `JournalLine` carries `costCentreId` as a bare scalar (no
`CostCentre` model exists in any `.prisma` file) beside `retailBrandId` and
`branchNodeId`, but none of the seven posting-rule subscribers in
`posting-rules.subscriber.ts` ever sets it — none of them is labour.
`domain-events.ts`'s 34 event names include no shift-closed or payroll
event at all. `PosShift` (pos.prisma:65) carries a cash float and a status,
never a wage rate, hours, or a cost centre. The ledger has a place for the
number and nothing that ever computes or posts one.

**Worked example:** Narrow slice: build a "branch labour cost" tile that
reads `JournalLine.costCentreId`. Complete capability: name the new domain
event (a real `shift.closed`), the posting rule that turns hours/rate into a
`JournalLine`, and the field on `PosShift` or a new roster model that
supplies the rate — none of which exist, so the tile's own PR must create
them or the column stays permanently null.

**Done test:** `grep -rn costCentreId apps/api/src/modules/accounting/posting-rules.subscriber.ts`
returns nothing today. The PR must add a setter there, or name and wire the
new rule — not just a `WHERE` clause over the existing seven.

**Breaks without:** A "labour cost per branch" dashboard tile either renders
zero everywhere or gets computed outside the ledger, disagreeing with
`trialBalance`/`profitAndLoss` (`gl-reports.service.ts`) the first time
anyone reconciles the two.

## Not modelled yet

- A rank/grade/seniority model, or any `managerId`/`reportsTo` — so "moved
  branch" and "promoted" have no field to record the fact itself.
- `expiresAt` on `AdminScope`, `UserRoleAssignment`, `RoleGrant`, or
  `UserPermission` — a grant is permanent until someone remembers to delete
  it by hand.
- A `Location`-keyed admin scope for staff, distinct from `AdminScope.branchNodeId`
  (which names a child deployment, not a place).
- A `CostCentre` model to back `JournalLine.costCentreId`, and any posting
  rule, domain event, or `PosShift`/roster field that would populate it.
- An attendance/roster/timesheet concept altogether — `PosShift` is the only
  record of someone's working hours, and it has no relation to `User`, only
  a bare `openedByUserId`/`closedByUserId` scalar.

## Hardening record

**Kept (3):**

- **The leaver keeps the keys** — verified against
  `users-admin.service.ts:248-254` (the deactivation transaction touches
  only `User` and `RefreshToken`), `core.prisma:335-345`
  (`UserRoleAssignment`, no `expiresAt`), `organization.prisma:106-120`
  (`AdminScope`, no `expiresAt`), `pos.prisma:65-68`
  (`PosShift.openedByUserId` is a bare scalar), and
  `permissions.service.ts:26-58` (`PermissionsResolverService.resolveForUser`
  never queries `User.isActive`). Distinct from the existing "reversal
  document, not the reversal flag" lens: that one is about undo of a
  transaction, this one is about a status flip on an actor row that other
  tables never observe.
- **Branch means database, not location** — verified against
  `organization.prisma:106-120` (`AdminScope.branchNodeId` → `Node`),
  `organization.prisma:130-142` (`Node`'s own doc comment: recorded only for
  a genuinely separate child deployment), `pos.prisma:33`
  (`PosTerminal.locationId`), and `inventory.prisma:75-76` (`Location`).
  Distinct from "The edition above and the day it appears" (multi-entity
  topology): that lens is about a BRAND/ORG tier appearing above a
  deployment; this one is about `AdminScope` having no column that can name
  a `Location` inside a single deployment at all.
- **The column with no producer** — verified against
  `accounting.prisma:188` (`JournalLine.costCentreId`, bare scalar, no
  `CostCentre` model in any `.prisma` file), `posting-rules.subscriber.ts`
  (exactly seven `@OnDomainEvent` handlers, none of them setting
  `costCentreId`), `domain-events.ts` (34 named events, none named
  shift-closed or payroll), and `gl-reports.service.ts:74,94`
  (`trialBalance`/`profitAndLoss`, the ledger reports a labour-cost tile
  would have to agree with). Distinct from "The file outlives the app"
  (reporting): that lens is about an export surviving the app that produced
  it; this one is about a ledger column with a place for a number and no
  code path that ever computes one.

**Killed:** none — all three claims held up under citation and none
restates an existing lens without a stated difference.

**Corrections:**

- claimed `domain-events.ts`'s "~40 event names"; actual count is 34 named
  events (`DomainEvent` object, `domain-events.ts:11-61`).
