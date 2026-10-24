import { ForbiddenException } from '@nestjs/common';
import type { AdminScopeLevel } from '../prisma/client';

/**
 * The shape `assertCanManageAtScope()` and `scopeFilterFor()` read — an
 * actor's resolved `AdminScope` rows (RETAIL-ERP.md R10, WO-18.4). Every
 * deployment today has zero of these: `organization` is off by default
 * (WO-18.3), so callers pass `[]` and both functions behave as documented
 * below for that case.
 */
export interface AdminScopeGrant {
  level: AdminScopeLevel;
  retailBrandId: string | null;
  branchNodeId: string | null;
}

export interface ScopedActor {
  id: string;
  permissions: string[];
  adminScopes: AdminScopeGrant[];
}

/** What a `RetailBrand`- or `Location`-shaped row needs, to be checked or filtered against an actor's scope. */
export interface ScopeTarget {
  retailBrandId: string | null;
  branchNodeId?: string | null;
}

export interface ResolvedScope {
  /** A user holding this sees and manages everything — the entire mechanism behind "super admin" (R10). */
  isOrgWide: boolean;
  /** Brands this actor may manage in full — from BRAND-level (or wider) grants only. A brand grant covers every branch under it; this list is what `assertCanManageAtScope` checks, deliberately not widened by branch-level grants. */
  manageableBrandIds: string[];
  /** branchNodeIds a BRANCH-level grant names — the one branch that grant covers, nothing wider. */
  manageableBranchNodeIds: string[];
  /** Every brand this actor has *any* presence in — manageableBrandIds plus the parent brand of every branch-level grant. For list visibility ("which brands does my nav show") — never for authorization, which stays on manageableBrandIds/manageableBranchNodeIds. */
  visibleBrandIds: string[];
}

/**
 * Reduces an actor's raw `AdminScope` rows to the three sets the guard and
 * the filter each need. Pure and synchronous, like `assertCanManage()` —
 * the caller resolves `adminScopes` from the database beforehand (however
 * the rest of the actor's `permissions` array already gets resolved); this
 * function makes no query of its own.
 */
export function resolveScope(adminScopes: AdminScopeGrant[]): ResolvedScope {
  const isOrgWide = adminScopes.some((grant) => grant.level === 'ORG');
  const manageableBrandIds = [
    ...new Set(
      adminScopes
        .filter((grant) => grant.level === 'BRAND' && grant.retailBrandId)
        .map((grant) => grant.retailBrandId as string),
    ),
  ];
  const manageableBranchNodeIds = [
    ...new Set(
      adminScopes
        .filter((grant) => grant.level === 'BRANCH' && grant.branchNodeId)
        .map((grant) => grant.branchNodeId as string),
    ),
  ];
  const branchGrantBrandIds = adminScopes
    .filter((grant) => grant.level === 'BRANCH' && grant.retailBrandId)
    .map((grant) => grant.retailBrandId as string);
  const visibleBrandIds = [...new Set([...manageableBrandIds, ...branchGrantBrandIds])];

  return { isOrgWide, manageableBrandIds, manageableBranchNodeIds, visibleBrandIds };
}

/**
 * Throws unless the actor holds `"<capability>.manage_all"`, or an
 * `AdminScope` grant wide enough to cover `target` — the scope-aware
 * sibling of `assertCanManage()` (ownership.guard.ts), same file, same
 * `_own`/`_all` convention, extended from "do you own this row" to "does
 * your scope reach this row" (RETAIL-ERP.md R10; this is the second call
 * site `16-pbac-row-scoping.md` said Blocker B5 needed before the general
 * framework was worth building — R10 names AdminScope as exactly that).
 *
 * An ORG grant covers everything. A BRAND grant covers its own brand and
 * every branch under it — `target.branchNodeId` is not even inspected once
 * the brand matches. A BRANCH grant covers only its own branchNodeId.
 */
export function assertCanManageAtScope(
  actor: ScopedActor,
  capability: string,
  target: ScopeTarget,
): void {
  if (actor.permissions.includes(`${capability}.manage_all`)) return;

  const scope = resolveScope(actor.adminScopes);
  if (scope.isOrgWide) return;
  if (target.retailBrandId && scope.manageableBrandIds.includes(target.retailBrandId)) return;
  if (target.branchNodeId && scope.manageableBranchNodeIds.includes(target.branchNodeId)) return;

  throw new ForbiddenException(`You do not have access to manage this ${capability} row.`);
}

/**
 * A Prisma `where` fragment scoping a list query to what the actor's
 * `AdminScope` grants make visible — spread into a scoped list endpoint
 * (R10):
 *
 *   this.prisma.retailBrand.findMany({
 *     where: { ...scopeFilterFor(actor), isActive: true },
 *   });
 *
 * Targets a `RetailBrand`-shaped model (a `retailBrandId` column) — the
 * common case; `RetailBrand` itself, `Location`, `BrandPolicy` all fit. A
 * `Node`-shaped list (addressed by `id`, not a `retailBrandId` column —
 * NodesService.list(), WO-18.1) needs its own fragment built from
 * `resolveScope()` directly rather than this function.
 *
 * ORG scope returns `{}` — no restriction. Brand and branch grants both
 * narrow to `visibleBrandIds` (deliberately the wider, branch-inclusive
 * set — a branch admin still sees their own brand's row for navigation
 * context, even though `assertCanManageAtScope` would refuse them write
 * access to the rest of that brand). **No grants at all narrows to
 * nothing** (`retailBrandId: { in: [] }`, which Prisma's `in` matches
 * against zero rows) rather than falling open to "no restriction" — this
 * is not a substitute for the route's own `@RequirePermission`, only a
 * second, fail-closed layer once that has already let the request through.
 */
export function scopeFilterFor(actor: ScopedActor): { retailBrandId?: { in: string[] } } {
  const scope = resolveScope(actor.adminScopes);
  if (scope.isOrgWide) return {};
  return { retailBrandId: { in: scope.visibleBrandIds } };
}

/**
 * What `GrantService.reachableUnitIdsFor()` hands to `orgUnitScopeFilterFor`
 * below — access-control-identity/21-access-over-the-org-tree.md's fourth
 * scope answer, alongside ORG/BRAND/BRANCH above. `isUnrestricted` is this
 * axis's equivalent of `isOrgWide`: a caller holding NO open `Posting` at
 * all is not narrowed by this mechanism — see `GrantService`'s own doc
 * comment for why (nothing in this codebase's docs 19/20/21 build retrofits
 * an existing list endpoint's default visibility, and the only account that
 * exists on a fresh deployment holds no posting).
 */
export interface OrgUnitReach {
  isUnrestricted: boolean;
  /** Reach-root OrgUnit ids — a row is reachable when its own `path` contains ANY of these. */
  unitIds: string[];
}

/**
 * A Prisma `where` fragment scoping a list query to the OrgUnit subtree(s) a
 * reach descriptor covers — doc 21's WO-21.2. Spread into a query against an
 * `OrgUnit`-shaped model (a `path: String[]` column, root-first, including
 * the row's own id):
 *
 *   this.prisma.orgUnit.findMany({ where: orgUnitScopeFilterFor(reach) });
 *
 * `path: { hasSome: unitIds }` is `path && ARRAY[...]` in Postgres — array
 * overlap, index-supported by the GIN index on `path`
 * (org-structure.prisma) — exactly "one indexed containment check" the doc
 * promises, with no raw SQL needed: a row is reachable when ANY of the
 * caller's reach-root ids appears anywhere in that row's own ancestor chain,
 * which is true exactly when the row equals or descends from a reach root.
 *
 * Unrestricted returns `{}` (no restriction), mirroring `scopeFilterFor`'s
 * own `isOrgWide` case. A restricted reach with zero unit ids narrows to
 * nothing (`hasSome: []` matches no row) rather than falling open — the same
 * fail-closed convention `scopeFilterFor` already documents above.
 */
export function orgUnitScopeFilterFor(reach: OrgUnitReach): { path?: { hasSome: string[] } } {
  if (reach.isUnrestricted) return {};
  return { path: { hasSome: reach.unitIds } };
}
