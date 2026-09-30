import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { EventBusService } from '../../../core/events/event-bus.service';

describe('WorkOrdersService', () => {
  let service: WorkOrdersService;
  let prisma: any;
  let inventory: any;
  let events: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ counter: 1 }]),
      workOrder: { create: jest.fn(), update: jest.fn() },
      billOfMaterial: { findUnique: jest.fn() },
    };

    prisma = {
      $transaction: jest.fn((fn: any) => fn(tx)),
      productVariant: { findUnique: jest.fn() },
      billOfMaterial: { findUnique: jest.fn() },
      workOrder: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    };

    inventory = {
      moveMany: jest.fn().mockResolvedValue([]),
      move: jest.fn().mockResolvedValue({}),
      defaultLocationId: jest.fn().mockResolvedValue('loc1'),
    };

    events = { publish: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: inventory },
        { provide: EventBusService, useValue: events },
      ],
    }).compile();

    service = module.get(WorkOrdersService);
  });

  describe('create', () => {
    it('rejects a variant that is not producedInHouse', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({ id: 'v1', sku: 'SKU1', producedInHouse: false });

      await expect(
        service.create({ variantId: 'v1', quantityOrdered: 10, source: 'MANUAL' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a producedInHouse variant with no BillOfMaterial', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({ id: 'v1', sku: 'SKU1', producedInHouse: true });
      prisma.billOfMaterial.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ variantId: 'v1', quantityOrdered: 10, source: 'MANUAL' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('opens a DRAFT work order and publishes WorkOrderCreated', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({ id: 'v1', sku: 'SKU1', producedInHouse: true });
      prisma.billOfMaterial.findUnique.mockResolvedValue({ id: 'bom1' });
      tx.workOrder.create.mockResolvedValue({
        id: 'wo1',
        number: 'WO-2026-0001',
        variantId: 'v1',
        status: 'DRAFT',
        source: 'MANUAL',
      });

      const result = await service.create({ variantId: 'v1', quantityOrdered: 10, source: 'MANUAL' });

      expect(result.number).toBe('WO-2026-0001');
      expect(events.publish).toHaveBeenCalledWith(
        'production.work_order_created',
        expect.objectContaining({ workOrderId: 'wo1' }),
        tx,
      );
    });
  });

  describe('release', () => {
    it('consumes each BOM component proportionally to quantityOrdered', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({
        id: 'wo1',
        variantId: 'v1',
        quantityOrdered: 10,
        status: 'DRAFT',
        locationId: null,
      });
      prisma.billOfMaterial.findUnique.mockResolvedValue({
        components: [
          { componentVariantId: 'c1', quantityPerUnit: 2 },
          { componentVariantId: 'c2', quantityPerUnit: 0.5 },
        ],
      });
      tx.workOrder.update.mockResolvedValue({ id: 'wo1', number: 'WO-2026-0001', variantId: 'v1', status: 'RELEASED', source: 'MANUAL' });

      await service.release('wo1');

      expect(inventory.moveMany).toHaveBeenCalledWith(
        [
          expect.objectContaining({ variantId: 'c1', locationId: 'loc1', delta: -20, reason: 'PRODUCTION_CONSUMPTION' }),
          expect.objectContaining({ variantId: 'c2', locationId: 'loc1', delta: -5, reason: 'PRODUCTION_CONSUMPTION' }),
        ],
        tx,
      );
      expect(events.publish).toHaveBeenCalledWith('production.work_order_released', expect.anything(), tx);
    });

    it('refuses to release a non-DRAFT work order', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({ id: 'wo1', status: 'RELEASED' });
      await expect(service.release('wo1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to release when there is no bill of materials', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({ id: 'wo1', variantId: 'v1', status: 'DRAFT', quantityOrdered: 5 });
      prisma.billOfMaterial.findUnique.mockResolvedValue(null);
      await expect(service.release('wo1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('complete', () => {
    it('credits the produced variant and marks COMPLETED', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({
        id: 'wo1',
        variantId: 'v1',
        status: 'RELEASED',
        locationId: 'loc1',
      });
      tx.workOrder.update.mockResolvedValue({ id: 'wo1', number: 'WO-2026-0001', variantId: 'v1', status: 'COMPLETED', source: 'MANUAL' });

      await service.complete('wo1', 8);

      expect(inventory.move).toHaveBeenCalledWith(
        expect.objectContaining({ variantId: 'v1', locationId: 'loc1', delta: 8, reason: 'PRODUCTION_RECEIPT' }),
        tx,
      );
      expect(events.publish).toHaveBeenCalledWith('production.work_order_completed', expect.anything(), tx);
    });

    it('refuses to complete a work order that is not RELEASED', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({ id: 'wo1', status: 'DRAFT' });
      await expect(service.complete('wo1', 5)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('reverses consumption when cancelling a RELEASED work order', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({
        id: 'wo1',
        variantId: 'v1',
        status: 'RELEASED',
        locationId: 'loc1',
        quantityOrdered: 10,
      });
      tx.billOfMaterial.findUnique.mockResolvedValue({
        components: [{ componentVariantId: 'c1', quantityPerUnit: 2 }],
      });
      tx.workOrder.update.mockResolvedValue({ id: 'wo1', status: 'CANCELLED' });

      await service.cancel('wo1');

      expect(inventory.moveMany).toHaveBeenCalledWith(
        [expect.objectContaining({ variantId: 'c1', locationId: 'loc1', delta: 20, reason: 'ADJUSTMENT' })],
        tx,
      );
    });

    it('refuses to cancel an already-completed work order', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({ id: 'wo1', status: 'COMPLETED' });
      await expect(service.cancel('wo1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('throws NotFoundException for a missing work order', async () => {
    prisma.workOrder.findUnique.mockResolvedValue(null);
    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
