import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RequisitionService } from './requisition.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ApprovalService } from '../../core/approvals/approval.service';
import { PurchasingService } from './purchasing.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { WorkflowStepsRegistry } from '../../core/extension-points/workflow-steps.registry';

describe('RequisitionService — 152-purchase-requisition.md', () => {
  let service: RequisitionService;
  let prisma: any;
  let tx: any;
  let approvals: any;
  let purchasing: any;
  let events: any;
  let workflowSteps: any;

  beforeEach(() => {
    tx = {
      purchaseRequisition: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      supplierProduct: { findMany: jest.fn().mockResolvedValue([]) },
    };
    prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
    approvals = { start: jest.fn(), getChain: jest.fn(), decide: jest.fn() };
    purchasing = { createPurchaseOrder: jest.fn() };
    events = { publish: jest.fn() };
    workflowSteps = { getCompiledSteps: jest.fn().mockResolvedValue(null) };

    service = new RequisitionService(
      prisma as PrismaService,
      approvals as ApprovalService,
      purchasing as PurchasingService,
      events as EventBusService,
      workflowSteps as WorkflowStepsRegistry,
    );
  });

  describe('create', () => {
    it('refuses a requisition with no lines', async () => {
      await expect(service.create({ locationId: 'loc1', justification: 'need it', lines: [] }, 'u1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tx.purchaseRequisition.create).not.toHaveBeenCalled();
    });

    it('creates the requisition and starts a single-step approval chain', async () => {
      tx.purchaseRequisition.create.mockResolvedValue({ id: 'r1', lines: [] });

      await service.create(
        { locationId: 'loc1', justification: 'need it', lines: [{ variantId: 'v1', quantity: 2 }] },
        'requester1',
      );

      expect(tx.purchaseRequisition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ requestedById: 'requester1', locationId: 'loc1' }),
        }),
      );
      expect(approvals.start).toHaveBeenCalledWith(
        'PURCHASE_REQUISITION',
        'r1',
        [{ approverRoleId: 'purchasing.requisitions.approve' }],
        tx,
      );
      expect(events.publish).toHaveBeenCalledWith(
        'purchasing.requisition_created',
        expect.objectContaining({ requisitionId: 'r1', requestedById: 'requester1' }),
        tx,
      );
    });
  });

  describe('approve / reject — the toxic-pair refusal', () => {
    it('refuses when the actor is the requisition\'s own requester', async () => {
      tx.purchaseRequisition.findUnique.mockResolvedValue({ id: 'r1', requestedById: 'requester1', status: 'PENDING' });

      await expect(service.approve('r1', 'requester1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(approvals.getChain).not.toHaveBeenCalled();
    });

    it('404s for a requisition that does not exist', async () => {
      tx.purchaseRequisition.findUnique.mockResolvedValue(null);

      await expect(service.approve('missing', 'approver1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to decide a requisition that is not PENDING', async () => {
      tx.purchaseRequisition.findUnique.mockResolvedValue({ id: 'r1', requestedById: 'requester1', status: 'APPROVED' });

      await expect(service.approve('r1', 'approver1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('a different user CAN approve, and the requisition status follows the chain', async () => {
      tx.purchaseRequisition.findUnique.mockResolvedValue({ id: 'r1', requestedById: 'requester1', status: 'PENDING' });
      approvals.getChain.mockResolvedValue({ id: 'c1', steps: [{ id: 's1', status: 'PENDING' }] });
      approvals.decide.mockResolvedValue({ status: 'APPROVED' });
      tx.purchaseRequisition.update.mockResolvedValue({ id: 'r1', status: 'APPROVED' });

      const result = await service.approve('r1', 'approver1', 'looks fine');

      expect(approvals.decide).toHaveBeenCalledWith('c1', 's1', 'APPROVE', 'approver1', 'looks fine', tx);
      expect(tx.purchaseRequisition.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'r1' }, data: expect.objectContaining({ status: 'APPROVED' }) }),
      );
      expect(result.status).toBe('APPROVED');
    });

    it('reject() records the rejection note', async () => {
      tx.purchaseRequisition.findUnique.mockResolvedValue({ id: 'r1', requestedById: 'requester1', status: 'PENDING' });
      approvals.getChain.mockResolvedValue({ id: 'c1', steps: [{ id: 's1', status: 'PENDING' }] });
      approvals.decide.mockResolvedValue({ status: 'REJECTED' });
      tx.purchaseRequisition.update.mockResolvedValue({ id: 'r1', status: 'REJECTED' });

      await service.reject('r1', 'approver1', 'not needed right now');

      expect(tx.purchaseRequisition.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED', rejectionNote: 'not needed right now' }) }),
      );
    });
  });

  describe('convertToPurchaseOrder', () => {
    it('404s for a requisition that does not exist', async () => {
      tx.purchaseRequisition.findUnique.mockResolvedValue(null);

      await expect(service.convertToPurchaseOrder('missing', { supplierId: 's1' }, 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses an already-CONVERTED requisition — never a second purchase order', async () => {
      tx.purchaseRequisition.findUnique.mockResolvedValue({ id: 'r1', status: 'CONVERTED', lines: [] });

      await expect(service.convertToPurchaseOrder('r1', { supplierId: 's1' }, 'u1')).rejects.toBeInstanceOf(ConflictException);
      expect(purchasing.createPurchaseOrder).not.toHaveBeenCalled();
    });

    it('refuses a requisition that was never approved', async () => {
      tx.purchaseRequisition.findUnique.mockResolvedValue({ id: 'r1', status: 'PENDING', lines: [] });

      await expect(service.convertToPurchaseOrder('r1', { supplierId: 's1' }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates the PO through the existing purchasing path and claims the requisition atomically', async () => {
      tx.purchaseRequisition.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'APPROVED',
        justification: 'need it',
        lines: [{ variantId: 'v1', quantity: 2, estimatedUnitCostMinor: 500 }],
      });
      purchasing.createPurchaseOrder.mockResolvedValue({ id: 'po1', number: 'PO-2026-0001' });
      tx.purchaseRequisition.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.convertToPurchaseOrder('r1', { supplierId: 'sup1' }, 'converter1');

      expect(purchasing.createPurchaseOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: 'sup1',
          items: [expect.objectContaining({ variantId: 'v1', quantityOrdered: 2, unitCost: 500 })],
        }),
        'converter1',
        tx,
      );
      expect(tx.purchaseRequisition.updateMany).toHaveBeenCalledWith({
        where: { id: 'r1', status: 'APPROVED' },
        data: { status: 'CONVERTED', convertedPurchaseOrderId: 'po1' },
      });
      expect(result.id).toBe('po1');
    });

    it('resolves unit cost: priceOverrides beats estimatedUnitCostMinor beats supplier lastCost beats zero', async () => {
      tx.purchaseRequisition.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'APPROVED',
        justification: 'need it',
        lines: [
          { variantId: 'v1', quantity: 1, estimatedUnitCostMinor: 300 },
          { variantId: 'v2', quantity: 1, estimatedUnitCostMinor: null },
          { variantId: 'v3', quantity: 1, estimatedUnitCostMinor: null },
        ],
      });
      tx.supplierProduct.findMany.mockResolvedValue([{ variantId: 'v2', lastCost: 700 }]);
      purchasing.createPurchaseOrder.mockResolvedValue({ id: 'po1' });
      tx.purchaseRequisition.updateMany.mockResolvedValue({ count: 1 });

      await service.convertToPurchaseOrder('r1', { supplierId: 'sup1', priceOverrides: { v1: 999 } }, 'u1');

      const items = purchasing.createPurchaseOrder.mock.calls[0][0].items;
      expect(items.find((i: any) => i.variantId === 'v1').unitCost).toBe(999); // override wins
      expect(items.find((i: any) => i.variantId === 'v2').unitCost).toBe(700); // supplier lastCost
      expect(items.find((i: any) => i.variantId === 'v3').unitCost).toBe(0); // nothing known
    });

    it('rolls back the whole transaction — including the just-created PO — when the claim loses a concurrent race', async () => {
      tx.purchaseRequisition.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'APPROVED',
        justification: 'need it',
        lines: [{ variantId: 'v1', quantity: 1, estimatedUnitCostMinor: 100 }],
      });
      purchasing.createPurchaseOrder.mockResolvedValue({ id: 'po1' });
      tx.purchaseRequisition.updateMany.mockResolvedValue({ count: 0 }); // lost the race

      await expect(service.convertToPurchaseOrder('r1', { supplierId: 'sup1' }, 'u1')).rejects.toBeInstanceOf(ConflictException);
      expect(events.publish).not.toHaveBeenCalledWith('purchasing.requisition_converted', expect.anything(), expect.anything());
    });
  });
});
