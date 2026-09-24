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

## Hardening record

**Kept (4/4):**

- **Rank is a ceiling, not a location** — survives because it names a
  concrete missing artifact (a numeric ceiling column) and distinguishes
  rank from `AdminScopeLevel`, which answers *where* not *how much*; a
  reviewer without this lens would accept an unconditional
  `payments.approve` grant as complete.
- **Who may mint a role, and what a hundred of them costs** — survives
  because `RolesService.findRoleWithIdenticalPermissions` only flags a
  duplicate grant set via `duplicateOfRoleName`, never blocks it, and
  `Role` has no `parentId` to inherit from — a real gap a narrow build
  would ship past silently.
- **The grant that never expires** — survives because all four grant
  tables (`RoleGrant`, `UserRoleAssignment`, `UserPermission`,
  `AdminScope`) carry only `createdAt`, and the lens explicitly scopes
  itself against lens 27 (undo authority on a document) rather than
  restating it.
- **The actor with no role** — survives because
  `PermissionsResolverService.resolveForUser()` only resolves grants for a
  `userId`, and `TradingPartner`, `PosTerminal`, and `Node` each carry
  their own ad hoc `*KeyHash` column outside the `User`/`Role` system
  entirely — a coverage gap no existing lens (human-facing notifications,
  policy versioning, bulk operations) touches.

**Killed:** none. All four lenses pass the hard constraints — none is
generic software advice, none restates an existing lens, none is
unfalsifiable, and none is true of only one edition.

**Citations checked (12 targeted, all confirmed accurate — no
corrections required):**

1. `payments.approve` key exists in `packages/shared/src/permissions.ts`
   (lines 83, 284, 375, 403).
2. `Role` model at `core.prisma:307` — confirmed fields are exactly
   `id`, `name`, `description`, `createdAt`, `updatedAt`; no level, no
   `parentId`.
3. `AdminScopeLevel` enum at `organization.prisma:82` (`ORG | BRAND |
   BRANCH`), used as the `level` field on `AdminScope` at
   `organization.prisma:109` — the file's line reference points at the
   field usage, not the enum declaration, and both check out.
4. `RolesService` duplicate-role handling in `roles.service.ts` — confirmed
   `duplicateOfRoleName` is set (flagged) but never causes a refusal;
   only a duplicate *name* throws `ConflictException`.
5. `ADMIN_LOCKED_PERMISSIONS` at `packages/shared/src/permissions.ts:438`
   — confirmed exported array, re-used by `apps/web/src/constants/permissions.ts`.
6. `AdminScope` model at `organization.prisma:106` — confirmed fields
   `id`, `userId`, `level`, `retailBrandId`, `branchNodeId`, `createdAt`
   only; no `expiresAt`, no `grantedBy`.
7. `PermissionsResolverService.resolveForUser()` at
   `permissions.service.ts:29` — confirmed signature
   `resolveForUser(userId: string)`.
8. `TradingPartner.inboundApiKeyHash`, `PosTerminal.deviceKeyHash`, and
   `Node.inboundApiKeyHash` — confirmed in `trading-partners.prisma:47`,
   `pos.prisma:39`, and `organization.prisma:158` respectively, each a
   separate `String? @unique` column with no shared table or type.
9. `seedRoles()` one-time migration — confirmed in
   `apps/api/prisma/seed.ts:128`, guarded by `prisma.role.count()` so it
   runs at most once, matching the "one-time trap already on record"
   claim.
10. `@RequirePermission` decorator — confirmed in
    `apps/api/src/core/auth/decorators.ts:25`, enforced by the guard in
    `apps/api/src/core/auth/guards.ts`.
11. `RoleGrant` model in `core.prisma` — confirmed fields `id`, `roleId`,
    `permissionId`, `createdAt` only.
12. `Role.grants` / `Role.assignments` relations — confirmed `Role` links
    to `RoleGrant[]` and `UserRoleAssignment[]`, supporting the "no
    inheritance to extend" claim in lens 2.
