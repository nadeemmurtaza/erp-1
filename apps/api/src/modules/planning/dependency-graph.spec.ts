import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DependencyGraphService } from './dependency-graph';

describe('DependencyGraphService', () => {
  let service: DependencyGraphService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      supplierProduct: { findMany: jest.fn().mockResolvedValue([]) },
      bomComponent: { findMany: jest.fn().mockResolvedValue([]) },
      variantLocationStock: { findMany: jest.fn().mockResolvedValue([]) },
      stockTransfer: { findMany: jest.fn().mockResolvedValue([]) },
      supplierBill: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [DependencyGraphService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(DependencyGraphService);
  });

  it('returns an empty graph, never an error, when every source table is empty (bom/transfers off)', async () => {
    const edges = await service.build();
    expect(edges).toEqual([]);
  });

  it('omits RawMaterial edges when no BomComponent rows exist, without touching any other edge type', async () => {
    prisma.supplierProduct.findMany.mockResolvedValue([{ supplierId: 's1', variantId: 'v1' }]);
    const edges = await service.build();
    expect(edges.some((e) => e.from.type === 'RawMaterial')).toBe(false);
    expect(edges).toContainEqual({ from: { type: 'Supplier', id: 's1' }, to: { type: 'Sku', id: 'v1' } });
  });

  it('projects Location -> Location edges only from pairs with real transfer history', async () => {
    prisma.stockTransfer.findMany.mockResolvedValue([{ sourceLocationId: 'l1', destinationLocationId: 'l2' }]);
    const edges = await service.build();
    expect(edges).toContainEqual({ from: { type: 'Location', id: 'l1' }, to: { type: 'Location', id: 'l2' } });
  });

  it('projects an Obligation edge only for a bill not yet fully paid', async () => {
    prisma.supplierBill.findMany.mockResolvedValue([
      { supplierId: 's1', id: 'bill-open', amount: 1000, amountPaid: 400 },
      { supplierId: 's1', id: 'bill-paid', amount: 1000, amountPaid: 1000 },
    ]);
    const edges = await service.build();
    const obligationEdges = edges.filter((e) => e.to.type === 'Obligation');
    expect(obligationEdges).toHaveLength(1);
    expect(obligationEdges[0].to.id).toBe('bill-open');
    expect(obligationEdges[0].weight).toBe(600);
  });
});
