# ADR-007 — Access control is permission-based, and the grants are data

[← Decision log](../DECISIONS.md)


### Context
Roles as the unit of authorization mean every new capability edits a hardcoded
role check, and a client who wants "a manager who cannot see cost prices" needs
a code change.

### Options Considered
- Role checks at each route (`if (user.role === 'ADMIN')`).
- Permissions in code, role→permission mapping in code.
- Permissions in code, role→permission mapping as data, plus per-user overrides.

### Decision
**PBAC.** Every route states `@RequirePermission('…')` against the catalogue in
`packages/shared/src/permissions.ts`. Which role holds which permission is a
`RolePermission` row, editable from `/admin/settings`, with `UserPermission`
GRANT/REVOKE overrides on top.

### Reasoning
The capability a route needs is a property of the route and belongs in code
beside it. Who holds that capability is a property of the business and changes
without a deploy. Separating them is what lets a client reshape their own roles
without a release, while keeping the guard itself reviewable.

Long-form: `00-HOUSE-RULES.md` Rule 9; `16-pbac-row-scoping.md`;
`RETAIL-ERP.md` R10.

### Consequences
- `JwtAuthGuard` and `PermissionGuard` are global, so a route with no decorator
  is authenticated-but-unrestricted — almost never intended, and **not
  machine-enforced**; `scripts/check-route-permissions.mjs` reports it.
- A permission is not shipped until it reaches a role a live user holds. A key in
  the catalogue that no role grants is scaffolding.
- `pnpm idx perm <key>` reports all three layers at once for this reason.

### Status
Accepted.
