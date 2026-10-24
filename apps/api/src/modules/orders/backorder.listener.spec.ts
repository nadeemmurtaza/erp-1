import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { BackorderListener } from './backorder.listener';
import { InventoryService, InsufficientStockError } from '../inventory/inventory.service';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('BackorderListener', () => {
  let listener: BackorderListener;
  let prisma: any;
  let inventory: any;
  let tx: any;

  const payload = { variantId: 'v1', locationId: 'loc1', delta: 5, resultingStock: 5 };

  beforeEach(async () => {
    tx = { orderItem: { update: jest.fn() } };
    prisma = {
      orderItem: { findMany: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    inventory = { move: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackorderListener,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: inventory },
      ],
    }).compile();

    listener = module.get(BackorderListener);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  it('does nothing when no order lines are waiting on this variant', async () => {
    prisma.orderItem.findMany.mockResolvedValue([]);
    await listener.onStockReplenished(payload);
    expect(inventory.move).not.toHaveBeenCalled();
  });

  it('allocates stock oldest-first and flips fulfillmentStatus to READY', async () => {
    prisma.orderItem.findMany.mockResolvedValue([
      { id: 'oi1', orderId: 'o1', quantity: 2, unitCost: 500 },
      { id: 'oi2', orderId: 'o2', quantity: 3, unitCost: 500 },
    ]);

    await listener.onStockReplenished(payload);

    expect(inventory.move).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ variantId: 'v1', locationId: 'loc1', delta: -2, refId: 'o1' }),
      tx,
    );
    expect(inventory.move).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ variantId: 'v1', locationId: 'loc1', delta: -3, refId: 'o2' }),
      tx,
    );
    expect(tx.orderItem.update).toHaveBeenCalledWith({
      where: { id: 'oi1' },
      data: { fulfillmentStatus: 'READY', awaitingSince: null },
    });
    expect(tx.orderItem.update).toHaveBeenCalledWith({
      where: { id: 'oi2' },
      data: { fulfillmentStatus: 'READY', awaitingSince: null },
    });
  });

  it('leaves a line waiting when the replenishment is not enough for it, without throwing', async () => {
    prisma.orderItem.findMany.mockResolvedValue([{ id: 'oi1', orderId: 'o1', quantity: 10, unitCost: 500 }]);
    inventory.move.mockRejectedValue(new InsufficientStockError('v1', 'SKU1', 5, -10));

    await expect(listener.onStockReplenished(payload)).resolves.toBeUndefined();
    expect(tx.orderItem.update).not.toHaveBeenCalled();
  });

  it('rethrows an unexpected error', async () => {
    prisma.orderItem.findMany.mockResolvedValue([{ id: 'oi1', orderId: 'o1', quantity: 1, unitCost: 500 }]);
    inventory.move.mockRejectedValue(new Error('db down'));

    await expect(listener.onStockReplenished(payload)).rejects.toThrow('db down');
  });
});
