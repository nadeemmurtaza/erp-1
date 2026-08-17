import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { OrderStatus, Prisma } from '../../core/prisma/client';

/** Orders in these states never count toward revenue. */
const VOID_STATUSES: OrderStatus[] = ['CANCELLED', 'RETURNED'];

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
  constructor(private readonly prisma: PrismaService) {}

  async summary(days = 30): Promise<DashboardSummary> {
    const now = new Date();

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const seriesStart = new Date(startOfToday);
    seriesStart.setDate(seriesStart.getDate() - (days - 1));

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
      this.prisma.$queryRaw<Array<{ day: Date; orders: bigint; revenue: bigint }>>`
        SELECT date_trunc('day', "placedAt") AS day,
               COUNT(*) AS orders,
               COALESCE(SUM("grandTotal"), 0) AS revenue
        FROM "Order"
        WHERE "placedAt" >= ${seriesStart}
          AND "status" NOT IN ('CANCELLED', 'RETURNED')
        GROUP BY 1
        ORDER BY 1 ASC
      `,

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
      salesSeries: fillDays(seriesStart, days, seriesRows),
      topProducts: topProductRows.map((row) => ({
        name: row.name,
        quantity: Number(row.quantity),
        revenue: Number(row.revenue),
      })),
      stitchingByStage: stitchingRows.map((row) => ({
        stage: row.stage,
        count: row._count._all,
      })),
    };
  }
}

/**
 * Turns sparse day rows into one entry per day.
 *
 * A chart drawn straight from the query would silently skip days with no
 * orders, which makes a quiet week look like a busy one.
 */
function fillDays(
  start: Date,
  days: number,
  rows: Array<{ day: Date; orders: bigint; revenue: bigint }>,
): Array<{ date: string; orders: number; revenue: number }> {
  const byDate = new Map(
    rows.map((row) => [
      row.day.toISOString().slice(0, 10),
      { orders: Number(row.orders), revenue: Number(row.revenue) },
    ]),
  );

  const series: Array<{ date: string; orders: number; revenue: number }> = [];

  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(start);
    day.setDate(day.getDate() + offset);
    const date = day.toISOString().slice(0, 10);

    series.push({ date, ...(byDate.get(date) ?? { orders: 0, revenue: 0 }) });
  }

  return series;
}
