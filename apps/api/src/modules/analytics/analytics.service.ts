import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../core/prisma/client';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { AppConfigService } from '../../core/config/app-config.service';
import { VOID_ORDER_STATUSES as VOID_STATUSES } from '../../core/common/sales-revenue';
import {
  shopDayExpr,
  shopDayKeys,
  startOfShopDay,
  startOfShopDaysAgo,
  startOfShopMonth,
} from '../../core/time/shop-time';
import { rollUpDays, type MetricBucket } from '../../core/time/metric-window';

export interface MonthlyTarget {
  targetAmount: number;
  achievedAmount: number;
  /** Percentage, clamped to 0-999 so a wildly over-target month can't break a gauge UI. */
  percent: number;
}

export interface DashboardSummary {
  today: { orders: number; revenue: number };
  month: { orders: number; revenue: number };
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
  ) {}

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
    ]);

    const orderCount = allTime._count._all;
    // Order-only: "average ORDER value" means a checkout, not a stitching
    // booking, so this stays a narrower figure than the revenue totals below.
    const allTimeOrderRevenue = allTime._sum.grandTotal ?? 0;

    const monthRevenue = (month._sum.grandTotal ?? 0) + (stitchingMonth._sum.quotedFee ?? 0);

    return {
      today: {
        orders: today._count._all,
        revenue: (today._sum.grandTotal ?? 0) + (stitchingToday._sum.quotedFee ?? 0),
      },
      month: { orders: month._count._all, revenue: monthRevenue },
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
