import type { DependencyEdge } from './dependency-graph';
import type { PropagationResult } from './propagation';

/**
 * R22's own named action kinds, kept complete for forward extensibility —
 * `rankActions()` below only ever GENERATES the two kinds this graph
 * currently has real, shipped data to back (`TRANSFER_STOCK`,
 * `DELAY_DISCRETIONARY_AP`). The remaining kinds need data this document's
 * own graph (§1) does not yet project — an alternate-supplier PO split, a
 * substitute-SKU mapping, markdown price elasticity — and are named here so
 * a future work order extends this same enum rather than inventing a
 * second one, never generated speculatively today. This is R22's own
 * "generated from the graph, not invented" rule applied to itself: an
 * action kind with no real source is not generated at all, not faked.
 */
export type CandidateActionKind =
  | 'TRANSFER_STOCK'
  | 'EXPEDITE_PO'
  | 'SPLIT_PO_ALTERNATE_SUPPLIER'
  | 'SUBSTITUTE_SKU'
  | 'REALLOCATE_ONLINE_BUFFER'
  | 'DELIST_AT_LOCATION'
  | 'MARKDOWN_TRAPPED_STOCK'
  | 'DELAY_DISCRETIONARY_AP'
  | 'RAISE_PRICE';

export interface CandidateAction {
  kind: CandidateActionKind;
  description: string;
  cashPreservedMinor: number;
  rupeesSpentMinor: number;
  score: number;
  feasible: boolean;
  reversibilityRank: number;
  /** The exact graph edge(s) this candidate was generated from — "Click the number," made mechanical. */
  sourceEdges: DependencyEdge[];
}

export interface VariantEconomics {
  marginMinor: number;
}

/**
 * Every candidate is generated from a real graph edge — a transfer
 * candidate only exists where a `StockTransfer`-capable location pair with
 * surplus cover actually exists, per this document's own R22. Pure: no
 * `prisma.*` call, no side effect — `variantEconomics` and `graph` are
 * already-resolved inputs, the identical "deciding function takes inputs,
 * returns the outcome" shape `propagate()` above already establishes.
 */
export function rankActions(
  propagation: PropagationResult,
  graph: DependencyEdge[],
  variantEconomics: Map<string, VariantEconomics>,
  options: { horizonDays?: number } = {},
): CandidateAction[] {
  const horizonDays = options.horizonDays ?? 7;
  const candidates: CandidateAction[] = [];

  const stockEdges = graph.filter((e) => e.from.type === 'Sku' && e.to.type === 'Location');
  const transferEdges = graph.filter((e) => e.from.type === 'Location' && e.to.type === 'Location');

  for (const row of propagation.perSkuLocation) {
    const shortfallUnits = row.unmetDemandUnitsPerDay * horizonDays;
    if (shortfallUnits <= 0) continue;

    const inboundTransferEdges = transferEdges.filter((e) => e.to.id === row.locationId);
    for (const transferEdge of inboundTransferEdges) {
      const surplusEdge = stockEdges.find(
        (e) => e.from.id === row.variantId && e.to.id === transferEdge.from.id && (e.weight ?? 0) > 0,
      );
      if (!surplusEdge) continue;

      const transferableUnits = Math.min(surplusEdge.weight ?? 0, shortfallUnits);
      if (transferableUnits <= 0) continue;

      const marginMinor = variantEconomics.get(row.variantId)?.marginMinor ?? 0;
      const cashPreservedMinor = transferableUnits * marginMinor;
      // No real freight-cost model here yet — a transfer's own actual cost
      // (distance, courier rate) is not something this graph projects,
      // named honestly rather than assumed as zero-cost or invented.
      const rupeesSpentMinor = 0;

      candidates.push({
        kind: 'TRANSFER_STOCK',
        description: `Transfer ${transferableUnits} unit(s) of ${row.variantId} from ${transferEdge.from.id} to ${row.locationId}.`,
        cashPreservedMinor,
        rupeesSpentMinor,
        score: rupeesSpentMinor > 0 ? cashPreservedMinor / rupeesSpentMinor : cashPreservedMinor,
        feasible: true,
        reversibilityRank: 2,
        sourceEdges: [surplusEdge, transferEdge],
      });
    }
  }

  if (propagation.shock.kind === 'CashShock') {
    const obligationEdges = graph.filter((e) => e.to.type === 'Obligation');
    for (const edge of obligationEdges) {
      const amountMinor = edge.weight ?? 0;
      if (amountMinor <= 0) continue;
      candidates.push({
        kind: 'DELAY_DISCRETIONARY_AP',
        description: `Delay payment of obligation ${edge.to.id} (${edge.from.id}), preserving ${amountMinor} paisa of cash.`,
        cashPreservedMinor: amountMinor,
        rupeesSpentMinor: 0,
        score: amountMinor,
        feasible: true,
        reversibilityRank: 1,
        sourceEdges: [edge],
      });
    }
  }

  return candidates.sort((a, b) => b.score - a.score || a.reversibilityRank - b.reversibilityRank);
}
