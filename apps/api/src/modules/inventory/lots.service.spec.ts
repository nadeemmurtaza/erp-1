import { NotFoundException } from '@nestjs/common';
import { LotsService } from './lots.service';
import { InsufficientLotStockError } from './lot-allocation';

describe('LotsService', () => {
  let service: LotsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      lot: { upsert: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
      lotStock: { upsert: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      lotAllocation: { createMany: jest.fn(), findMany: jest.fn() },
      order: { findMany: jest.fn() },
    };
    service = new LotsService(prisma);
  });

  describe('recordReceipt', () => {
    it('finds-or-creates the Lot and increments LotStock for the location', async () => {
      prisma.lot.upsert.mockResolvedValue({ id: 'lot1', lotCode: 'L001' });
      await service.recordReceipt(
        { variantId: 'v1', locationId: 'loc1', lotCode: 'L001', expiresOn: new Date('2027-01-01'), quantity: 20 },
        prisma,
      );

      expect(prisma.lot.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productVariantId_lotCode: { productVariantId: 'v1', lotCode: 'L001' } },
        }),
      );
      expect(prisma.lotStock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { lotId_locationId: { lotId: 'lot1', locationId: 'loc1' } },
          update: { quantity: { increment: 20 } },
        }),
      );
    });

    it('never overwrites an existing lot\'s own expiresOn on a redelivered receipt', async () => {
      prisma.lot.upsert.mockResolvedValue({ id: 'lot1' });
      await service.recordReceipt({ variantId: 'v1', locationId: 'loc1', lotCode: 'L001', quantity: 5 }, prisma);
      const call = prisma.lot.upsert.mock.calls[0][0];
      expect(call.update).toEqual({});
    });
  });

  describe('recordDeduction', () => {
    it('returns [] — a correct, silent no-op — when the variant has no Lot rows at this location', async () => {
      prisma.lotStock.findMany.mockResolvedValue([]);
      const result = await service.recordDeduction(
        { variantId: 'v1', locationId: 'loc1', quantity: 5, stockMovementId: 'm1' },
        prisma,
      );
      expect(result).toEqual([]);
      expect(prisma.lotStock.update).not.toHaveBeenCalled();
      expect(prisma.lotAllocation.createMany).not.toHaveBeenCalled();
    });

    it('allocates FEFO across lot stock and decrements each drawn lot', async () => {
      prisma.lotStock.findMany.mockResolvedValue([
        { quantity: 5, lot: { id: 'earliest', expiresOn: new Date('2027-01-01') } },
        { quantity: 10, lot: { id: 'later', expiresOn: new Date('2027-06-01') } },
      ]);
      const result = await service.recordDeduction(
        { variantId: 'v1', locationId: 'loc1', quantity: 8, stockMovementId: 'm1' },
        prisma,
      );
      expect(result).toEqual([
        { lotId: 'earliest', quantity: 5 },
        { lotId: 'later', quantity: 3 },
      ]);
      expect(prisma.lotStock.update).toHaveBeenCalledTimes(2);
      expect(prisma.lotAllocation.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            { lotId: 'earliest', stockMovementId: 'm1', quantity: 5 },
            { lotId: 'later', stockMovementId: 'm1', quantity: 3 },
          ],
          skipDuplicates: true,
        }),
      );
    });

    it('throws InsufficientLotStockError when lot-tracked stock cannot cover the request', async () => {
      prisma.lotStock.findMany.mockResolvedValue([{ quantity: 2, lot: { id: 'l1', expiresOn: null } }]);
      await expect(
        service.recordDeduction({ variantId: 'v1', locationId: 'loc1', quantity: 10, stockMovementId: 'm1' }, prisma),
      ).rejects.toThrow(InsufficientLotStockError);
    });
  });

  describe('getDetail', () => {
    it('404s for an unknown lot', async () => {
      prisma.lot.findUnique.mockResolvedValue(null);
      await expect(service.getDetail('nope')).rejects.toThrow(NotFoundException);
    });

    it('returns the lot\'s own identity and non-zero stock per location', async () => {
      prisma.lot.findUnique.mockResolvedValue({
        id: 'lot1',
        lotCode: 'L001',
        expiresOn: new Date('2027-01-01'),
        receivedOn: new Date('2026-06-01'),
        sourceReceiptId: 'gr1',
        variant: { id: 'v1', sku: 'SKU-1', label: 'Widget' },
        stocks: [
          { locationId: 'loc1', quantity: 5, location: { id: 'loc1', name: 'Main', code: 'MAIN' } },
          { locationId: 'loc2', quantity: 0, location: { id: 'loc2', name: 'Warehouse', code: 'WH' } },
        ],
      });

      const result = await service.getDetail('lot1');
      expect(result.lotCode).toBe('L001');
      expect(result.totalQuantity).toBe(5);
      expect(result.stocks).toEqual([{ locationId: 'loc1', locationName: 'Main', quantity: 5 }]);
    });
  });

  describe('recallLookup', () => {
    it('404s for an unknown lot', async () => {
      prisma.lot.findUnique.mockResolvedValue(null);
      await expect(service.recallLookup('nope')).rejects.toThrow(NotFoundException);
    });

    it('joins LotAllocation -> StockMovement -> Order, only for movements refType=Order', async () => {
      prisma.lot.findUnique.mockResolvedValue({ id: 'lot1', lotCode: 'L001', expiresOn: null, productVariantId: 'v1' });
      prisma.lotAllocation.findMany.mockResolvedValue([
        {
          quantity: 5,
          allocatedAt: new Date('2027-01-05'),
          stockMovement: { id: 'm1', refType: 'Order', refId: 'order1', delta: -5, createdAt: new Date('2027-01-05'), locationId: 'loc1' },
        },
        {
          quantity: 3,
          allocatedAt: new Date('2027-01-06'),
          stockMovement: { id: 'm2', refType: 'GoodsReceipt', refId: 'gr1', delta: 3, createdAt: new Date('2027-01-06'), locationId: 'loc1' },
        },
      ]);
      prisma.order.findMany.mockResolvedValue([{ id: 'order1', number: 'YSN-2026-0001', placedAt: new Date('2027-01-05'), contactId: 'c1' }]);

      const result = await service.recallLookup('lot1');
      expect(result.allocations).toHaveLength(2);
      expect(result.allocations[0].order?.number).toBe('YSN-2026-0001');
      expect(result.allocations[1].order).toBeNull();
    });
  });
});
