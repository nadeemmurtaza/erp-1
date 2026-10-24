import { InventoryMetricsProvider, InventoryValuationMetricsProvider } from './inventory.metrics';
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

describe('InventoryMetricsProvider', () => {
  it('registers itself and needs inventory.manage', () => {
    const registry = makeRegistry();
    const provider = new InventoryMetricsProvider({} as any, {} as any, registry);
    provider.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(provider);
    expect(provider.permissions).toEqual(['inventory.manage']);
  });

  it('excludes out-of-stock rows from low_stock, and gives movements_in_window a real previous', async () => {
    const prisma = {
      productVariant: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { stock: 500 } }),
        count: jest.fn().mockResolvedValue(3),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ count: 4n }]),
      variantSalesStat: { count: jest.fn().mockResolvedValue(2) },
      stockMovement: { count: jest.fn().mockResolvedValueOnce(9).mockResolvedValueOnce(6) },
    };
    const inventory = { getReorderSuggestions: jest.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]) };
    const provider = new InventoryMetricsProvider(prisma as any, inventory as any, makeRegistry());

    const result = await provider.collect(makeCtx(), [
      'inventory.units_on_hand',
      'inventory.low_stock',
      'inventory.movements_in_window',
      'inventory.reorder_suggestions',
    ]);

    expect(result['inventory.units_on_hand']).toEqual({ value: 500, previous: null, unit: 'count' });
    expect(result['inventory.low_stock']).toEqual({ value: 4, previous: null, unit: 'count' });
    expect(result['inventory.movements_in_window']).toEqual({ value: 9, previous: 6, unit: 'count' });
    expect(result['inventory.reorder_suggestions']).toEqual({ value: 2, previous: null, unit: 'count' });
  });
});

describe('InventoryValuationMetricsProvider', () => {
  it('needs inventory.view_cost, stricter than the group default', () => {
    const provider = new InventoryValuationMetricsProvider({} as any, makeRegistry());
    expect(provider.permissions).toEqual(['inventory.view_cost']);
  });

  it('sums stock × costPrice for active variants', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ value: 12_345_600n }]) };
    const provider = new InventoryValuationMetricsProvider(prisma as any, makeRegistry());

    const result = await provider.collect();

    expect(result['inventory.valuation']).toEqual({ value: 12_345_600, previous: null, unit: 'paisa' });
  });
});
