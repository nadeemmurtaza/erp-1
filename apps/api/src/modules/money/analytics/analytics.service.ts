import { Injectable } from '@nestjs/common';
import { ORDER_STATUSES, type PermissionKey } from '@newax/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Prisma } from '../../../core/prisma/client';
import type { OrderStatus } from '../../../core/prisma/client';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { AppConfigService } from '../../../core/config/app-config.service';
import { VOID_ORDER_STATUSES as VOID_STATUSES } from '../../../core/common/sales-revenue';
import {
  shopDayExpr,
  shopDayKeys,
  startOfShopDay,
  startOfShopDaysAgo,
  startOfShopMonth,
} from '../../../core/time/shop-time';
import { previousWindow, rollUpDays, type MetricBucket } from '../../../core/time/metric-window';
import { MetricRegistryService } from '../../../core/metrics/metric-registry.service';
import type { DashboardCardsResponse } from './dto/cards.dto';

/** Placed but not yet DELIVERED, CANCELLED or RETURNED — WO-D.1's "open". */
const OPEN_ORDER_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED'];

export interface MonthlyTarget {
  targetAmount: number;
  achievedAmount: number;
  /** Percentage, clamped to 0-999 so a wildly over-target month can't break a gauge UI. */
  percent: number;
}

export interface SalesRevenueReport {
  totals: { revenue: number; orders: number; aov: number };
  series: Array<{ t: string; revenue: number; orders: number }>;
  byChannel: Array<{ channel: string; revenue: number; orders: number }>;
  target: { amount: number; achieved: number; percentBps: number };
}

export interface SalesAovReport {
  totals: { aov: number; median: number; basketSize: number };
  series: Array<{ t: string; aov: number }>;
  distribution: Array<{ bucket: string; orders: number }>;
}

export interface SalesProfitReport {
  totals: { revenue: number; cogs: number; grossProfit: number; grossMarginBps: number };
  series: Array<{ t: string; revenue: number; cogs: number; grossProfit: number }>;
  byProduct: Array<{ productId: string | null; name: string; revenue: number; cogs: number; grossProfit: number; marginBps: number }>;
}

export interface SalesFunnelReport {
  steps: Array<{ key: string; label: string; count: number }>;
  conversionBps: number;
  abandonedCarts: number;
  sources: Array<{ source: string; count: number; percent: number }>;
}

export interface DashboardSummary {
  today: { orders: number; revenue: number; totalUnits: number };
  month: { orders: number; revenue: number; totalUnits: number };
  /** WO-45.1 — the same order population `today`/`month` already count,
   *  with no window applied; not exposed anywhere before this field. */
  allTime: { orders: number; revenue: number; totalUnits: number };
  averageOrderValue: number;
  needsAttention: {
    pendingOrders: number;
    paymentsAwaitingApproval: number;
    followUpsDue: number;
    lowStockVariants: number;
    failedEvents: number;
  };
  catalogue: { live: number; drafts: number; services: number };
  customers: { total: number; repeat: number; newThisMonth: number };
  /** Daily revenue for the sales chart, oldest first. */
  salesSeries: Array<{ date: string; orders: number; revenue: number }>;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  stitchingByStage: Array<{ stage: string; count: number }>;
  monthlyTarget: MonthlyTarget;
}

export interface StitchingAnalytics {
  /** Garments most often booked for stitching, ranked by job count. */
  topGarments: Array<{ key: string; label: string; jobs: number; revenue: number }>;
  /** Style options most often chosen, across all garments. */
  topOptions: Array<{ groupKey: string; label: string; count: number; revenue: number }>;
  /** Same garments as topGarments, ranked by revenue instead — for a bar chart. */
  revenueByGarment: Array<{ label: string; revenue: number }>;
}

export interface ExtendedAnalytics {
  cartAbandonment: {
    cartsCreated: number;
    ordersPlaced: number;
    abandonedCarts: number;
    /** Percentage, 0-100. */
    rate: number;
  };
  revenueByCategory: Array<{ category: string; revenue: number }>;
  returnRate: {
    totalOrders: number;
    returned: number;
    cancelled: number;
    /** Percentage, 0-100. */
    rate: number;
  };
  averageFulfillmentDays: number;
  paymentMethodSplit: Array<{ provider: string; count: number; amount: number }>;
  revenueByCity: Array<{ city: string; revenue: number }>;
}

export interface OrderAgeingBucket {
  label: string;
  count: number;
}

export interface OrdersOverview {
  /** Open orders only (not yet DELIVERED/CANCELLED/RETURNED), oldest bucket first. */
  ageing: OrderAgeingBucket[];
  /** The 20 longest-open orders, oldest first — the ones a fulfilment desk should look at now. */
  oldestOpen: Array<{ id: string; number: string; status: string; placedAt: string; ageDays: number }>;
  byCity: Array<{ city: string; count: number; avgAgeDays: number }>;
  byPayment: Array<{ provider: string; count: number; avgAgeDays: number }>;
}

export interface OrderLifecycleBreakdown {
  /** Every real `Order.status` value, zero-filled — the single source of truth this tile only ever displays a grouping of. */
  counts: Record<OrderStatus, number>;
  /** PENDING + CONFIRMED + PROCESSING + READY_TO_SHIP + SHIPPED. */
  pending: number;
  /** DELIVERED. */
  completed: number;
  /** CANCELLED + RETURNED. */
  voided: number;
  /**
   * The same three figures, shaped for the report-registry's own generic
   * `table` block — `statusFilter` is a ready-made value for
   * `AdminOrderQueryDto.status`'s own comma-separated list (WO-69.2), so
   * "click the number" is a real link to the order list pre-filtered to
   * exactly this bucket's underlying statuses, never a dead-end count.
   */
  rows: Array<{ label: 'Pending' | 'Completed' | 'Voided'; count: number; statusFilter: string }>;
}

export interface OrderTransitionTiming {
  from: string;
  to: string;
  count: number;
  avgHours: number;
  medianHours: number;
}

export interface OrdersFulfilment {
  /** Pipeline order (PENDING→CONFIRMED→…), not grouped-row order. */
  transitions: OrderTransitionTiming[];
}

export interface PurchasingSpend {
  totals: {
    /** Σ PurchaseOrder.total by sentAt — a commitment, not yet a cost. */
    ordered: number;
    /** Σ GoodsReceiptItem.quantity × landedUnitCost by GoodsReceipt.receivedAt — comparison()'s own "purchases" definition, reused so the two never disagree. */
    received: number;
    /** Σ SupplierBill.amount by issuedAt. */
    billed: number;
    /** Σ (amount - amountPaid) across every non-PAID bill — a live balance, not windowed by `days`. */
    unpaid: number;
  };
  series: Array<{ date: string; ordered: number; received: number }>;
  byCategory: Array<{ category: string; spend: number }>;
}

export interface PurchasingSupplierRow {
  supplierId: string;
  name: string;
  spend: number;
  orders: number;
  /** Basis points (0-10000); null if this supplier has no PO with a promised date. */
  onTimeRateBps: number | null;
  /** null if no PO of this supplier's has ever been both sent and received. */
  avgLeadDays: number | null;
  /** Share of the whole list's received spend, basis points. */
  share: number;
  /**
   * WO-9.9 (09-ai-layer.md) — "gives merchandising a quality signal per
   * supplier": the average PUBLISHED Review.rating across every product this
   * supplier supplies (SupplierProduct), all-time — not windowed by `days`,
   * since a product's build quality doesn't reset every reporting period.
   * Null when none of this supplier's products has a published review yet.
   */
  avgProductRating: number | null;
  /** How many published reviews the average above is built from — so a 5.0 from 2 reviews reads differently than a 4.6 from 400. */
  productReviewCount: number;
}

export interface PurchasingSuppliers {
  rows: PurchasingSupplierRow[];
}

export interface ProductTopSellerRow {
  productId: string | null;
  variantId: string | null;
  sku: string;
  name: string;
  units: number;
  revenue: number;
  /** Absent (not null) without `inventory.view_cost` — cost-fields.ts's own OMIT convention, not comparison()'s null one; see purchasingTopSellers()'s docstring. */
  cogs?: number;
  marginBps?: number;
}

export interface ProductsTopSellers {
  rows: ProductTopSellerRow[];
}

export interface ProductSlowSellerRow {
  productId: string;
  variantId: string;
  sku: string;
  name: string;
  daysSinceLastSale: number;
  ageDays: number;
}

export interface ProductsSlowSellers {
  rows: ProductSlowSellerRow[];
}

export interface ProductCategoryRow {
  /** null for the "Uncategorised" bucket — Product.categoryId is genuinely nullable. */
  categoryId: string | null;
  name: string;
  revenue: number;
  units: number;
  productCount: number;
  /** Share of the returned rows' own total revenue, basis points. */
  share: number;
}

export interface ProductsCategories {
  rows: ProductCategoryRow[];
  series: Array<{ date: string; revenue: number }>;
}

/** WO-57.1 — one category's own revenue, broken out day by day, for the
 *  top categories in the window plus one "Other" bucket. */
export interface CategoryVelocitySeries {
  /** Which series key names which category — `report-registry.ts`'s new `dynamic-timeseries` block reads this to build its own chart legend, since the actual categories are data, not static config. */
  series: Array<{ key: string; label: string }>;
  /** One row per shop-day in the window, oldest first, zero-filled — never a gap the day axis would misalign against. */
  days: Array<{ date: string } & Record<string, number>>;
}

export interface InventoryValuation {
  totals: {
    units: number;
    value: number;
    /** In-stock variants with `costPrice: 0` — "never received against a PO," a real gap, not the normal state of an idle SKU. */
    unknownCostVariants: number;
  };
  byCategory: Array<{ categoryId: string | null; name: string; units: number; value: number }>;
  byKind: Array<{ kind: string; units: number; value: number }>;
  /** `VariantSalesStat.ageDays` buckets — the same field WO-D.3's slow-sellers report already depends on, at the accounting aging.ts's own 30/60/90 boundaries (this is a weeks-to-months scale, not WO-D.1's few-day order ageing). */
  ageing: Array<{ label: string; units: number; value: number }>;
}

export interface StockMovementReasonRow {
  reason: string;
  in: number;
  out: number;
  count: number;
}

export interface InventoryMovementRow {
  id: string;
  variantId: string;
  sku: string;
  name: string;
  reason: string;
  delta: number;
  createdAt: string;
}

export interface InventoryMovements {
  series: Array<{ date: string; in: number; out: number }>;
  byReason: StockMovementReasonRow[];
  recent: InventoryMovementRow[];
}

export interface CustomersOverview {
  totals: { total: number; repeat: number; newThisMonth: number };
  byCity: Array<{ city: string; count: number }>;
  bySource: Array<{ source: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
}

export interface CustomerCohort {
  /** "YYYY-MM" — the month the contact signed up. */
  cohort: string;
  size: number;
  /** How many of this cohort went on to place a second order (`orderCount >= 2`) — the same threshold `Contact.status: REPEAT` and `summary()`'s own `repeat` figure already use. */
  retained: number;
}

export interface CustomersRetention {
  cohorts: CustomerCohort[];
  repeatRateBps: number;
}

export interface CustomerTopRow {
  contactId: string;
  name: string;
  city: string | null;
  orders: number;
  lifetimeValue: number;
  avgOrderValue: number;
  lastOrderAt: string | null;
}

export interface CustomersTop {
  rows: CustomerTopRow[];
}

export interface WorkshopStageRow {
  stage: string;
  count: number;
  avgHours: number;
}

export interface WorkshopTailorRow {
  tailorId: string;
  name: string;
  jobsCompleted: number;
  avgHours: number;
}

export interface WorkshopOutput {
  series: Array<{ date: string; started: number; completed: number }>;
  byStage: WorkshopStageRow[];
  byTailor: WorkshopTailorRow[];
  bottleneck: { stage: string; avgHours: number } | null;
}

export interface ComparisonBucket {
  t: string;
  sales: number;
  purchases: number;
  expenses: number;
  /** null without `inventory.view_cost` — cost data is not this user's to see. */
  grossProfit: number | null;
  net: number | null;
}

export interface ComparisonAnalytics {
  bucket: MetricBucket;
  /** Oldest first; a bucket spanning "now" is the partial current one, last. */
  buckets: ComparisonBucket[];
  totals: {
    sales: number;
    purchases: number;
    expenses: number;
    grossProfit: number | null;
    net: number | null;
  };
  /** False when MODULES excludes `finance` — `expenses` is all zeros because there is truly nothing to show, not because the query silently failed. */
  financeEnabled: boolean;
}

export interface VisitorAnalytics {
  totalVisitors: number;
  /** vs the immediately preceding window of the same length; null if that window had no visitors. */
  visitorsChangePercent: number | null;
  funnel: {
    productViews: number;
    addToCart: number;
    checkoutStarted: number;
    purchasesCompleted: number;
  };
  trafficSources: Array<{ source: string; count: number; percent: number }>;
  abandonedCarts: number;
}

/**
 * Dashboard numbers.
 *
 * Every figure is derived here rather than in the browser, so the admin page
 * makes one request and every screen quoting "revenue this month" means the
 * same thing.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
    private readonly metricRegistry: MetricRegistryService,
  ) {}

  /**
   * `GET /admin/analytics/cards` (10-admin-dashboard.md D2, WO-A.4). One
   * request batches every card the caller may see: `groups` resolves to
   * metric keys via `MetricRegistryService.keysForGroups()` (the group
   * name IS the key's own dot-prefix — see that method's own comment for
   * why), permission gating happens inside `collect()` itself, and the
   * delta percentage is left for the client to compute from `value` and
   * `previous` — the server never has to know what "good" looks like.
   */
  async cards(
    days: number | undefined,
    groups: readonly string[],
    seriesKeys: readonly string[],
    bucket: MetricBucket,
    permissions: readonly string[],
  ): Promise<DashboardCardsResponse> {
    const timeZone = await this.settings.get<string>(SettingKey.StoreTimezone);
    const resolvedDays = days ?? (await this.settings.get<number>(SettingKey.AnalyticsDefaultRangeDays));
    const clampedDays = Math.min(Math.max(resolvedDays, 7), 365);

    const now = new Date();
    const from = startOfShopDaysAgo(now, clampedDays, timeZone);
    const to = now;
    const { prevFrom, prevTo } = previousWindow(from, to, timeZone);

    const wantedKeys = this.metricRegistry.keysForGroups(groups);
    const metrics = await this.metricRegistry.collect(
      { from, to, prevFrom, prevTo, permissions: permissions as readonly PermissionKey[] },
      wantedKeys,
      bucket,
    );

    const series = await this.sparklineSeries(seriesKeys, from, clampedDays, timeZone, permissions);

    return {
      days: clampedDays,
      from: from.toISOString(),
      to: to.toISOString(),
      generatedAt: now.toISOString(),
      metrics,
      series,
    };
  }

  /**
   * The six sparkline series D1 names, "only these are computed, and only
   * when requested." These are NOT `MetricProvider`s: a provider answers a
   * point-in-time value with a previous-window comparison; a sparkline is a
   * short day-bucketed series with no comparison at all, a different enough
   * shape that folding it into the registry would strain D2's own
   * interface rather than simplify it. Each series carries its own
   * permission check inline (no registry needed for six fixed names).
   */
  private async sparklineSeries(
    wanted: readonly string[],
    from: Date,
    days: number,
    timeZone: string,
    permissions: readonly string[],
  ): Promise<Record<string, Array<{ t: string; v: number }>>> {
    const has = (permission: string) => permissions.includes(permission) || permissions.includes('analytics.view');
    const series: Record<string, Array<{ t: string; v: number }>> = {};
    const want = (key: string) => wanted.includes(key);

    if (want('revenue') || want('orders')) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ day: string; orders: bigint; revenue: bigint }>>(
        `SELECT ${shopDayExpr('"placedAt"', timeZone)} AS day, COUNT(*) AS orders, COALESCE(SUM("grandTotal"), 0) AS revenue
         FROM "Order" WHERE "placedAt" >= $1 AND "status" NOT IN (${VOID_STATUSES.map((s) => `'${s}'`).join(',')})
         GROUP BY 1 ORDER BY 1 ASC`,
        from,
      );
      const byDay = new Map(rows.map((row) => [row.day, row]));
      const axis = shopDayKeys(from, days, timeZone);
      if (want('revenue')) series.revenue = axis.map((t) => ({ t, v: Number(byDay.get(t)?.revenue ?? 0) }));
      if (want('orders')) series.orders = axis.map((t) => ({ t, v: Number(byDay.get(t)?.orders ?? 0) }));
    }
    if (want('expenses') && has('finance.view')) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ day: string; amount: bigint }>>(
        `SELECT ${shopDayExpr('"incurredAt"', timeZone)} AS day, COALESCE(SUM("amount"), 0) AS amount
         FROM "Expense" WHERE "incurredAt" >= $1 GROUP BY 1 ORDER BY 1 ASC`,
        from,
      );
      const byDay = new Map(rows.map((row) => [row.day, Number(row.amount)]));
      series.expenses = shopDayKeys(from, days, timeZone).map((t) => ({ t, v: byDay.get(t) ?? 0 }));
    }
    if (want('purchases') && has('inventory.view_cost')) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ day: string; spend: bigint }>>(
        `SELECT ${shopDayExpr('gr."receivedAt"', timeZone)} AS day, COALESCE(SUM(gri."quantity" * gri."landedUnitCost"), 0) AS spend
         FROM "GoodsReceiptItem" gri JOIN "GoodsReceipt" gr ON gr."id" = gri."goodsReceiptId"
         WHERE gr."receivedAt" >= $1 GROUP BY 1 ORDER BY 1 ASC`,
        from,
      );
      const byDay = new Map(rows.map((row) => [row.day, Number(row.spend)]));
      series.purchases = shopDayKeys(from, days, timeZone).map((t) => ({ t, v: byDay.get(t) ?? 0 }));
    }
    if (want('units_produced') && has('bom.view')) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ day: string; units: bigint }>>(
        `SELECT ${shopDayExpr('"producedAt"', timeZone)} AS day, COALESCE(SUM("quantityProduced"), 0) AS units
         FROM "BomProductionRun" WHERE "producedAt" >= $1 GROUP BY 1 ORDER BY 1 ASC`,
        from,
      );
      const byDay = new Map(rows.map((row) => [row.day, Number(row.units)]));
      series.units_produced = shopDayKeys(from, days, timeZone).map((t) => ({ t, v: byDay.get(t) ?? 0 }));
    }
    if (want('new_customers') && has('crm.manage')) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ day: string; count: bigint }>>(
        `SELECT ${shopDayExpr('"createdAt"', timeZone)} AS day, COUNT(*) AS count
         FROM "Contact" WHERE "createdAt" >= $1 GROUP BY 1 ORDER BY 1 ASC`,
        from,
      );
      const byDay = new Map(rows.map((row) => [row.day, Number(row.count)]));
      series.new_customers = shopDayKeys(from, days, timeZone).map((t) => ({ t, v: byDay.get(t) ?? 0 }));
    }
    return series;
  }

  /**
   * `GET /admin/analytics/sales/revenue` (10-admin-dashboard.md WO-A.5) —
   * the first of the four genuinely new sales reports; the remaining two
   * report groups Track D wires (`sales.reports.ts`'s own file split from
   * the brief's file list isn't used — this module is already one file per
   * concern, `analytics.controller.ts`/`analytics.service.ts`, and splitting
   * four methods into a second file for six existing ones to stay in the
   * first would be a reorganisation with no behaviour change, which
   * `CLAUDE.md`'s change-minimization rule doesn't ask for).
   */
  async salesRevenue(days: number): Promise<SalesRevenueReport> {
    const timeZone = await this.settings.get<string>(SettingKey.StoreTimezone);
    const now = new Date();
    const seriesStart = startOfShopDaysAgo(now, days, timeZone);
    const countsAsSale: Prisma.OrderWhereInput = { placedAt: { gte: seriesStart }, status: { notIn: VOID_STATUSES } };

    const [totals, byChannel, seriesRows, monthTarget, monthAchieved] = await Promise.all([
      this.prisma.order.aggregate({ where: countsAsSale, _sum: { grandTotal: true }, _count: { _all: true } }),
      this.prisma.order.groupBy({ by: ['channel'], where: countsAsSale, _sum: { grandTotal: true }, _count: { _all: true } }),
      this.prisma.$queryRawUnsafe<Array<{ day: string; orders: bigint; revenue: bigint }>>(
        `SELECT ${shopDayExpr('"placedAt"', timeZone)} AS day, COUNT(*) AS orders, COALESCE(SUM("grandTotal"), 0) AS revenue
         FROM "Order" WHERE "placedAt" >= $1 AND "status" NOT IN (${VOID_STATUSES.map((s) => `'${s}'`).join(',')})
         GROUP BY 1 ORDER BY 1 ASC`,
        seriesStart,
      ),
      this.settings.get<number>(SettingKey.MonthlyRevenueTarget),
      this.prisma.order.aggregate({
        where: { placedAt: { gte: startOfShopMonth(now, timeZone) }, status: { notIn: VOID_STATUSES } },
        _sum: { grandTotal: true },
      }),
    ]);

    const revenue = totals._sum.grandTotal ?? 0;
    const orderCount = totals._count._all;
    const byDay = new Map(seriesRows.map((row) => [row.day, row]));
    const achieved = monthAchieved._sum.grandTotal ?? 0;

    return {
      totals: { revenue, orders: orderCount, aov: orderCount > 0 ? Math.round(revenue / orderCount) : 0 },
      series: shopDayKeys(seriesStart, days, timeZone).map((t) => ({
        t,
        revenue: Number(byDay.get(t)?.revenue ?? 0),
        orders: Number(byDay.get(t)?.orders ?? 0),
      })),
      byChannel: byChannel.map((row) => ({ channel: row.channel, revenue: row._sum.grandTotal ?? 0, orders: row._count._all })),
      target: {
        amount: monthTarget,
        achieved,
        percentBps: monthTarget > 0 ? Math.min(Math.round((achieved / monthTarget) * 10000), 99_900) : 0,
      },
    };
  }

  /** `GET /admin/analytics/sales/aov` (WO-A.5). */
  async salesAov(days: number): Promise<SalesAovReport> {
    const timeZone = await this.settings.get<string>(SettingKey.StoreTimezone);
    const now = new Date();
    const seriesStart = startOfShopDaysAgo(now, days, timeZone);

    const [orderRows, seriesRows] = await Promise.all([
      // One row per order with its own item count — median and basket size
      // both need the per-order distribution, not just a sum.
      this.prisma.$queryRawUnsafe<Array<{ grandTotal: bigint; items: bigint }>>(
        `SELECT o."grandTotal" AS "grandTotal", COALESCE(SUM(oi."quantity"), 0) AS items
         FROM "Order" o LEFT JOIN "OrderItem" oi ON oi."orderId" = o."id"
         WHERE o."placedAt" >= $1 AND o."status" NOT IN (${VOID_STATUSES.map((s) => `'${s}'`).join(',')})
         GROUP BY o."id", o."grandTotal"`,
        seriesStart,
      ),
      this.prisma.$queryRawUnsafe<Array<{ day: string; orders: bigint; revenue: bigint }>>(
        `SELECT ${shopDayExpr('"placedAt"', timeZone)} AS day, COUNT(*) AS orders, COALESCE(SUM("grandTotal"), 0) AS revenue
         FROM "Order" WHERE "placedAt" >= $1 AND "status" NOT IN (${VOID_STATUSES.map((s) => `'${s}'`).join(',')})
         GROUP BY 1 ORDER BY 1 ASC`,
        seriesStart,
      ),
    ]);

    const totals = orderRows.map((row) => Number(row.grandTotal)).sort((a, b) => a - b);
    const itemCounts = orderRows.map((row) => Number(row.items));
    const orderCount = totals.length;
    const revenue = totals.reduce((sum, value) => sum + value, 0);
    const median = orderCount === 0 ? 0 : orderCount % 2 === 1
      ? totals[(orderCount - 1) / 2]!
      : Math.round((totals[orderCount / 2 - 1]! + totals[orderCount / 2]!) / 2);
    const basketSize = orderCount > 0 ? Math.round((itemCounts.reduce((sum, value) => sum + value, 0) / orderCount) * 10) / 10 : 0;

    // Bucket boundaries in paisa (Rs 500 / 1,500 / 3,000 / 6,000) — round
    // rupee steps, not an arbitrary quartile split, so the reader recognises
    // the bucket edges without doing the paisa division themselves.
    const bucketEdges = [50_000, 150_000, 300_000, 600_000];
    const bucketLabels = ['< Rs 500', 'Rs 500–1,500', 'Rs 1,500–3,000', 'Rs 3,000–6,000', 'Rs 6,000+'];
    const distributionCounts = new Array(bucketLabels.length).fill(0) as number[];
    for (const total of totals) {
      const index = bucketEdges.findIndex((edge) => total < edge);
      distributionCounts[index === -1 ? bucketLabels.length - 1 : index] += 1;
    }

    const byDay = new Map(seriesRows.map((row) => [row.day, row]));
    return {
      totals: { aov: orderCount > 0 ? Math.round(revenue / orderCount) : 0, median, basketSize },
      series: shopDayKeys(seriesStart, days, timeZone).map((t) => {
        const row = byDay.get(t);
        const dayOrders = Number(row?.orders ?? 0);
        const dayRevenue = Number(row?.revenue ?? 0);
        return { t, aov: dayOrders > 0 ? Math.round(dayRevenue / dayOrders) : 0 };
      }),
      distribution: bucketLabels.map((bucket, index) => ({ bucket, orders: distributionCounts[index]! })),
    };
  }

  /**
   * `GET /admin/analytics/sales/profit` (WO-A.5, `inventory.view_cost`).
   * Direct gross profit — revenue less `Σ unitCost × quantity` over
   * `OrderItem` — available today, not waiting on WO-B.3's OrderEconomics
   * contribution figure (a different, narrower number, per the brief's own
   * note). Same direct-cost definition as `SalesCostMetricsProvider`
   * (`analytics.metrics.ts`) — restated here rather than shared through a
   * helper both call, since it is six lines and the two otherwise have
   * nothing else in common (a dashboard card vs. a byProduct breakdown).
   */
  async salesProfit(days: number): Promise<SalesProfitReport> {
    const timeZone = await this.settings.get<string>(SettingKey.StoreTimezone);
    const now = new Date();
    const seriesStart = startOfShopDaysAgo(now, days, timeZone);
    const statusFilter = VOID_STATUSES.map((s) => `'${s}'`).join(',');

    const [revenueRow, cogsRow, seriesRows, byProductRows] = await Promise.all([
      this.prisma.order.aggregate({
        where: { placedAt: { gte: seriesStart }, status: { notIn: VOID_STATUSES } },
        _sum: { grandTotal: true },
      }),
      this.prisma.$queryRawUnsafe<Array<{ cogs: bigint }>>(
        `SELECT COALESCE(SUM(oi."unitCost" * oi."quantity"), 0) AS cogs
         FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
         WHERE o."placedAt" >= $1 AND o."status" NOT IN (${statusFilter})`,
        seriesStart,
      ),
      this.prisma.$queryRawUnsafe<Array<{ day: string; revenue: bigint; cogs: bigint }>>(
        `SELECT ${shopDayExpr('o."placedAt"', timeZone)} AS day,
                COALESCE(SUM(o."grandTotal"), 0) AS revenue,
                COALESCE(SUM(oi."unitCost" * oi."quantity"), 0) AS cogs
         FROM "Order" o LEFT JOIN "OrderItem" oi ON oi."orderId" = o."id"
         WHERE o."placedAt" >= $1 AND o."status" NOT IN (${statusFilter})
         GROUP BY 1 ORDER BY 1 ASC`,
        seriesStart,
      ),
      this.prisma.$queryRawUnsafe<Array<{ productId: string | null; name: string; revenue: bigint; cogs: bigint }>>(
        `SELECT oi."productId" AS "productId", oi."nameEn" AS name,
                COALESCE(SUM(oi."lineTotal"), 0) AS revenue,
                COALESCE(SUM(oi."unitCost" * oi."quantity"), 0) AS cogs
         FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
         WHERE o."placedAt" >= $1 AND o."status" NOT IN (${statusFilter})
         GROUP BY oi."productId", oi."nameEn"
         ORDER BY revenue DESC LIMIT 20`,
        seriesStart,
      ),
    ]);

    const revenue = revenueRow._sum.grandTotal ?? 0;
    const cogs = Number(cogsRow[0]?.cogs ?? 0);
    const grossProfit = revenue - cogs;

    return {
      totals: { revenue, cogs, grossProfit, grossMarginBps: bpsOf(grossProfit, revenue) },
      series: seriesRows.map((row) => {
        const dayRevenue = Number(row.revenue);
        const dayCogs = Number(row.cogs);
        return { t: row.day, revenue: dayRevenue, cogs: dayCogs, grossProfit: dayRevenue - dayCogs };
      }),
      byProduct: byProductRows.map((row) => {
        const rowRevenue = Number(row.revenue);
        const rowCogs = Number(row.cogs);
        const rowProfit = rowRevenue - rowCogs;
        return {
          productId: row.productId,
          name: row.name,
          revenue: rowRevenue,
          cogs: rowCogs,
          grossProfit: rowProfit,
          marginBps: bpsOf(rowProfit, rowRevenue),
        };
      }),
    };
  }

  /**
   * `GET /admin/analytics/sales/funnel` (WO-A.5) — a thin reshaping of
   * `visitorAnalytics()`, which already computes every figure this report
   * needs (`funnel`, `abandonedCarts`, `trafficSources`). No new query.
   */
  async salesFunnel(days: number): Promise<SalesFunnelReport> {
    const visitors = await this.visitorAnalytics(days);
    const steps = [
      { key: 'productViews', label: 'Product views', count: visitors.funnel.productViews },
      { key: 'addToCart', label: 'Added to cart', count: visitors.funnel.addToCart },
      { key: 'checkoutStarted', label: 'Checkout started', count: visitors.funnel.checkoutStarted },
      { key: 'purchasesCompleted', label: 'Purchases completed', count: visitors.funnel.purchasesCompleted },
    ];
    return {
      steps,
      conversionBps: bpsOf(visitors.funnel.purchasesCompleted, visitors.funnel.productViews),
      abandonedCarts: visitors.abandonedCarts,
      sources: visitors.trafficSources,
    };
  }

  async summary(days = 30): Promise<DashboardSummary> {
    const now = new Date();

    // Every boundary below is the SHOP's, not the server's and not UTC. Local
    // midnight in UTC+5 is 19:00 UTC the previous day, so mixing the two puts a
    // sale made on the 29th into the 28th. See core/time/shop-time.ts.
    const timeZone = await this.settings.get<string>(SettingKey.StoreTimezone);

    const startOfToday = startOfShopDay(now, timeZone);
    const startOfMonth = startOfShopMonth(now, timeZone);
    const seriesStart = startOfShopDaysAgo(now, days, timeZone);

    const countsAsSale: Prisma.OrderWhereInput = { status: { notIn: VOID_STATUSES } };

    // A "bring your own fabric" booking (StitchingOrder) never becomes an
    // Order — it has its own quoted fee instead of a grandTotal — so it was
    // invisible to every figure below that only ever queried Order. Counted
    // once quoted (an unquoted booking has no revenue figure yet) and not
    // cancelled, dated by createdAt since it has no placedAt of its own.
    const stitchingBookingCountsAsSale: Prisma.StitchingOrderWhereInput = {
      status: { not: 'CANCELLED' },
      quotedFee: { not: null },
    };

    const [
      today,
      month,
      allTime,
      stitchingToday,
      stitchingMonth,
      pendingOrders,
      paymentsAwaitingApproval,
      followUpsDue,
      failedEvents,
      live,
      drafts,
      services,
      totalCustomers,
      repeatCustomers,
      newCustomers,
      seriesRows,
      stitchingSeriesRows,
      topProductRows,
      stitchingRows,
      lowStockVariants,
      monthlyTargetAmount,
      unitTotals,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: { placedAt: { gte: startOfToday }, ...countsAsSale },
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.aggregate({
        where: { placedAt: { gte: startOfMonth }, ...countsAsSale },
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.aggregate({
        where: countsAsSale,
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
      this.prisma.stitchingOrder.aggregate({
        where: { createdAt: { gte: startOfToday }, ...stitchingBookingCountsAsSale },
        _sum: { quotedFee: true },
      }),
      this.prisma.stitchingOrder.aggregate({
        where: { createdAt: { gte: startOfMonth }, ...stitchingBookingCountsAsSale },
        _sum: { quotedFee: true },
      }),
      this.prisma.order.count({ where: { status: 'PENDING' } }),
      this.prisma.payment.count({ where: { status: 'AWAITING_APPROVAL' } }),
      this.prisma.followUpTask.count({ where: { isDone: false, dueAt: { lte: now } } }),
      this.prisma.outboxEvent.count({ where: { status: 'FAILED' } }),
      this.prisma.product.count({ where: { status: 'ACTIVE' } }),
      this.prisma.product.count({ where: { status: 'DRAFT' } }),
      this.prisma.product.count({ where: { kind: 'STITCHING_SERVICE', status: 'ACTIVE' } }),
      this.prisma.contact.count(),
      this.prisma.contact.count({ where: { orderCount: { gte: 2 } } }),
      this.prisma.contact.count({ where: { createdAt: { gte: startOfMonth } } }),

      // One row per day with orders; gaps are filled in below so the chart has
      // a continuous axis rather than jumping over quiet days.
      this.prisma.$queryRawUnsafe<Array<{ day: string; orders: bigint; revenue: bigint }>>(
        // The day is grouped AND formatted in the shop's zone, and comes back as
        // a string so no driver can re-interpret it into a different day.
        `SELECT ${shopDayExpr('"placedAt"', timeZone)} AS day,
                COUNT(*) AS orders,
                COALESCE(SUM("grandTotal"), 0) AS revenue
         FROM "Order"
         WHERE "placedAt" >= $1
           AND "status" NOT IN ('CANCELLED', 'RETURNED')
         GROUP BY 1
         ORDER BY 1 ASC`,
        seriesStart,
      ),

      // Bring-your-own-fabric booking revenue, same day grouping — merged into
      // seriesRows below so the sales chart doesn't undercount either stream.
      this.prisma.$queryRawUnsafe<Array<{ day: string; revenue: bigint }>>(
        `SELECT ${shopDayExpr('"createdAt"', timeZone)} AS day,
                COALESCE(SUM("quotedFee"), 0) AS revenue
         FROM "StitchingOrder"
         WHERE "createdAt" >= $1
           AND "status" != 'CANCELLED'
           AND "quotedFee" IS NOT NULL
         GROUP BY 1
         ORDER BY 1 ASC`,
        seriesStart,
      ),

      this.prisma.$queryRaw<Array<{ name: string; quantity: bigint; revenue: bigint }>>`
        SELECT oi."nameEn" AS name,
               SUM(oi."quantity") AS quantity,
               SUM(oi."lineTotal") AS revenue
        FROM "OrderItem" oi
        JOIN "Order" o ON o."id" = oi."orderId"
        WHERE o."placedAt" >= ${seriesStart}
          AND o."status" NOT IN ('CANCELLED', 'RETURNED')
        GROUP BY oi."nameEn"
        ORDER BY revenue DESC
        LIMIT 8
      `,

      this.prisma.stitchingJob.groupBy({
        by: ['stage'],
        _count: { _all: true },
      }),

      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM "ProductVariant"
        WHERE "isActive" = true AND "stock" <= "lowStockThreshold"
      `,

      this.settings.get<number>(SettingKey.MonthlyRevenueTarget),

      // WO-45.1 (45-order-count-tracking-coverage-note.md) — "total item
      // volume" alongside the order-count/revenue figures above. One
      // conditional-aggregation pass under the SAME countsAsSale filter
      // those figures already use, rather than three separate round trips
      // or a second, possibly-drifting definition of the order population.
      this.prisma.$queryRawUnsafe<Array<{ todayUnits: bigint; monthUnits: bigint; allTimeUnits: bigint }>>(
        `SELECT
           COALESCE(SUM(CASE WHEN o."placedAt" >= $1 THEN oi.quantity ELSE 0 END), 0) AS "todayUnits",
           COALESCE(SUM(CASE WHEN o."placedAt" >= $2 THEN oi.quantity ELSE 0 END), 0) AS "monthUnits",
           COALESCE(SUM(oi.quantity), 0) AS "allTimeUnits"
         FROM "OrderItem" oi
         JOIN "Order" o ON o.id = oi."orderId"
         WHERE o.status NOT IN (${VOID_STATUSES.map((s) => `'${s}'`).join(',')})`,
        startOfToday,
        startOfMonth,
      ),
    ]);

    const orderCount = allTime._count._all;
    // Order-only: "average ORDER value" means a checkout, not a stitching
    // booking, so this stays a narrower figure than the revenue totals below.
    const allTimeOrderRevenue = allTime._sum.grandTotal ?? 0;

    const monthRevenue = (month._sum.grandTotal ?? 0) + (stitchingMonth._sum.quotedFee ?? 0);

    const units = unitTotals[0];

    return {
      today: {
        orders: today._count._all,
        revenue: (today._sum.grandTotal ?? 0) + (stitchingToday._sum.quotedFee ?? 0),
        totalUnits: Number(units?.todayUnits ?? 0),
      },
      month: { orders: month._count._all, revenue: monthRevenue, totalUnits: Number(units?.monthUnits ?? 0) },
      allTime: { orders: orderCount, revenue: allTimeOrderRevenue, totalUnits: Number(units?.allTimeUnits ?? 0) },
      // Rounded to whole rupees: an average quoted to the paisa is false
      // precision and reads as noise on a stat tile.
      averageOrderValue:
        orderCount > 0 ? Math.round(allTimeOrderRevenue / orderCount / 100) * 100 : 0,
      needsAttention: {
        pendingOrders,
        paymentsAwaitingApproval,
        followUpsDue,
        lowStockVariants: Number(lowStockVariants[0]?.count ?? 0),
        failedEvents,
      },
      catalogue: { live, drafts, services },
      customers: {
        total: totalCustomers,
        repeat: repeatCustomers,
        newThisMonth: newCustomers,
      },
      salesSeries: fillDays(seriesStart, days, timeZone, seriesRows, stitchingSeriesRows),
      topProducts: topProductRows.map((row) => ({
        name: row.name,
        quantity: Number(row.quantity),
        revenue: Number(row.revenue),
      })),
      stitchingByStage: stitchingRows.map((row) => ({
        stage: row.stage,
        count: row._count._all,
      })),
      monthlyTarget: this.buildMonthlyTarget(monthlyTargetAmount, monthRevenue),
    };
  }

  /**
   * WO-23.1's WO-B.5 — the owner's own headline request: sales, purchases
   * and expenses, side by side, over the same axis.
   *
   * Three DEFINITIONS, pinned down because they are the whole value of the
   * chart (10-admin-dashboard.md WO-B.5):
   *   - Sales = Σ Order.grandTotal by placedAt, excluding CANCELLED/RETURNED.
   *     Deliberately NOT OrderEconomics.revenue, which is null until an order
   *     is DELIVERED and would make the current week look empty.
   *   - Purchases = Σ GoodsReceiptItem.quantity × landedUnitCost by
   *     GoodsReceipt.receivedAt. Deliberately NOT PurchaseOrder.total by
   *     sentAt — a purchase order is an intention, a goods receipt is a cost.
   *   - Expenses = Σ Expense.amount by incurredAt.
   *
   * Every query still asks Postgres for one row per shop-local DAY (the same
   * `shopDayExpr` the dashboard's own daily series uses) — see
   * core/time/metric-window.ts's own header for why day/week/month bucketing
   * is done by summing those day rows in JS rather than teaching SQL a
   * second grain: it is what makes "daily buckets sum to monthly buckets sum
   * to totals" true by construction.
   */
  async comparison(days: number, bucket: MetricBucket, includeCost: boolean): Promise<ComparisonAnalytics> {
    const now = new Date();
    const timeZone = await this.settings.get<string>(SettingKey.StoreTimezone);
    const seriesStart = startOfShopDaysAgo(now, days, timeZone);
    const financeEnabled = this.config.isModuleEnabled('finance');
    // VOID_STATUSES interpolated rather than hardcoded a third time in this
    // file — the one place "which orders count" is decided.
    const voidStatusList = VOID_STATUSES.map((status) => `'${status}'`).join(', ');

    const [salesRows, cogsRows, purchaseRows, expenseRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ day: string; sales: bigint }>>(
        `SELECT ${shopDayExpr('"placedAt"', timeZone)} AS day,
                COALESCE(SUM("grandTotal"), 0) AS sales
         FROM "Order"
         WHERE "placedAt" >= $1 AND "status" NOT IN (${voidStatusList})
         GROUP BY 1`,
        seriesStart,
      ),
      this.prisma.$queryRawUnsafe<Array<{ day: string; cogs: bigint }>>(
        `SELECT ${shopDayExpr('o."placedAt"', timeZone)} AS day,
                COALESCE(SUM(oi."unitCost" * oi."quantity"), 0) AS cogs
         FROM "OrderItem" oi
         JOIN "Order" o ON o.id = oi."orderId"
         WHERE o."placedAt" >= $1 AND o."status" NOT IN (${voidStatusList})
         GROUP BY 1`,
        seriesStart,
      ),
      this.prisma.$queryRawUnsafe<Array<{ day: string; purchases: bigint }>>(
        `SELECT ${shopDayExpr('gr."receivedAt"', timeZone)} AS day,
                COALESCE(SUM(gri."quantity" * gri."landedUnitCost"), 0) AS purchases
         FROM "GoodsReceiptItem" gri
         JOIN "GoodsReceipt" gr ON gr.id = gri."goodsReceiptId"
         WHERE gr."receivedAt" >= $1
         GROUP BY 1`,
        seriesStart,
      ),
      // No row from a module that isn't even running — never a query against
      // a table whose data nobody should be reading right now.
      financeEnabled
        ? this.prisma.$queryRawUnsafe<Array<{ day: string; expenses: bigint }>>(
            `SELECT ${shopDayExpr('"incurredAt"', timeZone)} AS day,
                    COALESCE(SUM("amount"), 0) AS expenses
             FROM "Expense"
             WHERE "incurredAt" >= $1
             GROUP BY 1`,
            seriesStart,
          )
        : Promise.resolve([] as Array<{ day: string; expenses: bigint }>),
    ]);

    const dayKeys = shopDayKeys(seriesStart, days, timeZone);
    const salesByDay = new Map(salesRows.map((row) => [row.day, Number(row.sales)]));
    const cogsByDay = new Map(cogsRows.map((row) => [row.day, Number(row.cogs)]));
    const purchasesByDay = new Map(purchaseRows.map((row) => [row.day, Number(row.purchases)]));
    const expensesByDay = new Map(expenseRows.map((row) => [row.day, Number(row.expenses)]));

    const zero = { sales: 0, cogs: 0, purchases: 0, expenses: 0 };
    const valuesByDay = new Map(
      dayKeys.map((day) => [
        day,
        {
          sales: salesByDay.get(day) ?? 0,
          cogs: cogsByDay.get(day) ?? 0,
          purchases: purchasesByDay.get(day) ?? 0,
          expenses: expensesByDay.get(day) ?? 0,
        },
      ]),
    );

    const rolled = rollUpDays(dayKeys, valuesByDay, zero, bucket);

    const buckets: ComparisonBucket[] = rolled.map((row) => {
      const grossProfit = includeCost ? row.sales - row.cogs : null;
      const net = includeCost && grossProfit !== null ? grossProfit - row.expenses : null;
      return { t: row.t, sales: row.sales, purchases: row.purchases, expenses: row.expenses, grossProfit, net };
    });

    const totals = buckets.reduce(
      (sum, b) => ({
        sales: sum.sales + b.sales,
        purchases: sum.purchases + b.purchases,
        expenses: sum.expenses + b.expenses,
        grossProfit: includeCost ? (sum.grossProfit ?? 0) + (b.grossProfit ?? 0) : null,
        net: includeCost ? (sum.net ?? 0) + (b.net ?? 0) : null,
      }),
      {
        sales: 0,
        purchases: 0,
        expenses: 0,
        grossProfit: includeCost ? 0 : null,
        net: includeCost ? 0 : null,
      } as ComparisonAnalytics['totals'],
    );

    return { bucket, buckets, totals, financeEnabled };
  }

  /**
   * Which garments and style options are actually driving the stitching
   * business, over the trailing `days`.
   */
  async stitchingAnalytics(days = 30): Promise<StitchingAnalytics> {
    const start = this.windowStart(days);

    const [garmentRows, optionRows] = await Promise.all([
      // A job only exists once an order is placed, so joining through
      // OrderItem/Order gives us the placement window and status for free.
      // GarmentType is joined for the display label; a garment retired after
      // the job was booked still shows its key rather than disappearing.
      this.prisma.$queryRaw<
        Array<{ key: string; label: string; jobs: bigint; revenue: bigint }>
      >`
        SELECT COALESCE(oi."garmentTypeKey", 'unknown') AS key,
               COALESCE(gt."labelEn", oi."garmentTypeKey", 'Unknown') AS label,
               COUNT(sj.id) AS jobs,
               COALESCE(SUM(oi."stitchingFeeUnit" * oi."quantity"), 0) AS revenue
        FROM "StitchingJob" sj
        JOIN "OrderItem" oi ON oi.id = sj."orderItemId"
        JOIN "Order" o ON o.id = oi."orderId"
        LEFT JOIN "GarmentType" gt ON gt.key = oi."garmentTypeKey"
        WHERE o."placedAt" >= ${start}
          AND o."status" NOT IN ('CANCELLED', 'RETURNED')
        GROUP BY 1, 2
        ORDER BY jobs DESC
      `,

      // OrderItem.optionsSnapshot is the per-order snapshot written by
      // OrdersService.priceCart: a JSON array of
      // { groupKey, groupLabelEn, groupLabelUr, key, labelEn, labelUr,
      //   priceDelta, custom }, one entry per style choice, already carrying
      // its own display label. That snapshot survives product/option edits
      // and deletions, which CartItemStitchingOption (live cart rows, gone
      // once the cart is cleared at checkout) does not — so it's the only
      // path with queryable, historically-accurate option references.
      // jsonb_array_elements unpacks it per row; custom free-text entries
      // (the customer's own words for an area, not a catalogued option) are
      // excluded since they have no stable label to rank.
      this.prisma.$queryRaw<
        Array<{ groupKey: string; label: string; count: bigint; revenue: bigint }>
      >`
        SELECT elem->>'groupKey' AS "groupKey",
               elem->>'labelEn' AS label,
               COUNT(*) AS count,
               COALESCE(SUM((elem->>'priceDelta')::int * oi."quantity"), 0) AS revenue
        FROM "OrderItem" oi
        JOIN "Order" o ON o.id = oi."orderId"
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE 
              WHEN jsonb_typeof(oi."optionsSnapshot") = 'array' THEN oi."optionsSnapshot"
              ELSE '[]'::jsonb
            END
          ) AS elem
        WHERE o."placedAt" >= ${start}
          AND o."status" NOT IN ('CANCELLED', 'RETURNED')
          AND COALESCE((elem->>'custom')::boolean, false) = false
        GROUP BY 1, 2
        ORDER BY count DESC
        LIMIT 10
      `,
    ]);

    const garments = garmentRows.map((row) => ({
      key: row.key,
      label: row.label,
      jobs: Number(row.jobs),
      revenue: Number(row.revenue),
    }));

    return {
      topGarments: [...garments].sort((a, b) => b.jobs - a.jobs).slice(0, 10),
      topOptions: optionRows.map((row) => ({
        groupKey: row.groupKey ?? 'unknown',
        label: row.label ?? row.groupKey ?? 'Unknown',
        count: Number(row.count),
        revenue: Number(row.revenue),
      })),
      revenueByGarment: [...garments]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
        .map((row) => ({ label: row.label, revenue: row.revenue })),
    };
  }

  /**
   * Store-wide health metrics that fall outside the main dashboard: funnel,
   * geography, fulfilment speed and payment mix, over the trailing `days`.
   */
  async extendedAnalytics(days = 30): Promise<ExtendedAnalytics> {
    const start = this.windowStart(days);

    const [
      cartAbandonment,
      returnedOrders,
      cancelledOrders,
      categoryRows,
      fulfilmentRows,
      paymentRows,
      cityRows,
    ] = await Promise.all([
      // Every status counts toward ordersPlaced here, not just countsAsSale:
      // an order that was later cancelled still means the cart converted at
      // checkout, and returnRate below reuses this same all-statuses total
      // as its denominator.
      this.cartAbandonment(start),
      this.prisma.order.count({ where: { placedAt: { gte: start }, status: 'RETURNED' } }),
      this.prisma.order.count({ where: { placedAt: { gte: start }, status: 'CANCELLED' } }),

      this.prisma.$queryRaw<Array<{ category: string; revenue: bigint }>>`
        SELECT COALESCE(ct."name", 'Uncategorised') AS category,
               COALESCE(SUM(oi."lineTotal"), 0) AS revenue
        FROM "OrderItem" oi
        JOIN "Order" o ON o.id = oi."orderId"
        LEFT JOIN "Product" p ON p.id = oi."productId"
        LEFT JOIN "Category" c ON c.id = p."categoryId"
        LEFT JOIN "CategoryTranslation" ct ON ct."categoryId" = c.id AND ct.locale = 'en'
        WHERE o."placedAt" >= ${start}
          AND o."status" NOT IN ('CANCELLED', 'RETURNED')
        GROUP BY 1
        ORDER BY revenue DESC
        LIMIT 10
      `,

      this.prisma.$queryRaw<Array<{ days: number | null }>>`
        SELECT AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "placedAt")) / 86400.0)::float8 AS days
        FROM "Order"
        WHERE "placedAt" >= ${start}
          AND "status" NOT IN ('CANCELLED', 'RETURNED')
          AND "deliveredAt" IS NOT NULL
      `,

      this.prisma.payment.groupBy({
        by: ['provider'],
        where: { status: 'PAID', paidAt: { gte: start } },
        _count: { _all: true },
        _sum: { amount: true },
      }),

      this.prisma.$queryRaw<Array<{ city: string; revenue: bigint }>>`
        SELECT COALESCE("shippingAddress"->>'city', 'Unknown') AS city,
               COALESCE(SUM("grandTotal"), 0) AS revenue
        FROM "Order"
        WHERE "placedAt" >= ${start}
          AND "status" NOT IN ('CANCELLED', 'RETURNED')
        GROUP BY 1
        ORDER BY revenue DESC
        LIMIT 10
      `,
    ]);

    const totalOrders = cartAbandonment.ordersPlaced;
    const returnCancelCount = returnedOrders + cancelledOrders;

    return {
      cartAbandonment,
      revenueByCategory: categoryRows.map((row) => ({
        category: row.category,
        revenue: Number(row.revenue),
      })),
      returnRate: {
        totalOrders,
        returned: returnedOrders,
        cancelled: cancelledOrders,
        rate: totalOrders > 0 ? round1((returnCancelCount / totalOrders) * 100) : 0,
      },
      averageFulfillmentDays: round1(fulfilmentRows[0]?.days ?? 0),
      paymentMethodSplit: paymentRows.map((row) => ({
        provider: row.provider,
        count: row._count._all,
        amount: row._sum.amount ?? 0,
      })),
      revenueByCity: cityRows.map((row) => ({
        city: row.city,
        revenue: Number(row.revenue),
      })),
    };
  }

  /**
   * Visitor volume and the view -> cart -> checkout -> order funnel, over the
   * trailing `days`.
   */
  async visitorAnalytics(days = 30): Promise<VisitorAnalytics> {
    const currentStart = this.windowStart(days);
    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - days);

    const [
      visitorRows,
      productViews,
      addToCart,
      checkoutStarted,
      purchasesCompleted,
      sourceRows,
      cartAbandonment,
    ] = await Promise.all([
      // Both windows come off one scan, filtered by the same lower bound, so
      // this stays a single index-friendly query rather than two.
      this.prisma.$queryRaw<Array<{ current: bigint; previous: bigint }>>`
        SELECT
          COUNT(DISTINCT "sessionId") FILTER (WHERE "createdAt" >= ${currentStart}) AS current,
          COUNT(DISTINCT "sessionId") FILTER (
            WHERE "createdAt" >= ${previousStart} AND "createdAt" < ${currentStart}
          ) AS previous
        FROM "AnalyticsEvent"
        WHERE "createdAt" >= ${previousStart}
      `,

      this.prisma.analyticsEvent.count({
        where: { type: 'page_view', path: { contains: '/product/' }, createdAt: { gte: currentStart } },
      }),
      this.prisma.analyticsEvent.count({
        where: { type: 'add_to_cart', createdAt: { gte: currentStart } },
      }),
      this.prisma.analyticsEvent.count({
        where: { type: 'checkout_started', createdAt: { gte: currentStart } },
      }),
      this.prisma.order.count({
        where: { placedAt: { gte: currentStart }, status: { notIn: VOID_STATUSES } },
      }),

      this.prisma.analyticsEvent.groupBy({
        by: ['source'],
        where: { type: 'page_view', createdAt: { gte: currentStart } },
        _count: { _all: true },
      }),

      this.cartAbandonment(currentStart),
    ]);

    const totalVisitors = Number(visitorRows[0]?.current ?? 0);
    const previousVisitors = Number(visitorRows[0]?.previous ?? 0);
    const totalPageViews = sourceRows.reduce((sum, row) => sum + row._count._all, 0);

    return {
      totalVisitors,
      visitorsChangePercent:
        previousVisitors > 0
          ? round1(((totalVisitors - previousVisitors) / previousVisitors) * 100)
          : null,
      funnel: { productViews, addToCart, checkoutStarted, purchasesCompleted },
      trafficSources: sourceRows.map((row) => ({
        source: row.source,
        count: row._count._all,
        percent: totalPageViews > 0 ? round1((row._count._all / totalPageViews) * 100) : 0,
      })),
      abandonedCarts: cartAbandonment.abandonedCarts,
    };
  }

  /**
   * WO-D.1 (10-admin-dashboard.md Track D) — the ageing table and by-city/
   * by-payment breakdowns `extendedAnalytics()` doesn't cover. That
   * endpoint's `revenueByCity`/`paymentMethodSplit` are already-completed
   * sales (PAID payments, revenue only, trailing window); this is a live
   * snapshot of OPEN orders — not yet DELIVERED, CANCELLED or RETURNED —
   * so it takes no `days` window, the same as `summary()`'s
   * `needsAttention.pendingOrders`. Ships against the live "one endpoint,
   * one screen" idiom (ADR-019/020) — Track A's report-registry catalog
   * this doc assumes was never built.
   *
   * EXPLAIN (test DB, ~10 orders): every query here plans a sequential
   * scan, not an index scan — correctly, at this row count Postgres's own
   * cost estimator prefers it. `@@index([status, placedAt])` on `Order`
   * exists (orders.prisma) and is what the planner will switch to once a
   * real deployment's row count makes it cheaper; nothing here needs a new
   * index today.
   */
  async ordersOverview(): Promise<OrdersOverview> {
    const [ageingRows, oldestOpen, cityRows, paymentRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ bucket: string; count: bigint }>>`
        SELECT
          CASE
            WHEN now() - "placedAt" < interval '2 days' THEN '0-1 days'
            WHEN now() - "placedAt" < interval '4 days' THEN '2-3 days'
            WHEN now() - "placedAt" < interval '8 days' THEN '4-7 days'
            ELSE '8+ days'
          END AS bucket,
          COUNT(*) AS count
        FROM "Order"
        WHERE "status" IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED')
        GROUP BY 1
      `,

      // The 20 oldest open orders — a fulfilment desk's actual worklist, not
      // a ranking that needs a bigger LIMIT. status+placedAt is indexed
      // (orders.prisma @@index([status, placedAt])).
      this.prisma.order.findMany({
        where: { status: { in: OPEN_ORDER_STATUSES } },
        orderBy: { placedAt: 'asc' },
        take: 20,
        select: { id: true, number: true, status: true, placedAt: true },
      }),

      this.prisma.$queryRaw<Array<{ city: string; count: bigint; avg_age_days: number | null }>>`
        SELECT COALESCE("shippingAddress"->>'city', 'Unknown') AS city,
               COUNT(*) AS count,
               AVG(EXTRACT(EPOCH FROM (now() - "placedAt")) / 86400.0)::float8 AS avg_age_days
        FROM "Order"
        WHERE "status" IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED')
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 10
      `,

      // DISTINCT ON picks each order's first-ever payment attempt
      // (createdAt ascending), so an order with a failed-then-retried
      // payment is counted once, under the method actually tried first.
      this.prisma.$queryRaw<Array<{ provider: string; count: bigint; avg_age_days: number | null }>>`
        SELECT provider, COUNT(*) AS count, AVG(age_days)::float8 AS avg_age_days
        FROM (
          SELECT DISTINCT ON (p."orderId")
            p.provider,
            EXTRACT(EPOCH FROM (now() - o."placedAt")) / 86400.0 AS age_days
          FROM "Payment" p
          JOIN "Order" o ON o.id = p."orderId"
          WHERE o."status" IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED')
          ORDER BY p."orderId", p."createdAt" ASC
        ) first_payment
        GROUP BY provider
        ORDER BY count DESC
      `,
    ]);

    const bucketOrder = ['0-1 days', '2-3 days', '4-7 days', '8+ days'];
    const bucketCounts = new Map(ageingRows.map((row) => [row.bucket, Number(row.count)]));
    const now = Date.now();

    return {
      ageing: bucketOrder.map((label) => ({ label, count: bucketCounts.get(label) ?? 0 })),
      oldestOpen: oldestOpen.map((order) => ({
        id: order.id,
        number: order.number,
        status: order.status,
        placedAt: order.placedAt.toISOString(),
        ageDays: Math.floor((now - order.placedAt.getTime()) / 86_400_000),
      })),
      byCity: cityRows.map((row) => ({
        city: row.city,
        count: Number(row.count),
        avgAgeDays: round1(row.avg_age_days ?? 0),
      })),
      byPayment: paymentRows.map((row) => ({
        provider: row.provider,
        count: Number(row.count),
        avgAgeDays: round1(row.avg_age_days ?? 0),
      })),
    };
  }

  /**
   * WO-69.1 (69-order-lifecycle-status-dashboard.md) — the one status
   * aggregate this repository's own dashboard never got: a single
   * `GROUP BY status`, mapped onto the promotional list's own three
   * buckets. `Order.status` remains the one source of truth; the three
   * buckets are a read-time display grouping, never a second column.
   * `locationId`, when given, scopes to that branch exactly like every
   * other order-based read in this repository already is — restated here
   * rather than defaulted, since an unscoped "all locations" read is
   * exactly the implicit cross-branch read `CLAUDE.md`'s own three-axes
   * table forbids.
   */
  async orderLifecycleBreakdown(locationId?: string): Promise<OrderLifecycleBreakdown> {
    const rows = await this.prisma.order.groupBy({
      by: ['status'],
      where: locationId ? { locationId } : undefined,
      _count: { _all: true },
    });

    const counts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as Record<OrderStatus, number>;
    for (const row of rows) counts[row.status] = row._count._all;

    const pending = OPEN_ORDER_STATUSES.reduce((sum, status) => sum + counts[status], 0);
    const completed = counts.DELIVERED;
    const voided = counts.CANCELLED + counts.RETURNED;

    return {
      counts,
      pending,
      completed,
      voided,
      rows: [
        { label: 'Pending', count: pending, statusFilter: OPEN_ORDER_STATUSES.join(',') },
        { label: 'Completed', count: completed, statusFilter: 'DELIVERED' },
        { label: 'Voided', count: voided, statusFilter: 'CANCELLED,RETURNED' },
      ],
    };
  }

  /**
   * WO-D.1 — average and median time spent in each pipeline state, from
   * `OrderStatusEvent` (orders.prisma). Every row there already IS a
   * transition: `fromStatus` is always the order's status at the moment of
   * the call (`OrdersService.changeStatus` writes `fromStatus: order.status`,
   * a non-nullable column), never a genesis row — so "time in fromStatus" is
   * just the gap to the PREVIOUS event for that same order, or to
   * `placedAt` for an order's first-ever transition.
   *
   * EXPLAIN (test DB, ~10 orders): a sequential scan on both tables — the
   * right plan at this size. `@@index([orderId, createdAt])` on
   * `OrderStatusEvent` (orders.prisma) is exactly the join/window key this
   * query needs and is what the planner switches to once row count justifies
   * it; no new index needed.
   */
  async ordersFulfilment(days = 90): Promise<OrdersFulfilment> {
    const start = this.windowStart(days);

    const rows = await this.prisma.$queryRaw<
      Array<{
        from_status: string;
        to_status: string;
        count: bigint;
        avg_hours: number | null;
        median_hours: number | null;
      }>
    >`
      WITH gaps AS (
        SELECT
          e."fromStatus" AS from_status,
          e."toStatus" AS to_status,
          EXTRACT(EPOCH FROM (
            e."createdAt" - COALESCE(
              LAG(e."createdAt") OVER (PARTITION BY e."orderId" ORDER BY e."createdAt"),
              o."placedAt"
            )
          )) / 3600.0 AS hours
        FROM "OrderStatusEvent" e
        JOIN "Order" o ON o.id = e."orderId"
        WHERE e."createdAt" >= ${start} AND e."fromStatus" IS NOT NULL
      )
      SELECT
        from_status,
        to_status,
        COUNT(*) AS count,
        AVG(hours)::float8 AS avg_hours,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY hours)::float8 AS median_hours
      FROM gaps
      GROUP BY from_status, to_status
    `;

    const pipelineOrder = [
      'PENDING',
      'CONFIRMED',
      'PROCESSING',
      'READY_TO_SHIP',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
      'RETURNED',
    ];
    const rank = (status: string) => {
      const index = pipelineOrder.indexOf(status);
      return index === -1 ? pipelineOrder.length : index;
    };

    return {
      transitions: rows
        .map((row) => ({
          from: row.from_status,
          to: row.to_status,
          count: Number(row.count),
          avgHours: round1(row.avg_hours ?? 0),
          medianHours: round1(row.median_hours ?? 0),
        }))
        .sort((a, b) => rank(a.from) - rank(b.from) || rank(a.to) - rank(b.to)),
    };
  }

  /**
   * WO-D.2 (10-admin-dashboard.md Track D) — what the business has
   * committed to buy, actually received, been billed for, and still owes.
   * `comparison()`'s own `purchases` bucket already defines "received
   * spend" as Σ GoodsReceiptItem.quantity × landedUnitCost by
   * GoodsReceipt.receivedAt (its own docstring: "a purchase order is an
   * intention, a goods receipt is a cost") — reused verbatim here as
   * `totals.received`/`series.received`, so the two screens can never
   * quietly disagree about the same fact.
   *
   * `unpaid` is a live AP balance (`amount - amountPaid` on every non-PAID
   * `SupplierBill`, the exact figure `PurchasingService.recordPayment`
   * already computes at purchasing.service.ts:611), not windowed by
   * `days` — an old unpaid bill is still owed today.
   *
   * PERMISSION NOTE: unlike `comparison()`'s `purchases` bucket (visible to
   * any `analytics.view` holder), the controller requires `purchasing.manage`
   * for this whole endpoint — purchasing spend is domain-sensitive in a way
   * the general sales/purchases/expenses comparison isn't. It does NOT
   * additionally hard-gate behind `inventory.view_cost`: every figure here
   * is an aggregate spend total, not a per-unit cost — exactly the kind of
   * figure `comparison()`'s own `purchases` bucket already treats as not
   * margin-revealing on its own (cost-fields.ts's VIEW_COST gate exists for
   * per-item `unitCost`/`costPrice`, which this endpoint never returns).
   *
   * EXPLAIN (test DB, ~10 rows across the touched tables): every query
   * plans a sequential scan — correct at this size. `PurchaseOrder`'s
   * `status`/`sentAt`, `GoodsReceipt.receivedAt` and `SupplierBill`'s
   * `status`/`dueAt` index (purchasing.prisma) are what the planner
   * switches to once row count justifies it.
   */
  async purchasingSpend(days: number): Promise<PurchasingSpend> {
    const start = this.windowStart(days);
    const timeZone = await this.settings.get<string>(SettingKey.StoreTimezone);

    const [orderedRows, receivedRows, billedTotal, unpaidRows, categoryRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ day: string; ordered: bigint }>>(
        `SELECT ${shopDayExpr('"sentAt"', timeZone)} AS day, COALESCE(SUM("total"), 0) AS ordered
         FROM "PurchaseOrder"
         WHERE "sentAt" >= $1 AND status != 'CANCELLED'
         GROUP BY 1`,
        start,
      ),

      this.prisma.$queryRawUnsafe<Array<{ day: string; received: bigint }>>(
        `SELECT ${shopDayExpr('gr."receivedAt"', timeZone)} AS day,
                COALESCE(SUM(gri."quantity" * gri."landedUnitCost"), 0) AS received
         FROM "GoodsReceiptItem" gri
         JOIN "GoodsReceipt" gr ON gr.id = gri."goodsReceiptId"
         WHERE gr."receivedAt" >= $1
         GROUP BY 1`,
        start,
      ),

      this.prisma.supplierBill.aggregate({
        where: { issuedAt: { gte: start } },
        _sum: { amount: true },
      }),

      // Not windowed — an AP balance is what's owed right now, whenever it
      // was billed. amount/amountPaid, not baseAmountMinor: the schema's
      // own comment on SupplierBill.amountPaid — "the same unit as amount,
      // so amount - amountPaid is always the outstanding balance in the
      // bill's own currency without a conversion" — is the same assumption
      // purchasing.service.ts:611 already makes for this exact figure.
      this.prisma.supplierBill.findMany({
        where: { status: { not: 'PAID' } },
        select: { amount: true, amountPaid: true },
      }),

      this.prisma.$queryRaw<Array<{ category: string; spend: bigint }>>`
        SELECT COALESCE(ct."name", 'Uncategorised') AS category,
               COALESCE(SUM(gri."quantity" * gri."landedUnitCost"), 0) AS spend
        FROM "GoodsReceiptItem" gri
        JOIN "GoodsReceipt" gr ON gr.id = gri."goodsReceiptId"
        LEFT JOIN "ProductVariant" v ON v.id = gri."variantId"
        LEFT JOIN "Product" p ON p.id = v."productId"
        LEFT JOIN "Category" c ON c.id = p."categoryId"
        LEFT JOIN "CategoryTranslation" ct ON ct."categoryId" = c.id AND ct.locale = 'en'
        WHERE gr."receivedAt" >= ${start}
        GROUP BY 1
        ORDER BY spend DESC
        LIMIT 10
      `,
    ]);

    const dayKeys = shopDayKeys(start, days, timeZone);
    const orderedByDay = new Map(orderedRows.map((row) => [row.day, Number(row.ordered)]));
    const receivedByDay = new Map(receivedRows.map((row) => [row.day, Number(row.received)]));
    const unpaid = unpaidRows.reduce((sum, bill) => sum + (bill.amount - bill.amountPaid), 0);

    return {
      totals: {
        ordered: orderedRows.reduce((sum, row) => sum + Number(row.ordered), 0),
        received: receivedRows.reduce((sum, row) => sum + Number(row.received), 0),
        billed: billedTotal._sum.amount ?? 0,
        unpaid,
      },
      series: dayKeys.map((day) => ({
        date: day,
        ordered: orderedByDay.get(day) ?? 0,
        received: receivedByDay.get(day) ?? 0,
      })),
      byCategory: categoryRows.map((row) => ({ category: row.category, spend: Number(row.spend) })),
    };
  }

  /**
   * WO-D.2 — per-supplier spend, order count, on-time rate and average
   * lead time. The spend/order-count half reuses `purchasesBySupplierCsv`'s
   * own join shape (reports.service.ts) — `GoodsReceiptItem.quantity ×
   * landedUnitCost`, joined `PurchaseOrder` → `Supplier` — with a `LIMIT`
   * that CSV export doesn't need but this ranked screen does.
   *
   * On-time rate reuses the exact eligibility rule the weekly OTIF
   * scorecard already ships (`supply-chain-digest.cron.ts`'s
   * `sendSupplierScorecards`): a PO counts once it has a promised date
   * (`expectedAt`) AND is either already RECEIVED/PARTIAL or SENT-but-
   * overdue — never an in-flight order still inside its promised window.
   * "On time" here means on-time alone, not OTIF's stricter
   * on-time-AND-in-full.
   *
   * Lead time has no existing precedent (`Supplier.leadTimeDays` is a
   * supplier's own QUOTED lead time, a policy value — not measured). This
   * defines it as the actual gap `lastReceiptAt - sentAt`, averaged over
   * every PO that has both — a wider population than on-time rate's, since
   * lead time needs no promised date to be meaningful.
   *
   * No `inventory.view_cost` gate on `spend`/`share`, for the same reason
   * `purchasingSpend()` above has none: both are aggregate spend figures,
   * the same kind `comparison()`'s own `purchases` bucket already shows to
   * any `analytics.view` holder — `purchasing.manage`, checked by the
   * controller, is this report's real gate.
   */
  async purchasingSuppliers(days: number): Promise<PurchasingSuppliers> {
    const start = this.windowStart(days);

    const spendRows = await this.prisma.$queryRaw<
      Array<{ supplierId: string; name: string; spend: bigint; orders: bigint }>
    >`
      SELECT s.id AS "supplierId", s.name,
             COALESCE(SUM(gri."quantity" * gri."landedUnitCost"), 0) AS spend,
             COUNT(DISTINCT po.id) AS orders
      FROM "Supplier" s
      JOIN "PurchaseOrder" po ON po."supplierId" = s.id
      JOIN "GoodsReceipt" gr ON gr."purchaseOrderId" = po.id AND gr."receivedAt" >= ${start}
      JOIN "GoodsReceiptItem" gri ON gri."goodsReceiptId" = gr.id
      GROUP BY s.id, s.name
      ORDER BY spend DESC
      LIMIT 20
    `;

    if (spendRows.length === 0) return { rows: [] };

    const totalSpend = spendRows.reduce((sum, row) => sum + Number(row.spend), 0);
    const now = new Date();

    // WO-9.9 — all-time, not windowed by `days` (see PurchasingSupplierRow's
    // own doc comment); DISTINCT ON collapses a supplier supplying several
    // variants of the same product to one row per (supplier, product) so a
    // multi-size product isn't weighted several times in the average.
    const qualityRows = await this.prisma.$queryRaw<
      Array<{ supplierId: string; avgRating: number | null; reviewCount: bigint }>
    >(Prisma.sql`
      SELECT "supplierId", AVG(rating)::float AS "avgRating", COUNT(*) AS "reviewCount"
      FROM (
        SELECT DISTINCT sp."supplierId", r.id, r.rating
        FROM "SupplierProduct" sp
        JOIN "ProductVariant" pv ON pv.id = sp."variantId"
        JOIN "Review" r ON r."productId" = pv."productId" AND r.status = 'PUBLISHED'
        WHERE sp."supplierId" IN (${Prisma.join(spendRows.map((row) => row.supplierId))})
      ) per_review
      GROUP BY "supplierId"
    `);
    const qualityBySupplier = new Map(
      qualityRows.map((row) => [row.supplierId, { avgRating: row.avgRating, reviewCount: Number(row.reviewCount) }]),
    );

    // Bounded to the suppliers the ranking above already selected — not an
    // unbounded scan of every supplier's every PO.
    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: spendRows.map((row) => row.supplierId) } },
      select: {
        id: true,
        purchaseOrders: {
          where: { sentAt: { gte: start } },
          select: {
            expectedAt: true,
            sentAt: true,
            status: true,
            receipts: { select: { receivedAt: true } },
          },
        },
      },
    });

    const timingBySupplier = new Map(
      suppliers.map((supplier) => {
        let onTimeEligible = 0;
        let onTimeCount = 0;
        let leadDaySum = 0;
        let leadDayCount = 0;

        for (const po of supplier.purchaseOrders) {
          const lastReceiptAt = po.receipts.reduce<Date | null>(
            (latest, receipt) => (!latest || receipt.receivedAt > latest ? receipt.receivedAt : latest),
            null,
          );

          if (po.sentAt && lastReceiptAt) {
            leadDaySum += (lastReceiptAt.getTime() - po.sentAt.getTime()) / 86_400_000;
            leadDayCount += 1;
          }

          const eligible = po.expectedAt !== null && (po.status !== 'SENT' || po.expectedAt < now);
          if (eligible) {
            onTimeEligible += 1;
            if (lastReceiptAt !== null && lastReceiptAt <= po.expectedAt!) onTimeCount += 1;
          }
        }

        return [
          supplier.id,
          {
            onTimeRateBps: onTimeEligible > 0 ? Math.round((onTimeCount / onTimeEligible) * 10_000) : null,
            avgLeadDays: leadDayCount > 0 ? round1(leadDaySum / leadDayCount) : null,
          },
        ] as const;
      }),
    );

    return {
      rows: spendRows.map((row) => {
        const spend = Number(row.spend);
        const timing = timingBySupplier.get(row.supplierId);
        const quality = qualityBySupplier.get(row.supplierId);
        return {
          supplierId: row.supplierId,
          name: row.name,
          spend,
          orders: Number(row.orders),
          onTimeRateBps: timing?.onTimeRateBps ?? null,
          avgLeadDays: timing?.avgLeadDays ?? null,
          share: totalSpend > 0 ? Math.round((spend / totalSpend) * 10_000) : 0,
          avgProductRating: quality ? round1(quality.avgRating ?? 0) : null,
          productReviewCount: quality?.reviewCount ?? 0,
        };
      }),
    };
  }

  /**
   * WO-D.3 (10-admin-dashboard.md Track D) — richer than `summary()`'s own
   * `topProducts` (grouped by `oi."nameEn"` text alone, no ids, no
   * cost/margin — fine for a dashboard glance, not for a report whose rows
   * must link somewhere). Grouped by `OrderItem`'s own snapshot columns
   * (`productId`, `variantId`, `sku`, `nameEn`) instead — the same columns
   * already on the line, so no join to `Product`/`ProductVariant` is
   * needed. `productId`/`variantId` are nullable on `OrderItem` by design
   * ("kept for reporting; nullable so deleting a product cannot delete
   * history") — a null one simply can't be linked from the screen.
   *
   * OMIT, not null, for `cogs`/`marginBps` without `inventory.view_cost` —
   * a deliberate departure from `comparison()`'s null convention just above
   * in this file. Two precedents disagree here: `comparison()`'s own
   * cost fields are null (the analytics idiom), but `cost-fields.ts`'s
   * product-domain convention — the one this report's subject (products,
   * cost prices) actually belongs to — is explicit: "the safe default is
   * to OMIT cost, so callers that forget the check are safe, not leaky."
   * This report sits with the products/cost-price domain, and the WO's own
   * row shape (`cogs?`, `marginBps?` — optional keys, not nullable ones)
   * reads the same way. Chosen: omit.
   */
  async productsTopSellers(days: number, includeCost: boolean): Promise<ProductsTopSellers> {
    const start = this.windowStart(days);
    const voidStatusList = VOID_STATUSES.map((status) => `'${status}'`).join(', ');

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        productId: string | null;
        variantId: string | null;
        sku: string | null;
        name: string;
        units: bigint;
        revenue: bigint;
        cogs: bigint;
      }>
    >(
      `SELECT oi."productId" AS "productId", oi."variantId" AS "variantId", oi.sku, oi."nameEn" AS name,
              COALESCE(SUM(oi.quantity), 0) AS units,
              COALESCE(SUM(oi."lineTotal"), 0) AS revenue,
              COALESCE(SUM(oi."unitCost" * oi.quantity), 0) AS cogs
       FROM "OrderItem" oi
       JOIN "Order" o ON o.id = oi."orderId"
       WHERE o."placedAt" >= $1 AND o.status NOT IN (${voidStatusList})
       GROUP BY oi."productId", oi."variantId", oi.sku, oi."nameEn"
       ORDER BY revenue DESC
       LIMIT 20`,
      start,
    );

    return {
      rows: rows.map((row) => {
        const revenue = Number(row.revenue);
        const base = {
          productId: row.productId,
          variantId: row.variantId,
          sku: row.sku ?? '—',
          name: row.name,
          units: Number(row.units),
          revenue,
        };
        if (!includeCost) return base;
        const cogs = Number(row.cogs);
        return { ...base, cogs, marginBps: revenue > 0 ? Math.round(((revenue - cogs) / revenue) * 10_000) : 0 };
      }),
    };
  }

  /**
   * WO-D.3 — the same `isSlowMover` population `InventoryService
   * .getSlowMovers()` already lists (isActive, in stock,
   * `VariantSalesStat.isSlowMover`), ranked and capped here where that
   * method isn't. `daysSinceLastSale` is NOT a stored column —
   * `VariantSalesStat` only persists `lastSoldAt`/`ageDays`
   * (`InventoryCron.computeNightlyStats()` computes the day-count in-loop
   * and never writes it back) — so it's re-derived here with the exact
   * same formula the cron uses: days since `lastSoldAt`, or `ageDays` for
   * a variant that has never sold at all.
   */
  async productsSlowSellers(): Promise<ProductsSlowSellers> {
    const now = Date.now();
    const variants = await this.prisma.productVariant.findMany({
      where: { isActive: true, stock: { gt: 0 }, salesStat: { isSlowMover: true } },
      orderBy: { salesStat: { ageDays: 'desc' } },
      take: 20,
      select: {
        id: true,
        sku: true,
        productId: true,
        product: { select: { translations: { where: { locale: 'en' }, select: { name: true } } } },
        salesStat: { select: { lastSoldAt: true, ageDays: true } },
      },
    });

    return {
      rows: variants.map((variant) => {
        const lastSoldAt = variant.salesStat?.lastSoldAt ?? null;
        const ageDays = variant.salesStat?.ageDays ?? 0;
        const daysSinceLastSale = lastSoldAt ? Math.floor((now - lastSoldAt.getTime()) / 86_400_000) : ageDays;
        return {
          productId: variant.productId,
          variantId: variant.id,
          sku: variant.sku,
          name: variant.product?.translations[0]?.name ?? variant.sku,
          daysSinceLastSale,
          ageDays,
        };
      }),
    };
  }

  /**
   * WO-D.3 — the same category join chain `extendedAnalytics()`'s
   * `revenueByCategory` already uses (`OrderItem` → `Order` → `Product` →
   * `Category` → `CategoryTranslation`, `COALESCE(ct.name,
   * 'Uncategorised')`), extended with a product count and this row's own
   * `categoryId` (null for the Uncategorised bucket — `Product.categoryId`
   * is genuinely nullable, so null is the correct value here, not a
   * placeholder). `series` is the SAME window's overall daily product
   * revenue — one trend line behind the category breakdown, the same
   * "one axis" idiom `comparison()`'s own docstring names.
   */
  async productsCategories(days: number): Promise<ProductsCategories> {
    const start = this.windowStart(days);
    const timeZone = await this.settings.get<string>(SettingKey.StoreTimezone);
    const voidStatusList = VOID_STATUSES.map((status) => `'${status}'`).join(', ');

    const [categoryRows, seriesRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        Array<{ categoryId: string | null; name: string; revenue: bigint; units: bigint; productCount: bigint }>
      >(
        `SELECT c.id AS "categoryId", COALESCE(ct.name, 'Uncategorised') AS name,
                COALESCE(SUM(oi."lineTotal"), 0) AS revenue,
                COALESCE(SUM(oi.quantity), 0) AS units,
                COUNT(DISTINCT p.id) AS "productCount"
         FROM "OrderItem" oi
         JOIN "Order" o ON o.id = oi."orderId"
         LEFT JOIN "Product" p ON p.id = oi."productId"
         LEFT JOIN "Category" c ON c.id = p."categoryId"
         LEFT JOIN "CategoryTranslation" ct ON ct."categoryId" = c.id AND ct.locale = 'en'
         WHERE o."placedAt" >= $1 AND o.status NOT IN (${voidStatusList})
         GROUP BY c.id, ct.name
         ORDER BY revenue DESC
         LIMIT 10`,
        start,
      ),

      this.prisma.$queryRawUnsafe<Array<{ day: string; revenue: bigint }>>(
        `SELECT ${shopDayExpr('"placedAt"', timeZone)} AS day, COALESCE(SUM("grandTotal"), 0) AS revenue
         FROM "Order"
         WHERE "placedAt" >= $1 AND status NOT IN (${voidStatusList})
         GROUP BY 1`,
        start,
      ),
    ]);

    const totalRevenue = categoryRows.reduce((sum, row) => sum + Number(row.revenue), 0);
    const dayKeys = shopDayKeys(start, days, timeZone);
    const revenueByDay = new Map(seriesRows.map((row) => [row.day, Number(row.revenue)]));

    return {
      rows: categoryRows.map((row) => {
        const revenue = Number(row.revenue);
        return {
          categoryId: row.categoryId,
          name: row.name,
          revenue,
          units: Number(row.units),
          productCount: Number(row.productCount),
          share: totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 10_000) : 0,
        };
      }),
      series: dayKeys.map((day) => ({ date: day, revenue: revenueByDay.get(day) ?? 0 })),
    };
  }

  /**
   * WO-57.1 (57-multiday-category-velocity.md) — category × day, not
   * category OR day: `productsCategories()` above already computes a
   * top-10 revenue snapshot and a category-agnostic daily series, but
   * neither is "one category's own revenue broken out day by day," which
   * this is. Reuses the identical join chain, `VOID_STATUSES` exclusion
   * and shop-day boundary `productsCategories()` already established —
   * never a second, possibly-drifting definition of "a day's sales."
   *
   * The top 5 categories by revenue in the window get their own named
   * series; every other category (including a genuinely uncategorised
   * product, `categoryId IS NULL`) is folded into one "Other" series —
   * doc 57's own "never more than a legible handful of lines" acceptance
   * criterion, enforced here rather than left to the chart to truncate.
   * Response rows are zero-filled for every day in the window (never a
   * sparse array a caller has to re-align against its own day axis), and
   * shaped as `{date, [seriesKey]: number}` rows plus a `series` list
   * naming each key — the exact shape `TimeSeriesChart`/`TimeSeriesBlock`
   * already render for a report's own static series, extended here to a
   * per-request, data-driven series list (report-registry.ts's new
   * `dynamic-timeseries` block kind) rather than inventing a second chart
   * component for what is otherwise an identical rendering job.
   */
  async categoryVelocity(days: number = 14): Promise<CategoryVelocitySeries> {
    const start = this.windowStart(days);
    const timeZone = await this.settings.get<string>(SettingKey.StoreTimezone);
    const voidStatusList = VOID_STATUSES.map((status) => `'${status}'`).join(', ');
    const TOP_N = 5;

    const [totalsRows, dailyRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ categoryId: string | null; name: string; revenue: bigint }>>(
        `SELECT c.id AS "categoryId", COALESCE(ct.name, 'Uncategorised') AS name,
                COALESCE(SUM(oi."lineTotal"), 0) AS revenue
         FROM "OrderItem" oi
         JOIN "Order" o ON o.id = oi."orderId"
         LEFT JOIN "Product" p ON p.id = oi."productId"
         LEFT JOIN "Category" c ON c.id = p."categoryId"
         LEFT JOIN "CategoryTranslation" ct ON ct."categoryId" = c.id AND ct.locale = 'en'
         WHERE o."placedAt" >= $1 AND o.status NOT IN (${voidStatusList})
         GROUP BY c.id, ct.name
         ORDER BY revenue DESC
         LIMIT ${TOP_N}`,
        start,
      ),

      this.prisma.$queryRawUnsafe<Array<{ categoryId: string | null; day: string; revenue: bigint }>>(
        `SELECT c.id AS "categoryId", ${shopDayExpr('o."placedAt"', timeZone)} AS day,
                COALESCE(SUM(oi."lineTotal"), 0) AS revenue
         FROM "OrderItem" oi
         JOIN "Order" o ON o.id = oi."orderId"
         LEFT JOIN "Product" p ON p.id = oi."productId"
         LEFT JOIN "Category" c ON c.id = p."categoryId"
         WHERE o."placedAt" >= $1 AND o.status NOT IN (${voidStatusList})
         GROUP BY c.id, day`,
        start,
      ),
    ]);

    // A stable, synthetic key per top category — never the category's own
    // name, which can carry characters/spaces unsafe as an object key a
    // chart's own dataKey reads by exact string match.
    const topCategoryIds = new Set(totalsRows.map((row) => row.categoryId));
    const series = [
      ...totalsRows.map((row, index) => ({ key: `cat_${index}`, label: row.name })),
      { key: 'other', label: 'Other' },
    ];
    const keyByCategoryId = new Map(totalsRows.map((row, index) => [row.categoryId, `cat_${index}`]));

    const dayKeys = shopDayKeys(start, days, timeZone);
    const byDay = new Map<string, Record<string, number>>(dayKeys.map((day) => [day, {}]));
    for (const row of dailyRows) {
      const bucket = byDay.get(row.day);
      if (!bucket) continue; // outside the requested window's own day keys
      const key = topCategoryIds.has(row.categoryId) ? keyByCategoryId.get(row.categoryId)! : 'other';
      bucket[key] = (bucket[key] ?? 0) + Number(row.revenue);
    }

    return {
      series,
      days: dayKeys.map((day) => {
        const bucket = byDay.get(day) ?? {};
        const point: Record<string, string | number> = { date: day };
        for (const s of series) point[s.key] = bucket[s.key] ?? 0;
        return point as { date: string } & Record<string, number>;
      }),
    };
  }

  /**
   * WO-D.4 (10-admin-dashboard.md Track D) — what the stock on hand is
   * worth, right now. Every figure here is `stock × costPrice`
   * (`stockValuationCsv()`'s own definition, reports.service.ts) restricted
   * to `stock > 0` — a zero-stock, zero-cost SKU is not a valuation gap,
   * it is simply idle, so it is excluded from every total here rather than
   * diluting them. `unknownCostVariants` counts the ones that DO hold
   * stock with no cost basis (`costPrice: 0` — "never received against a
   * PO," per `ProductVariant.costPrice`'s own doc comment), which is a
   * real problem worth surfacing.
   *
   * This is a hard, whole-endpoint gate on `inventory.view_cost` — unlike
   * WO-D.2/D.3's aggregate spend/revenue totals, every field this report
   * returns IS cost data with no non-cost subset worth keeping; the
   * controller throws before calling this method at all without it,
   * mirroring `bom.controller.ts`'s `recipeCost()` precedent.
   *
   * EXPLAIN (test DB, ~10 variants): sequential scans throughout —
   * correct at this size. `ProductVariant`'s own `@@index([stock])`
   * (catalog.prisma) is what the planner uses once row count justifies it;
   * no new index needed.
   */
  async inventoryValuation(): Promise<InventoryValuation> {
    const [totalsRow, categoryRows, kindRows, ageingRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ units: bigint; value: bigint; unknownCostVariants: bigint }>>`
        SELECT COALESCE(SUM(stock), 0) AS units,
               COALESCE(SUM(stock * "costPrice"), 0) AS value,
               COUNT(*) FILTER (WHERE "costPrice" = 0) AS "unknownCostVariants"
        FROM "ProductVariant"
        WHERE stock > 0
      `,

      this.prisma.$queryRaw<
        Array<{ categoryId: string | null; name: string; units: bigint; value: bigint }>
      >`
        SELECT c.id AS "categoryId", COALESCE(ct."name", 'Uncategorised') AS name,
               COALESCE(SUM(v.stock), 0) AS units,
               COALESCE(SUM(v.stock * v."costPrice"), 0) AS value
        FROM "ProductVariant" v
        JOIN "Product" p ON p.id = v."productId"
        LEFT JOIN "Category" c ON c.id = p."categoryId"
        LEFT JOIN "CategoryTranslation" ct ON ct."categoryId" = c.id AND ct.locale = 'en'
        WHERE v.stock > 0
        GROUP BY c.id, ct."name"
        ORDER BY value DESC
        LIMIT 10
      `,

      this.prisma.$queryRaw<Array<{ kind: string; units: bigint; value: bigint }>>`
        SELECT p.kind,
               COALESCE(SUM(v.stock), 0) AS units,
               COALESCE(SUM(v.stock * v."costPrice"), 0) AS value
        FROM "ProductVariant" v
        JOIN "Product" p ON p.id = v."productId"
        WHERE v.stock > 0
        GROUP BY p.kind
        ORDER BY value DESC
      `,

      this.prisma.$queryRaw<Array<{ bucket: string; units: bigint; value: bigint }>>`
        SELECT
          CASE
            WHEN COALESCE(vs."ageDays", 0) <= 30 THEN '0-30 days'
            WHEN COALESCE(vs."ageDays", 0) <= 60 THEN '31-60 days'
            WHEN COALESCE(vs."ageDays", 0) <= 90 THEN '61-90 days'
            ELSE '90+ days'
          END AS bucket,
          COALESCE(SUM(v.stock), 0) AS units,
          COALESCE(SUM(v.stock * v."costPrice"), 0) AS value
        FROM "ProductVariant" v
        LEFT JOIN "VariantSalesStat" vs ON vs."variantId" = v.id
        WHERE v.stock > 0
        GROUP BY 1
      `,
    ]);

    const bucketOrder = ['0-30 days', '31-60 days', '61-90 days', '90+ days'];
    const ageingByBucket = new Map(ageingRows.map((row) => [row.bucket, row]));

    return {
      totals: {
        units: Number(totalsRow[0]?.units ?? 0),
        value: Number(totalsRow[0]?.value ?? 0),
        unknownCostVariants: Number(totalsRow[0]?.unknownCostVariants ?? 0),
      },
      byCategory: categoryRows.map((row) => ({
        categoryId: row.categoryId,
        name: row.name,
        units: Number(row.units),
        value: Number(row.value),
      })),
      byKind: kindRows.map((row) => ({ kind: row.kind, units: Number(row.units), value: Number(row.value) })),
      ageing: bucketOrder.map((label) => {
        const row = ageingByBucket.get(label);
        return { label, units: Number(row?.units ?? 0), value: Number(row?.value ?? 0) };
      }),
    };
  }

  /**
   * WO-D.4 — stock movement volume: how much moved in and out, by day and
   * by reason, plus the most recent individual movements. `delta`'s own
   * sign (`StockMovement.delta`'s doc comment: "positive = stock in,
   * negative = stock out") is trusted directly rather than inferred from
   * `reason`, the same convention WO-D.1's order-status timing trusted
   * `OrderStatusEvent`'s own recorded fields over re-deriving them.
   *
   * `series`/`byReason` here are flat, one-level aggregates — every other
   * Track D series in this file is (WO-D.1 through D.3's `series` fields
   * are all `Array<{date, ...numbers}>`, no nesting); a per-day reason
   * breakdown would be real complexity for a JSON shape no chart in this
   * codebase currently consumes.
   */
  async inventoryMovements(days: number): Promise<InventoryMovements> {
    const start = this.windowStart(days);
    const timeZone = await this.settings.get<string>(SettingKey.StoreTimezone);

    const [seriesRows, reasonRows, recent] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ day: string; in: bigint; out: bigint }>>(
        `SELECT ${shopDayExpr('"createdAt"', timeZone)} AS day,
                COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS "in",
                COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0) AS "out"
         FROM "StockMovement"
         WHERE "createdAt" >= $1
         GROUP BY 1`,
        start,
      ),

      this.prisma.$queryRaw<Array<{ reason: string; in: bigint; out: bigint; count: bigint }>>`
        SELECT reason,
               COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS "in",
               COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0) AS "out",
               COUNT(*) AS count
        FROM "StockMovement"
        WHERE "createdAt" >= ${start}
        GROUP BY reason
        ORDER BY count DESC
      `,

      this.prisma.stockMovement.findMany({
        where: { createdAt: { gte: start } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          variantId: true,
          delta: true,
          reason: true,
          createdAt: true,
          variant: {
            select: { sku: true, product: { select: { translations: { where: { locale: 'en' }, select: { name: true } } } } },
          },
        },
      }),
    ]);

    const dayKeys = shopDayKeys(start, days, timeZone);
    const inByDay = new Map(seriesRows.map((row) => [row.day, Number(row.in)]));
    const outByDay = new Map(seriesRows.map((row) => [row.day, Number(row.out)]));

    return {
      series: dayKeys.map((day) => ({ date: day, in: inByDay.get(day) ?? 0, out: outByDay.get(day) ?? 0 })),
      byReason: reasonRows.map((row) => ({
        reason: row.reason,
        in: Number(row.in),
        out: Number(row.out),
        count: Number(row.count),
      })),
      recent: recent.map((movement) => ({
        id: movement.id,
        variantId: movement.variantId,
        sku: movement.variant.sku,
        name: movement.variant.product?.translations[0]?.name ?? movement.variant.sku,
        reason: movement.reason,
        delta: movement.delta,
        createdAt: movement.createdAt.toISOString(),
      })),
    };
  }

  /**
   * WO-D.5 (10-admin-dashboard.md Track D) — the customer book, by where
   * they are, where they came from, and their lifecycle stage. `totals`
   * reuses `summary()`'s own `total`/`repeat`/`newThisMonth` queries
   * verbatim (`contact.count()`, `orderCount >= 2`, `createdAt >=` this
   * shop-month) rather than re-deriving the same three figures a second
   * way — the same "don't diverge" discipline `sales-revenue.ts` names
   * for revenue.
   *
   * EXPLAIN (test DB, ~10 contacts): sequential scans — correct at this
   * size. `Contact`'s own `@@index([status])` (crm.prisma) is what the
   * planner uses once row count justifies it; no new index needed.
   */
  async customersOverview(): Promise<CustomersOverview> {
    const now = new Date();
    const timeZone = await this.settings.get<string>(SettingKey.StoreTimezone);
    const startOfMonth = startOfShopMonth(now, timeZone);

    const [total, repeat, newThisMonth, cityRows, sourceRows, statusRows] = await Promise.all([
      this.prisma.contact.count(),
      this.prisma.contact.count({ where: { orderCount: { gte: 2 } } }),
      this.prisma.contact.count({ where: { createdAt: { gte: startOfMonth } } }),

      this.prisma.$queryRaw<Array<{ city: string; count: bigint }>>`
        SELECT COALESCE(city, 'Unknown') AS city, COUNT(*) AS count
        FROM "Contact"
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 10
      `,

      this.prisma.$queryRaw<Array<{ source: string; count: bigint }>>`
        SELECT source, COUNT(*) AS count
        FROM "Contact"
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 10
      `,

      this.prisma.$queryRaw<Array<{ status: string; count: bigint }>>`
        SELECT status, COUNT(*) AS count
        FROM "Contact"
        GROUP BY 1
        ORDER BY count DESC
      `,
    ]);

    return {
      totals: { total, repeat, newThisMonth },
      byCity: cityRows.map((row) => ({ city: row.city, count: Number(row.count) })),
      bySource: sourceRows.map((row) => ({ source: row.source, count: Number(row.count) })),
      byStatus: statusRows.map((row) => ({ status: row.status, count: Number(row.count) })),
    };
  }

  /**
   * WO-D.5 — cohort retention and the overall repeat rate. No existing
   * cohort/retention definition anywhere in this codebase to reuse or
   * diverge from, so both are defined here, deliberately narrowly:
   *
   *   - A cohort is a signup MONTH (`Contact.createdAt`, shop-local not
   *     needed — a month boundary is coarse enough that a timezone shift
   *     never moves a contact into a different one in practice).
   *   - "Retained" means the same thing `summary()`'s own `repeat` figure
   *     and `Contact.status: REPEAT` already mean: went on to place a
   *     SECOND order (`orderCount >= 2`) — not a time-windowed
   *     "purchased again within N days" curve, which nothing in this
   *     codebase defines and this report doesn't ask for beyond
   *     `{cohort, size, retained}`.
   *   - `repeatRateBps` is the SAME ratio, unwindowed (every contact ever,
   *     matching `summary()`'s own `repeat`/`total`), not limited to the
   *     last 24 months of cohorts below it — a shop's overall repeat rate
   *     is a different question than "how is this month's cohort doing."
   *
   * Capped at the last 24 months so the cohort table stays a table, not a
   * scroll — old enough to show a trend, not the shop's entire history.
   */
  async customersRetention(): Promise<CustomersRetention> {
    const now = new Date();
    const cohortWindowStart = new Date(now.getFullYear(), now.getMonth() - 23, 1);

    const [cohortRows, total, repeat] = await Promise.all([
      this.prisma.$queryRaw<Array<{ cohort: string; size: bigint; retained: bigint }>>`
        SELECT to_char("createdAt", 'YYYY-MM') AS cohort,
               COUNT(*) AS size,
               COUNT(*) FILTER (WHERE "orderCount" >= 2) AS retained
        FROM "Contact"
        WHERE "createdAt" >= ${cohortWindowStart}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      this.prisma.contact.count(),
      this.prisma.contact.count({ where: { orderCount: { gte: 2 } } }),
    ]);

    return {
      cohorts: cohortRows.map((row) => ({
        cohort: row.cohort,
        size: Number(row.size),
        retained: Number(row.retained),
      })),
      repeatRateBps: total > 0 ? Math.round((repeat / total) * 10_000) : 0,
    };
  }

  /**
   * WO-D.5 — the highest-lifetime-value customers. Reads straight from
   * `Contact.lifetimeValue`/`avgOrderValue`/`orderCount` — the CRM's own
   * denormalised rollup (`CrmService.refreshOrderRollups()`,
   * crm.service.ts), computed with the same `status NOT IN
   * ('CANCELLED','RETURNED')` exclusion `sales-revenue.ts`'s
   * `VOID_ORDER_STATUSES` names — not summed fresh from `Order` here,
   * which would either duplicate that definition or risk drifting from it.
   * `lifetimeValue: { gt: 0 }` excludes a lead who has never ordered; a
   * "top customers" ranking padded with $0 rows once real spenders run out
   * is not a smaller version of the report, it's a wrong one.
   */
  async customersTop(): Promise<CustomersTop> {
    const contacts = await this.prisma.contact.findMany({
      where: { lifetimeValue: { gt: 0 } },
      orderBy: { lifetimeValue: 'desc' },
      take: 20,
      select: { id: true, name: true, city: true, orderCount: true, lifetimeValue: true, avgOrderValue: true, lastOrderAt: true },
    });

    return {
      rows: contacts.map((contact) => ({
        contactId: contact.id,
        name: contact.name,
        city: contact.city,
        orders: contact.orderCount,
        lifetimeValue: contact.lifetimeValue,
        avgOrderValue: contact.avgOrderValue,
        lastOrderAt: contact.lastOrderAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * WO-D.6 (10-admin-dashboard.md Track D, the last one) — workshop
   * throughput: how many jobs started and finished each day, how long a
   * job sits in each pipeline stage, who's finishing the most work, and
   * where the pipeline is actually stuck.
   *
   * `byStage`'s timing reuses `ordersFulfilment()`'s own LAG-window
   * pattern verbatim, against `StitchingJobEvent` instead of
   * `OrderStatusEvent` — that table is the exact same shape (append-only,
   * `fromStage`/`toStage`/`createdAt`, `fromStage` always populated since
   * `JobsService.changeStage()` writes `fromStage: job.stage`, never a
   * genesis row — jobs.service.ts:365). Grouped by the single `fromStage`
   * here, not the `(from, to)` pair `ordersFulfilment()` groups by — D.6
   * wants "how long in this stage," not "how long for this exact
   * transition," and `RECEIVED→CUTTING→STITCHING→QC→READY→DISPATCHED` is
   * close enough to linear that the pair distinction adds noise, not
   * signal, for a workshop supervisor.
   *
   * `started`/`completed` in `series`, and `byTailor`'s own `avgHours`,
   * read `StitchingJob.startedAt`/`completedAt` directly (set once, at
   * CUTTING and READY respectively — `jobs.service.ts:357-359`) rather
   * than the event log — a tailor's own throughput is "how long did MY
   * job take end to end," a different question from "how long did the
   * pipeline spend in each stage across every tailor."
   *
   * `byTailor`'s row shape is this WO's one genuine judgment call — the
   * doc names only the bare word `byTailor`. Chosen: `{tailorId, name,
   * jobsCompleted, avgHours}`, mirroring `byStage`'s own field names.
   * `name` prefers `TailorProfile.displayName` (the purpose-built field
   * for this) over concatenating `User.firstName`/`lastName`, falling
   * back to the latter only for a tailor with no profile row.
   *
   * `bottleneck` is simply the `byStage` row with the highest `avgHours`
   * — computed here, not a separate query, since `byStage` already has it.
   *
   * EXPLAIN (test DB, ~10 jobs): sequential scans throughout — correct at
   * this size. `StitchingJob`'s `@@index([assignedTailorId, stage])` and
   * `StitchingJobEvent`'s `@@index([jobId, createdAt])` (stitching.prisma)
   * are what the planner uses once row count justifies it.
   */
  async workshopOutput(days: number): Promise<WorkshopOutput> {
    const start = this.windowStart(days);
    const timeZone = await this.settings.get<string>(SettingKey.StoreTimezone);

    const [startedRows, completedRows, stageRows, tailorRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ day: string; started: bigint }>>(
        `SELECT ${shopDayExpr('"startedAt"', timeZone)} AS day, COUNT(*) AS started
         FROM "StitchingJob"
         WHERE "startedAt" >= $1
         GROUP BY 1`,
        start,
      ),

      this.prisma.$queryRawUnsafe<Array<{ day: string; completed: bigint }>>(
        `SELECT ${shopDayExpr('"completedAt"', timeZone)} AS day, COUNT(*) AS completed
         FROM "StitchingJob"
         WHERE "completedAt" >= $1
         GROUP BY 1`,
        start,
      ),

      this.prisma.$queryRaw<Array<{ stage: string; count: bigint; avg_hours: number | null }>>`
        WITH gaps AS (
          SELECT
            e."fromStage" AS stage,
            EXTRACT(EPOCH FROM (
              e."createdAt" - COALESCE(
                LAG(e."createdAt") OVER (PARTITION BY e."jobId" ORDER BY e."createdAt"),
                j."createdAt"
              )
            )) / 3600.0 AS hours
          FROM "StitchingJobEvent" e
          JOIN "StitchingJob" j ON j.id = e."jobId"
          WHERE e."createdAt" >= ${start} AND e."fromStage" IS NOT NULL
        )
        SELECT stage, COUNT(*) AS count, AVG(hours)::float8 AS avg_hours
        FROM gaps
        GROUP BY stage
      `,

      this.prisma.$queryRaw<Array<{ tailorId: string; jobsCompleted: bigint; avg_hours: number | null }>>`
        SELECT "assignedTailorId" AS "tailorId",
               COUNT(*) AS "jobsCompleted",
               AVG(EXTRACT(EPOCH FROM ("completedAt" - "startedAt")) / 3600.0)::float8 AS avg_hours
        FROM "StitchingJob"
        WHERE "completedAt" >= ${start} AND "assignedTailorId" IS NOT NULL AND "startedAt" IS NOT NULL
        GROUP BY "assignedTailorId"
        ORDER BY "jobsCompleted" DESC
        LIMIT 20
      `,
    ]);

    const dayKeys = shopDayKeys(start, days, timeZone);
    const startedByDay = new Map(startedRows.map((row) => [row.day, Number(row.started)]));
    const completedByDay = new Map(completedRows.map((row) => [row.day, Number(row.completed)]));

    const byStage: WorkshopStageRow[] = stageRows.map((row) => ({
      stage: row.stage,
      count: Number(row.count),
      avgHours: round1(row.avg_hours ?? 0),
    }));

    let byTailor: WorkshopTailorRow[] = [];
    if (tailorRows.length > 0) {
      const tailorIds = tailorRows.map((row) => row.tailorId);
      const [profiles, users] = await Promise.all([
        this.prisma.tailorProfile.findMany({ where: { userId: { in: tailorIds } }, select: { userId: true, displayName: true } }),
        this.prisma.user.findMany({ where: { id: { in: tailorIds } }, select: { id: true, firstName: true, lastName: true } }),
      ]);
      const nameByTailorId = new Map<string, string>();
      for (const user of users) {
        nameByTailorId.set(user.id, [user.firstName, user.lastName].filter(Boolean).join(' ') || user.id);
      }
      for (const profile of profiles) {
        nameByTailorId.set(profile.userId, profile.displayName);
      }

      byTailor = tailorRows.map((row) => ({
        tailorId: row.tailorId,
        name: nameByTailorId.get(row.tailorId) ?? row.tailorId,
        jobsCompleted: Number(row.jobsCompleted),
        avgHours: round1(row.avg_hours ?? 0),
      }));
    }

    const bottleneck = byStage.reduce<WorkshopStageRow | null>(
      (worst, row) => (!worst || row.avgHours > worst.avgHours ? row : worst),
      null,
    );

    return {
      series: dayKeys.map((day) => ({
        date: day,
        started: startedByDay.get(day) ?? 0,
        completed: completedByDay.get(day) ?? 0,
      })),
      byStage,
      byTailor,
      bottleneck: bottleneck ? { stage: bottleneck.stage, avgHours: bottleneck.avgHours } : null,
    };
  }

  /**
   * Updates the monthly revenue target and returns it recomputed against the
   * current month, so the admin UI can update in place without a reload.
   */
  async setMonthlyTarget(targetAmount: number): Promise<MonthlyTarget> {
    await this.settings.set(SettingKey.MonthlyRevenueTarget, targetAmount);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [month, stitchingMonth] = await Promise.all([
      this.prisma.order.aggregate({
        where: { placedAt: { gte: startOfMonth }, status: { notIn: VOID_STATUSES } },
        _sum: { grandTotal: true },
      }),
      this.prisma.stitchingOrder.aggregate({
        where: { createdAt: { gte: startOfMonth }, status: { not: 'CANCELLED' }, quotedFee: { not: null } },
        _sum: { quotedFee: true },
      }),
    ]);

    const achieved = (month._sum.grandTotal ?? 0) + (stitchingMonth._sum.quotedFee ?? 0);
    return this.buildMonthlyTarget(targetAmount, achieved);
  }

  /** Midnight `days` ago, matching summary()'s seriesStart convention. */
  private windowStart(days: number): Date {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    startOfToday.setDate(startOfToday.getDate() - (days - 1));
    return startOfToday;
  }

  /**
   * Cart-to-order conversion for the window starting at `start`. Shared by
   * extendedAnalytics (full cartAbandonment stat) and visitorAnalytics (just
   * needs the abandonedCarts count) so the two can never diverge.
   */
  private async cartAbandonment(start: Date): Promise<ExtendedAnalytics['cartAbandonment']> {
    const [cartsCreated, ordersPlaced] = await Promise.all([
      // CartService.getOrCreate fires on every storefront cart read, so a raw
      // cart count is really a visit count. Only a cart that ever held an
      // item represents shopping intent worth measuring against orders.
      this.prisma.cart.count({ where: { createdAt: { gte: start }, items: { some: {} } } }),
      this.prisma.order.count({ where: { placedAt: { gte: start } } }),
    ]);

    const abandonedCarts = Math.max(cartsCreated - ordersPlaced, 0);

    return {
      cartsCreated,
      ordersPlaced,
      abandonedCarts,
      rate: cartsCreated > 0 ? round1((abandonedCarts / cartsCreated) * 100) : 0,
    };
  }

  /** Percent is clamped to 0-999 so a wildly over-target month can't break a gauge UI. */
  private buildMonthlyTarget(targetAmount: number, achievedAmount: number): MonthlyTarget {
    const percent =
      targetAmount > 0 ? Math.min(Math.max(round1((achievedAmount / targetAmount) * 100), 0), 999) : 0;
    return { targetAmount, achievedAmount, percent };
  }
}

/** Rounds to one decimal place, for percentage and day-count metrics. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Basis points of `part` over `whole`, 0 when `whole` is 0 — the sales-report endpoints' own margin/conversion arithmetic. */
function bpsOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 10000) : 0;
}

/**
 * Turns sparse day rows into one entry per day.
 *
 * A chart drawn straight from the query would silently skip days with no
 * orders, which makes a quiet week look like a busy one.
 */
/**
 * Widens the grouped rows into one point per day so the chart has a continuous
 * axis. The axis is generated in `timeZone` and the rows were grouped in the
 * same zone, so the keys line up by construction — which is the property the
 * old version lacked, having built the axis locally and the keys in UTC.
 */
function fillDays(
  start: Date,
  days: number,
  timeZone: string,
  rows: Array<{ day: string; orders: bigint; revenue: bigint }>,
  /** Same-shaped revenue from a second source (stitching bookings) to add in per day. */
  extraRevenueRows: Array<{ day: string; revenue: bigint }> = [],
): Array<{ date: string; orders: number; revenue: number }> {
  const byDate = new Map(
    rows.map((row) => [row.day, { orders: Number(row.orders), revenue: Number(row.revenue) }]),
  );
  const extraByDate = new Map(extraRevenueRows.map((row) => [row.day, Number(row.revenue)]));

  return shopDayKeys(start, days, timeZone).map((date) => {
    const base = byDate.get(date) ?? { orders: 0, revenue: 0 };
    return { date, orders: base.orders, revenue: base.revenue + (extraByDate.get(date) ?? 0) };
  });
}
