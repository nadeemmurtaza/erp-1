import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { OrderStatus, Prisma } from '../../core/prisma/client';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import {
  shopDayExpr,
  shopDayKeys,
  startOfShopDay,
  startOfShopDaysAgo,
  startOfShopMonth,
} from '../../core/time/shop-time';

/** Orders in these states never count toward revenue. */
const VOID_STATUSES: OrderStatus[] = ['CANCELLED', 'RETURNED'];

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

    const [
      today,
      month,
      allTime,
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
    const allTimeRevenue = allTime._sum.grandTotal ?? 0;

    return {
      today: { orders: today._count._all, revenue: today._sum.grandTotal ?? 0 },
      month: { orders: month._count._all, revenue: month._sum.grandTotal ?? 0 },
      // Rounded to whole rupees: an average quoted to the paisa is false
      // precision and reads as noise on a stat tile.
      averageOrderValue:
        orderCount > 0 ? Math.round(allTimeRevenue / orderCount / 100) * 100 : 0,
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
      salesSeries: fillDays(seriesStart, days, timeZone, seriesRows),
      topProducts: topProductRows.map((row) => ({
        name: row.name,
        quantity: Number(row.quantity),
        revenue: Number(row.revenue),
      })),
      stitchingByStage: stitchingRows.map((row) => ({
        stage: row.stage,
        count: row._count._all,
      })),
      monthlyTarget: this.buildMonthlyTarget(monthlyTargetAmount, month._sum.grandTotal ?? 0),
    };
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
    const month = await this.prisma.order.aggregate({
      where: { placedAt: { gte: startOfMonth }, status: { notIn: VOID_STATUSES } },
      _sum: { grandTotal: true },
    });

    return this.buildMonthlyTarget(targetAmount, month._sum.grandTotal ?? 0);
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
): Array<{ date: string; orders: number; revenue: number }> {
  const byDate = new Map(
    rows.map((row) => [row.day, { orders: Number(row.orders), revenue: Number(row.revenue) }]),
  );

  return shopDayKeys(start, days, timeZone).map((date) => ({
    date,
    ...(byDate.get(date) ?? { orders: 0, revenue: 0 }),
  }));
}
