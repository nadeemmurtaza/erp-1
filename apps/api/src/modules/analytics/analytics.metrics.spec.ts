import {
  CustomersMetricsProvider,
  OrdersMetricsProvider,
  ProductsMetricsProvider,
  SalesCostMetricsProvider,
  SalesMetricsProvider,
  WorkshopMetricsProvider,
  WorkshopStaffMetricsProvider,
} from './analytics.metrics';
import { MetricRegistryService } from '../../core/metrics/metric-registry.service';

function makeCtx(overrides: Partial<import('../../core/metrics/metric-provider').MetricContext> = {}) {
  return {
    from: new Date('2026-08-01T00:00:00.000Z'),
    to: new Date('2026-08-31T00:00:00.000Z'),
    prevFrom: new Date('2026-07-02T00:00:00.000Z'),
    prevTo: new Date('2026-08-01T00:00:00.000Z'),
    permissions: [],
    ...overrides,
  };
}

function makeRegistry() {
  return { register: jest.fn() } as unknown as MetricRegistryService;
}

describe('SalesMetricsProvider', () => {
  it('registers itself in onModuleInit', () => {
    const registry = makeRegistry();
    const provider = new SalesMetricsProvider({} as any, {} as any, registry);
    provider.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(provider);
  });

  it('declares no permission requirement (falls back to analytics.view)', () => {
    const provider = new SalesMetricsProvider({} as any, {} as any, makeRegistry());
    expect(provider.permissions).toEqual([]);
  });

  it('computes revenue and AOV from a single aggregate per window', async () => {
    const aggregate = jest
      .fn()
      .mockResolvedValueOnce({ _sum: { grandTotal: 100_000 }, _count: { _all: 4 } }) // current
      .mockResolvedValueOnce({ _sum: { grandTotal: 50_000 }, _count: { _all: 2 } }); // previous
    const prisma = { order: { aggregate }, cart: { count: jest.fn() } };
    const provider = new SalesMetricsProvider(prisma as any, {} as any, makeRegistry());

    const result = await provider.collect(makeCtx(), ['sales.revenue', 'sales.aov']);

    expect(aggregate).toHaveBeenCalledTimes(2);
    expect(result['sales.revenue']).toEqual({ value: 100_000, previous: 50_000, unit: 'paisa' });
    expect(result['sales.aov']).toEqual({ value: 25_000, previous: 25_000, unit: 'paisa' });
  });

  it('only requests what it needs: skipping sales.revenue/aov skips the order aggregate entirely', async () => {
    const aggregate = jest.fn();
    const cartCount = jest.fn().mockResolvedValue(10);
    const orderCount = jest.fn().mockResolvedValue(3);
    const prisma = { order: { aggregate, count: orderCount }, cart: { count: cartCount } };
    const provider = new SalesMetricsProvider(prisma as any, {} as any, makeRegistry());

    const result = await provider.collect(makeCtx(), ['sales.conversion_rate']);

    expect(aggregate).not.toHaveBeenCalled();
    expect(result['sales.conversion_rate']).toEqual({ value: 30, previous: null, unit: 'count' });
  });
});

describe('SalesCostMetricsProvider', () => {
  it('needs inventory.view_cost', () => {
    const provider = new SalesCostMetricsProvider({} as any, makeRegistry());
    expect(provider.permissions).toEqual(['inventory.view_cost']);
  });

  it('computes gross profit as revenue minus COGS, and margin in bps', async () => {
    const aggregate = jest
      .fn()
      .mockResolvedValueOnce({ _sum: { grandTotal: 100_000 } }) // current revenue
      .mockResolvedValueOnce({ _sum: { grandTotal: 40_000 } }); // previous revenue
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ cogs: 60_000n }]) // current cogs
      .mockResolvedValueOnce([{ cogs: 20_000n }]); // previous cogs
    const prisma = { order: { aggregate }, $queryRaw: queryRaw };
    const provider = new SalesCostMetricsProvider(prisma as any, makeRegistry());

    const result = await provider.collect(makeCtx());

    expect(result['sales.gross_profit']).toEqual({ value: 40_000, previous: 20_000, unit: 'paisa' });
    // 40,000 / 100,000 = 40% = 4000 bps
    expect(result['sales.gross_margin_bps']).toEqual({ value: 4000, previous: 5000, unit: 'bps' });
  });
});

describe('OrdersMetricsProvider', () => {
  it('serves every status-shaped key from ONE groupBy call per window (N+1 prevention, D2)', async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { status: 'PENDING', _count: { _all: 3 } },
      { status: 'DELIVERED', _count: { _all: 7 } },
    ]);
    const prisma = { order: { groupBy }, $queryRaw: jest.fn().mockResolvedValue([{ days: 2.5 }]) };
    const provider = new OrdersMetricsProvider(prisma as any, makeRegistry());

    const result = await provider.collect(makeCtx(), ['orders.total', 'orders.pending', 'orders.delivered', 'orders.confirmed']);

    // One call for the current window, one for the previous — never one per key.
    expect(groupBy).toHaveBeenCalledTimes(2);
    // The mock returns the same rows for both the current and previous window.
    expect(result['orders.total']).toEqual({ value: 10, previous: 10, unit: 'count' });
    expect(result['orders.pending']).toEqual({ value: 3, previous: 3, unit: 'count' });
    expect(result['orders.delivered']).toEqual({ value: 7, previous: 7, unit: 'count' });
    expect(result['orders.confirmed']).toEqual({ value: 0, previous: 0, unit: 'count' });
  });

  it('computes avg_fulfilment_days only when asked', async () => {
    const groupBy = jest.fn().mockResolvedValue([]);
    const queryRaw = jest.fn().mockResolvedValue([{ days: 3.14159 }]);
    const prisma = { order: { groupBy }, $queryRaw: queryRaw };
    const provider = new OrdersMetricsProvider(prisma as any, makeRegistry());

    const withoutIt = await provider.collect(makeCtx(), ['orders.total']);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(withoutIt['orders.avg_fulfilment_days']).toBeUndefined();

    const withIt = await provider.collect(makeCtx(), ['orders.avg_fulfilment_days']);
    expect(withIt['orders.avg_fulfilment_days']).toEqual({ value: 3.1, previous: 3.1, unit: 'days' });
  });
});

describe('ProductsMetricsProvider', () => {
  it('needs catalog.manage', () => {
    const provider = new ProductsMetricsProvider({} as any, makeRegistry());
    expect(provider.permissions).toEqual(['catalog.manage']);
  });

  it('carries the top and slowest seller names as MetricValue.label, not a second key', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      { name: 'Kurta XL', units: 50n },
      { name: 'Scarf', units: 1n },
    ]);
    const prisma = {
      product: { count: jest.fn().mockResolvedValue(0) },
      productVariant: { count: jest.fn().mockResolvedValue(0) },
      $queryRaw: queryRaw,
    };
    const provider = new ProductsMetricsProvider(prisma as any, makeRegistry());

    const result = await provider.collect(makeCtx(), ['products.top_seller_units', 'products.slowest_seller_units']);

    expect(result['products.top_seller_units']).toEqual({ value: 50, previous: null, unit: 'count', label: 'Kurta XL' });
    expect(result['products.slowest_seller_units']).toEqual({ value: 1, previous: null, unit: 'count', label: 'Scarf' });
  });
});

describe('CustomersMetricsProvider', () => {
  it('carries the top spender name via label alongside their lifetime value', async () => {
    const prisma = {
      contact: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue({ name: 'Ayesha', lifetimeValue: 250_000 }),
      },
      lead: { count: jest.fn() },
      followUpTask: { count: jest.fn() },
    };
    const provider = new CustomersMetricsProvider(prisma as any, makeRegistry());

    const result = await provider.collect(makeCtx(), ['customers.top_spender_ltv']);

    expect(result['customers.top_spender_ltv']).toEqual({ value: 250_000, previous: null, unit: 'paisa', label: 'Ayesha' });
  });
});

describe('WorkshopMetricsProvider', () => {
  it('reports the busiest non-dispatched stage as bottleneck_stage, via label', async () => {
    const prisma = {
      stitchingJob: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([
          { stage: 'STITCHING', _count: { _all: 5 } },
          { stage: 'QC', _count: { _all: 12 } },
        ]),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ days: 1 }]),
      user: { count: jest.fn() },
    };
    const provider = new WorkshopMetricsProvider(prisma as any, makeRegistry());

    const result = await provider.collect(makeCtx(), ['workshop.bottleneck_stage']);

    expect(result['workshop.bottleneck_stage']).toEqual({ value: 12, previous: null, unit: 'count', label: 'QC' });
  });
});

describe('WorkshopStaffMetricsProvider', () => {
  it('needs users.manage — stricter than the rest of the Workshop group', () => {
    const provider = new WorkshopStaffMetricsProvider({} as any, makeRegistry());
    expect(provider.permissions).toEqual(['users.manage']);
  });

  it('counts active STAFF/ADMIN/TAILOR accounts', async () => {
    const count = jest.fn().mockResolvedValue(6);
    const provider = new WorkshopStaffMetricsProvider({ user: { count } } as any, makeRegistry());

    const result = await provider.collect();

    expect(count).toHaveBeenCalledWith({ where: { role: { in: ['STAFF', 'ADMIN', 'TAILOR'] }, isActive: true } });
    expect(result['workshop.staff_accounts']).toEqual({ value: 6, previous: null, unit: 'count' });
  });
});
