import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { OrderStatus, Prisma } from '../../core/prisma/client';
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

/** Placed but not yet DELIVERED, CANCELLED or RETURNED — WO-D.1's "open". */
const OPEN_ORDER_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED'];

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
}

export interface PurchasingSuppliers {
  rows: PurchasingSupplierRow[];
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
        return {
          supplierId: row.supplierId,
          name: row.name,
          spend,
          orders: Number(row.orders),
          onTimeRateBps: timing?.onTimeRateBps ?? null,
          avgLeadDays: timing?.avgLeadDays ?? null,
          share: totalSpend > 0 ? Math.round((spend / totalSpend) * 10_000) : 0,
        };
      }),
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
