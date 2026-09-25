import { BomCardsMetricsProvider, BomValueMetricsProvider } from './bom-cards.metrics';
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

describe('BomCardsMetricsProvider', () => {
  it('registers itself and needs bom.view', () => {
    const registry = makeRegistry();
    const provider = new BomCardsMetricsProvider({} as any, {} as any, registry);
    provider.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(provider);
    expect(provider.permissions).toEqual(['bom.view']);
  });

  it('reuses RecipeService.missingSummary() for missing_recipes/incomplete_cost_recipes rather than a second query', async () => {
    const missingSummary = jest.fn().mockResolvedValue({ missing: [{ id: 'v1' }], incompleteCost: [], counts: { missing: 1, incompleteCost: 0 } });
    const prisma = {
      bomRecipe: { count: jest.fn().mockResolvedValue(4) },
      bomProductionRun: { aggregate: jest.fn().mockResolvedValue({ _count: { _all: 3 }, _sum: { quantityProduced: 30 } }) },
      $queryRaw: jest.fn().mockResolvedValue([{ count: 0n }]),
    };
    const provider = new BomCardsMetricsProvider(prisma as any, { missingSummary } as any, makeRegistry());

    const result = await provider.collect(makeCtx(), ['bom.missing_recipes', 'bom.incomplete_cost_recipes', 'bom.active_recipes']);

    expect(missingSummary).toHaveBeenCalledTimes(1);
    expect(result['bom.missing_recipes']).toEqual({ value: 1, previous: null, unit: 'count' });
    expect(result['bom.incomplete_cost_recipes']).toEqual({ value: 0, previous: null, unit: 'count' });
    expect(result['bom.active_recipes']).toEqual({ value: 4, previous: null, unit: 'count' });
  });
});

describe('BomValueMetricsProvider', () => {
  it('needs inventory.view_cost, stricter than the group default', () => {
    const provider = new BomValueMetricsProvider({} as any, makeRegistry());
    expect(provider.permissions).toEqual(['inventory.view_cost']);
  });

  it('sums stock × costPrice for active raw-material variants only', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ value: 500_000n }]) };
    const provider = new BomValueMetricsProvider(prisma as any, makeRegistry());

    const result = await provider.collect();

    expect(result['bom.raw_material_value']).toEqual({ value: 500_000, previous: null, unit: 'paisa' });
  });
});
