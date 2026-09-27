import { propagate, type DemandBand, type Shock } from './propagation';
import type { DependencyEdge } from './dependency-graph';

describe('propagate', () => {
  const GRAPH: DependencyEdge[] = [
    { from: { type: 'Sku', id: 'v1' }, to: { type: 'Location', id: 'l1' }, weight: 100 },
    { from: { type: 'Sku', id: 'v1' }, to: { type: 'Location', id: 'l2' }, weight: 50 },
    { from: { type: 'Supplier', id: 's1' }, to: { type: 'Sku', id: 'v1' } },
  ];
  const FORECASTS = new Map<string, DemandBand>([['v1', { low: 7, base: 10, high: 13 }]]);

  it('is deterministic — identical inputs produce byte-identical output', () => {
    const shock: Shock = { kind: 'DemandShock', variantId: 'v1', pctChange: 20 };
    const result1 = propagate(GRAPH, shock, FORECASTS);
    const result2 = propagate(GRAPH, shock, FORECASTS);
    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });

  it('a LocationDown shock only affects the named location', () => {
    const shock: Shock = { kind: 'LocationDown', locationId: 'l1', days: 3 };
    const result = propagate(GRAPH, shock, FORECASTS);
    expect(result.perSkuLocation).toHaveLength(1);
    expect(result.perSkuLocation[0].locationId).toBe('l1');
  });

  it('a SkuRecall zeroes projected on-hand and demand for that variant', () => {
    const shock: Shock = { kind: 'SkuRecall', variantId: 'v1' };
    const result = propagate(GRAPH, shock, FORECASTS);
    for (const row of result.perSkuLocation) {
      expect(row.projectedOnHand).toBe(0);
      expect(row.stockoutInDays).toBe(0);
    }
  });

  it('a SupplierDown shock marks unmet demand for the supplier\'s own variants', () => {
    const shock: Shock = { kind: 'SupplierDown', supplierId: 's1', days: 10 };
    const result = propagate(GRAPH, shock, FORECASTS);
    for (const row of result.perSkuLocation) {
      expect(row.unmetDemandUnitsPerDay).toBeGreaterThan(0);
    }
  });

  it('a variant with no demand forecast has zero unmet demand and no stockout date', () => {
    const shock: Shock = { kind: 'CashShock', amountMinor: 1000 };
    const result = propagate(GRAPH, shock, new Map());
    for (const row of result.perSkuLocation) {
      expect(row.unmetDemandUnitsPerDay).toBe(0);
      expect(row.stockoutInDays).toBeNull();
    }
  });
});
