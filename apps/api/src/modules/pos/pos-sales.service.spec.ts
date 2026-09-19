import { NotFoundException } from '@nestjs/common';
import { PosSalesService } from './pos-sales.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { PosReceiptsService } from './pos-receipts.service';

describe('PosSalesService — WO-21.3', () => {
  let service: PosSalesService;
  let prisma: any;
  let orders: { placeFromPos: jest.Mock };
  let receipts: { createForOrder: jest.Mock };

  beforeEach(() => {
    prisma = { posShift: { findUnique: jest.fn() } };
    orders = { placeFromPos: jest.fn() };
    receipts = { createForOrder: jest.fn().mockResolvedValue(undefined) };
    service = new PosSalesService(
      prisma as PrismaService,
      orders as unknown as OrdersService,
      receipts as unknown as PosReceiptsService,
    );
  });

  it('404s for a shift that does not exist', async () => {
    prisma.posShift.findUnique.mockResolvedValue(null);

    await expect(service.sell('missing', 'u1', [{ variantId: 'v1', quantity: 1 }], {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(orders.placeFromPos).not.toHaveBeenCalled();
  });

  it('refuses a sale against a CLOSED shift', async () => {
    prisma.posShift.findUnique.mockResolvedValue({ id: 's1', status: 'CLOSED', terminalId: 't1', terminal: { locationId: 'loc1' } });

    await expect(service.sell('s1', 'u1', [{ variantId: 'v1', quantity: 1 }], {})).rejects.toThrow(/shift is closed/);
    expect(orders.placeFromPos).not.toHaveBeenCalled();
  });

  it('resolves the terminal and location off the shift and hands a validated sale to OrdersService', async () => {
    prisma.posShift.findUnique.mockResolvedValue({
      id: 's1',
      status: 'OPEN',
      terminalId: 't1',
      terminal: { id: 't1', locationId: 'loc1' },
    });
    orders.placeFromPos.mockResolvedValue({ id: 'order1', number: 'YSN-POS-0001' });

    const lines = [{ variantId: 'v1', quantity: 2 }];
    const result = await service.sell('s1', 'u1', lines, { customerName: 'Ali' });

    expect(orders.placeFromPos).toHaveBeenCalledWith({
      locationId: 'loc1',
      terminalId: 't1',
      shiftId: 's1',
      cashierUserId: 'u1',
      lines,
      customerName: 'Ali',
    });
    expect(result).toEqual({ id: 'order1', number: 'YSN-POS-0001' });
    expect(receipts.createForOrder).toHaveBeenCalledWith('order1');
  });

  it('still returns the order when recording the receipt fails — a missing receipt never fails the sale', async () => {
    prisma.posShift.findUnique.mockResolvedValue({
      id: 's1',
      status: 'OPEN',
      terminalId: 't1',
      terminal: { id: 't1', locationId: 'loc1' },
    });
    orders.placeFromPos.mockResolvedValue({ id: 'order1', number: 'YSN-POS-0001' });
    receipts.createForOrder.mockRejectedValue(new Error('db hiccup'));

    const result = await service.sell('s1', 'u1', [{ variantId: 'v1', quantity: 1 }], {});

    expect(result).toEqual({ id: 'order1', number: 'YSN-POS-0001' });
  });
});
