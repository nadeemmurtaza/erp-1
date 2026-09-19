import { ConsolidationService } from './consolidation.service';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('ConsolidationService — R17, WO-20.6', () => {
  let service: ConsolidationService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      journalLine: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
      account: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ConsolidationService(prisma as PrismaService);
  });

  describe('groupProfitAndLoss', () => {
    it('with no intercompany activity, matches a plain unconsolidated total', async () => {
      prisma.journalLine.groupBy.mockResolvedValue([
        { accountId: 'a-rev', _sum: { debitMinor: 0, creditMinor: 5000 } },
        { accountId: 'a-cogs', _sum: { debitMinor: 2000, creditMinor: 0 } },
      ]);
      prisma.account.findMany.mockResolvedValue([
        { id: 'a-rev', type: 'INCOME' },
        { id: 'a-cogs', type: 'EXPENSE' },
      ]);

      const result = await service.groupProfitAndLoss(new Date('2026-01-01'), new Date('2026-01-31'));

      expect(result.totalIncomeMinor).toBe(5000);
      expect(result.totalExpenseMinor).toBe(2000);
      expect(result.eliminatedMinor).toBe(0);
    });

    it('eliminates a fully-matched intercompany pair from both income and expense', async () => {
      // Naive totals across brand A + brand B: 5000 income (includes A's
      // 1000 intercompany sale to B), 2000 expense (includes B's matching
      // 1000 intercompany cost from A).
      prisma.journalLine.groupBy.mockResolvedValue([
        { accountId: 'a-rev', _sum: { debitMinor: 0, creditMinor: 5000 } },
        { accountId: 'a-cogs', _sum: { debitMinor: 2000, creditMinor: 0 } },
      ]);
      prisma.account.findMany.mockResolvedValue([
        { id: 'a-rev', type: 'INCOME' },
        { id: 'a-cogs', type: 'EXPENSE' },
      ]);
      prisma.journalLine.findMany.mockResolvedValue([
        // Brand A recognizes 1000 revenue against brand B.
        { retailBrandId: 'brandA', counterpartyBrandId: 'brandB', debitMinor: 0, creditMinor: 1000 },
        // Brand B recognizes the matching 1000 cost against brand A.
        { retailBrandId: 'brandB', counterpartyBrandId: 'brandA', debitMinor: 1000, creditMinor: 0 },
      ]);

      const result = await service.groupProfitAndLoss(new Date('2026-01-01'), new Date('2026-01-31'));

      expect(result.eliminatedMinor).toBe(1000);
      expect(result.totalIncomeMinor).toBe(4000);
      expect(result.totalExpenseMinor).toBe(1000);
      expect(result.netIncomeMinor).toBe(3000);
      expect(result.intercompanyPairs).toHaveLength(1);
      expect(result.intercompanyPairs[0]).toMatchObject({
        brandId: 'brandA',
        counterpartyBrandId: 'brandB',
        eliminatedMinor: 1000,
        unmatchedMinor: 0,
      });
    });

    it('only eliminates the matched portion when the two sides disagree, leaving the rest as unmatched', async () => {
      prisma.journalLine.groupBy.mockResolvedValue([]);
      prisma.journalLine.findMany.mockResolvedValue([
        { retailBrandId: 'brandA', counterpartyBrandId: 'brandB', debitMinor: 0, creditMinor: 1000 },
        { retailBrandId: 'brandB', counterpartyBrandId: 'brandA', debitMinor: 700, creditMinor: 0 },
      ]);

      const result = await service.groupProfitAndLoss(new Date('2026-01-01'), new Date('2026-01-31'));

      expect(result.eliminatedMinor).toBe(700);
      expect(result.intercompanyPairs[0]).toMatchObject({ eliminatedMinor: 700, unmatchedMinor: 300 });
    });

    it('counts each unordered brand pair exactly once regardless of which direction is iterated first', async () => {
      prisma.journalLine.groupBy.mockResolvedValue([]);
      prisma.journalLine.findMany.mockResolvedValue([
        { retailBrandId: 'brandB', counterpartyBrandId: 'brandA', debitMinor: 500, creditMinor: 0 },
        { retailBrandId: 'brandA', counterpartyBrandId: 'brandB', debitMinor: 0, creditMinor: 500 },
      ]);

      const result = await service.groupProfitAndLoss(new Date('2026-01-01'), new Date('2026-01-31'));

      expect(result.intercompanyPairs).toHaveLength(1);
    });

    it('never lets rawTotals query cross accounts it never fetched — no accounts, no crash', async () => {
      prisma.journalLine.groupBy.mockResolvedValue([]);

      const result = await service.groupProfitAndLoss(new Date('2026-01-01'), new Date('2026-01-31'));

      expect(result.totalIncomeMinor).toBe(0);
      expect(result.totalExpenseMinor).toBe(0);
      expect(prisma.account.findMany).not.toHaveBeenCalled();
    });
  });

  describe('unmatchedIntercompany', () => {
    it('excludes fully-matched pairs from the exception report', async () => {
      prisma.journalLine.findMany.mockResolvedValue([
        { retailBrandId: 'brandA', counterpartyBrandId: 'brandB', debitMinor: 0, creditMinor: 1000 },
        { retailBrandId: 'brandB', counterpartyBrandId: 'brandA', debitMinor: 1000, creditMinor: 0 },
      ]);

      const result = await service.unmatchedIntercompany(new Date('2026-01-01'), new Date('2026-01-31'));

      expect(result).toHaveLength(0);
    });

    it('reports a brand pair with intercompany activity on only one side as fully unmatched', async () => {
      prisma.journalLine.findMany.mockResolvedValue([
        { retailBrandId: 'brandA', counterpartyBrandId: 'brandB', debitMinor: 0, creditMinor: 800 },
      ]);

      const result = await service.unmatchedIntercompany(new Date('2026-01-01'), new Date('2026-01-31'));

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ brandId: 'brandA', counterpartyBrandId: 'brandB', eliminatedMinor: 0, unmatchedMinor: 800 });
    });
  });
});
