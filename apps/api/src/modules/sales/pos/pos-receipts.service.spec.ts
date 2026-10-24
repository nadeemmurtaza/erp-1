import { NotFoundException } from '@nestjs/common';
import { PosReceiptsService } from './pos-receipts.service';
import { PrismaService } from '../../../core/prisma/prisma.service';

describe('PosReceiptsService — WO-21.5', () => {
  let service: PosReceiptsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      posReceipt: { upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      order: { findUnique: jest.fn() },
    };
    service = new PosReceiptsService(prisma as PrismaService);
  });

  describe('createForOrder', () => {
    it('upserts a receipt row, idempotent against redelivery', async () => {
      await service.createForOrder('order1');

      expect(prisma.posReceipt.upsert).toHaveBeenCalledWith({
        where: { orderId: 'order1' },
        create: { orderId: 'order1' },
        update: {},
      });
    });
  });

  describe('getForOrder', () => {
    it('404s when the order no longer exists', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      prisma.posReceipt.findUnique.mockResolvedValue({ orderId: 'order1', printCount: 0, printedAt: null });

      await expect(service.getForOrder('order1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s when no receipt was ever recorded for this order', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'order1', items: [], payments: [], statusEvents: [] });
      prisma.posReceipt.findUnique.mockResolvedValue(null);

      await expect(service.getForOrder('order1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('builds the print-ready shape from the order, its lines, its payment and the cashier who rang it up', async () => {
      prisma.order.findUnique.mockResolvedValue({
        number: 'YSN-2026-0500',
        placedAt: new Date('2026-01-01T00:00:00.000Z'),
        terminalId: 'terminal-1',
        guestName: 'Ali',
        guestPhone: '03001234567',
        itemsSubtotal: 1000,
        grandTotal: 1000,
        items: [{ nameEn: 'Kurta', sku: 'SKU1', quantity: 1, unitPrice: 1000, lineTotal: 1000 }],
        payments: [{ provider: 'cash' }],
        statusEvents: [{ actorId: 'cashier-1' }],
      });
      prisma.posReceipt.findUnique.mockResolvedValue({ orderId: 'order1', printCount: 2, printedAt: null });

      const receipt = await service.getForOrder('order1');

      expect(receipt).toEqual({
        orderNumber: 'YSN-2026-0500',
        placedAt: new Date('2026-01-01T00:00:00.000Z'),
        terminalId: 'terminal-1',
        cashierUserId: 'cashier-1',
        customerName: 'Ali',
        customerPhone: '03001234567',
        lines: [{ nameEn: 'Kurta', sku: 'SKU1', quantity: 1, unitPrice: 1000, lineTotal: 1000 }],
        itemsSubtotal: 1000,
        grandTotal: 1000,
        paymentProvider: 'cash',
        printCount: 2,
        printedAt: null,
      });
    });
  });

  describe('markPrinted', () => {
    it('404s when no receipt was ever recorded for this order', async () => {
      prisma.posReceipt.findUnique.mockResolvedValue(null);

      await expect(service.markPrinted('order1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.posReceipt.update).not.toHaveBeenCalled();
    });

    it('increments printCount and sets printedAt', async () => {
      prisma.posReceipt.findUnique.mockResolvedValue({ orderId: 'order1', printCount: 0, printedAt: null });
      prisma.order.findUnique.mockResolvedValue({
        number: 'YSN-2026-0500',
        placedAt: new Date(),
        terminalId: null,
        guestName: null,
        guestPhone: null,
        itemsSubtotal: 0,
        grandTotal: 0,
        items: [],
        payments: [],
        statusEvents: [],
      });

      await service.markPrinted('order1');

      expect(prisma.posReceipt.update).toHaveBeenCalledWith({
        where: { orderId: 'order1' },
        data: { printCount: { increment: 1 }, printedAt: expect.any(Date) },
      });
    });
  });
});
