import type { DependencyEdge } from './dependency-graph';

export type Shock =
  | { kind: 'SupplierDown'; supplierId: string; days: number }
  | { kind: 'LeadTimeShift'; supplierId: string; deltaDays: number }
  | { kind: 'LocationDown'; locationId: string; days: number }
  | { kind: 'DemandShock'; variantId: string; pctChange: number }
  | { kind: 'CashShock'; amountMinor: number }
  | { kind: 'SkuRecall'; variantId: string };

/**
 * Units/day demand for one variant, with explicit low/base/high confidence
 * bands — R21's own "carrying explicit low/base/high confidence bands"
 * requirement. `base` is ordinarily `computeDemandForecast()`'s own
 * `forecastedDailyDemand` (`@newax/shared`, already shipped); `low`/`high`
 * are an honest ±30% band around it, never a fabricated statistical
 * interval — this is the one place this document is explicit that the band
 * is a simple heuristic, not a modelled variance, pending a real per-SKU
 * variance source.
 */
export interface DemandBand {
  low: number;
  base: number;
  high: number;
}

export interface SkuLocationRiskRow {
  variantId: string;
  locationId: string;
  projectedOnHand: number;
  daysOfCoverRemaining: number | null;
  stockoutInDays: number | null;
  unmetDemandUnitsPerDay: number;
}

export interface PropagationResult {
  shock: Shock;
  perSkuLocation: SkuLocationRiskRow[];
}

/**
 * Pure arithmetic over the graph — never inference. Same graph + same shock
 * + same forecasts -> byte-identical output (R21's own "Determinism").
 * Every number here traces to a specific graph edge (stock on hand) and a
 * specific forecast input (a demand band) — "Traceability," satisfied by
 * construction since nothing here is inferred or estimated beyond the
 * caller's own typed inputs.
 */
export function propagate(graph: DependencyEdge[], shock: Shock, forecasts: Map<string, DemandBand>): PropagationResult {
  const stockEdges = graph.filter((e) => e.from.type === 'Sku' && e.to.type === 'Location');

  const affectedLocationIds = shock.kind === 'LocationDown' ? new Set([shock.locationId]) : null;
  const affectedSupplierIds = shock.kind === 'SupplierDown' || shock.kind === 'LeadTimeShift' ? shock.supplierId : null;
  const suppliedVariantIds = affectedSupplierIds
    ? new Set(
        graph
          .filter((e) => e.from.type === 'Supplier' && e.from.id === affectedSupplierIds && e.to.type === 'Sku')
          .map((e) => e.to.id),
      )
    : null;

  const perSkuLocation: SkuLocationRiskRow[] = [];

  for (const edge of stockEdges) {
    const variantId = edge.from.id;
    const locationId = edge.to.id;
    const onHand = edge.weight ?? 0;

    if (affectedLocationIds && !affectedLocationIds.has(locationId)) continue;

    const band = forecasts.get(variantId);
    let dailyDemand = band?.base ?? 0;

    if (shock.kind === 'DemandShock' && shock.variantId === variantId) {
      dailyDemand = dailyDemand * (1 + shock.pctChange / 100);
    }
    if (shock.kind === 'SkuRecall' && shock.variantId === variantId) {
      // A recalled SKU has zero sellable demand — every unit on hand is
      // itself the risk, not a stockout.
      dailyDemand = 0;
    }

    const supplyInterrupted = suppliedVariantIds ? suppliedVariantIds.has(variantId) : false;
    // A supplier outage or lead-time slip does not remove today's on-hand
    // stock — it removes the ability to REPLENISH it. Modelled here as: no
    // effective on-hand change, but daysOfCoverRemaining is what is left to
    // find an alternate source before this variant actually runs out.
    const projectedOnHand = shock.kind === 'SkuRecall' && shock.variantId === variantId ? 0 : onHand;

    const daysOfCoverRemaining = dailyDemand > 0 ? projectedOnHand / dailyDemand : null;
    const stockoutInDays =
      dailyDemand > 0 && daysOfCoverRemaining !== null
        ? daysOfCoverRemaining
        : shock.kind === 'SkuRecall' && shock.variantId === variantId
          ? 0
          : null;
    const unmetDemandUnitsPerDay = supplyInterrupted && dailyDemand > 0 ? dailyDemand : 0;

    perSkuLocation.push({ variantId, locationId, projectedOnHand, daysOfCoverRemaining, stockoutInDays, unmetDemandUnitsPerDay });
  }

  return { shock, perSkuLocation };
}
