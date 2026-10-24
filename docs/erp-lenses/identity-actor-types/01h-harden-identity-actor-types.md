# 01h. Hardening record: Identity and the hundred kinds of actor

Adversarial review of [01-identity-actor-types.md](./01-identity-actor-types.md) by the `harden:01:identity-actor-types` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The actor with three tables  — strong

**Question:** For each new kind of actor, name which existing table it becomes (User, Party, or one of the three key-hash principals) and, if a real person can hold two at once, the column that links them.

**Verified against:** User (core.prisma:11) has no partyId; Party (parties.prisma:15) has no userId; no FRANCHISEE/Franchisee token anywhere in apps/api/prisma/schema — all confirmed by grep.

### The credential with no permission key  — strong

**Question:** For any non-User actor, name which PERMISSION_CATALOG keys it can be checked against, or name the code path that authenticates it instead of PermissionsGuard.

**Verified against:** PERMISSION_CATALOG confirmed in packages/shared/src/permissions.ts; resolveForUser confirmed called from jwt.strategy.ts; TradingPartner.inboundApiKeyHash, PosTerminal.deviceKeyHash, Node.inboundApiKeyHash confirmed as three separate unique columns.

### The access with no end date  — solid

**Question:** For a time-boxed actor (auditor, subcontractor), name the field that ends their access and what happens to their RoleGrant/AdminScope rows at engagement close.

**Verified against:** RoleGrant, UserRoleAssignment, UserPermission (core.prisma) and AdminScope (organization.prisma:106) confirmed to carry only createdAt, no expiresAt/grantedBy.

## Killed (0)

_Nothing was killed._


## Citations corrected (2)

- Lens 3's doneTest claimed `grep -n "expiresAt" apps/api/prisma/schema/core.prisma` returns nothing today; running it actually returns 6 lines (RefreshToken, PasswordResetToken, EmailVerificationToken all have expiresAt in that file). Replaced with two model-scoped greps (RoleGrant/UserRoleAssignment/UserPermission in core.prisma, and AdminScope in organization.prisma) that do return 0, verified by running them.
- Lens 2 cited AuditLog.actorId at core.prisma:220; that line is where `model AuditLog {` starts, actorId itself is on line 222. Corrected citation to name both lines.
