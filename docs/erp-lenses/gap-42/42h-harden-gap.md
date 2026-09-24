# 42h harden gap

Output of the `harden:gap:42` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

The grant with no ceiling on the granter (role-assignment authority)

## File

docs/erp-lenses/gap-42/42-gap-the-grant-with-no-ceiling-on-the-granter.md

## Kept

### The mint has no ceiling

**Question:** State the rule comparing the granted role against the granting actor's own permissions, and name the file/line where it runs today.

**Strength:** strong

**Citations:** RolesService.assign (roles.service.ts:144-153) confirmed to take no actorId; assertLockedPermissionsStillHeldSomewhere (roles.service.ts:261-283) confirmed to check only cross-role/override coverage, never the granter's own permissions.

### The un-grant checks less than the grant

**Question:** State what RolesService.unassign() checks before removing a role, and why revoke should pass fewer checks than an edit.

**Strength:** strong

**Citations:** unassignRole (users-admin.service.ts:101-114) -> RolesService.unassign (roles.service.ts:155-157), a bare deleteMany; assertLockedKeysStillHeldAfterRevoke confirmed wired only into updatePermissions (users-admin.service.ts:293-297), not into unassign.

### The grant nobody can trace back

**Question:** Name the field recording the granter's own permissions at grant time, and where a review reads it back.

**Strength:** solid

**Citations:** UserRoleAssignment (schema/core.prisma:336-348) has no grantedBy/expiresAt/snapshot field; AuditLog.data (schema/core.prisma:220-235) is untyped Json; audit.record calls for role_assigned/role_unassigned (users-admin.service.ts:90-96,105-111) confirmed to write only {roleId}.

## Killed

## Corrections

- None needed — all citations (roles.service.ts line ranges, users-admin.service.ts line ranges, UserRoleAssignment and AuditLog schema shapes, PermissionsResolverService, and the absence of a rank/hierarchy field) were opened and confirmed to match the file's claims exactly.

