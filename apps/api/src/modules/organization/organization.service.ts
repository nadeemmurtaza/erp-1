import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { resolveScope, scopeFilterFor, type AdminScopeGrant, type ScopedActor } from '../../core/auth/scope.guard';
import type { AdminScope, AdminScopeLevel, Node, RetailBrand } from '../../core/prisma/client';

export interface AdminScopeWithHolder extends AdminScope {
  user: { id: string; email: string | null; firstName: string | null; lastName: string | null };
}

export interface GrantScopeInput {
  userId: string;
  level: AdminScopeLevel;
  retailBrandId?: string;
  branchNodeId?: string;
}

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
  organization: { id: string; name: string; allowInterBrandTransfers: boolean } | null;
  brands: RetailBrand[];
  nodes: Node[];
}

/**
 * The `organization` module's data (RETAIL-ERP.md R19/R10). Mostly read —
 * the three-level admin shell's data (WO-18.5) — plus one write path: who
 * holds `AdminScope` at all (WO-18.6), which is the only thing that decides
 * whether the shell has any admin to show besides a super admin's own
 * future self. Promoting a branch-created product, editing brand policy,
 * registering a node — still later work.
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
        ? this.prisma.organization.findFirst({ select: { id: true, name: true, allowInterBrandTransfers: true } })
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

  /**
   * Every `AdminScope` grant in this deployment (WO-18.6) — who is a super
   * admin, who runs which brand, who manages which branch. ORG-scope only:
   * this is the roster of who has power, and a brand admin seeing another
   * brand's staffing is exactly the kind of leak scope exists to prevent.
   * A brand admin managing their *own* branches' assignments is a
   * reasonable next increment — not built here, because nothing asked for
   * it yet and it is easy to add without touching this method's shape.
   */
  async listScopes(actor: ScopedActor): Promise<AdminScopeWithHolder[]> {
    this.assertOrgWide(actor, 'view the admin roster');

    return this.prisma.adminScope.findMany({
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Makes `input.userId` a super admin (ORG), a brand admin (BRAND), or a
   * branch admin (BRANCH) — the entire mechanism behind those titles (R10):
   * there is no role for any of them, only this row. Only an ORG-scoped
   * actor may call it — "super admin decides who runs what" is the whole
   * point, not a permission any admin can be handed piecemeal.
   */
  async grantScope(actor: ScopedActor, input: GrantScopeInput): Promise<AdminScope> {
    this.assertOrgWide(actor, 'grant admin scope');
    this.assertScopeShape(input);

    return this.prisma.adminScope.create({
      data: {
        userId: input.userId,
        level: input.level,
        retailBrandId: input.level === 'ORG' ? null : (input.retailBrandId ?? null),
        branchNodeId: input.level === 'BRANCH' ? (input.branchNodeId ?? null) : null,
      },
    });
  }

  /** Takes a grant away — the row simply stops existing, unlike a JournalEntry there is no audit reason to keep a revoked grant around. */
  async revokeScope(actor: ScopedActor, adminScopeId: string): Promise<void> {
    this.assertOrgWide(actor, 'revoke admin scope');
    await this.prisma.adminScope.delete({ where: { id: adminScopeId } });
  }

  /**
   * R9's `org.allow_inter_brand_transfers` — the switch `TransfersService`
   * (WO-22.2) reads directly via Prisma before letting a dispatch cross a
   * `RetailBrand` boundary. ORG-scope only, same reasoning `grantScope()`
   * already gives: the organization's own cross-brand policy is not
   * something a brand admin can turn on for themselves.
   *
   * Throws if no `Organization` row exists yet (WO-18.3's own note: "a
   * Chain-edition deployment has no Organization row at all") — there is no
   * "register the organization" endpoint yet either, so this is honest
   * about what it cannot do rather than fabricating a row with a name
   * nobody supplied.
   */
  async setInterBrandTransfersPolicy(actor: ScopedActor, allow: boolean) {
    this.assertOrgWide(actor, 'change the inter-brand transfer policy');

    const existing = await this.prisma.organization.findFirst({ select: { id: true } });
    if (existing) {
      return this.prisma.organization.update({
        where: { id: existing.id },
        data: { allowInterBrandTransfers: allow },
      });
    }

    throw new BadRequestException(
      'No Organization row exists yet for this deployment — register the organization before setting its policy.',
    );
  }

  private assertOrgWide(actor: ScopedActor, action: string): void {
    if (!resolveScope(actor.adminScopes).isOrgWide) {
      throw new ForbiddenException(`Only an organization-scoped admin may ${action}.`);
    }
  }

  private assertScopeShape(input: GrantScopeInput): void {
    if (input.level === 'ORG' && (input.retailBrandId || input.branchNodeId)) {
      throw new BadRequestException('An ORG-level grant takes no brand or branch.');
    }
    if (input.level === 'BRAND' && !input.retailBrandId) {
      throw new BadRequestException('A BRAND-level grant needs a retailBrandId.');
    }
    if (input.level === 'BRAND' && input.branchNodeId) {
      throw new BadRequestException('A BRAND-level grant takes no branchNodeId — it already covers every branch.');
    }
    if (input.level === 'BRANCH' && (!input.retailBrandId || !input.branchNodeId)) {
      throw new BadRequestException('A BRANCH-level grant needs both a retailBrandId and a branchNodeId.');
    }
  }
}
