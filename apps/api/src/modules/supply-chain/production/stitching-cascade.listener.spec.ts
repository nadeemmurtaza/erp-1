import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { StitchingCascadeListener } from './stitching-cascade.listener';
import { WorkOrdersService } from './work-orders.service';
import { PrismaService } from '../../../core/prisma/prisma.service';

describe('StitchingCascadeListener', () => {
  let listener: StitchingCascadeListener;
  let workOrders: any;
  let prisma: any;

  beforeEach(async () => {
    workOrders = {
      create: jest.fn().mockResolvedValue({ id: 'wo1', number: 'WO-2026-0001' }),
      release: jest.fn(),
      complete: jest.fn(),
    };
    prisma = {
      workOrder: { findFirst: jest.fn() },
      productVariant: { findUnique: jest.fn() },
      billOfMaterial: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StitchingCascadeListener,
        { provide: WorkOrdersService, useValue: workOrders },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    listener = module.get(StitchingCascadeListener);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  describe('onStitchingJobCreated', () => {
    const payload = { jobId: 'job1', jobNumber: 'JOB-2026-0001', fromStage: null, toStage: 'RECEIVED', assignedTailorId: null, orderId: 'o1', stitchingOrderId: null, variantId: 'v1', quantity: 2 };

    it('does nothing for a made-to-order line with no variant', async () => {
      await listener.onStitchingJobCreated({ ...payload, variantId: null });
      expect(prisma.workOrder.findFirst).not.toHaveBeenCalled();
    });

    it('is idempotent against a redelivered event', async () => {
      prisma.workOrder.findFirst.mockResolvedValue({ id: 'wo-existing' });
      await listener.onStitchingJobCreated(payload);
      expect(workOrders.create).not.toHaveBeenCalled();
    });

    it('no-ops silently when the variant is not producedInHouse (the common case)', async () => {
      prisma.workOrder.findFirst.mockResolvedValue(null);
      prisma.productVariant.findUnique.mockResolvedValue({ producedInHouse: false, sku: 'SKU1' });
      await listener.onStitchingJobCreated(payload);
      expect(workOrders.create).not.toHaveBeenCalled();
    });

    it('warns and no-ops when producedInHouse but no BOM exists', async () => {
      prisma.workOrder.findFirst.mockResolvedValue(null);
      prisma.productVariant.findUnique.mockResolvedValue({ producedInHouse: true, sku: 'SKU1' });
      prisma.billOfMaterial.findUnique.mockResolvedValue(null);
      await listener.onStitchingJobCreated(payload);
      expect(workOrders.create).not.toHaveBeenCalled();
    });

    it('opens and immediately releases a WorkOrder when a BOM exists', async () => {
      prisma.workOrder.findFirst.mockResolvedValue(null);
      prisma.productVariant.findUnique.mockResolvedValue({ producedInHouse: true, sku: 'SKU1' });
      prisma.billOfMaterial.findUnique.mockResolvedValue({ id: 'bom1' });

      await listener.onStitchingJobCreated(payload);

      expect(workOrders.create).toHaveBeenCalledWith({
        variantId: 'v1',
        quantityOrdered: 2,
        source: 'ORDER_CASCADE',
        sourceRefType: 'StitchingJob',
        sourceRefId: 'job1',
      });
      expect(workOrders.release).toHaveBeenCalledWith('wo1');
    });
  });

  describe('onStitchingJobStageChanged', () => {
    it('ignores every stage except READY', async () => {
      await listener.onStitchingJobStageChanged({ jobId: 'job1', jobNumber: 'JOB-1', fromStage: 'CUTTING', toStage: 'STITCHING', assignedTailorId: null, orderId: null, stitchingOrderId: null });
      expect(prisma.workOrder.findFirst).not.toHaveBeenCalled();
    });

    it('no-ops when the job has no linked RELEASED WorkOrder', async () => {
      prisma.workOrder.findFirst.mockResolvedValue(null);
      await listener.onStitchingJobStageChanged({ jobId: 'job1', jobNumber: 'JOB-1', fromStage: 'QC', toStage: 'READY', assignedTailorId: null, orderId: null, stitchingOrderId: null });
      expect(workOrders.complete).not.toHaveBeenCalled();
    });

    it('completes the linked WorkOrder for its remaining quantity when the job reaches READY', async () => {
      prisma.workOrder.findFirst.mockResolvedValue({ id: 'wo1', number: 'WO-2026-0001', quantityOrdered: 2, quantityCompleted: 0 });
      await listener.onStitchingJobStageChanged({ jobId: 'job1', jobNumber: 'JOB-1', fromStage: 'QC', toStage: 'READY', assignedTailorId: null, orderId: null, stitchingOrderId: null });
      expect(workOrders.complete).toHaveBeenCalledWith('wo1', 2);
    });
  });
});
