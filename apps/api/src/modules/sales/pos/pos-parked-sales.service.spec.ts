import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PosParkedSalesService } from './pos-parked-sales.service';
import { PrismaService } from '../../../core/prisma/prisma.service';

describe('PosParkedSalesService — pos-hardware/31 WO-31.3', () => {
  let service: PosParkedSalesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      posShift: { findUnique: jest.fn() },
      posParkedSale: {
        create: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    service = new PosParkedSalesService(prisma as PrismaService);
  });

  describe('park', () => {
    it('refuses a COUNTER sale — a COUNTER sale never parks', async () => {
      await expect(service.park('s1', 'COUNTER', 'Table 1', {})).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.posShift.findUnique).not.toHaveBeenCalled();
    });

    it('404s for a shift that does not exist', async () => {
      prisma.posShift.findUnique.mockResolvedValue(null);
      await expect(service.park('missing', 'TAB', 'Tab — Ahmed', {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses parking against a CLOSED shift', async () => {
      prisma.posShift.findUnique.mockResolvedValue({ id: 's1', status: 'CLOSED' });
      await expect(service.park('s1', 'TAB', 'Tab — Ahmed', {})).rejects.toThrow(/shift is closed/);
    });

    it('parks a TAB/TABLE sale against an OPEN shift', async () => {
      prisma.posShift.findUnique.mockResolvedValue({ id: 's1', status: 'OPEN' });
      prisma.posParkedSale.create.mockResolvedValue({ id: 'p1', shiftId: 's1', orderType: 'TABLE', label: 'Table 4' });

      const result = await service.park('s1', 'TABLE', 'Table 4', { lines: [] });

      expect(prisma.posParkedSale.create).toHaveBeenCalledWith({
        data: { shiftId: 's1', orderType: 'TABLE', label: 'Table 4', basketSnapshot: { lines: [] } },
      });
      expect(result).toEqual({ id: 'p1', shiftId: 's1', orderType: 'TABLE', label: 'Table 4' });
    });
  });

  describe('retrieve', () => {
    it('is idempotent — a second retrieve of the same id is refused', async () => {
      prisma.posParkedSale.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.posParkedSale.findUniqueOrThrow.mockResolvedValueOnce({ id: 'p1', retrievedAt: new Date() });

      await service.retrieve('p1');

      prisma.posParkedSale.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.posParkedSale.findUnique.mockResolvedValueOnce({ id: 'p1', retrievedAt: new Date() });

      await expect(service.retrieve('p1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s for a parked sale that never existed', async () => {
      prisma.posParkedSale.updateMany.mockResolvedValue({ count: 0 });
      prisma.posParkedSale.findUnique.mockResolvedValue(null);

      await expect(service.retrieve('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marks retrievedAt via a conditional updateMany, never a read-then-write', async () => {
      prisma.posParkedSale.updateMany.mockResolvedValue({ count: 1 });
      prisma.posParkedSale.findUniqueOrThrow.mockResolvedValue({ id: 'p1', retrievedAt: new Date() });

      await service.retrieve('p1');

      expect(prisma.posParkedSale.updateMany).toHaveBeenCalledWith({
        where: { id: 'p1', retrievedAt: null },
        data: { retrievedAt: expect.any(Date) },
      });
    });
  });

  describe('listOpen / countOpen', () => {
    it('scopes to the shift and only still-open (unretrieved) rows', async () => {
      prisma.posParkedSale.findMany.mockResolvedValue([]);
      await service.listOpen('s1');
      expect(prisma.posParkedSale.findMany).toHaveBeenCalledWith({
        where: { shiftId: 's1', retrievedAt: null },
        orderBy: { parkedAt: 'asc' },
      });
    });

    it('countOpen scopes the same way', async () => {
      prisma.posParkedSale.count.mockResolvedValue(2);
      const count = await service.countOpen('s1');
      expect(prisma.posParkedSale.count).toHaveBeenCalledWith({ where: { shiftId: 's1', retrievedAt: null } });
      expect(count).toBe(2);
    });
  });
});
