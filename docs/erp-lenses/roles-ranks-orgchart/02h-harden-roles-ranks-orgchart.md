# 02h. Hardening record: Roles, ranks and the org chart

Adversarial review of [02-roles-ranks-orgchart.md](./02-roles-ranks-orgchart.md) by the `harden:02:roles-ranks-orgchart` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (4)

### Rank is a ceiling, not a location  — strong

**Question:** For each approval-gated action, what number bounds how much a given holder of the required permission key may approve alone, where does that number live, and what happens when the amount exceeds it?

**Verified against:** packages/shared/src/permissions.ts (payments.approve), core.prisma:307 (Role, no level field), organization.prisma:82/109 (AdminScopeLevel) — all verified

### Who may mint a role, and what a hundred of them costs  — strong

**Question:** Name the mechanism, if any, that stops a new named role from being an independent, fully-typed-out grant list; is there a base/parent role to extend, and who may create a role at all?

**Verified against:** roles.service.ts (duplicateOfRoleName flags but never blocks), core.prisma:307 (no parentId), packages/shared/src/permissions.ts:438 (ADMIN_LOCKED_PERMISSIONS) — all verified

### The grant that never expires  — strong

**Question:** For a role assignment, permission override, or admin-scope grant this feature creates, what ends it automatically, and if 'someone remembers to revoke it', who is on the hook and how do they find out?

**Verified against:** RoleGrant, UserRoleAssignment, UserPermission, AdminScope (organization.prisma:106) — all carry only createdAt, verified

### The actor with no role  — strong

**Question:** For each non-human/non-employee actor kind, does it hold a Role checked by PermissionsGuard, or does it authenticate through a separate key-hash path that bypasses the permission system, and if so what bounds it?

**Verified against:** TradingPartner.inboundApiKeyHash (trading-partners.prisma:47), PosTerminal.deviceKeyHash (pos.prisma:39), Node.inboundApiKeyHash (organization.prisma:158), PermissionsResolverService.resolveForUser (permissions.service.ts:29) — all verified

## Killed (0)

_Nothing was killed._


## Citations corrected (1)

- None required — all 12 targeted citation checks confirmed exact matches to the repo (Role at core.prisma:307, AdminScopeLevel at organization.prisma:82 used at :109, AdminScope at organization.prisma:106, duplicateOfRoleName behavior in roles.service.ts, ADMIN_LOCKED_PERMISSIONS at permissions.ts:438, resolveForUser at permissions.service.ts:29, the three *KeyHash columns, seedRoles() one-time guard in seed.ts:128, @RequirePermission in decorators.ts:25).
