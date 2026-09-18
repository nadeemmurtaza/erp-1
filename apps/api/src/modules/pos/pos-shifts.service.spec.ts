import { NotFoundException } from '@nestjs/common';
import { PosShiftsService } from './pos-shifts.service';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('PosShiftsService — WO-21.2', () => {
  let service: PosShiftsService;
  let prisma: any;
  let tx: any;

  beforeEach(() => {
    tx = {
      posShift: { create: jest.fn() },
      cashMovement: { create: jest.fn() },
    };
    prisma = {
      posTerminal: { findUnique: jest.fn() },
      posShift: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      cashMovement: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    service = new PosShiftsService(prisma as PrismaService);
  });

  describe('openShift', () => {
    it('404s for a terminal that does not exist', async () => {
      prisma.posTerminal.findUnique.mockResolvedValue(null);

      await expect(service.openShift('missing', 'u1', 5000)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a terminal that is not ACTIVE', async () => {
      prisma.posTerminal.findUnique.mockResolvedValue({ id: 't1', code: 'LHR-01-T1', status: 'PENDING' });

      await expect(service.openShift('t1', 'u1', 5000)).rejects.toThrow(/not ACTIVE/);
    });

    it('refuses opening a second shift while one is already open on the same terminal', async () => {
      prisma.posTerminal.findUnique.mockResolvedValue({ id: 't1', code: 'LHR-01-T1', status: 'ACTIVE' });
      prisma.posShift.findFirst.mockResolvedValue({ id: 'existing-shift' });

      await expect(service.openShift('t1', 'u1', 5000)).rejects.toThrow(/already has an open shift/);
    });

    it('creates the shift and an OPENING_FLOAT cash movement in the same transaction', async () => {
      prisma.posTerminal.findUnique.mockResolvedValue({ id: 't1', code: 'LHR-01-T1', status: 'ACTIVE' });
      prisma.posShift.findFirst.mockResolvedValue(null);
      tx.posShift.create.mockResolvedValue({ id: 's1', terminalId: 't1', openingCashMinor: 5000, status: 'OPEN' });

      const shift = await service.openShift('t1', 'u1', 5000);

      expect(tx.posShift.create).toHaveBeenCalledWith({
        data: { terminalId: 't1', openedByUserId: 'u1', openingCashMinor: 5000 },
      });
      expect(tx.cashMovement.create).toHaveBeenCalledWith({
        data: { shiftId: 's1', type: 'OPENING_FLOAT', amountMinor: 5000, actorId: 'u1' },
      });
      expect(shift.id).toBe('s1');
    });
  });

  describe('recordCashMovement', () => {
    it('404s for a shift that does not exist', async () => {
      prisma.posShift.findUnique.mockResolvedValue(null);

      await expect(service.recordCashMovement('missing', 'CASH_IN', 100, undefined, 'u1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses to post against a CLOSED shift', async () => {
      prisma.posShift.findUnique.mockResolvedValue({ id: 's1', status: 'CLOSED' });

      await expect(service.recordCashMovement('s1', 'CASH_IN', 100, undefined, 'u1')).rejects.toThrow(/already closed/);
    });

    it('creates a cash movement on an OPEN shift', async () => {
      prisma.posShift.findUnique.mockResolvedValue({ id: 's1', status: 'OPEN' });
      prisma.cashMovement.create.mockResolvedValue({ id: 'm1' });

      await service.recordCashMovement('s1', 'DROP', 2000, 'safe drop', 'u1');

      expect(prisma.cashMovement.create).toHaveBeenCalledWith({
        data: { shiftId: 's1', type: 'DROP', amountMinor: 2000, reason: 'safe drop', actorId: 'u1' },
      });
    });
  });

  describe('closeShift', () => {
    it('404s for a shift that does not exist', async () => {
      prisma.posShift.findUnique.mockResolvedValue(null);
      await expect(service.closeShift('missing', 'u1', 5000)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to close an already-closed shift', async () => {
      prisma.posShift.findUnique.mockResolvedValue({ id: 's1', status: 'CLOSED' });
      await expect(service.closeShift('s1', 'u1', 5000)).rejects.toThrow(/already closed/);
    });

    it('marks the shift CLOSED with the physical count and closer', async () => {
      prisma.posShift.findUnique.mockResolvedValue({ id: 's1', status: 'OPEN' });
      prisma.posShift.update.mockResolvedValue({ id: 's1', status: 'CLOSED', closingCashMinor: 4800 });

      await service.closeShift('s1', 'u2', 4800);

      expect(prisma.posShift.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'CLOSED', closingCashMinor: 4800, closedByUserId: 'u2', closedAt: expect.any(Date) },
      });
    });
  });

  describe('xReport', () => {
    it('404s for a shift that does not exist', async () => {
      prisma.posShift.findUnique.mockResolvedValue(null);
      await expect(service.xReport('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('computes expected cash from every movement type, callable on an OPEN shift', async () => {
      prisma.posShift.findUnique.mockResolvedValue({ id: 's1', status: 'OPEN' });
      prisma.cashMovement.findMany.mockResolvedValue([
        { type: 'OPENING_FLOAT', amountMinor: 5000 },
        { type: 'CASH_IN', amountMinor: 1000 },
        { type: 'CASH_OUT', amountMinor: 300 },
        { type: 'DROP', amountMinor: 2000 },
        { type: 'PAID_OUT', amountMinor: 200 },
      ]);

      const report = await service.xReport('s1');

      expect(report).toEqual({
        expectedCashMinor: 5000 + 1000 - 300 - 2000 - 200,
        openingFloatMinor: 5000,
        cashInMinor: 1000,
        cashOutMinor: 300,
        dropMinor: 2000,
        paidOutMinor: 200,
      });
    });
  });

  describe('zReport', () => {
    it('404s for a shift that does not exist', async () => {
      prisma.posShift.findUnique.mockResolvedValue(null);
      await expect(service.zReport('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses on a shift that is still OPEN', async () => {
      prisma.posShift.findUnique.mockResolvedValue({ id: 's1', status: 'OPEN', closingCashMinor: null });

      await expect(service.zReport('s1')).rejects.toThrow(/only available once the shift is closed/);
    });

    it('reports over/short as the physical count minus the expected cash', async () => {
      prisma.posShift.findUnique.mockResolvedValue({ id: 's1', status: 'CLOSED', closingCashMinor: 5900 });
      prisma.cashMovement.findMany.mockResolvedValue([
        { type: 'OPENING_FLOAT', amountMinor: 5000 },
        { type: 'CASH_IN', amountMinor: 1000 },
      ]);

      const report = await service.zReport('s1');

      expect(report.expectedCashMinor).toBe(6000);
      expect(report.closingCashMinor).toBe(5900);
      expect(report.overShortMinor).toBe(-100);
    });

    it('reports a positive over-short when the drawer has more than expected', async () => {
      prisma.posShift.findUnique.mockResolvedValue({ id: 's1', status: 'CLOSED', closingCashMinor: 5100 });
      prisma.cashMovement.findMany.mockResolvedValue([{ type: 'OPENING_FLOAT', amountMinor: 5000 }]);

      const report = await service.zReport('s1');

      expect(report.overShortMinor).toBe(100);
    });
  });
});
