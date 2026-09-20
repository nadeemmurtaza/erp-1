# 01g generate identity actor types

Output of the `gen:01:identity-actor-types` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Identity and the hundred kinds of actor — who may hold an account at all, and what each kind of actor is modelled as

## File

docs/erp-lenses/01-identity-actor-types.md

## Lenses

### The actor with three tables

**Question:** For each new kind of actor this feature introduces, name which existing table it becomes — User, Party, or one of the three independent key-hash principals (TradingPartner.inboundApiKeyHash, PosTerminal.deviceKeyHash, Node.inboundApiKeyHash) — and if a real person can hold two of these for the same engagement, name the column that links the two rows.

**Grounding:** core.prisma:11 (User, no partyId column), parties.prisma:15 (Party, no userId column) — confirmed no link exists by grep; 'franchisee'/'Franchisee' returns zero matches anywhere in apps/api/prisma/schema; trading-partners.prisma:47, pos.prisma:39, organization.prisma Node model each define an independent SHA-256 hash credential.

### The credential with no permission key

**Question:** For any actor kind that is not a User, name which keys from PERMISSION_CATALOG it can be checked against — or state that it bypasses PermissionsGuard entirely and name the one code path that authenticates it instead.

**Grounding:** trading-partners.prisma:47 (inboundApiKeyHash), pos.prisma:39 (deviceKeyHash), organization.prisma Node model (inboundApiKeyHash) — three separate ad-hoc credential patterns, none a User row, none passing through PermissionsResolverService.resolveForUser or PermissionsGuard; core.prisma:220 AuditLog.actorId is a bare scalar with no principal-type discrimination.

### The access with no end date

**Question:** For an actor whose access must end without a human remembering to revoke it — an external auditor, a tax agent, a seasonal subcontractor — name the field that ends it, and what happens to their RoleGrant/AdminScope rows the day the engagement closes.

**Grounding:** core.prisma RoleGrant (line 321), UserRoleAssignment (336), UserPermission (278), and organization.prisma:106 AdminScope — all four confirmed by direct read to carry only createdAt, no expiresAt or grantedBy column anywhere in the schema.

## Absences

- No link between User and Party — the same human cannot be represented as both a directory counterparty and a logged-in principal
- No Franchisee model, role, or PartyRoleName value at all
- No shared principal type across TradingPartner, PosTerminal and Node — three independent key-hash patterns, none checked against PERMISSION_CATALOG
- No expiresAt or grantedBy on RoleGrant, UserRoleAssignment, UserPermission, or AdminScope — no way to represent or later prove a time-boxed grant

