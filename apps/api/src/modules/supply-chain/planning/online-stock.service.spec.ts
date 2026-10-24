import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../../../core/audit/audit.service';
import { OnlineStockService } from './online-stock.service';

describe('OnlineStockService', () => {
  let service: OnlineStockService;
  let prisma: any;
  let inventory: any;
  let audit: any;

  beforeEach(async () => {
    prisma = {
      variantLocationStock: { findMany: jest.fn() },
      order: { findUnique: jest.fn() },
      $transaction: jest.fn((fn: any) => fn({ order: { update: jest.fn() } })),
    };
    inventory = { move: jest.fn(), defaultLocationId: jest.fn() };
    audit = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnlineStockService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: inventory },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(OnlineStockService);
  });

  describe('onlineStockFor', () => {
    it('sums quantity across every branch allotment for the variant', async () => {
      prisma.variantLocationStock.findMany.mockResolvedValue([{ quantity: 5 }, { quantity: 3 }]);
      await expect(service.onlineStockFor('v1')).resolves.toBe(8);
    });
  });

  describe('assignFulfillingBranch', () => {
    it('throws NotFoundException for a missing order', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.assignFulfillingBranch('o1', 'l2', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to reassign an order that has already shipped', async () => {
      prisma.order.findUnique.mockResolvedValue({ status: 'SHIPPED', locationId: 'l1', items: [{ variantId: 'v1', quantity: 2 }] });
      await expect(service.assignFulfillingBranch('o1', 'l2', 'u1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses an order with no stock-tracked line items', async () => {
      prisma.order.findUnique.mockResolvedValue({ status: 'PENDING', locationId: 'l1', items: [{ variantId: null, quantity: 1 }] });
      await expect(service.assignFulfillingBranch('o1', 'l2', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reverses stock at the current location and re-commits at the new one, through the identical InventoryService.move() writer', async () => {
      prisma.order.findUnique.mockResolvedValue({ status: 'CONFIRMED', locationId: 'l1', items: [{ variantId: 'v1', quantity: 4 }] });

      await service.assignFulfillingBranch('o1', 'l2', 'u1');

      expect(inventory.move).toHaveBeenCalledTimes(2);
      expect(inventory.move).toHaveBeenCalledWith(
        expect.objectContaining({ variantId: 'v1', locationId: 'l1', delta: 4, reason: 'ADJUSTMENT', refType: 'Order', refId: 'o1' }),
        expect.anything(),
      );
      expect(inventory.move).toHaveBeenCalledWith(
        expect.objectContaining({ variantId: 'v1', locationId: 'l2', delta: -4, reason: 'ADJUSTMENT', refType: 'Order', refId: 'o1' }),
        expect.anything(),
      );
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'planning.order.fulfilling_branch_reassigned' }));
    });

    it('resolves the current location via defaultLocationId() when the order carries no explicit one', async () => {
      prisma.order.findUnique.mockResolvedValue({ status: 'PENDING', locationId: null, items: [{ variantId: 'v1', quantity: 1 }] });
      inventory.defaultLocationId.mockResolvedValue('default-loc');

      await service.assignFulfillingBranch('o1', 'l2', 'u1');

      expect(inventory.move).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'default-loc', delta: 1 }), expect.anything());
    });

    it('refuses reassigning to the order\'s own current location', async () => {
      prisma.order.findUnique.mockResolvedValue({ status: 'PENDING', locationId: 'l1', items: [{ variantId: 'v1', quantity: 1 }] });
      await expect(service.assignFulfillingBranch('o1', 'l1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
