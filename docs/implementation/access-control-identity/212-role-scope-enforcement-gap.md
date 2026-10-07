# 212 — Role/permission scope enforcement: confirmed gap between "may you at all" and "over which rows"

> **Status: investigated, nothing built.** A real, present gap confirmed
> against the running schema and guards, not a hypothetical — the
> mechanism this document's own fix needs already exists half-built
> (`scope.guard.ts`, docs 16/21) and is not enforced by any automated
> check. No code changed in this pass. ADR-081.

## 1. The concern, in the owner's own words

"Finance manager from company A and same role from company B should not
be considered the same person" — confirm which company, confirm which
department, before granting access. Not a request for a new "back tree"
mechanism: the tree already exists. This document checks whether it's
actually enforced.

## 2. What's confirmed, against the real code

**A `Role` is global and a role assignment carries no scope.**
`Role.name` is `@unique` — one row per role name, tenant-wide
(`apps/api/prisma/schema/core.prisma:520`). `UserRoleAssignment` is
`{ id, userId, roleId, createdAt }` — no `retailBrandId`, no `orgUnitId`,
nothing that confines a grant to one company or department
(`core.prisma:547-559`). Assigning "Finance Manager" to a user grants
every permission key that role holds, tenant-wide, the instant the
assignment is created.

**This is by design, not a bug — permission resolution and row scoping
are deliberately two different questions.** `PermissionsResolverService`'s
own doc comment says so directly: "*this resolver answers may you at all;
over which rows is scope.guard.ts's job*" (`permissions.service.ts:58`).
`resolveForUser()`/`resolveForUserCached()` return a flat
`{ roles, permissions }` — no brand, no department, on purpose.

**The "over which rows" layer exists, twice, and is well-built:**
- `AdminScope` (ORG/BRAND/BRANCH) — `assertCanManageAtScope()` throws
  unless an actor's scope covers a target's `retailBrandId`/`branchNodeId`;
  `scopeFilterFor()` narrows a list query the same way
  (`apps/api/src/core/auth/scope.guard.ts:84-128`).
- `OrgUnitGrant` plus the materialized `path` array — `GrantService.
  reachOf()` resolves an actor's reachable OrgUnit subtree(s)
  (`org-unit-grant.service.ts:111`); `orgUnitScopeFilterFor()` turns that
  into a GIN-indexed `path: { hasSome: unitIds }` filter
  (`scope.guard.ts:166-169`).

**Neither is applied by default, and one of them has never been called
in production at all.** Confirmed by grepping the whole of `apps/api/src`
for real call sites, excluding the guard's own definition and its spec:

| Function | Production callers | Where |
|---|---|---|
| `assertCanManageAtScope` / `scopeFilterFor` | **1 file** | `modules/people/organization/organization.service.ts` — `listBrands`, `listNodes`, `getBrandPolicy`, `setBrandPolicy`, `listPolicyQuarantine` |
| `orgUnitScopeFilterFor` | **0 files** | Referenced only in its own `scope.guard.spec.ts` |

Doc 16's own status blockquote already said this plainly for the
brand/branch side ("Still not wired into a live route... nothing today
calls either function outside its own tests"); this document confirms
it is now wired into exactly one module, and confirms the OrgUnit/
department side is still zero.

**The one automated check that runs on every route has no idea any of
this exists.** `scripts/check-route-permissions.mjs` verifies a route
carries `@RequirePermission`, `@Public`, or `@AuthenticatedOnly`
(`check-route-permissions.mjs:11-19,38`) — presence of a permission
decorator, nothing about whether the handler also scopes its query. A
controller checking `@RequirePermission('finance.manage')` and querying
`prisma.something.findMany()` with no `retailBrandId`/`orgUnitId` filter
passes `pnpm lint` clean today.

## 3. What this means concretely

Outside the `organization` module itself, **every other module is
exposed to exactly the scenario named**: if two companies/brands exist
under one tenant (Organization edition) and a "Finance Manager" role is
assigned to one person per company — whether via the same `Role` row or
two different roles granting the same permission keys — nothing stops a
route in, say, `finance-accounting` or `crm` from returning or mutating
the other company's rows, because the route's own `@RequirePermission`
check has no idea which company issued the request, and nothing
downstream re-checks. This is not a defect in `AdminScope`/`OrgUnitGrant`
— it's an adoption gap. The mechanism is correct; it just isn't reached.

## 4. Decision

1. **Do not add a rigid `User.homeCompanyId`/`homeOrgUnitId` field.**
   Grant-based membership (`AdminScope`, `OrgUnitGrant`) is the right
   shape — time-boxed, revocable, matches the "grant that ends itself"
   discipline `CLAUDE.md` already requires. A fixed "home company" column
   would fight that, not strengthen it.
2. **Enforce pairing with a static check, the same class as
   `check-route-permissions.mjs`**, not a runtime framework: a new script
   (`scripts/check-route-scoping.mjs`) that walks every
   `@RequirePermission`-guarded handler touching a `RetailBrand`-,
   `Location`-, or `OrgUnit`-shaped Prisma model and fails the build if
   the method body calls neither `assertCanManageAtScope`/`scopeFilterFor`
   nor `orgUnitScopeFilterFor`. Same enforcement class as
   `check-module-boundaries.mjs` — a build gate, not a reviewer's memory.
3. **Give `orgUnitScopeFilterFor()` a first real caller** before more code
   is written assuming it works — doc 16/18's own "prove the shape before
   a real consumer depends on it" discipline, applied to the half of this
   mechanism that has never once been exercised outside a test.
4. **Confirm the `organization` module (WO-18.3) is actually enabled**
   wherever more than one `RetailBrand`/company shares a tenant.
   `AdminScope` scoping is a complete no-op with the module off — a
   deployment can be running exactly the exposure in §3 while believing
   `AdminScope` protects it, because nothing currently fails loudly when
   the module is off and more than one brand exists.

## 5. Out of scope (this pass)

Not built in this pass:

- `scripts/check-route-scoping.mjs` itself.
- Wiring `orgUnitScopeFilterFor()` into a real department-scoped list
  endpoint.
- An audit of every existing `@RequirePermission` route against the new
  check, to find which ones fail it today.
- Any runtime behavior change — this document is a finding and a decision
  on the fix's shape, not an implementation.

## Acceptance criteria (for the work order that builds this)

1. `pnpm lint` fails when a `@RequirePermission`-guarded handler queries a
   brand/branch/OrgUnit-shaped model with no paired scope call.
2. At least one production route calls `orgUnitScopeFilterFor()`.
3. A deployment with the `organization` module off and more than one
   `RetailBrand` row logs or fails loudly, rather than silently running
   unscoped.
