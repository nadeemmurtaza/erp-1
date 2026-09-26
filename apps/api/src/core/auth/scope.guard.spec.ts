import { ForbiddenException } from '@nestjs/common';
import { assertCanManageAtScope, orgUnitScopeFilterFor, resolveScope, scopeFilterFor } from './scope.guard';
import type { AdminScopeGrant } from './scope.guard';

const actor = (permissions: string[], adminScopes: AdminScopeGrant[] = []) => ({
  id: 'user-1',
  permissions,
  adminScopes,
});

const org = (): AdminScopeGrant => ({ level: 'ORG', retailBrandId: null, branchNodeId: null });
const brand = (retailBrandId: string): AdminScopeGrant => ({ level: 'BRAND', retailBrandId, branchNodeId: null });
const branch = (retailBrandId: string, branchNodeId: string): AdminScopeGrant => ({
  level: 'BRANCH',
  retailBrandId,
  branchNodeId,
});

describe('resolveScope', () => {
  it('is org-wide with an ORG grant, regardless of other grants', () => {
    expect(resolveScope([org(), brand('b1')]).isOrgWide).toBe(true);
  });

  it('collects manageable brand ids from BRAND grants only', () => {
    const scope = resolveScope([brand('b1'), branch('b2', 'n1')]);
    expect(scope.manageableBrandIds).toEqual(['b1']);
  });

  it('collects manageable branch ids from BRANCH grants', () => {
    const scope = resolveScope([branch('b1', 'n1'), branch('b1', 'n2')]);
    expect(scope.manageableBranchNodeIds.sort()).toEqual(['n1', 'n2']);
  });

  it('visibleBrandIds unions BRAND grants with the parent brand of BRANCH grants', () => {
    const scope = resolveScope([brand('b1'), branch('b2', 'n1')]);
    expect(scope.visibleBrandIds.sort()).toEqual(['b1', 'b2']);
  });

  it('a branch-only grant does not make its brand manageable, only visible', () => {
    const scope = resolveScope([branch('b1', 'n1')]);
    expect(scope.manageableBrandIds).toEqual([]);
    expect(scope.visibleBrandIds).toEqual(['b1']);
  });

  it('deduplicates repeated grants', () => {
    const scope = resolveScope([brand('b1'), brand('b1')]);
    expect(scope.manageableBrandIds).toEqual(['b1']);
  });

  it('is empty for an actor with no grants', () => {
    const scope = resolveScope([]);
    expect(scope).toEqual({
      isOrgWide: false,
      manageableBrandIds: [],
      manageableBranchNodeIds: [],
      visibleBrandIds: [],
    });
  });
});

describe('assertCanManageAtScope', () => {
  it('allows a manage_all holder regardless of scope', () => {
    expect(() =>
      assertCanManageAtScope(actor(['organization.brands.manage_all']), 'organization.brands', {
        retailBrandId: 'someone-elses-brand',
      }),
    ).not.toThrow();
  });

  it('allows an ORG-scope holder to manage any brand', () => {
    expect(() =>
      assertCanManageAtScope(actor([], [org()]), 'organization.brands', { retailBrandId: 'b1' }),
    ).not.toThrow();
  });

  it('allows a BRAND-scope holder to manage that brand', () => {
    expect(() =>
      assertCanManageAtScope(actor([], [brand('b1')]), 'organization.brands', { retailBrandId: 'b1' }),
    ).not.toThrow();
  });

  it('allows a BRAND-scope holder to manage a branch under that brand', () => {
    expect(() =>
      assertCanManageAtScope(actor([], [brand('b1')]), 'organization.branches', {
        retailBrandId: 'b1',
        branchNodeId: 'n1',
      }),
    ).not.toThrow();
  });

  it('rejects a BRAND-scope holder against a different brand', () => {
    expect(() =>
      assertCanManageAtScope(actor([], [brand('b1')]), 'organization.brands', { retailBrandId: 'b2' }),
    ).toThrow(ForbiddenException);
  });

  it('allows a BRANCH-scope holder to manage that one branch', () => {
    expect(() =>
      assertCanManageAtScope(actor([], [branch('b1', 'n1')]), 'organization.branches', {
        retailBrandId: 'b1',
        branchNodeId: 'n1',
      }),
    ).not.toThrow();
  });

  it('rejects a BRANCH-scope holder against a sibling branch in the same brand', () => {
    expect(() =>
      assertCanManageAtScope(actor([], [branch('b1', 'n1')]), 'organization.branches', {
        retailBrandId: 'b1',
        branchNodeId: 'n2',
      }),
    ).toThrow(ForbiddenException);
  });

  it('rejects a BRANCH-scope holder from managing the brand itself (no branchNodeId on the target)', () => {
    expect(() =>
      assertCanManageAtScope(actor([], [branch('b1', 'n1')]), 'organization.brands', {
        retailBrandId: 'b1',
      }),
    ).toThrow(ForbiddenException);
  });

  it('rejects an actor with no grant and no manage_all', () => {
    expect(() =>
      assertCanManageAtScope(actor([]), 'organization.brands', { retailBrandId: 'b1' }),
    ).toThrow(ForbiddenException);
  });
});

describe('scopeFilterFor', () => {
  it('returns no restriction for an ORG-scope holder', () => {
    expect(scopeFilterFor(actor([], [org()]))).toEqual({});
  });

  it('narrows to visible brands for a BRAND-scope holder', () => {
    expect(scopeFilterFor(actor([], [brand('b1'), brand('b2')]))).toEqual({
      retailBrandId: { in: ['b1', 'b2'] },
    });
  });

  it('narrows to the parent brand for a BRANCH-scope holder', () => {
    expect(scopeFilterFor(actor([], [branch('b1', 'n1')]))).toEqual({
      retailBrandId: { in: ['b1'] },
    });
  });

  it('matches nothing for an actor with no grants at all — fail closed, not fail open', () => {
    expect(scopeFilterFor(actor([]))).toEqual({ retailBrandId: { in: [] } });
  });
});

// access-control-identity/21-access-over-the-org-tree.md WO-21.2 — the
// fourth scopeFilterFor case, over an OrgUnit's own `path`.
describe('orgUnitScopeFilterFor', () => {
  it('returns no restriction when unrestricted (no open posting — see GrantService)', () => {
    expect(orgUnitScopeFilterFor({ isUnrestricted: true, unitIds: [] })).toEqual({});
  });

  it('narrows to a hasSome filter over the reach-root unit ids', () => {
    expect(orgUnitScopeFilterFor({ isUnrestricted: false, unitIds: ['north'] })).toEqual({
      path: { hasSome: ['north'] },
    });
  });

  it('matches nothing for a restricted reach with zero unit ids — fail closed, not fail open', () => {
    expect(orgUnitScopeFilterFor({ isUnrestricted: false, unitIds: [] })).toEqual({ path: { hasSome: [] } });
  });

  /**
   * doc 19's own acceptance criterion, word for word: "scopeFilterFor()
   * over a mid-tree unit returns that unit and its descendants and nothing
   * else, proven at three depths." Simulated here over an in-memory tree
   * (root -> north -> north-hr) the way the real GIN-indexed `path && ...`
   * containment query behaves in Postgres — `hasSome` is exactly the
   * overlap test, so filtering this array in JS is a faithful stand-in for
   * what the database does.
   */
  it('reaches a mid-tree unit and every descendant, and nothing above or beside it — three depths', () => {
    const tree = [
      { id: 'root', path: ['root'] },
      { id: 'north', path: ['root', 'north'] },
      { id: 'south', path: ['root', 'south'] },
      { id: 'north-hr', path: ['root', 'north', 'north-hr'] },
      { id: 'north-hr-payroll', path: ['root', 'north', 'north-hr', 'north-hr-payroll'] },
    ];

    const filter = orgUnitScopeFilterFor({ isUnrestricted: false, unitIds: ['north'] });
    const reachable = tree.filter((unit) => unit.path.some((id) => filter.path!.hasSome.includes(id)));

    expect(reachable.map((u) => u.id).sort()).toEqual(['north', 'north-hr', 'north-hr-payroll']);
    expect(reachable.map((u) => u.id)).not.toContain('root');
    expect(reachable.map((u) => u.id)).not.toContain('south');
  });
});
