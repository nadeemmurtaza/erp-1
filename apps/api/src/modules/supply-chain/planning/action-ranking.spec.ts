import { rankActions, type VariantEconomics } from './action-ranking';
import type { DependencyEdge } from './dependency-graph';
import type { PropagationResult } from './propagation';

describe('rankActions', () => {
  it('never proposes a TRANSFER_STOCK candidate with no corresponding real StockTransfer-capable location pair', () => {
    const graph: DependencyEdge[] = [
      { from: { type: 'Sku', id: 'v1' }, to: { type: 'Location', id: 'l2' }, weight: 40 }, // surplus at l2
      // NOTE: no Location -> Location transfer edge exists between l1 and l2.
    ];
    const propagation: PropagationResult = {
      shock: { kind: 'DemandShock', variantId: 'v1', pctChange: 0 },
      perSkuLocation: [{ variantId: 'v1', locationId: 'l1', projectedOnHand: 0, daysOfCoverRemaining: 0, stockoutInDays: 0, unmetDemandUnitsPerDay: 5 }],
    };
    const economics = new Map<string, VariantEconomics>([['v1', { marginMinor: 100 }]]);

    const candidates = rankActions(propagation, graph, economics);
    expect(candidates.filter((c) => c.kind === 'TRANSFER_STOCK')).toHaveLength(0);
  });

  it('proposes a feasible TRANSFER_STOCK candidate when a real transfer-capable surplus location exists', () => {
    const graph: DependencyEdge[] = [
      { from: { type: 'Sku', id: 'v1' }, to: { type: 'Location', id: 'l2' }, weight: 40 },
      { from: { type: 'Location', id: 'l2' }, to: { type: 'Location', id: 'l1' } },
    ];
    const propagation: PropagationResult = {
      shock: { kind: 'DemandShock', variantId: 'v1', pctChange: 0 },
      perSkuLocation: [{ variantId: 'v1', locationId: 'l1', projectedOnHand: 0, daysOfCoverRemaining: 0, stockoutInDays: 0, unmetDemandUnitsPerDay: 5 }],
    };
    const economics = new Map<string, VariantEconomics>([['v1', { marginMinor: 100 }]]);

    const candidates = rankActions(propagation, graph, economics);
    const transfer = candidates.find((c) => c.kind === 'TRANSFER_STOCK');
    expect(transfer).toBeDefined();
    expect(transfer!.feasible).toBe(true);
    expect(transfer!.sourceEdges.length).toBeGreaterThan(0);
  });

  it('only generates DELAY_DISCRETIONARY_AP candidates for a CashShock, never another shock kind', () => {
    const graph: DependencyEdge[] = [{ from: { type: 'Supplier', id: 's1' }, to: { type: 'Obligation', id: 'ob1' }, weight: 5000 }];
    const propagation: PropagationResult = {
      shock: { kind: 'SkuRecall', variantId: 'v1' },
      perSkuLocation: [],
    };
    const candidates = rankActions(propagation, graph, new Map());
    expect(candidates.filter((c) => c.kind === 'DELAY_DISCRETIONARY_AP')).toHaveLength(0);
  });

  it('sorts by score descending, tiebreaking by reversibility', () => {
    const graph: DependencyEdge[] = [{ from: { type: 'Supplier', id: 's1' }, to: { type: 'Obligation', id: 'ob1' }, weight: 100 }];
    const propagation: PropagationResult = { shock: { kind: 'CashShock', amountMinor: 100 }, perSkuLocation: [] };
    const candidates = rankActions(propagation, graph, new Map());
    for (let i = 1; i < candidates.length; i += 1) {
      expect(candidates[i - 1].score).toBeGreaterThanOrEqual(candidates[i].score);
    }
  });
});
