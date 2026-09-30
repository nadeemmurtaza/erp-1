# ADR-081 — Doc 212: role/permission scope enforcement confirmed as a live adoption gap, not a hypothetical — `AdminScope` has exactly one production caller, `orgUnitScopeFilterFor()` has zero, and `check-route-permissions.mjs` has no awareness of either

[← Decision log](../DECISIONS.md)


### Context

The owner raised a specific concern: a role holder at one company/
department must never be authorized against another company's/
department's rows merely because they share a role name or permission
key — confirm company membership, confirm department membership, before
granting access. Investigation was required before answering, since
this codebase already has two real scoping mechanisms (`AdminScope` via
`scope.guard.ts`, and `OrgUnitGrant`'s subtree reach via doc 21) and the
question was whether they are actually enforced, not whether they exist.

### Options Considered

1. **Assume the existing mechanisms are sufficient because they exist.**
   Rejected — grepping the real call sites showed `assertCanManageAtScope`/
   `scopeFilterFor` used in exactly one module (`organization.service.ts`)
   and `orgUnitScopeFilterFor` used nowhere outside its own spec. Assuming
   coverage without checking would have been exactly the kind of
   unverified claim this codebase's own discipline forbids.
2. **Design a new "back tree" authentication mechanism from scratch**, as
   the request was initially phrased. Rejected once investigated — the
   correct mechanism already exists (`AdminScope`, `OrgUnitGrant`); the
   gap is adoption and enforcement, not a missing primitive. Building a
   second mechanism alongside an already-correct, unused one would be the
   duplicate-implementation defect `CLAUDE.md` itself names.
3. **Add a rigid `User.homeCompanyId`/`homeOrgUnitId` field** to make
   membership a single fact rather than inferred from grant rows.
   Rejected — fights the existing "grant that ends itself" model
   (time-boxed, revocable) that `AdminScope`/`OrgUnitGrant` already
   implement correctly.
4. **Record the gap precisely (which functions, how many real callers,
   which automated check doesn't cover it) and propose a static-check
   enforcement mechanism, matching `check-module-boundaries.mjs`'s own
   class of fix, without implementing it in this pass.** Chosen.

### Decision

Doc 212, as written. No `User.homeCompanyId` field. A new
`scripts/check-route-scoping.mjs` is proposed — same enforcement class
as `check-route-permissions.mjs` and `check-module-boundaries.mjs` — to
fail `pnpm lint` when a `@RequirePermission`-guarded handler touching a
`RetailBrand`/`Location`/`OrgUnit`-shaped model has no paired
`assertCanManageAtScope`/`scopeFilterFor`/`orgUnitScopeFilterFor` call.
Not implemented in this pass.

### Reasoning

The permission/scope separation in `PermissionsResolverService`'s own
doc comment ("this resolver answers may you at all; over which rows is
scope.guard.ts's job") is architecturally correct and shouldn't be
undone — the fix belongs at the enforcement layer, matching how this
codebase already catches an undecorated route (`check-route-permissions.
mjs`) and a cross-module import (`check-module-boundaries.mjs`) with a
build-time script rather than a runtime framework or a reviewer's
memory.

### Consequences

No behavior changes yet — every route that would fail the proposed check
today keeps working exactly as before. This ADR records a confirmed,
named exposure (any multi-brand/multi-department tenant with the
`organization` module either off, or on but relying on a route outside
`organization.service.ts`) so it is discoverable and fixable, rather than
found later in an incident. `ENTERPRISE-SCALE.md`'s own list of
not-yet-machine-enforced rules ("branch-scoped reads... undecorated
routes") already named this class of gap; this ADR makes the org/brand-
scoping half of it concrete with real file:line evidence instead of a
general caution.

### Status
**Accepted.**
