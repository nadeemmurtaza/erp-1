import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { PermissionKey } from '@newax/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MetricRegistryService } from '../../../core/metrics/metric-registry.service';
import { InventoryService } from './inventory.service';
import type { MetricContext, MetricProvider, MetricValue } from '../../../core/metrics/metric-provider';

/**
 * The Inventory group's dashboard cards (10-admin-dashboard.md card
 * inventory, WO-A.4). `inventory.valuation` is its own provider below,
 * gated by `inventory.view_cost` on top of the group's own
 * `inventory.manage` — the same "one card in a group needs a stricter
 * permission than the rest" shape as `sales.gross_profit` (analytics) and
 * `purchasing.spend` (purchasing).
 *
 * Every count here is a live, point-in-time snapshot (stock on hand right
 * now), not a sum over `[from, to)` — so `previous` is `null` throughout
 * except `movements_in_window`, the one genuinely windowed figure in this
 * group. A snapshot has no historical replay to compare against without a
 * daily inventory-level cache this codebase does not have (see
 * `VariantSalesStat` for what IS precomputed).
 */
@Injectable()
export class InventoryMetricsProvider implements MetricProvider, OnModuleInit {
  readonly id = 'inventory.metrics';
  readonly keys = [
    'inventory.units_on_hand',
    'inventory.out_of_stock',
    'inventory.low_stock',
    'inventory.slow_movers',
    'inventory.dead_stock',
    'inventory.movements_in_window',
    'inventory.reorder_suggestions',
  ];
  readonly permissions: readonly PermissionKey[] = ['inventory.manage'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly metricRegistry: MetricRegistryService,
  ) {}

  onModuleInit(): void {
    this.metricRegistry.register(this);
  }

  async collect(ctx: MetricContext, wanted: readonly string[]): Promise<Record<string, MetricValue>> {
    const want = (key: string) => wanted.includes(key);
    const out: Record<string, MetricValue> = {};

    const [
      unitsOnHand,
      outOfStock,
      lowStockRows,
      slowMovers,
      deadStock,
      movementsInWindow,
      movementsPrevWindow,
      reorderSuggestions,
    ] = await Promise.all([
      this.prisma.productVariant.aggregate({ where: { isActive: true }, _sum: { stock: true } }),
      this.prisma.productVariant.count({ where: { isActive: true, stock: { lte: 0 } } }),
      // Column-to-column comparison ("stock <= its own threshold") is not
      // expressible in Prisma's fluent where — same reason
      // analytics.service.ts's own needsAttention.lowStockVariants uses raw
      // SQL. Excludes out-of-stock rows (stock > 0) so the two cards never
      // double-count the same variant.
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count FROM "ProductVariant"
        WHERE "isActive" = true AND "stock" > 0 AND "stock" <= "lowStockThreshold"
      `,
      this.prisma.variantSalesStat.count({ where: { isSlowMover: true } }),
      this.prisma.variantSalesStat.count({ where: { isDeadStock: true } }),
      this.prisma.stockMovement.count({ where: { createdAt: { gte: ctx.from, lt: ctx.to } } }),
      this.prisma.stockMovement.count({ where: { createdAt: { gte: ctx.prevFrom, lt: ctx.prevTo } } }),
      this.inventory.getReorderSuggestions(),
    ]);

    if (want('inventory.units_on_hand')) {
      out['inventory.units_on_hand'] = { value: unitsOnHand._sum.stock ?? 0, previous: null, unit: 'count' };
    }
    if (want('inventory.out_of_stock')) {
      out['inventory.out_of_stock'] = { value: outOfStock, previous: null, unit: 'count' };
    }
    if (want('inventory.low_stock')) {
      out['inventory.low_stock'] = { value: Number(lowStockRows[0]?.count ?? 0), previous: null, unit: 'count' };
    }
    if (want('inventory.slow_movers')) {
      out['inventory.slow_movers'] = { value: slowMovers, previous: null, unit: 'count' };
    }
    if (want('inventory.dead_stock')) {
      out['inventory.dead_stock'] = { value: deadStock, previous: null, unit: 'count' };
    }
    if (want('inventory.movements_in_window')) {
      out['inventory.movements_in_window'] = { value: movementsInWindow, previous: movementsPrevWindow, unit: 'count' };
    }
    if (want('inventory.reorder_suggestions')) {
      out['inventory.reorder_suggestions'] = { value: reorderSuggestions.length, previous: null, unit: 'count' };
    }
    return out;
  }
}

/** `inventory.valuation` alone — see the class doc above for why it is split out. */
@Injectable()
export class InventoryValuationMetricsProvider implements MetricProvider, OnModuleInit {
  readonly id = 'inventory.valuation.metrics';
  readonly keys = ['inventory.valuation'];
  readonly permissions: readonly PermissionKey[] = ['inventory.view_cost'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly metricRegistry: MetricRegistryService,
  ) {}

  onModuleInit(): void {
    this.metricRegistry.register(this);
  }

  async collect(): Promise<Record<string, MetricValue>> {
    // Weighted-average cost × units on hand, right now — the same
    // valuation definition analytics.service.ts's inventory/valuation
    // endpoint uses, but that endpoint isn't reused here to avoid a
    // feature-module import; both read the same two columns the same way.
    const result = await this.prisma.$queryRaw<Array<{ value: bigint }>>`
      SELECT COALESCE(SUM("stock" * "costPrice"), 0) AS value
      FROM "ProductVariant"
      WHERE "isActive" = true
    `;
    return {
      'inventory.valuation': { value: Number(result[0]?.value ?? 0), previous: null, unit: 'paisa' },
    };
  }
}
