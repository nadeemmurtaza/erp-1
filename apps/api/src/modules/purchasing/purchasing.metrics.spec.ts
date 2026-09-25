import { PurchasingMetricsProvider, PurchasingSpendMetricsProvider } from './purchasing.metrics';
import { MetricRegistryService } from '../../core/metrics/metric-registry.service';
import type { MetricContext } from '../../core/metrics/metric-provider';

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

describe('PurchasingMetricsProvider', () => {
  it('registers itself and needs purchasing.manage', () => {
    const registry = makeRegistry();
    const provider = new PurchasingMetricsProvider({} as any, registry);
    provider.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(provider);
    expect(provider.permissions).toEqual(['purchasing.manage']);
  });

  it('derives open_pos/awaiting_transit/partial from one groupBy, and the top supplier share in bps', async () => {
    const prisma = {
      purchaseOrder: {
        groupBy: jest
          .fn()
          .mockImplementationOnce(async () => [
            { status: 'DRAFT', _count: { _all: 2 } },
            { status: 'SENT', _count: { _all: 1 } },
          ])
          .mockImplementationOnce(async () => [
            { supplierId: 's1', _sum: { total: 70_000 } },
            { supplierId: 's2', _sum: { total: 30_000 } },
          ])
          .mockImplementationOnce(async () => []),
      },
      supplierBill: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0, amountPaid: 0 } }), count: jest.fn().mockResolvedValue(0) },
    };
    const provider = new PurchasingMetricsProvider(prisma as any, makeRegistry());

    const result = await provider.collect(makeCtx(), ['purchasing.open_pos', 'purchasing.awaiting_transit', 'purchasing.top_supplier_share_bps']);

    expect(result['purchasing.open_pos']).toEqual({ value: 2, previous: null, unit: 'count' });
    expect(result['purchasing.awaiting_transit']).toEqual({ value: 1, previous: null, unit: 'count' });
    // top supplier (70,000) / total (100,000) = 70% = 7000 bps
    expect(result['purchasing.top_supplier_share_bps']).toEqual({ value: 7000, previous: 0, unit: 'bps' });
  });
});

describe('PurchasingSpendMetricsProvider', () => {
  it('needs inventory.view_cost, not purchasing.manage', () => {
    const provider = new PurchasingSpendMetricsProvider({} as any, makeRegistry());
    expect(provider.permissions).toEqual(['inventory.view_cost']);
  });

  it('sums quantity × landedUnitCost across the window, and separately for the previous one', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ quantity: 10, landedUnitCost: 500 }, { quantity: 2, landedUnitCost: 1000 }])
      .mockResolvedValueOnce([{ quantity: 5, landedUnitCost: 500 }]);
    const provider = new PurchasingSpendMetricsProvider({ goodsReceiptItem: { findMany } } as any, makeRegistry());

    const result = await provider.collect(makeCtx());

    expect(result['purchasing.spend']).toEqual({ value: 7000, previous: 2500, unit: 'paisa' });
  });
});
