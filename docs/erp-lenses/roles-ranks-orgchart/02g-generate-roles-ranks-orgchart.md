# 02g generate roles ranks orgchart

Output of the `gen:02:roles-ranks-orgchart` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Roles, ranks and the org chart

## File

docs/erp-lenses/roles-ranks-orgchart/02-roles-ranks-orgchart.md

## Lenses

### Rank is a ceiling, not a location

**Question:** For each approval-gated action in this feature, what number bounds how much a given holder of the required permission key may approve alone, where does that number live per person or per grade, and what happens when the amount exceeds it — a second approver, and is that approver named by role, by rank, or by whoever is online?

**Grounding:** payments.approve (packages/shared/src/permissions.ts) as a flat boolean with no ceiling; Role (core.prisma:307, only name/description/timestamps); AdminScopeLevel ORG|BRAND|BRANCH (organization.prisma:109) as a location axis, not an authority axis.

### Who may mint a role, and what a hundred of them costs

**Question:** Name the mechanism, if any, that stops a new named role from being built as an independent, fully-typed-out grant list. Is there a base or parent role a new one extends, and who holds the permission to create a role at all?

**Grounding:** RolesService duplicate-permission-set flag-only behavior (duplicateOfRoleName, roles.service.ts); Role has no parentId/level (core.prisma:307); roles.manage_permissions as one of two ADMIN_LOCKED_PERMISSIONS (permissions.ts:438); the seedRoles() one-time-grant gap already on record.

### The grant that never expires

**Question:** For a role assignment, permission override, or admin-scope grant this feature creates, what ends it automatically — and if the honest answer is 'someone remembers to revoke it,' name who is on the hook and how they find out it is time.

**Grounding:** RoleGrant, UserRoleAssignment, UserPermission, AdminScope (organization.prisma:106) each carry only createdAt, verified by direct read — no expiresAt or grantedBy on any of the four grant tables.

### The actor with no role

**Question:** For each non-human or non-employee actor kind this feature must let act — POS terminal, trading partner, child node, bot, service account — does it hold a Role and get checked by PermissionsGuard, or does it authenticate through a separate key-hash path that bypasses the permission system, and if the latter, what bounds what it may do?

**Grounding:** TradingPartner.inboundApiKeyHash, PosTerminal.deviceKeyHash, Node.inboundApiKeyHash as three separate ad hoc credential patterns; PermissionsResolverService.resolveForUser (permissions.service.ts:29) resolving strictly via userId/UserRoleAssignment, verified by direct read.

## Absences

- A rank, grade, level, seniority or approval-ceiling field anywhere (not on Role, not on User, not on UserRoleAssignment)
- Role inheritance or a parent/base role (Role has no parentId)
- expiresAt or grantedBy on RoleGrant, UserRoleAssignment, UserPermission, or AdminScope (all four carry only createdAt)
- A department or cost-centre model, or any departmental scope column
- An org chart: no managerId, reportsTo, or people-hierarchy of any kind (RetailBrand.parentId nests brands, not people)
- A common principal abstraction covering User, TradingPartner, PosTerminal, and Node (each authenticates through its own hash pattern with no shared permission surface)

