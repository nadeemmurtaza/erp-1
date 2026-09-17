import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { resolveScope, scopeFilterFor, type AdminScopeGrant, type ScopedActor } from '../../core/auth/scope.guard';
import type { Node, RetailBrand } from '../../core/prisma/client';

/**
 * Where this actor lands (R19) — the *authoritative* signal, not something
 * the frontend should infer from `brands.length`/`nodes.length`. `brands`
 * below is deliberately widened to include a BRANCH grant's own parent
 * brand (for breadcrumb visibility — see `resolveScope()`'s
 * `visibleBrandIds`), so a branch-only actor's `brands` array is non-empty
 * too; checking array length instead of `level` would land them on the
 * brand dashboard (#2) they cannot manage, one they were only ever meant to
 * glimpse the name of.
 */
export type MyScopeLevel = 'ORG' | 'BRAND' | 'BRANCH' | 'NONE';

export interface MyScopeResult {
  isOrgWide: boolean;
  level: MyScopeLevel;
  /** The single Organization row this deployment describes itself with — only fetched (and only ever non-null) for an org-wide actor. There is at most one per database (WO-18.3). */
  organization: { id: string; name: string } | null;
  brands: RetailBrand[];
  nodes: Node[];
}

/**
 * Read side of the `organization` module (RETAIL-ERP.md R19, WO-18.5) — the
 * three-level admin shell's data. Nothing here writes; promoting a
 * branch-created product, editing brand policy, registering a node — all
 * later work, gated on this module actually shipping a write path.
 */
@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  /** This actor's own resolved scope — what the frontend uses to decide where to land and what chips to draw (R19). */
  async myScope(actor: ScopedActor): Promise<MyScopeResult> {
    const scope = resolveScope(actor.adminScopes);

    const [brands, nodes, organization] = await Promise.all([
      this.listBrands(actor),
      this.listNodes(actor),
      scope.isOrgWide
        ? this.prisma.organization.findFirst({ select: { id: true, name: true } })
        : Promise.resolve(null),
    ]);

    const level: MyScopeLevel = scope.isOrgWide
      ? 'ORG'
      : scope.manageableBrandIds.length > 0
        ? 'BRAND'
        : scope.manageableBranchNodeIds.length > 0
          ? 'BRANCH'
          : 'NONE';

    return { isOrgWide: scope.isOrgWide, level, organization, brands, nodes };
  }

  /** RetailBrand rows visible to this actor — the "All" / brand chip row at ORG scope. */
  async listBrands(actor: ScopedActor): Promise<RetailBrand[]> {
    return this.prisma.retailBrand.findMany({
      where: { ...scopeFilterFor(actor), isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * This deployment's registered child nodes, narrowed to what the actor may
   * see. `Node` carries no `retailBrandId` (WO-18.3 — a branch is shared
   * infrastructure across a brand's sub-brands, Part 1), so this cannot use
   * `scopeFilterFor()` — a brand-or-wider grant sees every node (a brand
   * admin manages every branch under it); a branch-only grant sees just its
   * own nodes; no grant at all sees none, same fail-closed default as
   * `scopeFilterFor`.
   */
  async listNodes(actor: ScopedActor): Promise<Node[]> {
    const scope = resolveScope(actor.adminScopes);
    if (scope.isOrgWide || scope.manageableBrandIds.length > 0) {
      return this.prisma.node.findMany({ orderBy: { label: 'asc' } });
    }
    if (scope.manageableBranchNodeIds.length === 0) return [];
    return this.prisma.node.findMany({
      where: { id: { in: scope.manageableBranchNodeIds } },
      orderBy: { label: 'asc' },
    });
  }

  /** An actor's raw AdminScope grants, for building a `ScopedActor` — the one query every caller needs before it can call anything above. */
  async grantsFor(userId: string): Promise<AdminScopeGrant[]> {
    return this.prisma.adminScope.findMany({
      where: { userId },
      select: { level: true, retailBrandId: true, branchNodeId: true },
    });
  }
}
