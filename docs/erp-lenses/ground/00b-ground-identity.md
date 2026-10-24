# 00b. Ground: Identity, permissions, roles and scope

Reconnaissance report from the `ground:identity` agent of workflow `wf_0cc0602e-66b`, recorded verbatim.
It is the raw input to [00-uagent.md](./00-uagent.md), which merges all six into one map. Read this one when you
want the unsummarised detail for this area.

## Facts

## The catalog (packages/shared/src/permissions.ts, 450 lines)

`PERMISSION_CATALOG` holds **exactly 36** entries. Shape: `{ key, label, category, sensitivity }` (`PermissionDefinition`, line 38). Keys are flat two- or three-segment dot strings — `analytics.view`, `orders.manage`, `stitching.jobs.manage_own`, `accounting.manage_periods`. There is **no resource-id, no wildcard, no hierarchy, no `*` expansion, no action/resource split, no ABAC condition** — a key is an opaque string compared with `Array.includes`.

`PermissionKey` is a literal union derived from the const array, so every `@RequirePermission(...)` call site is compile-checked.

`sensitivity` counts: 15 `low`, 15 `medium`, 4 `high`, 2 `critical`. The header comment (lines 24–35) is explicit that sensitivity is "never enforced by itself"; `critical` is exactly `ADMIN_LOCKED_PERMISSIONS = ['settings.manage','roles.manage_permissions']` (line 438) restated for a pre-save warning.

`category` has 9 distinct values (Dashboard, Customers, Sales, Production, Catalogue, Purchasing, Account, Administration). A *second, parallel* grouping exists: `PERMISSION_GROUPS`, 14 groups, for the role-creation wizard. Every catalog key appears in exactly one group, asserted by `permissions.spec.ts`. So there are two taxonomies over the same 36 keys.

`ROLE_PERMISSION_SEED` is keyed by the **old fixed enum** `UserRole` = CUSTOMER | TAILOR | STAFF | ADMIN (core.prisma line 4). CUSTOMER gets 1 key, TAILOR 4, STAFF 24, ADMIN 35.

## How a role becomes a grant

Two generations coexist in `core.prisma`:

- Old: `RolePermission { role: UserRole, permissionId }` — enum-keyed.
- New: `Role { id, name @unique, description }` → `RoleGrant { roleId, permissionId }` → `UserRoleAssignment { userId, roleId }` (@@unique userId+roleId).

`Role` has **only** name/description/timestamps. No parent role, no level, no priority, no inheritance, no tenant/brand column.

`PermissionsResolverService.resolveForUser(userId)` (apps/api/src/core/auth/permissions.service.ts:29) is the whole engine: union every assigned role's `RoleGrant` keys into a `Set`, then apply `UserPermission` overrides (GRANT adds, REVOKE deletes). Returns `{ roles: string[], permissions: string[] }`. It **never reads `User.role`** (the enum column's own doc comment says so, core.prisma:22-27).

Called from `JwtStrategy.validate` (jwt.strategy.ts:39) on **every request** — the JWT payload deliberately carries no roles (`auth.constants.ts:12` `JwtPayload` = sub/email/phone only).

`PermissionsGuard.canActivate` (guards.ts:83) is pure OR: passes if the caller holds **any** required key. `JwtAuthGuard` is global; `@Public()`, `@RequirePermission(...)`, `@AuthenticatedOnly()` in decorators.ts.

`RolesService` (roles.service.ts) does create/update/delete/assign/unassign. Duplicate role *name* is refused; duplicate *permission set* is only flagged (`duplicateOfRoleName`). `assertLockedPermissionsStillHeldSomewhere` and `assertLockedKeysStillHeldAfterRevoke` refuse any edit leaving a locked key held by nobody deployment-wide.

## Scope

`AdminScope` lives in **organization.prisma:106** — `{ userId, level: ORG|BRAND|BRANCH, retailBrandId?, branchNodeId? }`. That is the only scoping dimension that exists: brand and branch. There is **no department, no cost centre, no region, no product-category, no customer-segment scope**.

`scope.guard.ts` provides `resolveScope()`, `assertCanManageAtScope(actor, capability, target)` and `scopeFilterFor(actor)` → `{ retailBrandId: { in: [...] } }`. Fail-closed: no grants narrows to `in: []`.

**Where scope is NOT attached:** `AuthenticatedUser` (auth.constants.ts:22) has `id, roles, permissions, email, phone` — **no `adminScopes`**. `PermissionsResolverService` does not fetch them. Scope is re-queried ad hoc, per controller: `OrganizationController.actorFor()` (organization.controller.ts:33) calls `this.organization.grantsFor(user.id)` and hand-builds a `ScopedActor`. That is the **only** place in the codebase that does so — `grep` for `scopeFilterFor|assertCanManageAtScope` outside tests returns only scope.guard.ts itself and organization.service.ts. Every other module's list endpoint is unscoped. `assertCanManage` (ownership.guard.ts) has exactly one production call site: `jobs.service.ts:324`.

`docs/implementation/access-control-identity/16-pbac-row-scoping.md` is **stale** on this point: its status block (lines 24-28) says "Still not wired into a live route… `organization` (WO-18.3) has no controller yet." A controller now exists and calls both functions.

## Rank / grade / hierarchy / delegation

**There is no rank model. There is no grade, level, seniority, band or step field anywhere.** No `managerId`, no `reportsTo`, no org chart, no approval limit, no approval threshold, no delegation, no acting-for, no temporary elevation, no expiry on any grant (`RoleGrant`, `UserRoleAssignment`, `UserPermission`, `AdminScope` all have `createdAt` and nothing else — no `expiresAt`, no `grantedBy`). No break-glass. No separation-of-duties or mutual-exclusion constraint between roles. `RetailBrand.parentId` is the only hierarchy in the identity area and it is a brand tree, not a people tree. (`featuredRank` in catalog.prisma:124 is product sort order, unrelated.)

Approval is modelled as a flat permission, not a limit: `payments.approve` is a boolean capability with no amount ceiling.

## Non-staff actors

- **Customer** — a `User` row with the CUSTOMER role; same table as staff. One identity table for everyone.
- **Tailor** — also a `User`; `StitchingJob.assignedTailorId` (stitching.prisma:132) points at User.id.
- **Supplier / manufacturer / distributor / retailer** — NOT users. `Party` + `PartyRoleAssignment { partyId, role: PartyRoleName }` (parties.prisma), a directory record with no credentials and no login. `Supplier` hangs 1:1 off `Party`.
- **Trading partner** — `TradingPartner` (trading-partners.prisma:33), machine-to-machine: `inboundApiKeyHash` (SHA-256), `outboundApiKeyEncrypted`, `inviteTokenHash`. Authenticated outside the User/permission system entirely.
- **POS terminal / device** — `PosTerminal` (pos.prisma:27) with `deviceKeyHash`. `PosShift.openedByUserId` is a bare scalar, not a relation.
- **Child deployment** — `Node` with `inboundApiKeyHash`.
- **Franchisee** — **does not exist**; no model, no enum value, no permission key.
- **Service account** — no such concept. Three separate hash-a-key patterns (TradingPartner, PosTerminal, Node) with no shared principal type and no permission keys of their own.

## The seedPermissions/seedRoles trap

CLAUDE.md names it twice (lines 210-212 and 744-749). In apps/api/prisma/seed.ts: `seedPermissions()` (line 82) upserts every `Permission` row unconditionally but only writes `RolePermission` grants for permissions that currently have **zero** grants (`alreadyManaged` set) — so an admin's edits survive. `seedRoles()` (line 128) is **strictly one-time**: `if (await prisma.role.count() > 0) return;` — it copies the then-current `RolePermission` rows into `RoleGrant` and assigns users, and never re-syncs.

The gap: a new permission added to `PERMISSION_CATALOG` after first boot gets its `Permission` row and a `RolePermission` row, but `seedRoles()` has already returned and **no `RoleGrant` is ever created for it**. Since `PermissionsResolverService` reads only `RoleGrant`, the key reaches no live user. CLAUDE.md's rule: a permission must be seeded "all the way through to a real grant a live user holds"; the existing gap is "tracked, not repeated on purpose."

## Where a narrow build goes wrong here

- Permission keys are opaque flat strings compared with Array.includes, and PermissionsGuard is a pure OR over required keys. At 100+ roles and 10000+ products this gives no wildcard, no grouping at enforcement time, and no way to say 'manage products in category X' — every new distinction costs a new catalog key and a new seed, and a role's grant set is an unbounded row-per-key list in RoleGrant.
- There is no rank, grade, level, approval limit or delegation anywhere. payments.approve is a boolean with no amount ceiling. Any corporate approval-chain requirement (spend thresholds, two-person rule, acting-manager during leave) has no attachment point and cannot be expressed by adding permission keys — it needs new models.
- Scope exists only as AdminScope with three levels (ORG/BRAND/BRANCH) and is NOT on AuthenticatedUser. It is re-queried by hand in exactly one controller (OrganizationController.actorFor). Any new scoped surface must remember to build a ScopedActor itself; forgetting it silently ships an unscoped endpoint, and nothing in the guard layer catches that.
- There is no department dimension at all — no Department model, no departmental scope column, no department-keyed permission category. A corporate A-to-Z department map has nowhere to attach; the only two axes are brand and branch.
- One User table serves customers, tailors and staff; suppliers/partners are Party rows with no login; devices and child nodes authenticate through three separate ad-hoc API-key hashes (TradingPartner.inboundApiKeyHash, PosTerminal.deviceKeyHash, Node.inboundApiKeyHash) that bypass the permission system entirely. There is no common principal abstraction, so '100+ types of user' cannot be modelled without either overloading Role or inventing a fourth credential pattern.
- No grant of any kind expires or records who granted it — RoleGrant, UserRoleAssignment, UserPermission and AdminScope each carry only createdAt. AuditLog records actions but not permission-change provenance, so access reviews, temporary elevation and joiner-mover-leaver flows have no data to work from.
- Two parallel taxonomies already exist over the same 36 keys (category, 9 values, and PERMISSION_GROUPS, 14 groups). Adding a third organizing axis for enterprise scale would fork this further; permissions.spec.ts only asserts that every key appears in exactly one PERMISSION_GROUP.
- seedRoles() returns immediately once any Role row exists, so RoleGrant rows are never created for permissions added after first boot. Any work order that introduces a permission key must ship its own grant migration or the capability is unreachable — CLAUDE.md flags this, and the repo currently carries the gap.
- User.role (the UserRole enum) still exists and is still indexed, still the default for new signups, and still the source seedRoles() migrated from — but nothing in PermissionsResolverService reads it. A dual-source-of-truth that will read as authoritative to anyone who greps for 'role'.
- docs/implementation/access-control-identity/16-pbac-row-scoping.md's status block is out of date: it states the scope functions are 'still not wired into a live route', which organization.controller.ts contradicts. Grounding a design on that doc's stated status would understate what already ships.
