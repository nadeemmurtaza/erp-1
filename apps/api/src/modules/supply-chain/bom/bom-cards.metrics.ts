import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { PermissionKey } from '@newax/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MetricRegistryService } from '../../../core/metrics/metric-registry.service';
import { RecipeService } from './recipe.service';
import type { MetricContext, MetricProvider, MetricValue } from '../../../core/metrics/metric-provider';

/**
 * The "BOM & Manufacturing" group's dashboard cards
 * (10-admin-dashboard.md card inventory, WO-A.4/D — wiring WO-C.4's
 * already-built BOM reporting into Track A's registry, per ADR-025).
 *
 * Named `bom-cards.metrics.ts`, not `bom.metrics.ts` — that file already
 * exists (`BomMetricsService`, the raw-usage REPORT endpoint's own
 * aggregation, WO-C.4). This is a different concern (dashboard cards) with
 * a different shape (`MetricProvider`), so it gets its own file rather than
 * overloading that one.
 *
 * `bom.raw_material_value` is split into its own provider, gated by
 * `inventory.view_cost` on top of the group's own `bom.view` — the same
 * "one money card needs a stricter permission" shape as
 * `sales.gross_profit`, `purchasing.spend` and `inventory.valuation`.
 */
@Injectable()
export class BomCardsMetricsProvider implements MetricProvider, OnModuleInit {
  readonly id = 'bom.cards.metrics';
  readonly keys = [
    'bom.active_recipes',
    'bom.missing_recipes',
    'bom.incomplete_cost_recipes',
    'bom.production_runs',
    'bom.units_produced',
    'bom.raw_materials_low_stock',
  ];
  readonly permissions: readonly PermissionKey[] = ['bom.view'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly recipes: RecipeService,
    private readonly metricRegistry: MetricRegistryService,
  ) {}

  onModuleInit(): void {
    this.metricRegistry.register(this);
  }

  async collect(ctx: MetricContext, wanted: readonly string[]): Promise<Record<string, MetricValue>> {
    const want = (key: string) => wanted.includes(key);
    const out: Record<string, MetricValue> = {};

    const [activeRecipes, missing, runsInWindow, runsPrevWindow, lowStockRawMaterials] = await Promise.all([
      this.prisma.bomRecipe.count({ where: { status: 'ACTIVE' } }),
      this.recipes.missingSummary(),
      this.prisma.bomProductionRun.aggregate({
        where: { producedAt: { gte: ctx.from, lt: ctx.to } },
        _count: { _all: true },
        _sum: { quantityProduced: true },
      }),
      this.prisma.bomProductionRun.aggregate({
        where: { producedAt: { gte: ctx.prevFrom, lt: ctx.prevTo } },
        _count: { _all: true },
        _sum: { quantityProduced: true },
      }),
      // Raw materials are ProductVariants (D5) — reuses the same
      // stock-vs-threshold comparison as the Inventory group's own
      // `inventory.low_stock`, scoped to variants a RawMaterial row points at.
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count FROM "ProductVariant" v
        JOIN "RawMaterial" rm ON rm."variantId" = v."id"
        WHERE v."isActive" = true AND rm."isActive" = true AND v."stock" <= v."lowStockThreshold"
      `,
    ]);

    if (want('bom.active_recipes')) {
      out['bom.active_recipes'] = { value: activeRecipes, previous: null, unit: 'count' };
    }
    if (want('bom.missing_recipes')) {
      out['bom.missing_recipes'] = { value: missing.counts.missing, previous: null, unit: 'count' };
    }
    if (want('bom.incomplete_cost_recipes')) {
      out['bom.incomplete_cost_recipes'] = { value: missing.counts.incompleteCost, previous: null, unit: 'count' };
    }
    if (want('bom.production_runs')) {
      out['bom.production_runs'] = { value: runsInWindow._count._all, previous: runsPrevWindow._count._all, unit: 'count' };
    }
    if (want('bom.units_produced')) {
      out['bom.units_produced'] = {
        value: runsInWindow._sum.quantityProduced ?? 0,
        previous: runsPrevWindow._sum.quantityProduced ?? 0,
        unit: 'count',
      };
    }
    if (want('bom.raw_materials_low_stock')) {
      out['bom.raw_materials_low_stock'] = { value: Number(lowStockRawMaterials[0]?.count ?? 0), previous: null, unit: 'count' };
    }
    return out;
  }
}

/** `bom.raw_material_value` alone — see the class doc above for why it is split out. */
@Injectable()
export class BomValueMetricsProvider implements MetricProvider, OnModuleInit {
  readonly id = 'bom.value.metrics';
  readonly keys = ['bom.raw_material_value'];
  readonly permissions: readonly PermissionKey[] = ['inventory.view_cost'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly metricRegistry: MetricRegistryService,
  ) {}

  onModuleInit(): void {
    this.metricRegistry.register(this);
  }

  async collect(): Promise<Record<string, MetricValue>> {
    const result = await this.prisma.$queryRaw<Array<{ value: bigint }>>`
      SELECT COALESCE(SUM(v."stock" * v."costPrice"), 0) AS value
      FROM "ProductVariant" v
      JOIN "RawMaterial" rm ON rm."variantId" = v."id"
      WHERE v."isActive" = true AND rm."isActive" = true
    `;
    return { 'bom.raw_material_value': { value: Number(result[0]?.value ?? 0), previous: null, unit: 'paisa' } };
  }
}
