import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { GlReportsService } from './gl-reports.service';
import { ACCOUNT_CODE } from './chart-of-accounts';

describe('GlReportsService — WO-19.4', () => {
  let service: GlReportsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      journalLine: { groupBy: jest.fn(), findMany: jest.fn() },
      account: { findMany: jest.fn(), findUnique: jest.fn() },
      contact: { findMany: jest.fn() },
      supplier: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [GlReportsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(GlReportsService);
  });

  describe('trialBalance', () => {
    it('is balanced when total debit equals total credit, sorted by account code', async () => {
      prisma.journalLine.groupBy.mockResolvedValue([
        { accountId: 'a-rev', _sum: { debitMinor: 0, creditMinor: 1000 } },
        { accountId: 'a-ar', _sum: { debitMinor: 1000, creditMinor: 0 } },
      ]);
      prisma.account.findMany.mockResolvedValue([
        { id: 'a-ar', code: '1100', name: 'Accounts Receivable', type: 'ASSET' },
        { id: 'a-rev', code: '4000', name: 'Sales Revenue', type: 'INCOME' },
      ]);

      const result = await service.trialBalance(new Date('2026-03-31'));

      expect(result.balanced).toBe(true);
      expect(result.totalDebitMinor).toBe(1000);
      expect(result.totalCreditMinor).toBe(1000);
      expect(result.rows.map((r) => r.code)).toEqual(['1100', '4000']); // sorted
    });

    it('flags an imbalance rather than silently reporting a wrong total', async () => {
      prisma.journalLine.groupBy.mockResolvedValue([
        { accountId: 'a-ar', _sum: { debitMinor: 1000, creditMinor: 0 } },
        { accountId: 'a-rev', _sum: { debitMinor: 0, creditMinor: 900 } },
      ]);
      prisma.account.findMany.mockResolvedValue([
        { id: 'a-ar', code: '1100', name: 'AR', type: 'ASSET' },
        { id: 'a-rev', code: '4000', name: 'Revenue', type: 'INCOME' },
      ]);

      const result = await service.trialBalance(new Date());

      expect(result.balanced).toBe(false);
    });
  });

  describe('profitAndLoss', () => {
    it('splits income and expense, and nets them correctly', async () => {
      prisma.journalLine.groupBy.mockResolvedValue([
        { accountId: 'a-rev', _sum: { debitMinor: 0, creditMinor: 5000 } },
        { accountId: 'a-cogs', _sum: { debitMinor: 2000, creditMinor: 0 } },
      ]);
      prisma.account.findMany.mockResolvedValue([
        { id: 'a-rev', code: '4000', name: 'Sales Revenue', type: 'INCOME' },
        { id: 'a-cogs', code: '5000', name: 'COGS', type: 'EXPENSE' },
      ]);

      const result = await service.profitAndLoss(new Date('2026-01-01'), new Date('2026-01-31'));

      expect(result.totalIncomeMinor).toBe(5000);
      expect(result.totalExpenseMinor).toBe(2000);
      expect(result.netIncomeMinor).toBe(3000);
    });

    it('carries accountId on each row, so a year-end close can post straight back to it', async () => {
      prisma.journalLine.groupBy.mockResolvedValue([{ accountId: 'a-rev', _sum: { debitMinor: 0, creditMinor: 5000 } }]);
      prisma.account.findMany.mockResolvedValue([{ id: 'a-rev', code: '4000', name: 'Sales Revenue', type: 'INCOME' }]);

      const result = await service.profitAndLoss(new Date('2026-01-01'), new Date('2026-01-31'));

      expect(result.income[0]).toMatchObject({ accountId: 'a-rev', code: '4000', amountMinor: 5000 });
    });
  });

  describe('balanceSheet', () => {
    it('balances Assets = Liabilities + Equity + unclosed retained earnings', async () => {
      // Rs 1000 cash sale: Dr Cash 1000, Cr Revenue 800, Cr Tax Payable 200.
      prisma.journalLine.groupBy.mockResolvedValue([
        { accountId: 'a-cash', _sum: { debitMinor: 1000, creditMinor: 0 } },
        { accountId: 'a-tax', _sum: { debitMinor: 0, creditMinor: 200 } },
        { accountId: 'a-rev', _sum: { debitMinor: 0, creditMinor: 800 } },
      ]);
      prisma.account.findMany.mockResolvedValue([
        { id: 'a-cash', code: '1000', name: 'Cash & Bank', type: 'ASSET' },
        { id: 'a-tax', code: '2100', name: 'Tax Payable', type: 'LIABILITY' },
        { id: 'a-rev', code: '4000', name: 'Sales Revenue', type: 'INCOME' },
      ]);

      const result = await service.balanceSheet(new Date());

      expect(result.totalAssetsMinor).toBe(1000);
      expect(result.totalLiabilitiesMinor).toBe(200);
      expect(result.totalEquityMinor).toBe(0);
      expect(result.retainedEarningsMinor).toBe(800);
      expect(result.balanced).toBe(true);
    });
  });

  describe('cashFlow', () => {
    it('only includes isBank accounts, and sums their net movement', async () => {
      prisma.journalLine.groupBy.mockResolvedValue([
        { accountId: 'a-bank', _sum: { debitMinor: 5000, creditMinor: 1000 } },
        { accountId: 'a-rev', _sum: { debitMinor: 0, creditMinor: 4000 } }, // not a bank account
      ]);
      prisma.account.findMany.mockResolvedValue([{ id: 'a-bank', code: '1000', name: 'Cash & Bank', isBank: true }]);

      const result = await service.cashFlow(new Date('2026-01-01'), new Date('2026-01-31'));

      expect(result.accounts).toHaveLength(1);
      expect(result.netChangeMinor).toBe(4000);
      expect(prisma.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isBank: true }) }),
      );
    });
  });

  describe('agedReceivables', () => {
    it('treats a debit as the origination and a credit as the settlement, dropping fully-settled contacts', async () => {
      prisma.account.findUnique.mockResolvedValue({ id: 'a-ar', code: ACCOUNT_CODE.ACCOUNTS_RECEIVABLE });
      prisma.journalLine.findMany.mockResolvedValue([
        { contactId: 'c1', debitMinor: 1000, creditMinor: 0, entry: { date: new Date('2026-01-01') } },
        { contactId: 'c2', debitMinor: 1000, creditMinor: 0, entry: { date: new Date('2026-01-01') } },
        { contactId: 'c2', debitMinor: 0, creditMinor: 1000, entry: { date: new Date('2026-01-10') } }, // c2 fully paid
      ]);
      prisma.contact.findMany.mockResolvedValue([
        { id: 'c1', name: 'Sana' },
        { id: 'c2', name: 'Bilal' },
      ]);

      const result = await service.agedReceivables(new Date('2026-02-01'));

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ id: 'c1', name: 'Sana', totalMinor: 1000 });
    });

    it('returns an empty report when the AR account has not been seeded yet', async () => {
      prisma.account.findUnique.mockResolvedValue(null);

      const result = await service.agedReceivables(new Date());

      expect(result).toEqual({ asOf: expect.any(Date), rows: [], totalMinor: 0 });
      expect(prisma.journalLine.findMany).not.toHaveBeenCalled();
    });
  });

  describe('agedPayables', () => {
    it('treats a credit as the origination and a debit as the settlement — the opposite of AR', async () => {
      prisma.account.findUnique.mockResolvedValue({ id: 'a-ap', code: ACCOUNT_CODE.ACCOUNTS_PAYABLE });
      prisma.journalLine.findMany.mockResolvedValue([
        { supplierId: 's1', debitMinor: 0, creditMinor: 2000, entry: { date: new Date('2026-01-01') } },
        { supplierId: 's1', debitMinor: 500, creditMinor: 0, entry: { date: new Date('2026-01-15') } },
      ]);
      prisma.supplier.findMany.mockResolvedValue([{ id: 's1', name: 'Acme Textiles' }]);

      const result = await service.agedPayables(new Date('2026-02-01'));

      expect(result.rows).toEqual([expect.objectContaining({ id: 's1', name: 'Acme Textiles', totalMinor: 1500 })]);
    });
  });
});
