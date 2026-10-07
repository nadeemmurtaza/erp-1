import { FinanceMetricsProvider } from './finance.metrics';
import { MetricRegistryService } from '../../../core/metrics/metric-registry.service';
import type { MetricContext } from '../../../core/metrics/metric-provider';

function makeCtx(): MetricContext {
  return {
    from: new Date('2026-08-01T00:00:00.000Z'),
    to: new Date('2026-08-31T00:00:00.000Z'),
    prevFrom: new Date('2026-07-02T00:00:00.000Z'),
    prevTo: new Date('2026-08-01T00:00:00.000Z'),
    permissions: [],
  };
}

function makeRegistry() {
  return { register: jest.fn() } as unknown as MetricRegistryService;
}

describe('FinanceMetricsProvider', () => {
  it('registers itself and needs finance.view', () => {
    const registry = makeRegistry();
    const provider = new FinanceMetricsProvider({} as any, {} as any, registry);
    provider.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(provider);
    expect(provider.permissions).toEqual(['finance.view']);
  });

  it('reuses FinanceService.summary() rather than a second aggregation, and computes vs_revenue_bps from the shared revenue reading', async () => {
    const summary = jest
      .fn()
      .mockResolvedValueOnce({
        totals: { amount: 40_000, count: 5, directAmount: 30_000, operatingAmount: 10_000, unpaidAmount: 5_000, unpaidCount: 2 },
        byCategory: [{ categoryId: 'c1', categoryName: 'Rent', isDirect: true, amount: 30_000, count: 1 }],
        series: [],
      })
      .mockResolvedValueOnce({
        totals: { amount: 20_000, count: 2, directAmount: 10_000, operatingAmount: 10_000, unpaidAmount: 0, unpaidCount: 0 },
        byCategory: [],
        series: [],
      });
    const prisma = {
      order: { aggregate: jest.fn().mockResolvedValueOnce({ _sum: { grandTotal: 200_000 } }).mockResolvedValueOnce({ _sum: { grandTotal: 100_000 } }) },
      $queryRaw: jest.fn().mockResolvedValue([{ count: 0n }]),
    };
    const provider = new FinanceMetricsProvider(prisma as any, { summary } as any, makeRegistry());

    const result = await provider.collect(makeCtx(), [
      'expenses.total',
      'expenses.largest_category_amount',
      'expenses.direct_share_bps',
      'expenses.vs_revenue_bps',
    ]);

    expect(summary).toHaveBeenCalledTimes(2);
    expect(result['expenses.total']).toEqual({ value: 40_000, previous: 20_000, unit: 'paisa' });
    expect(result['expenses.largest_category_amount']).toEqual({ value: 30_000, previous: null, unit: 'paisa', label: 'Rent' });
    // 30,000 direct / 40,000 total = 75% = 7500 bps
    expect(result['expenses.direct_share_bps']).toEqual({ value: 7500, previous: 5000, unit: 'bps' });
    // 40,000 expenses / 200,000 revenue = 20% = 2000 bps
    expect(result['expenses.vs_revenue_bps']).toEqual({ value: 2000, previous: 2000, unit: 'bps' });
  });
});
