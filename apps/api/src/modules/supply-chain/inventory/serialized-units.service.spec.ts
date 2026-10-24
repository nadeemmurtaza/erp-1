import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SerializedUnitsService } from './serialized-units.service';

describe('SerializedUnitsService', () => {
  let service: SerializedUnitsService;
  let prisma: any;
  let inventory: any;

  beforeEach(() => {
    prisma = {
      serializedUnit: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      stockMovement: { findUnique: jest.fn() },
      order: { findUnique: jest.fn() },
    };
    inventory = { move: jest.fn() };
    service = new SerializedUnitsService(prisma, inventory);
  });

  describe('receiveUnits', () => {
    it('refuses an empty serial list', async () => {
      await expect(
        service.receiveUnits({ variantId: 'v1', locationId: 'loc1', serials: [], refType: 'GoodsReceipt', refId: 'gr1' }, prisma),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a repeated serial within the same receipt', async () => {
      await expect(
        service.receiveUnits({ variantId: 'v1', locationId: 'loc1', serials: ['S1', 'S1'], refType: 'GoodsReceipt', refId: 'gr1' }, prisma),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates one StockMovement (delta 1) and one SerializedUnit per serial', async () => {
      inventory.move.mockResolvedValueOnce({ id: 'm1' }).mockResolvedValueOnce({ id: 'm2' });
      prisma.serializedUnit.create.mockResolvedValueOnce({ id: 'u1' }).mockResolvedValueOnce({ id: 'u2' });

      const result = await service.receiveUnits(
        { variantId: 'v1', locationId: 'loc1', serials: ['S1', 'S2'], refType: 'GoodsReceipt', refId: 'gr1' },
        prisma,
      );

      expect(inventory.move).toHaveBeenCalledTimes(2);
      expect(inventory.move).toHaveBeenCalledWith(expect.objectContaining({ delta: 1, reason: 'PURCHASE_RECEIPT' }), prisma);
      expect(prisma.serializedUnit.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ data: expect.objectContaining({ serialNumber: 'S1', stockMovementId: 'm1' }) }),
      );
      expect(result).toHaveLength(2);
    });

    it('surfaces a duplicate serial as a named conflict, not a raw constraint error', async () => {
      inventory.move.mockResolvedValue({ id: 'm1' });
      prisma.serializedUnit.create.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.receiveUnits({ variantId: 'v1', locationId: 'loc1', serials: ['DUP'], refType: 'GoodsReceipt', refId: 'gr1' }, prisma),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('sellUnit', () => {
    it('404s for an unknown serial', async () => {
      prisma.serializedUnit.findUnique.mockResolvedValue(null);
      await expect(service.sellUnit({ serialNumber: 'X', orderId: 'o1' }, prisma)).rejects.toThrow(NotFoundException);
    });

    it('refuses a serial already sold, naming the specific reason', async () => {
      prisma.serializedUnit.findUnique.mockResolvedValue({ id: 'u1', status: 'SOLD', locationId: null, productVariantId: 'v1' });
      await expect(service.sellUnit({ serialNumber: 'X', orderId: 'o1' }, prisma)).rejects.toThrow(ConflictException);
    });

    it('moves stock -1 and marks the unit SOLD, clearing its location', async () => {
      prisma.serializedUnit.findUnique.mockResolvedValue({ id: 'u1', status: 'IN_STOCK', locationId: 'loc1', productVariantId: 'v1' });
      inventory.move.mockResolvedValue({ id: 'm1' });
      prisma.serializedUnit.update.mockResolvedValue({ id: 'u1', status: 'SOLD' });

      await service.sellUnit({ serialNumber: 'X', orderId: 'o1' }, prisma);

      expect(inventory.move).toHaveBeenCalledWith(expect.objectContaining({ delta: -1, reason: 'SALE', refType: 'Order', refId: 'o1' }), prisma);
      expect(prisma.serializedUnit.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SOLD', orderId: 'o1', locationId: null }) }),
      );
    });
  });

  describe('returnUnit — the toxic-pair guard', () => {
    it('refuses a serial not sold on this exact order', async () => {
      prisma.serializedUnit.findUnique.mockResolvedValue({ id: 'u1', status: 'SOLD', orderId: 'other-order', productVariantId: 'v1' });
      await expect(
        service.returnUnit({ serialNumber: 'X', orderId: 'o1', locationId: 'loc1' }, prisma),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses a serial that was never sold at all', async () => {
      prisma.serializedUnit.findUnique.mockResolvedValue({ id: 'u1', status: 'IN_STOCK', orderId: null, productVariantId: 'v1' });
      await expect(
        service.returnUnit({ serialNumber: 'X', orderId: 'o1', locationId: 'loc1' }, prisma),
      ).rejects.toThrow(ConflictException);
    });

    it('accepts a return matching the exact order it was sold on', async () => {
      prisma.serializedUnit.findUnique.mockResolvedValue({ id: 'u1', status: 'SOLD', orderId: 'o1', productVariantId: 'v1' });
      inventory.move.mockResolvedValue({ id: 'm2' });
      prisma.serializedUnit.update.mockResolvedValue({ id: 'u1', status: 'RETURNED' });

      await service.returnUnit({ serialNumber: 'X', orderId: 'o1', locationId: 'loc1' }, prisma);
      expect(inventory.move).toHaveBeenCalledWith(expect.objectContaining({ delta: 1, reason: 'RETURN' }), prisma);
    });
  });

  describe('getUnitHistory', () => {
    it('returns null for an unknown serial, never a stack trace or a fabricated result', async () => {
      prisma.serializedUnit.findUnique.mockResolvedValue(null);
      expect(await service.getUnitHistory('nope')).toBeNull();
    });

    it('computes warrantyEndsOn from soldOn + variant.warrantyMonths', async () => {
      prisma.serializedUnit.findUnique.mockResolvedValue({
        serialNumber: 'X',
        status: 'SOLD',
        orderId: 'o1',
        stockMovementId: 'm1',
        variant: { warrantyMonths: 12 },
      });
      prisma.stockMovement.findUnique.mockResolvedValue({ createdAt: new Date('2026-01-15') });
      prisma.order.findUnique.mockResolvedValue({ number: 'YSN-2026-0001' });

      const history = await service.getUnitHistory('X');
      expect(history?.orderId).toBe('o1');
      expect(history?.orderNumber).toBe('YSN-2026-0001');
      expect(history?.warrantyEndsOn?.toISOString().slice(0, 10)).toBe('2027-01-15');
    });

    it('leaves soldOn/orderNumber/warrantyEndsOn null for a unit still IN_STOCK', async () => {
      prisma.serializedUnit.findUnique.mockResolvedValue({
        serialNumber: 'X',
        status: 'IN_STOCK',
        orderId: null,
        stockMovementId: null,
        variant: { warrantyMonths: 12 },
      });
      const history = await service.getUnitHistory('X');
      expect(history).toEqual({
        serialNumber: 'X',
        status: 'IN_STOCK',
        soldOn: null,
        orderId: null,
        orderNumber: null,
        warrantyEndsOn: null,
      });
    });
  });
});
