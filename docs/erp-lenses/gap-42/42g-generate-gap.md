# 42g generate gap

Output of the `gen:gap:42` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

The grant with no ceiling on the granter

## File

docs/erp-lenses/gap-42/42-gap-the-grant-with-no-ceiling-on-the-granter.md

## Lenses

### The mint has no ceiling

**Question:** Before assignRole ships, state the rule that compares the role being granted against the granting actor's own resolved permissions -- and name the file and line where it runs today.

**Grounding:** RolesService.assign(userId, roleId) at roles.service.ts:144-153 takes no actorId; assertLockedPermissionsStillHeldSomewhere (roles.service.ts:261-283) only guards role edit/delete against deployment-wide orphaning, never checks the granter's own holdings.

### The un-grant checks less than the grant

**Question:** State what RolesService.unassign() checks before removing a role from a user, and why stripping authority should pass fewer checks than editing a role's own permission list.

**Grounding:** unassignRole (users-admin.service.ts:101-114) calls roles.unassign() -> a bare deleteMany (roles.service.ts:155-157) with no call to assertLockedKeysStillHeldAfterRevoke, which is wired only into updatePermissions() (users-admin.service.ts:293-297).

### The grant nobody can trace back

**Question:** Name the field that records which permissions the actor held at the moment they granted or revoked a role, and where an access review reads it back.

**Grounding:** AuditService.record() calls for user.role_assigned/user.role_unassigned (users-admin.service.ts:90-96,105-111) write only {roleId}; UserRoleAssignment has only userId/roleId/createdAt, no grantedBy/expiresAt/snapshot.

## Absences

- No actorId parameter on RolesService.assign()/unassign() -- no seam for an authority-ceiling check without changing the signature and its call sites
- No rank, grade, or hierarchy field anywhere in the schema -- the actor's own resolved permission set is the only implementable ceiling; nothing lets one role or actor outrank another
- No grantedBy, expiresAt, or permission-snapshot field on UserRoleAssignment, and no such shape in AuditLog.data -- provenance for a delegation event has nowhere to be written today

