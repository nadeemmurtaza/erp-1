import { BadRequestException, ForbiddenException, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { resolveScope, scopeFilterFor, assertCanManageAtScope, type AdminScopeGrant, type ScopedActor } from '../../../core/auth/scope.guard';
import { BranchPolicyRegistry } from '../../../core/extension-points/branch-policy.registry';
import { PolicyQuarantineService } from '../../../core/replication/policy-quarantine.service';
import type { AdminScope, AdminScopeLevel, BrandPolicy, Node, PolicyQuarantine, RetailBrand } from '../../../core/prisma/client';
import type { UpdateBrandPolicyDto } from './dto/brand-policy.dto';

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
export class OrganizationService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchPolicy: BranchPolicyRegistry,
    private readonly policyQuarantine: PolicyQuarantineService,
  ) {}

  /** Registers both BranchPolicyRegistry handlers, so `purchasing` (always-on) can ask "is this branch allowed to buy locally?" — from a user's own session, or from a replicated fact's origin node — without importing this off-by-default module, the same seam `inventory` uses for StockIntakeRegistry. */
  onModuleInit(): void {
    this.branchPolicy.register({
      allowsBranchLocalPurchasing: (userId) => this.allowsBranchLocalPurchasing(userId),
      allowsBranchLocalPurchasingForNode: (originNodeId) => this.allowsBranchLocalPurchasingForNode(originNodeId),
    });
  }

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

  /**
   * The three switches a brand sets for its own branches (R9/R13, ADR-021/
   * ADR-022): allowBranchProductCreation, allowBranchLocalPurchasing,
   * allowInterBranchTransfers. `null` when no `BrandPolicy` row exists yet
   * — a brand that never configured this needs no row to mean "as
   * restrictive as possible" (the schema's own `@default(false)` on every
   * column); the caller reads `null` the same way.
   */
  async getBrandPolicy(actor: ScopedActor, retailBrandId: string): Promise<BrandPolicy | null> {
    assertCanManageAtScope(actor, 'organization', { retailBrandId });
    return this.prisma.brandPolicy.findUnique({ where: { retailBrandId } });
  }

  /**
   * A BRAND-level (or wider) grant may set its own brand's policy — an ORG
   * grant may set any brand's. `assertCanManageAtScope` is the same
   * mechanism `scopeFilterFor` already narrows list reads with; this is
   * its first real write-side caller.
   */
  async setBrandPolicy(actor: ScopedActor, retailBrandId: string, patch: UpdateBrandPolicyDto): Promise<BrandPolicy> {
    assertCanManageAtScope(actor, 'organization', { retailBrandId });

    const brand = await this.prisma.retailBrand.findUnique({ where: { id: retailBrandId }, select: { id: true } });
    if (!brand) throw new BadRequestException('That retail brand no longer exists.');

    return this.prisma.brandPolicy.upsert({
      where: { retailBrandId },
      create: {
        retailBrandId,
        allowBranchProductCreation: patch.allowBranchProductCreation ?? false,
        allowBranchLocalPurchasing: patch.allowBranchLocalPurchasing ?? false,
        allowInterBranchTransfers: patch.allowInterBranchTransfers ?? false,
      },
      update: {
        allowBranchProductCreation: patch.allowBranchProductCreation,
        allowBranchLocalPurchasing: patch.allowBranchLocalPurchasing,
        allowInterBranchTransfers: patch.allowInterBranchTransfers,
      },
    });
  }

  /**
   * R9's quarantine (WO-23.3c/e) — an ORG-wide actor sees every open entry;
   * a BRAND/BRANCH-scope actor sees only entries attributable to a brand
   * their scope reaches. An entry with no `retailBrandId` at all (the
   * origin node couldn't even be resolved to a brand) is ORG-only — a
   * brand-scoped viewer has no legitimate claim on an exception that isn't
   * attributable to their own brand. An actor with no grant at all sees
   * nothing, the same fail-closed default `scopeFilterFor` already gives.
   */
  async listPolicyQuarantine(actor: ScopedActor): Promise<PolicyQuarantine[]> {
    const entries = await this.policyQuarantine.listOpen();
    const scope = resolveScope(actor.adminScopes);
    if (scope.isOrgWide) return entries;
    return entries.filter((entry) => entry.retailBrandId && scope.visibleBrandIds.includes(entry.retailBrandId));
  }

  /** Same scope reach as `listPolicyQuarantine()` — a brand admin may resolve their own brand's exceptions, never another's. */
  async resolvePolicyQuarantine(
    actor: ScopedActor,
    id: string,
    resolvedById: string,
    note?: string,
  ): Promise<PolicyQuarantine> {
    const entry = await this.policyQuarantine.get(id);
    if (!entry) throw new NotFoundException('Quarantined record not found.');

    const scope = resolveScope(actor.adminScopes);
    if (!scope.isOrgWide && !(entry.retailBrandId && scope.visibleBrandIds.includes(entry.retailBrandId))) {
      throw new ForbiddenException('You do not have access to resolve this quarantined record.');
    }

    return this.policyQuarantine.resolve(id, resolvedById, note);
  }

  /**
   * BranchPolicyRegistry's own handler (registered in `onModuleInit()`
   * above). An ORG-wide or BRAND-level (or wider) grant may always create a
   * BRANCH-scope purchase order — R9's switch protects a branch from
   * overreaching its own brand's policy, not from an admin who already
   * holds authority over that policy and could simply flip it. A
   * BRANCH-only actor is checked against every brand their BRANCH grants
   * name; `.some()` fails CLOSED the moment none of those brands has a
   * `BrandPolicy` row saying `true` (ADR-021) — including the case where no
   * row exists at all. An actor with no AdminScope grant at all (no
   * `organization` involvement) is waved through: nothing about their
   * request claims a branch identity this switch was ever meant to gate.
   */
  private async allowsBranchLocalPurchasing(userId: string): Promise<boolean> {
    const grants = await this.grantsFor(userId);
    const scope = resolveScope(grants);
    if (scope.isOrgWide || scope.manageableBrandIds.length > 0) return true;

    const branchGrantBrandIds = [
      ...new Set(
        grants
          .filter((grant) => grant.level === 'BRANCH' && grant.retailBrandId)
          .map((grant) => grant.retailBrandId as string),
      ),
    ];
    if (branchGrantBrandIds.length === 0) return true;

    const policies = await this.prisma.brandPolicy.findMany({
      where: { retailBrandId: { in: branchGrantBrandIds } },
    });
    return policies.some((policy) => policy.allowBranchLocalPurchasing);
  }

  /**
   * BranchPolicyRegistry's RECEIVING-side handler (WO-23.3c/e, ADR-023) —
   * a replicated FACT claims `scopeLevel: 'BRANCH'` and there is no acting
   * user, only the authenticated child node that pushed it. Resolves
   * `Node.retailBrandId` → that brand's `BrandPolicy`, failing CLOSED at
   * every step: no `Node` row for this `nodeId`, no `retailBrandId`
   * recorded on it, or no `BrandPolicy` row for that brand all read as
   * "not allowed" — the opposite default from the user-keyed method above,
   * because a fact that explicitly claims a branch identity is exactly the
   * claim R9 says is never trusted by default.
   */
  private async allowsBranchLocalPurchasingForNode(originNodeId: string): Promise<boolean> {
    const node = await this.prisma.node.findUnique({ where: { nodeId: originNodeId }, select: { retailBrandId: true } });
    if (!node?.retailBrandId) return false;

    const policy = await this.prisma.brandPolicy.findUnique({ where: { retailBrandId: node.retailBrandId } });
    return policy?.allowBranchLocalPurchasing ?? false;
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
