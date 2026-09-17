import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationService } from './organization.service';
import { PrismaService } from '../../core/prisma/prisma.service';
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

  beforeEach(async () => {
    prisma = {
      retailBrand: { findMany: jest.fn().mockResolvedValue([]) },
      node: { findMany: jest.fn().mockResolvedValue([]) },
      adminScope: { findMany: jest.fn().mockResolvedValue([]) },
      organization: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OrganizationService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<OrganizationService>(OrganizationService);
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
});
