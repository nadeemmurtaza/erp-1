import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { PermissionKey } from '@newax/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MetricRegistryService } from '../../../core/metrics/metric-registry.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { VOID_ORDER_STATUSES } from '../../../core/common/sales-revenue';
import { startOfShopMonth } from '../../../core/time/shop-time';
import type { OrderStatus } from '../../../core/prisma/client';
import type { MetricContext, MetricProvider, MetricValue } from '../../../core/metrics/metric-provider';

/**
 * Dashboard cards for Sales, Orders, Products, Customers and Workshop &
 * Users — five of the nine groups in 10-admin-dashboard.md's card inventory,
 * exactly as WO-A.4 scopes this file. Split into several small
 * `MetricProvider`s, not one, because the card inventory gates several
 * individual cards behind a STRICTER permission than the rest of their
 * group (`sales.gross_profit` needs `inventory.view_cost`,
 * `workshop.staff_accounts` needs `users.manage`) — and `MetricProvider`'s
 * own permission gate is all-or-nothing per provider (D2), so a mixed-gate
 * group is several providers, not one with a wider gate.
 *
 * `Product` counts exclude raw materials throughout (D5): a raw material is
 * a real `Product` row (`status: DRAFT`, in a hidden category) that this
 * card inventory's "Products" group was never meant to count — it belongs
 * to "BOM & Manufacturing" instead.
 */

/** Excludes any product carrying a raw-material variant (D5). Shared by every Products query below. */
const NOT_RAW_MATERIAL = { variants: { none: { rawMaterial: { isNot: null } } } };

/** Basis points of `part` over `whole`, 0 when `whole` is 0. */
function bps(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 10000) : 0;
}

@Injectable()
export class SalesMetricsProvider implements MetricProvider, OnModuleInit {
  readonly id = 'analytics.sales.metrics';
  readonly keys = ['sales.revenue', 'sales.aov', 'sales.conversion_rate', 'sales.target_progress_bps'];
  readonly permissions: readonly PermissionKey[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly metricRegistry: MetricRegistryService,
  ) {}

  onModuleInit(): void {
    this.metricRegistry.register(this);
  }

  async collect(ctx: MetricContext, wanted: readonly string[]): Promise<Record<string, MetricValue>> {
    const want = (key: string) => wanted.includes(key);
    const out: Record<string, MetricValue> = {};

    const salesFor = (from: Date, to: Date) =>
      this.prisma.order.aggregate({
        where: { placedAt: { gte: from, lt: to }, status: { notIn: VOID_ORDER_STATUSES } },
        _sum: { grandTotal: true },
        _count: { _all: true },
      });
    // "Cart" = a storefront cart that ever held an item — the same shopping-intent
    // reading analytics.service.ts's own cartAbandonment() uses.
    const cartsFor = (from: Date, to: Date) =>
      this.prisma.cart.count({ where: { createdAt: { gte: from, lt: to }, items: { some: {} } } });

    const needsRevenue = want('sales.revenue') || want('sales.aov');
    const needsConversion = want('sales.conversion_rate');
    const needsTarget = want('sales.target_progress_bps');

    const [current, previous, cartsCurrent, ordersCurrent, timeZone, monthTarget] = await Promise.all([
      needsRevenue ? salesFor(ctx.from, ctx.to) : Promise.resolve(null),
      needsRevenue ? salesFor(ctx.prevFrom, ctx.prevTo) : Promise.resolve(null),
      needsConversion ? cartsFor(ctx.from, ctx.to) : Promise.resolve(0),
      needsConversion ? this.prisma.order.count({ where: { placedAt: { gte: ctx.from, lt: ctx.to } } }) : Promise.resolve(0),
      needsTarget ? this.settings.get<string>(SettingKey.StoreTimezone) : Promise.resolve(null),
      needsTarget ? this.settings.get<number>(SettingKey.MonthlyRevenueTarget) : Promise.resolve(0),
    ]);

    if (want('sales.revenue') && current && previous) {
      out['sales.revenue'] = { value: current._sum.grandTotal ?? 0, previous: previous._sum.grandTotal ?? 0, unit: 'paisa' };
    }
    if (want('sales.aov') && current && previous) {
      const aov = (sum: { _sum: { grandTotal: number | null }; _count: { _all: number } }) =>
        sum._count._all > 0 ? Math.round((sum._sum.grandTotal ?? 0) / sum._count._all) : 0;
      out['sales.aov'] = { value: aov(current), previous: aov(previous), unit: 'paisa' };
    }
    if (want('sales.conversion_rate')) {
      out['sales.conversion_rate'] = {
        value: cartsCurrent > 0 ? Math.round((ordersCurrent / cartsCurrent) * 1000) / 10 : 0,
        previous: null,
        unit: 'count', // a plain percent number (0-100), not basis points — ValueFormat 'percent'
      };
    }
    if (want('sales.target_progress_bps') && timeZone) {
      const now = new Date();
      const monthAchieved = await this.prisma.order.aggregate({
        where: { placedAt: { gte: startOfShopMonth(now, timeZone) }, status: { notIn: VOID_ORDER_STATUSES } },
        _sum: { grandTotal: true },
      });
      out['sales.target_progress_bps'] = {
        value: bps(monthAchieved._sum.grandTotal ?? 0, monthTarget),
        previous: null,
        unit: 'bps',
      };
    }
    return out;
  }
}

@Injectable()
export class SalesCostMetricsProvider implements MetricProvider, OnModuleInit {
  readonly id = 'analytics.sales.cost.metrics';
  readonly keys = ['sales.gross_profit', 'sales.gross_margin_bps'];
  readonly permissions: readonly PermissionKey[] = ['inventory.view_cost'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly metricRegistry: MetricRegistryService,
  ) {}

  onModuleInit(): void {
    this.metricRegistry.register(this);
  }

  async collect(ctx: MetricContext): Promise<Record<string, MetricValue>> {
    // Direct gross profit (revenue less Σ unitCost × quantity) — available today,
    // must not wait on WO-B.3's OrderEconomics contribution figure (WO-A.5's own note).
    const grossProfitFor = async (from: Date, to: Date) => {
      const [revenue, cogsRows] = await Promise.all([
        this.prisma.order.aggregate({
          where: { placedAt: { gte: from, lt: to }, status: { notIn: VOID_ORDER_STATUSES } },
          _sum: { grandTotal: true },
        }),
        this.prisma.$queryRaw<Array<{ cogs: bigint }>>`
          SELECT COALESCE(SUM(oi."unitCost" * oi."quantity"), 0) AS cogs
          FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
          WHERE o."placedAt" >= ${from} AND o."placedAt" < ${to}
            AND o."status" NOT IN ('CANCELLED', 'RETURNED')
        `,
      ]);
      const rev = revenue._sum.grandTotal ?? 0;
      const cogs = Number(cogsRows[0]?.cogs ?? 0);
      return { grossProfit: rev - cogs, marginBps: bps(rev - cogs, rev) };
    };

    const [current, previous] = await Promise.all([
      grossProfitFor(ctx.from, ctx.to),
      grossProfitFor(ctx.prevFrom, ctx.prevTo),
    ]);

    return {
      'sales.gross_profit': { value: current.grossProfit, previous: previous.grossProfit, unit: 'paisa' },
      'sales.gross_margin_bps': { value: current.marginBps, previous: previous.marginBps, unit: 'bps' },
    };
  }
}

const ORDER_STATUS_KEYS: Record<string, OrderStatus> = {
  'orders.pending': 'PENDING',
  'orders.confirmed': 'CONFIRMED',
  'orders.processing': 'PROCESSING',
  'orders.ready_to_ship': 'READY_TO_SHIP',
  'orders.shipped': 'SHIPPED',
  'orders.delivered': 'DELIVERED',
  'orders.cancelled': 'CANCELLED',
  'orders.returned': 'RETURNED',
};

@Injectable()
export class OrdersMetricsProvider implements MetricProvider, OnModuleInit {
  readonly id = 'analytics.orders.metrics';
  readonly keys = ['orders.total', ...Object.keys(ORDER_STATUS_KEYS), 'orders.avg_fulfilment_days'];
  readonly permissions: readonly PermissionKey[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly metricRegistry: MetricRegistryService,
  ) {}

  onModuleInit(): void {
    this.metricRegistry.register(this);
  }

  // One groupBy for every status-shaped key — D2's own worked example
  // ("OrdersMetricsProvider returns nine metrics from a single groupBy").
  async collect(ctx: MetricContext, wanted: readonly string[]): Promise<Record<string, MetricValue>> {
    const want = (key: string) => wanted.includes(key);
    const out: Record<string, MetricValue> = {};

    const groupFor = (from: Date, to: Date) =>
      this.prisma.order.groupBy({ by: ['status'], where: { placedAt: { gte: from, lt: to } }, _count: { _all: true } });

    const [current, previous] = await Promise.all([groupFor(ctx.from, ctx.to), groupFor(ctx.prevFrom, ctx.prevTo)]);
    const countFor = (rows: typeof current, status: OrderStatus) =>
      rows.find((row) => row.status === status)?._count._all ?? 0;
    const totalFor = (rows: typeof current) => rows.reduce((sum, row) => sum + row._count._all, 0);

    if (want('orders.total')) {
      out['orders.total'] = { value: totalFor(current), previous: totalFor(previous), unit: 'count' };
    }
    for (const [key, status] of Object.entries(ORDER_STATUS_KEYS)) {
      if (want(key)) out[key] = { value: countFor(current, status), previous: countFor(previous, status), unit: 'count' };
    }
    if (want('orders.avg_fulfilment_days')) {
      const fulfilmentFor = async (from: Date, to: Date) => {
        const rows = await this.prisma.$queryRaw<Array<{ days: number | null }>>`
          SELECT AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "placedAt")) / 86400.0)::float8 AS days
          FROM "Order"
          WHERE "placedAt" >= ${from} AND "placedAt" < ${to} AND "deliveredAt" IS NOT NULL
        `;
        return rows[0]?.days ?? 0;
      };
      const [days, previousDays] = await Promise.all([fulfilmentFor(ctx.from, ctx.to), fulfilmentFor(ctx.prevFrom, ctx.prevTo)]);
      out['orders.avg_fulfilment_days'] = { value: round1(days), previous: round1(previousDays), unit: 'days' };
    }
    return out;
  }
}

@Injectable()
export class ProductsMetricsProvider implements MetricProvider, OnModuleInit {
  readonly id = 'analytics.products.metrics';
  readonly keys = [
    'products.total',
    'products.active',
    'products.draft',
    'products.top_seller_units',
    'products.slowest_seller_units',
    'products.out_of_stock_variants',
    'products.low_stock_variants',
    'products.no_sales_in_window',
  ];
  readonly permissions: readonly PermissionKey[] = ['catalog.manage'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly metricRegistry: MetricRegistryService,
  ) {}

  onModuleInit(): void {
    this.metricRegistry.register(this);
  }

  async collect(ctx: MetricContext, wanted: readonly string[]): Promise<Record<string, MetricValue>> {
    const want = (key: string) => wanted.includes(key);
    const out: Record<string, MetricValue> = {};

    const [total, active, draft, sellers, outOfStock, lowStock, noSales] = await Promise.all([
      want('products.total') ? this.prisma.product.count({ where: NOT_RAW_MATERIAL }) : Promise.resolve(0),
      want('products.active') ? this.prisma.product.count({ where: { status: 'ACTIVE', ...NOT_RAW_MATERIAL } }) : Promise.resolve(0),
      want('products.draft') ? this.prisma.product.count({ where: { status: 'DRAFT', ...NOT_RAW_MATERIAL } }) : Promise.resolve(0),
      want('products.top_seller_units') || want('products.slowest_seller_units')
        ? this.prisma.$queryRaw<Array<{ name: string; units: bigint }>>`
            SELECT oi."nameEn" AS name, SUM(oi."quantity") AS units
            FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
            WHERE o."placedAt" >= ${ctx.from} AND o."placedAt" < ${ctx.to}
              AND o."status" NOT IN ('CANCELLED', 'RETURNED')
            GROUP BY oi."nameEn"
            ORDER BY units DESC
          `
        : Promise.resolve([]),
      want('products.out_of_stock_variants')
        ? this.prisma.productVariant.count({ where: { isActive: true, stock: { lte: 0 }, product: NOT_RAW_MATERIAL } })
        : Promise.resolve(0),
      want('products.low_stock_variants')
        ? this.prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*) AS count FROM "ProductVariant" v
            JOIN "Product" p ON p."id" = v."productId"
            WHERE v."isActive" = true AND v."stock" > 0 AND v."stock" <= v."lowStockThreshold"
              AND NOT EXISTS (SELECT 1 FROM "ProductVariant" rv JOIN "RawMaterial" rm ON rm."variantId" = rv."id" WHERE rv."productId" = p."id")
          `
        : Promise.resolve([{ count: 0n }]),
      want('products.no_sales_in_window')
        ? this.prisma.product.count({
            where: {
              status: 'ACTIVE',
              ...NOT_RAW_MATERIAL,
              variants: { none: { orderItems: { some: { order: { placedAt: { gte: ctx.from, lt: ctx.to } } } } } },
            },
          })
        : Promise.resolve(0),
    ]);

    if (want('products.total')) out['products.total'] = { value: total, previous: null, unit: 'count' };
    if (want('products.active')) out['products.active'] = { value: active, previous: null, unit: 'count' };
    if (want('products.draft')) out['products.draft'] = { value: draft, previous: null, unit: 'count' };
    if (want('products.top_seller_units')) {
      const top = sellers[0];
      out['products.top_seller_units'] = { value: Number(top?.units ?? 0), previous: null, unit: 'count', label: top?.name };
    }
    if (want('products.slowest_seller_units')) {
      // The active seller with the FEWEST units sold in the window — distinct
      // from products.no_sales_in_window, which is zero sales entirely.
      const slowest = sellers[sellers.length - 1];
      out['products.slowest_seller_units'] = {
        value: Number(slowest?.units ?? 0),
        previous: null,
        unit: 'count',
        label: slowest?.name,
      };
    }
    if (want('products.out_of_stock_variants')) out['products.out_of_stock_variants'] = { value: outOfStock, previous: null, unit: 'count' };
    if (want('products.low_stock_variants')) out['products.low_stock_variants'] = { value: Number(lowStock[0]?.count ?? 0), previous: null, unit: 'count' };
    if (want('products.no_sales_in_window')) out['products.no_sales_in_window'] = { value: noSales, previous: null, unit: 'count' };
    return out;
  }
}

@Injectable()
export class CustomersMetricsProvider implements MetricProvider, OnModuleInit {
  readonly id = 'analytics.customers.metrics';
  readonly keys = [
    'customers.total',
    'customers.new',
    'customers.repeat',
    'customers.repeat_rate_bps',
    'customers.top_spender_ltv',
    'customers.open_leads',
    'customers.follow_ups_due',
  ];
  readonly permissions: readonly PermissionKey[] = ['crm.manage'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly metricRegistry: MetricRegistryService,
  ) {}

  onModuleInit(): void {
    this.metricRegistry.register(this);
  }

  async collect(ctx: MetricContext, wanted: readonly string[]): Promise<Record<string, MetricValue>> {
    const want = (key: string) => wanted.includes(key);
    const out: Record<string, MetricValue> = {};
    const now = new Date();

    const [total, newCurrent, newPrevious, repeat, topSpender, openLeads, followUpsDue] = await Promise.all([
      this.prisma.contact.count(),
      this.prisma.contact.count({ where: { createdAt: { gte: ctx.from, lt: ctx.to } } }),
      this.prisma.contact.count({ where: { createdAt: { gte: ctx.prevFrom, lt: ctx.prevTo } } }),
      this.prisma.contact.count({ where: { orderCount: { gte: 2 } } }),
      want('customers.top_spender_ltv')
        ? this.prisma.contact.findFirst({ orderBy: { lifetimeValue: 'desc' }, select: { name: true, lifetimeValue: true } })
        : Promise.resolve(null),
      want('customers.open_leads') ? this.prisma.lead.count({ where: { status: { notIn: ['WON', 'LOST'] } } }) : Promise.resolve(0),
      want('customers.follow_ups_due')
        ? this.prisma.followUpTask.count({ where: { isDone: false, dueAt: { lte: now } } })
        : Promise.resolve(0),
    ]);

    if (want('customers.total')) out['customers.total'] = { value: total, previous: null, unit: 'count' };
    if (want('customers.new')) out['customers.new'] = { value: newCurrent, previous: newPrevious, unit: 'count' };
    if (want('customers.repeat')) out['customers.repeat'] = { value: repeat, previous: null, unit: 'count' };
    if (want('customers.repeat_rate_bps')) {
      out['customers.repeat_rate_bps'] = { value: bps(repeat, total), previous: null, unit: 'bps' };
    }
    if (want('customers.top_spender_ltv')) {
      out['customers.top_spender_ltv'] = {
        value: topSpender?.lifetimeValue ?? 0,
        previous: null,
        unit: 'paisa',
        label: topSpender?.name,
      };
    }
    if (want('customers.open_leads')) out['customers.open_leads'] = { value: openLeads, previous: null, unit: 'count' };
    if (want('customers.follow_ups_due')) out['customers.follow_ups_due'] = { value: followUpsDue, previous: null, unit: 'count' };
    return out;
  }
}

@Injectable()
export class WorkshopMetricsProvider implements MetricProvider, OnModuleInit {
  readonly id = 'analytics.workshop.metrics';
  readonly keys = ['workshop.active_jobs', 'workshop.jobs_completed', 'workshop.bottleneck_stage', 'workshop.avg_job_days', 'workshop.active_tailors'];
  readonly permissions: readonly PermissionKey[] = ['stitching.jobs.view_queue'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly metricRegistry: MetricRegistryService,
  ) {}

  onModuleInit(): void {
    this.metricRegistry.register(this);
  }

  async collect(ctx: MetricContext, wanted: readonly string[]): Promise<Record<string, MetricValue>> {
    const want = (key: string) => wanted.includes(key);
    const out: Record<string, MetricValue> = {};

    const [activeJobs, jobsCompleted, jobsCompletedPrev, stageRows, avgDaysRows, avgDaysPrevRows, activeTailors] = await Promise.all([
      this.prisma.stitchingJob.count({ where: { stage: { not: 'DISPATCHED' } } }),
      this.prisma.stitchingJob.count({ where: { completedAt: { gte: ctx.from, lt: ctx.to } } }),
      this.prisma.stitchingJob.count({ where: { completedAt: { gte: ctx.prevFrom, lt: ctx.prevTo } } }),
      want('workshop.bottleneck_stage')
        ? this.prisma.stitchingJob.groupBy({ by: ['stage'], where: { stage: { not: 'DISPATCHED' } }, _count: { _all: true } })
        : Promise.resolve([]),
      want('workshop.avg_job_days')
        ? this.prisma.$queryRaw<Array<{ days: number | null }>>`
            SELECT AVG(EXTRACT(EPOCH FROM ("completedAt" - "createdAt")) / 86400.0)::float8 AS days
            FROM "StitchingJob" WHERE "completedAt" >= ${ctx.from} AND "completedAt" < ${ctx.to}
          `
        : Promise.resolve([]),
      want('workshop.avg_job_days')
        ? this.prisma.$queryRaw<Array<{ days: number | null }>>`
            SELECT AVG(EXTRACT(EPOCH FROM ("completedAt" - "createdAt")) / 86400.0)::float8 AS days
            FROM "StitchingJob" WHERE "completedAt" >= ${ctx.prevFrom} AND "completedAt" < ${ctx.prevTo}
          `
        : Promise.resolve([]),
      this.prisma.user.count({ where: { role: 'TAILOR', isActive: true } }),
    ]);

    if (want('workshop.active_jobs')) out['workshop.active_jobs'] = { value: activeJobs, previous: null, unit: 'count' };
    if (want('workshop.jobs_completed')) out['workshop.jobs_completed'] = { value: jobsCompleted, previous: jobsCompletedPrev, unit: 'count' };
    if (want('workshop.bottleneck_stage')) {
      const bottleneck = [...stageRows].sort((a, b) => b._count._all - a._count._all)[0];
      out['workshop.bottleneck_stage'] = { value: bottleneck?._count._all ?? 0, previous: null, unit: 'count', label: bottleneck?.stage };
    }
    if (want('workshop.avg_job_days')) {
      out['workshop.avg_job_days'] = { value: round1(avgDaysRows[0]?.days ?? 0), previous: round1(avgDaysPrevRows[0]?.days ?? 0), unit: 'days' };
    }
    if (want('workshop.active_tailors')) out['workshop.active_tailors'] = { value: activeTailors, previous: null, unit: 'count' };
    return out;
  }
}

/** `workshop.staff_accounts` alone — needs `users.manage`, stricter than the rest of this group. */
@Injectable()
export class WorkshopStaffMetricsProvider implements MetricProvider, OnModuleInit {
  readonly id = 'analytics.workshop.staff.metrics';
  readonly keys = ['workshop.staff_accounts'];
  readonly permissions: readonly PermissionKey[] = ['users.manage'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly metricRegistry: MetricRegistryService,
  ) {}

  onModuleInit(): void {
    this.metricRegistry.register(this);
  }

  async collect(): Promise<Record<string, MetricValue>> {
    const count = await this.prisma.user.count({ where: { role: { in: ['STAFF', 'ADMIN', 'TAILOR'] }, isActive: true } });
    return { 'workshop.staff_accounts': { value: count, previous: null, unit: 'count' } };
  }
}

/** Rounds to one decimal place, matching analytics.service.ts's own day-count convention. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
