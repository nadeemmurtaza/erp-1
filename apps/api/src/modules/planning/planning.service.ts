import { Injectable } from '@nestjs/common';
import { computeDemandForecast, type DemandForecastSale } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DependencyGraphService, type DependencyEdge } from './dependency-graph';
import { propagate, type Shock, type PropagationResult, type DemandBand } from './propagation';
import { rankActions, type CandidateAction, type VariantEconomics } from './action-ranking';
import { NarrationService, type NarrationResult } from './narration.service';

const DEMAND_LOOKBACK_DAYS = 455; // matches computeDemandForecast's own same-period-last-year window
const SALE_REASONS = ['SALE', 'POS_SALE'] as const;
const DEMAND_BAND_SPREAD = 0.3; // an honest ±30% heuristic, never a fabricated statistical interval — see propagation.ts's own DemandBand doc

export interface RunPropagationResult {
  propagation: PropagationResult;
  rankedActions: CandidateAction[];
  narration: NarrationResult | null;
}

/**
 * The orchestrator: builds the graph once, derives demand bands and
 * variant economics from real rows, then hands everything to the pure
 * `propagate()`/`rankActions()` functions — the only place in this module
 * that touches Prisma for the propagation path, keeping those two
 * functions themselves free of I/O and independently testable.
 */
@Injectable()
export class PlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: DependencyGraphService,
    private readonly narration: NarrationService,
  ) {}

  async runPropagation(shock: Shock, options: { includeNarration?: boolean } = {}): Promise<RunPropagationResult> {
    const edges = await this.graph.build();
    const variantIds = [...new Set(edges.filter((e) => e.from.type === 'Sku').map((e) => e.from.id))];

    const [forecasts, variantEconomics] = await Promise.all([
      this.buildDemandForecasts(variantIds),
      this.buildVariantEconomics(variantIds),
    ]);

    const propagation = propagate(edges, shock, forecasts);
    const rankedActions = rankActions(propagation, edges, variantEconomics);
    const narration = options.includeNarration ? await this.narration.narrate(propagation, rankedActions) : null;

    return { propagation, rankedActions, narration };
  }

  private async buildDemandForecasts(variantIds: string[]): Promise<Map<string, DemandBand>> {
    if (variantIds.length === 0) return new Map();
    const since = new Date(Date.now() - DEMAND_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();

    const [movements, variants] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where: { variantId: { in: variantIds }, reason: { in: [...SALE_REASONS] }, createdAt: { gte: since } },
        select: { variantId: true, delta: true, createdAt: true },
      }),
      this.prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: {
          id: true,
          preferredSupplier: { select: { leadTimeDays: true } },
        },
      }),
    ]);

    const salesByVariant = new Map<string, DemandForecastSale[]>();
    for (const m of movements) {
      if (m.delta >= 0) continue;
      if (!salesByVariant.has(m.variantId)) salesByVariant.set(m.variantId, []);
      salesByVariant.get(m.variantId)!.push({ qty: -m.delta, occurredAt: m.createdAt });
    }

    const leadTimeByVariant = new Map(variants.map((v) => [v.id, v.preferredSupplier?.leadTimeDays ?? null]));

    const bands = new Map<string, DemandBand>();
    for (const variantId of variantIds) {
      const sales = salesByVariant.get(variantId) ?? [];
      const forecast = computeDemandForecast({
        stock: 0, // this call only needs forecastedDailyDemand — projectedStockoutAt is recomputed per-location by propagate() itself, against each location's own on-hand
        sales,
        now,
        minLastYearUnits: 5,
        leadTimeDays: leadTimeByVariant.get(variantId) ?? null,
      });
      const base = forecast.forecastedDailyDemand;
      bands.set(variantId, { base, low: base * (1 - DEMAND_BAND_SPREAD), high: base * (1 + DEMAND_BAND_SPREAD) });
    }
    return bands;
  }

  private async buildVariantEconomics(variantIds: string[]): Promise<Map<string, VariantEconomics>> {
    if (variantIds.length === 0) return new Map();
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, priceOverride: true, costPrice: true, product: { select: { basePrice: true } } },
    });

    return new Map(
      variants.map((v) => {
        const effectivePrice = v.priceOverride ?? v.product.basePrice;
        return [v.id, { marginMinor: Math.max(0, effectivePrice - v.costPrice) }];
      }),
    );
  }
}

export type { DependencyEdge };
