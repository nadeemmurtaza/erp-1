# 42. The grant with no ceiling on the granter

`UsersAdminController` gates the whole role-assignment surface behind one flat
`users.manage` key, and `RolesService.assign()`/`unassign()` take no actor at
all — the only brakes that exist, the `ADMIN_LOCKED_PERMISSIONS` orphan
checks, guard against a critical key vanishing deployment-wide, never against
who is handing it to whom. At corporate scale, with the rank ladder and
100+ named roles the scale axis demands, a flat capability that lets its
holder mint any privilege — including its own management — is not an edge
case; it is the escalation path every other control routes around.

## Lens: The mint has no ceiling

**Question:** Before `assignRole` ships, state the rule that compares the
role being granted against the granting actor's own resolved permissions —
"actor must already hold every permission the role grants", something
looser, or no rule at all — and name the file and line where it runs today.
**Why:** `RolesService.assign(userId: string, roleId: string): Promise<void>`
(`roles.service.ts:144-153`) takes no `actorId`. The only privilege check
near role writes, `assertLockedPermissionsStillHeldSomewhere`
(`roles.service.ts:261-283`), fires on role *edit/delete* and asks only
"does anyone still hold this key deployment-wide", never "does this
granter hold it". This differs from "Who may mint a role" (defining a
role) — this is handing an existing one to a person.
**Worked example:** Narrow slice: a `users.manage` holder picks any of
100+ named roles by id; `POST /admin/users/:id/roles/:roleId` succeeds.
Complete capability: `RolesService.assign(actorId, userId, roleId)`
resolves the actor's own permissions via `PermissionsResolverService`,
diffs them against the target role's `RoleGrant` keys, and throws naming
the keys the actor lacks before the `UserRoleAssignment` row is written.
**Done test:** `RolesService.assign`'s signature takes an `actorId`; the
PR includes a test where a user holding only `users.manage` gets 403
assigning a role that carries `roles.manage_permissions`.
**Breaks without:** With every branch manager or department head holding
`users.manage` to run their own team, any one of them can hand a peer (or
a second account they control) `settings.manage` or
`roles.manage_permissions` — the two `ADMIN_LOCKED_PERMISSIONS` keys —
turning one mid-level grant into deployment-wide control, with no rank
model to have stopped it.

## Lens: The un-grant checks less than the grant

**Question:** State what `RolesService.unassign()` checks before removing
a role from a user, and why stripping authority should ever pass fewer
checks than editing a role's own permission list does.
**Why:** `unassignRole` (`users-admin.service.ts:101-114`) calls only
`this.roles.unassign(targetId, roleId)`, a bare `deleteMany`
(`roles.service.ts:155-157`) — no call to
`assertLockedKeysStillHeldAfterRevoke` at all. That guard is wired only
into `updatePermissions()` (`users-admin.service.ts:293-297`) for personal
`UserPermission` overrides. Removing a role — the ordinary way a user
holds `roles.manage_permissions` — passes zero checks, not even the
"is this key still held somewhere" rule role edits get.
**Worked example:** Narrow slice: `DELETE /admin/users/:id/roles/:roleId`
removes any role from any user, unconditionally. Complete capability:
`unassign()` runs the same orphan check role edits get before deleting the
`UserRoleAssignment`, and, because this also removes a peer's authority,
records the actor's own permission snapshot alongside the `roleId`.
**Done test:** grep `roles.service.ts` for `assertLockedKeysStillHeldAfterRevoke`
call sites — must include `unassign()`; a test removing the sole
`roles.manage_permissions`-granting role from its last holder must 400.
**Breaks without:** At 100+ roles, an admin can silently delete the one
role granting `roles.manage_permissions` from its last holder, orphaning
that key deployment-wide with no warning — exactly the failure
`assertLockedPermissionsStillHeldSomewhere` exists to prevent, reachable
through the one door it was never wired to.

## Lens: The grant nobody can trace back

**Question:** Name the field that records which permissions the actor
held at the moment they granted or revoked a role, and where an access
review reads it back — not that a grant happened, but whether it was
inside the actor's own authority when it happened.
**Why:** `AuditService.record()` calls for `user.role_assigned` /
`user.role_unassigned` (`users-admin.service.ts:90-96,105-111`) write only
`{ roleId }`. `UserRoleAssignment` carries `userId`/`roleId`/`createdAt`
and no `grantedBy`, no `expiresAt`, no snapshot of the granter's own
permissions at that instant. If the ceiling checks above are added later
without this, a post-incident review can see a role was assigned, never
whether the actor was authorized to give it.
**Worked example:** Narrow slice: audit shows `{actorId, action:
'user.role_assigned', data:{roleId}}`. Complete capability: `data` also
carries `{grantedByPermissions: [...], ceilingCheckPassed: true}`, so a
reviewer reconstructs authority without re-deriving history through
since-changed `RoleGrant` rows.
**Done test:** the `audit.record` call for role_assigned/role_unassigned
includes the actor's permission snapshot; answering "was this authorized"
requires no join against current, since-mutated `RoleGrant` state.
**Breaks without:** An auditor reviewing a privilege-escalation incident
across 100+ roles and years of `RoleGrant` edits cannot tell, after the
fact, whether a since-deleted role's grant was ever within the granter's
authority — the incident is undiagnosable, not merely unprevented.

## Not modelled yet

- No `actorId` parameter on `RolesService.assign()`/`unassign()` — the
  ceiling checks above have no seam to attach to without changing the
  method signature and every call site (`users-admin.service.ts`,
  `roles.service.ts:assignByNameIfExists`).
- No rank, grade or hierarchy field anywhere in the schema, so "the
  actor's own resolved permission set" is the only implementable ceiling;
  there is no notion of one role or actor outranking another beyond a
  raw permission-set comparison.
- No `grantedBy`, `expiresAt`, or permission-snapshot field on
  `UserRoleAssignment`, and no such shape in `AuditLog.data` today — the
  provenance lens has nowhere to write until one is added.

## Hardening record

**Kept (3):**

- **The mint has no ceiling** — `RolesService.assign(userId, roleId)`
  (`roles.service.ts:144-153`) confirmed to take no `actorId`, and
  `assertLockedPermissionsStillHeldSomewhere` (`roles.service.ts:261-283`)
  confirmed to check only "is this key held by another role or override
  anywhere", never the granting actor's own permissions. Distinct from the
  `settings.manage` scope-and-approval lens ("Authority and blast radius",
  Policy and rules) — that lens is about who may change a *business rule*;
  this one is about who may hand a *role* to a *person*, a different write
  path (`RolesService.assign` vs the `Setting` table) with no scope concept
  at all today.
- **The un-grant checks less than the grant** — confirmed `unassignRole`
  (`users-admin.service.ts:101-114`) calls only the bare
  `RolesService.unassign` (`roles.service.ts:155-157`, a `deleteMany`), and
  confirmed `assertLockedKeysStillHeldAfterRevoke` is wired only into
  `updatePermissions()` (`users-admin.service.ts:293-297`), never into
  `unassign()`. The asymmetry is real and checkable by grep.
- **The grant nobody can trace back** — confirmed `UserRoleAssignment`
  (`schema/core.prisma:336-348`) carries only `id`/`userId`/`roleId`/
  `createdAt`, no `grantedBy` or snapshot field, and `AuditLog.data`
  (`schema/core.prisma:220-235`) is an untyped `Json?`, so the
  `user.role_assigned`/`user.role_unassigned` calls
  (`users-admin.service.ts:90-96,105-111`) writing only `{ roleId }` is the
  whole of what's recorded today.

**Killed:** none. All three name a distinct write path with no overlapping
existing lens, and each question demands a specific artifact (a stated rule
plus its file/line, a grep result, an audit-payload shape) rather than a
yes/no.

**Corrections:** none. Every cited symbol, path and line range was opened
and confirmed against the current source:
`RolesService.assign` (roles.service.ts:144-153),
`RolesService.unassign` (roles.service.ts:155-157),
`assertLockedPermissionsStillHeldSomewhere` (roles.service.ts:261-283),
`assertLockedKeysStillHeldAfterRevoke` (roles.service.ts:175-197, wired at
users-admin.service.ts:297),
`UsersAdminService.assignRole`/`unassignRole` and their `audit.record` calls
(users-admin.service.ts:86-114),
`UsersAdminService.updatePermissions` (users-admin.service.ts:293-297),
`PermissionsResolverService` (permissions.service.ts:26),
`UserRoleAssignment` and `AuditLog` models (schema/core.prisma:336-348,
220-235), and the absence of any rank/hierarchy/grade field in the schema
— all matched the file's claims exactly; no citation needed a fix.
