import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SupplierResilienceService } from './supplier-resilience.service';

describe('SupplierResilienceService', () => {
  let service: SupplierResilienceService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      supplierLeadTimeObservation: { findMany: jest.fn(), create: jest.fn() },
      supplier: { findUnique: jest.fn() },
      purchaseOrder: { findMany: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [SupplierResilienceService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(SupplierResilienceService);
  });

  describe('leadTimeDistribution', () => {
    it('falls back to Supplier.leadTimeDays when too few observations exist', async () => {
      prisma.supplierLeadTimeObservation.findMany.mockResolvedValue([{ observedDays: 5 }]);
      prisma.supplier.findUnique.mockResolvedValue({ leadTimeDays: 9 });

      const result = await service.leadTimeDistribution('s1');

      expect(result).toEqual({ meanDays: 9, stdDevDays: 0, observationCount: 1 });
    });

    it('computes a real mean/stdDev once enough observations exist', async () => {
      prisma.supplierLeadTimeObservation.findMany.mockResolvedValue([{ observedDays: 4 }, { observedDays: 6 }, { observedDays: 5 }]);

      const result = await service.leadTimeDistribution('s1');

      expect(result.meanDays).toBe(5);
      expect(result.observationCount).toBe(3);
      expect(result.stdDevDays).toBeCloseTo(0.8165, 3);
    });
  });

  describe('recordObservation', () => {
    it('never records a negative day count', async () => {
      await service.recordObservation('s1', 'po1', -2);
      expect(prisma.supplierLeadTimeObservation.create).not.toHaveBeenCalled();
    });

    it('records a valid observation', async () => {
      await service.recordObservation('s1', 'po1', 5);
      expect(prisma.supplierLeadTimeObservation.create).toHaveBeenCalledWith({
        data: { supplierId: 's1', purchaseOrderId: 'po1', observedDays: 5 },
      });
    });
  });

  describe('supplierScorecard', () => {
    it('returns a zeroed scorecard with no defect rate when the supplier has no orders', async () => {
      prisma.purchaseOrder.findMany.mockResolvedValue([]);
      await expect(service.supplierScorecard('s1')).resolves.toEqual({ otifPct: 0, priceVariancePct: 0, defectRatePct: null });
    });

    it('counts an order as on-time-in-full only when fully received by the expected date', async () => {
      prisma.purchaseOrder.findMany.mockResolvedValue([
        {
          expectedAt: new Date('2026-01-10'),
          items: [
            {
              quantityOrdered: 10,
              quantityReceived: 10,
              unitCost: 100,
              receiptItems: [{ unitCost: 100, goodsReceipt: { receivedAt: new Date('2026-01-05') } }],
            },
          ],
        },
        {
          expectedAt: new Date('2026-01-10'),
          items: [
            {
              quantityOrdered: 10,
              quantityReceived: 8,
              unitCost: 100,
              receiptItems: [{ unitCost: 100, goodsReceipt: { receivedAt: new Date('2026-01-05') } }],
            },
          ],
        },
      ]);

      const result = await service.supplierScorecard('s1');
      expect(result.otifPct).toBe(50);
      expect(result.defectRatePct).toBeNull();
    });

    it('computes average price variance across receipt lines', async () => {
      prisma.purchaseOrder.findMany.mockResolvedValue([
        {
          expectedAt: null,
          items: [
            {
              quantityOrdered: 10,
              quantityReceived: 10,
              unitCost: 100,
              receiptItems: [{ unitCost: 110, goodsReceipt: { receivedAt: new Date() } }],
            },
          ],
        },
      ]);
      const result = await service.supplierScorecard('s1');
      expect(result.priceVariancePct).toBeCloseTo(10, 5);
    });
  });
});
