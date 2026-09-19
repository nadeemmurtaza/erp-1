import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { FiscalPeriodsService } from './fiscal-periods.service';
import { AccountingService } from './accounting.service';
import { GlReportsService } from './gl-reports.service';

describe('FiscalPeriodsService — WO-19.5', () => {
  let service: FiscalPeriodsService;
  let prisma: any;
  let accounting: any;
  let glReports: any;
  let tx: any;

  beforeEach(async () => {
    tx = { fiscalYear: { update: jest.fn() } };
    prisma = {
      fiscalYear: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn() },
      fiscalPeriod: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      account: { findUnique: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    accounting = { postEntry: jest.fn().mockResolvedValue({}) };
    glReports = { profitAndLoss: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalPeriodsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountingService, useValue: accounting },
        { provide: GlReportsService, useValue: glReports },
      ],
    }).compile();

    service = module.get(FiscalPeriodsService);
  });

  describe('createFiscalYear', () => {
    it('refuses startsOn on or after endsOn', async () => {
      await expect(
        service.createFiscalYear({ name: 'FY2026', startsOn: '2026-12-31', endsOn: '2026-01-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.fiscalYear.create).not.toHaveBeenCalled();
    });

    it('refuses a duplicate name', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue({ id: 'fy1' });

      await expect(
        service.createFiscalYear({ name: 'FY2026', startsOn: '2026-01-01', endsOn: '2027-01-01' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a valid fiscal year', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue(null);
      prisma.fiscalYear.create.mockResolvedValue({ id: 'fy1', name: 'FY2026' });

      const result = await service.createFiscalYear({ name: 'FY2026', startsOn: '2026-01-01', endsOn: '2027-01-01' });

      expect(result.id).toBe('fy1');
    });
  });

  describe('createFiscalPeriod', () => {
    const FY = { id: 'fy1', name: 'FY2026', startsOn: new Date('2026-01-01'), endsOn: new Date('2027-01-01') };

    it('404s for an unknown fiscal year', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue(null);

      await expect(
        service.createFiscalPeriod({ fiscalYearId: 'missing', name: 'P1', startsOn: '2026-01-01', endsOn: '2026-02-01' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a period outside its fiscal year', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue(FY);

      await expect(
        service.createFiscalPeriod({
          fiscalYearId: 'fy1',
          name: 'P13',
          startsOn: '2026-12-15',
          endsOn: '2027-01-15', // spills past FY2026's endsOn
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a duplicate period name within the same fiscal year', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue(FY);
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ id: 'p1' });

      await expect(
        service.createFiscalPeriod({ fiscalYearId: 'fy1', name: 'P1', startsOn: '2026-01-01', endsOn: '2026-02-01' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a period that falls within its fiscal year', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue(FY);
      prisma.fiscalPeriod.findUnique.mockResolvedValue(null);
      prisma.fiscalPeriod.create.mockResolvedValue({ id: 'p1', name: 'P1', status: 'OPEN' });

      const result = await service.createFiscalPeriod({
        fiscalYearId: 'fy1',
        name: 'P1',
        startsOn: '2026-01-01',
        endsOn: '2026-02-01',
      });

      expect(result.status).toBe('OPEN');
    });
  });

  describe('closePeriod', () => {
    it('moves OPEN -> CLOSED', async () => {
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ id: 'p1', name: 'P1', status: 'OPEN' });
      prisma.fiscalPeriod.update.mockResolvedValue({ id: 'p1', status: 'CLOSED' });

      const result = await service.closePeriod('p1');

      expect(result.status).toBe('CLOSED');
      expect(prisma.fiscalPeriod.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: 'CLOSED' } });
    });

    it('refuses to close a period that is not OPEN', async () => {
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ id: 'p1', name: 'P1', status: 'CLOSED' });

      await expect(service.closePeriod('p1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.fiscalPeriod.update).not.toHaveBeenCalled();
    });

    it('404s for an unknown period', async () => {
      prisma.fiscalPeriod.findUnique.mockResolvedValue(null);

      await expect(service.closePeriod('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reopenPeriod', () => {
    it('moves CLOSED -> OPEN', async () => {
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ id: 'p1', name: 'P1', status: 'CLOSED' });
      prisma.fiscalPeriod.update.mockResolvedValue({ id: 'p1', status: 'OPEN' });

      const result = await service.reopenPeriod('p1');

      expect(result.status).toBe('OPEN');
    });

    it('refuses to reopen an already-OPEN period', async () => {
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ id: 'p1', name: 'P1', status: 'OPEN' });

      await expect(service.reopenPeriod('p1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to reopen a LOCKED period — permanent, matching R2', async () => {
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ id: 'p1', name: 'P1', status: 'LOCKED' });

      await expect(service.reopenPeriod('p1')).rejects.toThrow(/never be reopened/i);
      expect(prisma.fiscalPeriod.update).not.toHaveBeenCalled();
    });
  });

  describe('lockPeriod', () => {
    it('moves CLOSED -> LOCKED', async () => {
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ id: 'p1', name: 'P1', status: 'CLOSED' });
      prisma.fiscalPeriod.update.mockResolvedValue({ id: 'p1', status: 'LOCKED' });

      const result = await service.lockPeriod('p1');

      expect(result.status).toBe('LOCKED');
    });

    it('refuses to lock an OPEN period — must be closed first', async () => {
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ id: 'p1', name: 'P1', status: 'OPEN' });

      await expect(service.lockPeriod('p1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.fiscalPeriod.update).not.toHaveBeenCalled();
    });

    it('refuses to lock an already-LOCKED period', async () => {
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ id: 'p1', name: 'P1', status: 'LOCKED' });

      await expect(service.lockPeriod('p1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('closeFiscalYear', () => {
    const FY = { id: 'fy1', name: 'FY2026', startsOn: new Date('2026-01-01'), endsOn: new Date('2027-01-01'), closedAt: null };

    it('404s for an unknown fiscal year', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue(null);

      await expect(service.closeFiscalYear('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a fiscal year that is already closed', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue({ ...FY, closedAt: new Date() });

      await expect(service.closeFiscalYear('fy1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses while any period in the year is still OPEN', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue(FY);
      prisma.fiscalPeriod.findMany.mockResolvedValue([
        { id: 'p1', name: 'Jan', status: 'CLOSED' },
        { id: 'p2', name: 'Feb', status: 'OPEN' },
      ]);

      await expect(service.closeFiscalYear('fy1')).rejects.toThrow(/still OPEN: Feb/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('posts a closing entry that debits income, credits expense, and balances to Retained Earnings on a profit', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue(FY);
      prisma.fiscalPeriod.findMany.mockResolvedValue([{ id: 'p1', name: 'Jan', status: 'LOCKED' }]);
      glReports.profitAndLoss.mockResolvedValue({
        income: [{ accountId: 'a-rev', code: '4000', name: 'Sales Revenue', amountMinor: 5000 }],
        expense: [{ accountId: 'a-cogs', code: '5000', name: 'COGS', amountMinor: 2000 }],
        totalIncomeMinor: 5000,
        totalExpenseMinor: 2000,
        netIncomeMinor: 3000,
      });
      prisma.account.findUnique.mockResolvedValue({ id: 'a-re', code: '3000', name: 'Retained Earnings' });
      tx.fiscalYear.update.mockResolvedValue({ ...FY, closedAt: new Date() });

      await service.closeFiscalYear('fy1');

      const [input, passedTx] = accounting.postEntry.mock.calls[0];
      expect(passedTx).toBe(tx);
      expect(input.date).toEqual(FY.endsOn);
      expect(input.source).toBe('accounting.year_end_close');
      expect(input.lines).toEqual(
        expect.arrayContaining([
          { accountId: 'a-rev', debitMinor: 5000 },
          { accountId: 'a-cogs', creditMinor: 2000 },
          { accountId: 'a-re', creditMinor: 3000 },
        ]),
      );
      const totalDebit = input.lines.reduce((s: number, l: any) => s + (l.debitMinor ?? 0), 0);
      const totalCredit = input.lines.reduce((s: number, l: any) => s + (l.creditMinor ?? 0), 0);
      expect(totalDebit).toBe(totalCredit);

      expect(tx.fiscalYear.update).toHaveBeenCalledWith({ where: { id: 'fy1' }, data: { closedAt: expect.any(Date) } });
    });

    it('debits Retained Earnings on a loss', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue(FY);
      prisma.fiscalPeriod.findMany.mockResolvedValue([]);
      glReports.profitAndLoss.mockResolvedValue({
        income: [{ accountId: 'a-rev', code: '4000', name: 'Sales Revenue', amountMinor: 1000 }],
        expense: [{ accountId: 'a-cogs', code: '5000', name: 'COGS', amountMinor: 4000 }],
        totalIncomeMinor: 1000,
        totalExpenseMinor: 4000,
        netIncomeMinor: -3000,
      });
      prisma.account.findUnique.mockResolvedValue({ id: 'a-re', code: '3000', name: 'Retained Earnings' });

      await service.closeFiscalYear('fy1');

      const [input] = accounting.postEntry.mock.calls[0];
      expect(input.lines).toEqual(
        expect.arrayContaining([{ accountId: 'a-re', debitMinor: 3000 }]),
      );
    });

    it('skips posting entirely when there was no income/expense activity, but still marks the year closed', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue(FY);
      prisma.fiscalPeriod.findMany.mockResolvedValue([]);
      glReports.profitAndLoss.mockResolvedValue({ income: [], expense: [], totalIncomeMinor: 0, totalExpenseMinor: 0, netIncomeMinor: 0 });

      await service.closeFiscalYear('fy1');

      expect(accounting.postEntry).not.toHaveBeenCalled();
      expect(tx.fiscalYear.update).toHaveBeenCalledWith({ where: { id: 'fy1' }, data: { closedAt: expect.any(Date) } });
    });

    it('does not add a Retained Earnings line when income exactly offsets expense', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue(FY);
      prisma.fiscalPeriod.findMany.mockResolvedValue([]);
      glReports.profitAndLoss.mockResolvedValue({
        income: [{ accountId: 'a-rev', code: '4000', name: 'Sales Revenue', amountMinor: 2000 }],
        expense: [{ accountId: 'a-cogs', code: '5000', name: 'COGS', amountMinor: 2000 }],
        totalIncomeMinor: 2000,
        totalExpenseMinor: 2000,
        netIncomeMinor: 0,
      });

      await service.closeFiscalYear('fy1');

      expect(prisma.account.findUnique).not.toHaveBeenCalled();
      const [input] = accounting.postEntry.mock.calls[0];
      expect(input.lines).toHaveLength(2);
    });

    it('throws if the Retained Earnings account is missing from the chart of accounts', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue(FY);
      prisma.fiscalPeriod.findMany.mockResolvedValue([]);
      glReports.profitAndLoss.mockResolvedValue({
        income: [{ accountId: 'a-rev', code: '4000', name: 'Sales Revenue', amountMinor: 5000 }],
        expense: [],
        totalIncomeMinor: 5000,
        totalExpenseMinor: 0,
        netIncomeMinor: 5000,
      });
      prisma.account.findUnique.mockResolvedValue(null);

      await expect(service.closeFiscalYear('fy1')).rejects.toBeInstanceOf(BadRequestException);
      expect(accounting.postEntry).not.toHaveBeenCalled();
    });
  });
});
