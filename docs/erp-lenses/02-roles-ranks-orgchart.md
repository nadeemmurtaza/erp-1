# 02. Roles, ranks and the org chart

Solo has an owner and two staff; Org has a hundred named roles, a rank
ladder, delegation and acting cover across a hundred locations. The same
`Role`/`RoleGrant` tables must serve both, but today `Role` is a flat
name-and-description row with no parent, no level and no expiry. A feature
that reaches for "add a permission to a role" without asking what rank,
inheritance or grant lifetime it needs ships correctly for Solo and silently
under-models the org chart the moment a group tries to run on it.

## Lens: Rank is a ceiling, not a location

**Question:** For each approval-gated action in this feature, what number
bounds how much a given holder of the required permission key may approve
alone, where does that number live per person or per grade, and what happens
when the amount exceeds it — a second approver, and is that approver named
by role, by rank, or by whoever is online?

**Why:** `payments.approve` (`packages/shared/src/permissions.ts`) is a flat
boolean capability with no amount ceiling. `Role` (`core.prisma:307`) has
only `name`/`description`/timestamps — no level field to hang a ceiling on.
`AdminScopeLevel` (`ORG|BRAND|BRANCH`, `organization.prisma:109`) answers
*where* an actor may act, not *how much* they may approve; treating scope as
a stand-in for rank is the trap this lens exists to catch.

**Worked example:** Narrow slice: grant an Area Manager `payments.approve` so
they can approve refunds. Complete capability: name the ceiling for an Area
Manager versus a Branch Manager versus a Regional Director, where it is
stored — since `Role` has nowhere to put it — and what happens to a refund
one rupee over that line.

**Done test:** Grep the schema for a numeric ceiling column reachable from
`Role` or `UserRoleAssignment`. The PR names that column, or states "no
ceiling — the grant is unconditional" as an explicit, reviewed decision.

**Breaks without:** At 100+ locations a single `payments.approve` grant is
unconditional — a walk-in till user promoted with that key can approve a
refund of any size, because neither the permission key nor `Role` has any
notion of "up to X."

## Lens: Who may mint a role, and what a hundred of them costs

**Question:** Name the mechanism, if any, that stops a new named role from
being built as an independent, fully-typed-out grant list. Is there a
base or parent role a new one extends, and who holds the permission to
create a role at all?

**Why:** `RolesService` (`roles.service.ts`) refuses a duplicate role
*name* but only flags a duplicate *permission set*
(`duplicateOfRoleName`) — it never blocks it. `Role` (`core.prisma:307`)
carries no `parentId` and no level, so there is no inheritance to extend.
`roles.manage_permissions` is one of exactly two
`ADMIN_LOCKED_PERMISSIONS` (`permissions.ts:438`) — the only ceiling that
exists is on editing locked keys, not on minting a role in the first
place.

**Worked example:** Narrow slice: add "Assistant Branch Manager" as a new
`Role`, hand-picking keys from the 50-entry catalogue. Complete capability:
state whether it extends "Branch Manager" or duplicates its grant list, and
what happens to Assistant Branch Manager when Branch Manager's grants change
six months later.

**Done test:** The PR states whether `Role` gained a parent/base field, or
documents that the product accepts N independent flat grant lists that must
be hand-kept in sync, and names who is responsible for that sync.

**Breaks without:** At 100+ named roles, a permission key added later (the
`seedRoles()` one-time trap already on record in this repo) must be
re-added by hand to every role meant to inherit it; nothing detects the
roles that were missed, and a role silently drifts from its intended peers.

## Lens: The grant that never expires

**Question:** For a role assignment, permission override, or admin-scope
grant this feature creates, what ends it automatically — and if the honest
answer is "someone remembers to revoke it," name who is on the hook and how
they find out it is time.

**Why:** `RoleGrant`, `UserRoleAssignment`, `UserPermission`, and
`AdminScope` (`organization.prisma:106`) each carry only `createdAt` — no
`expiresAt`, no `grantedBy`, on any of the four grant tables in
`core.prisma`/`organization.prisma`. This is distinct from lens 27 ("who may
unmake it, how large, how late") — that lens is about undo authority on a
document; this one is about a personnel grant's own lifetime, independent of
anything it was ever used to do.

**Worked example:** Narrow slice: cover an Area Manager's three branches
under `AdminScope` while the Branch Manager is on leave. Complete
capability: the grant carries an end date and something revokes it on that
date unattended, or the PR explicitly accepts a permanent, silently-widened
`AdminScope` row.

**Done test:** Grep the four grant models for `expiresAt`. If absent, the PR
names the manual-revocation process and the role or person who owns running
it.

**Breaks without:** At 100+ people rotating through 100+ locations, "cover
while someone is out" grants accumulate and are never pulled back — a
manager who has left, or moved to a different brand entirely, keeps live
`AdminScope` rows granting access nobody intended past the day cover ended.

## Lens: The actor with no role

**Question:** For each non-human or non-employee actor kind this feature
must let act — POS terminal, trading partner, child node, bot, service
account — does it hold a `Role` and get checked by `PermissionsGuard`, or
does it authenticate through a separate key-hash path that bypasses the
permission system, and if the latter, what bounds what it may do?

**Why:** `TradingPartner.inboundApiKeyHash`, `PosTerminal.deviceKeyHash`,
and `Node.inboundApiKeyHash` are three separate, ad hoc credential patterns,
none a `User` row and none carrying permission keys.
`PermissionsResolverService.resolveForUser()` (`permissions.service.ts:29`)
only resolves grants for a `userId` via `UserRoleAssignment` — a principal
outside that table is invisible to the role system entirely.

**Worked example:** Narrow slice: let a POS terminal call an
inventory-adjustment endpoint using its `deviceKeyHash`. Complete
capability: name whether that route sits behind `@RequirePermission` for
terminal callers, and if not, what actually bounds it (which actions, which
locations) in place of a permission check.

**Done test:** Grep the endpoint's controller for `@RequirePermission`. If
the caller is a non-`User` principal, the PR names the real authorization
mechanism enforced for it instead.

**Breaks without:** At 100+ non-human actor kinds, each getting its own
one-off key path means the 50-key permission catalogue and the role ladder
cover only human logins — a coverage gap that grows every time a new
device, bot or partner type is added, invisible to any role or permission
audit because it was never in that system to begin with.

## Not modelled yet

- A rank, grade, level, seniority or approval-ceiling field anywhere — not
  on `Role`, not on `User`, not on `UserRoleAssignment`.
- Role inheritance or a parent/base role — `Role` has no `parentId`.
- `expiresAt` or `grantedBy` on `RoleGrant`, `UserRoleAssignment`,
  `UserPermission`, or `AdminScope` — all four carry only `createdAt`.
- A department or cost-centre model, or any departmental scope column.
- An org chart: no `managerId`, `reportsTo`, or people-hierarchy of any
  kind. `RetailBrand.parentId` nests brands, not people.
- A common principal abstraction covering `User`, `TradingPartner`,
  `PosTerminal`, and `Node` — each authenticates through its own hash
  pattern with no shared permission surface.
