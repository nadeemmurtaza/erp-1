import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { BranchPolicyRegistry } from '../../core/extension-points/branch-policy.registry';
import type { AdminScopeGrant, ScopedActor } from '../../core/auth/scope.guard';

const org = (): AdminScopeGrant => ({ level: 'ORG', retailBrandId: null, branchNodeId: null });
const brand = (retailBrandId: string): AdminScopeGrant => ({ level: 'BRAND', retailBrandId, branchNodeId: null });
const branch = (retailBrandId: string, branchNodeId: string): AdminScopeGrant => ({
  level: 'BRANCH',
  retailBrandId,
  branchNodeId,
});
const actor = (adminScopes: AdminScopeGrant[]): ScopedActor => ({
  id: 'user-1',
  permissions: [],
  adminScopes,
});

describe('OrganizationService', () => {
  let service: OrganizationService;
  let prisma: any;
  let branchPolicy: BranchPolicyRegistry;

  beforeEach(async () => {
    prisma = {
      retailBrand: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue({ id: 'b1' }) },
      node: { findMany: jest.fn().mockResolvedValue([]) },
      adminScope: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      organization: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({}) },
      brandPolicy: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OrganizationService, { provide: PrismaService, useValue: prisma }, BranchPolicyRegistry],
    }).compile();

    service = module.get<OrganizationService>(OrganizationService);
    branchPolicy = module.get(BranchPolicyRegistry);
    service.onModuleInit();
  });

  describe('listBrands', () => {
    it('spreads scopeFilterFor into the where clause', async () => {
      await service.listBrands(actor([brand('b1')]));

      expect(prisma.retailBrand.findMany).toHaveBeenCalledWith({
        where: { retailBrandId: { in: ['b1'] }, isActive: true },
        orderBy: { name: 'asc' },
      });
    });

    it('applies no restriction for an ORG-scope actor', async () => {
      await service.listBrands(actor([org()]));

      expect(prisma.retailBrand.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('listNodes', () => {
    it('returns every node for an ORG-scope actor', async () => {
      await service.listNodes(actor([org()]));
      expect(prisma.node.findMany).toHaveBeenCalledWith({ orderBy: { label: 'asc' } });
    });

    it('returns every node for a BRAND-scope actor — a brand grant covers every branch under it', async () => {
      await service.listNodes(actor([brand('b1')]));
      expect(prisma.node.findMany).toHaveBeenCalledWith({ orderBy: { label: 'asc' } });
    });

    it('narrows to the actor’s own nodes for a BRANCH-only actor', async () => {
      await service.listNodes(actor([branch('b1', 'n1'), branch('b1', 'n2')]));
      expect(prisma.node.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['n1', 'n2'] } },
        orderBy: { label: 'asc' },
      });
    });

    it('queries nothing for an actor with no grants — fail closed', async () => {
      await service.listNodes(actor([]));
      expect(prisma.node.findMany).not.toHaveBeenCalled();
    });
  });

  describe('myScope', () => {
    it('reports isOrgWide, the Organization row, and the brand/node lists for an org-wide actor', async () => {
      prisma.retailBrand.findMany.mockResolvedValue([{ id: 'b1' }]);
      prisma.node.findMany.mockResolvedValue([{ id: 'n1' }]);
      prisma.organization.findFirst.mockResolvedValue({ id: 'org1', name: 'Khaadi Group' });

      const result = await service.myScope(actor([org()]));

      expect(result).toEqual({
        isOrgWide: true,
        level: 'ORG',
        organization: { id: 'org1', name: 'Khaadi Group' },
        brands: [{ id: 'b1' }],
        nodes: [{ id: 'n1' }],
      });
    });

    it('is not org-wide for a BRAND-scope actor, and never fetches the Organization row', async () => {
      const result = await service.myScope(actor([brand('b1')]));

      expect(result.isOrgWide).toBe(false);
      expect(result.level).toBe('BRAND');
      expect(result.organization).toBeNull();
      expect(prisma.organization.findFirst).not.toHaveBeenCalled();
    });

    it('resolves BRANCH level for a branch-only actor, even though brands is non-empty (breadcrumb visibility)', async () => {
      prisma.retailBrand.findMany.mockResolvedValue([{ id: 'b1' }]);
      prisma.node.findMany.mockResolvedValue([{ id: 'n1' }]);

      const result = await service.myScope(actor([branch('b1', 'n1')]));

      expect(result.level).toBe('BRANCH');
      expect(result.brands).toEqual([{ id: 'b1' }]);
    });

    it('resolves NONE for an actor with no grants at all', async () => {
      const result = await service.myScope(actor([]));
      expect(result.level).toBe('NONE');
    });
  });

  describe('grantsFor', () => {
    it('queries AdminScope by userId, selecting only the three fields resolveScope needs', async () => {
      await service.grantsFor('user-1');

      expect(prisma.adminScope.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: { level: true, retailBrandId: true, branchNodeId: true },
      });
    });
  });

  describe('listScopes', () => {
    it('lists every grant, with the holder, for an ORG-scope actor', async () => {
      await service.listScopes(actor([org()]));

      expect(prisma.adminScope.findMany).toHaveBeenCalledWith({
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('refuses a BRAND-scope actor', async () => {
      await expect(service.listScopes(actor([brand('b1')]))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an actor with no grants at all', async () => {
      await expect(service.listScopes(actor([]))).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('grantScope', () => {
    it('only an ORG-scope actor may grant — a BRAND-scope actor is refused even for their own brand', async () => {
      await expect(
        service.grantScope(actor([brand('b1')]), { userId: 'u2', level: 'BRANCH', retailBrandId: 'b1', branchNodeId: 'n1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.adminScope.create).not.toHaveBeenCalled();
    });

    it('grants ORG with no brand or branch', async () => {
      await service.grantScope(actor([org()]), { userId: 'u2', level: 'ORG' });

      expect(prisma.adminScope.create).toHaveBeenCalledWith({
        data: { userId: 'u2', level: 'ORG', retailBrandId: null, branchNodeId: null },
      });
    });

    it('grants BRAND with a retailBrandId and no branchNodeId', async () => {
      await service.grantScope(actor([org()]), { userId: 'u2', level: 'BRAND', retailBrandId: 'b1' });

      expect(prisma.adminScope.create).toHaveBeenCalledWith({
        data: { userId: 'u2', level: 'BRAND', retailBrandId: 'b1', branchNodeId: null },
      });
    });

    it('grants BRANCH with both a retailBrandId and a branchNodeId', async () => {
      await service.grantScope(actor([org()]), {
        userId: 'u2',
        level: 'BRANCH',
        retailBrandId: 'b1',
        branchNodeId: 'n1',
      });

      expect(prisma.adminScope.create).toHaveBeenCalledWith({
        data: { userId: 'u2', level: 'BRANCH', retailBrandId: 'b1', branchNodeId: 'n1' },
      });
    });

    it('refuses ORG with a brand or branch attached', async () => {
      await expect(
        service.grantScope(actor([org()]), { userId: 'u2', level: 'ORG', retailBrandId: 'b1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses BRAND with no retailBrandId', async () => {
      await expect(service.grantScope(actor([org()]), { userId: 'u2', level: 'BRAND' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses BRAND with a branchNodeId attached', async () => {
      await expect(
        service.grantScope(actor([org()]), { userId: 'u2', level: 'BRAND', retailBrandId: 'b1', branchNodeId: 'n1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses BRANCH missing either id', async () => {
      await expect(
        service.grantScope(actor([org()]), { userId: 'u2', level: 'BRANCH', retailBrandId: 'b1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.grantScope(actor([org()]), { userId: 'u2', level: 'BRANCH', branchNodeId: 'n1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('setInterBrandTransfersPolicy', () => {
    it('refuses a non-ORG-scope actor', async () => {
      await expect(service.setInterBrandTransfersPolicy(actor([brand('b1')]), true)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('throws when no Organization row exists yet — there is nothing to update', async () => {
      prisma.organization.findFirst.mockResolvedValue(null);

      await expect(service.setInterBrandTransfersPolicy(actor([org()]), true)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('updates the existing Organization row for an ORG-scope actor', async () => {
      prisma.organization.findFirst.mockResolvedValue({ id: 'org1' });

      await service.setInterBrandTransfersPolicy(actor([org()]), true);

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org1' },
        data: { allowInterBrandTransfers: true },
      });
    });
  });

  describe('getBrandPolicy / setBrandPolicy — WO-23.3b, RETAIL-ERP.md R9/R13', () => {
    it('getBrandPolicy refuses an actor whose scope does not reach the brand', async () => {
      await expect(service.getBrandPolicy(actor([brand('other-brand')]), 'b1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('getBrandPolicy returns null when no BrandPolicy row exists yet', async () => {
      await expect(service.getBrandPolicy(actor([org()]), 'b1')).resolves.toBeNull();
    });

    it('getBrandPolicy allows a BRAND-scope actor managing their own brand', async () => {
      prisma.brandPolicy.findUnique.mockResolvedValue({ retailBrandId: 'b1', allowBranchLocalPurchasing: true });

      const result = await service.getBrandPolicy(actor([brand('b1')]), 'b1');

      expect(result).toEqual({ retailBrandId: 'b1', allowBranchLocalPurchasing: true });
    });

    it('setBrandPolicy refuses an actor whose scope does not reach the brand', async () => {
      await expect(
        service.setBrandPolicy(actor([brand('other-brand')]), 'b1', { allowBranchLocalPurchasing: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.brandPolicy.upsert).not.toHaveBeenCalled();
    });

    it('setBrandPolicy throws when the retail brand no longer exists', async () => {
      prisma.retailBrand.findUnique.mockResolvedValue(null);

      await expect(
        service.setBrandPolicy(actor([org()]), 'b1', { allowBranchLocalPurchasing: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.brandPolicy.upsert).not.toHaveBeenCalled();
    });

    it('setBrandPolicy upserts, defaulting unset switches to false on create', async () => {
      await service.setBrandPolicy(actor([org()]), 'b1', { allowBranchLocalPurchasing: true });

      expect(prisma.brandPolicy.upsert).toHaveBeenCalledWith({
        where: { retailBrandId: 'b1' },
        create: {
          retailBrandId: 'b1',
          allowBranchProductCreation: false,
          allowBranchLocalPurchasing: true,
          allowInterBranchTransfers: false,
        },
        update: {
          allowBranchProductCreation: undefined,
          allowBranchLocalPurchasing: true,
          allowInterBranchTransfers: undefined,
        },
      });
    });
  });

  describe('allowsBranchLocalPurchasing (BranchPolicyRegistry handler) — WO-23.3b', () => {
    it('allows an ORG-wide actor without consulting BrandPolicy', async () => {
      prisma.adminScope.findMany.mockResolvedValue([org()]);

      await expect(branchPolicy.allowsBranchLocalPurchasing('user-1')).resolves.toBe(true);
      expect(prisma.brandPolicy.findMany).not.toHaveBeenCalled();
    });

    it('allows a BRAND-level actor without consulting BrandPolicy', async () => {
      prisma.adminScope.findMany.mockResolvedValue([brand('b1')]);

      await expect(branchPolicy.allowsBranchLocalPurchasing('user-1')).resolves.toBe(true);
      expect(prisma.brandPolicy.findMany).not.toHaveBeenCalled();
    });

    it('allows an actor with no AdminScope grant at all — nothing claims a branch identity', async () => {
      prisma.adminScope.findMany.mockResolvedValue([]);

      await expect(branchPolicy.allowsBranchLocalPurchasing('user-1')).resolves.toBe(true);
      expect(prisma.brandPolicy.findMany).not.toHaveBeenCalled();
    });

    it('fails closed for a BRANCH-only actor when no BrandPolicy row exists for their brand', async () => {
      prisma.adminScope.findMany.mockResolvedValue([branch('b1', 'node1')]);
      prisma.brandPolicy.findMany.mockResolvedValue([]);

      await expect(branchPolicy.allowsBranchLocalPurchasing('user-1')).resolves.toBe(false);
      expect(prisma.brandPolicy.findMany).toHaveBeenCalledWith({ where: { retailBrandId: { in: ['b1'] } } });
    });

    it('fails closed for a BRANCH-only actor whose brand explicitly disallows it', async () => {
      prisma.adminScope.findMany.mockResolvedValue([branch('b1', 'node1')]);
      prisma.brandPolicy.findMany.mockResolvedValue([{ retailBrandId: 'b1', allowBranchLocalPurchasing: false }]);

      await expect(branchPolicy.allowsBranchLocalPurchasing('user-1')).resolves.toBe(false);
    });

    it('allows a BRANCH-only actor whose brand explicitly allows it', async () => {
      prisma.adminScope.findMany.mockResolvedValue([branch('b1', 'node1')]);
      prisma.brandPolicy.findMany.mockResolvedValue([{ retailBrandId: 'b1', allowBranchLocalPurchasing: true }]);

      await expect(branchPolicy.allowsBranchLocalPurchasing('user-1')).resolves.toBe(true);
    });
  });

  describe('revokeScope', () => {
    it('deletes the grant for an ORG-scope actor', async () => {
      await service.revokeScope(actor([org()]), 'scope-1');
      expect(prisma.adminScope.delete).toHaveBeenCalledWith({ where: { id: 'scope-1' } });
    });

    it('refuses a non-ORG-scope actor', async () => {
      await expect(service.revokeScope(actor([brand('b1')]), 'scope-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.adminScope.delete).not.toHaveBeenCalled();
    });
  });
});
