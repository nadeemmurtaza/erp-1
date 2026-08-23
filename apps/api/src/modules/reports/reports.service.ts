import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

/** A CSV export ready to stream: a filename, a header row, and data rows in column order. */
export interface CsvExport {
  filename: string;
  header: string[];
  rows: Array<Array<string | number | null | undefined>>;
}

const MAX_RANGE_DAYS = 366;
const DEFAULT_RANGE_DAYS = 30;
const DAY_MS = 86_400_000;

interface DateRange {
  from: Date;
  to: Date;
  fromLabel: string;
  toLabel: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One row per order placed in the range: identifying, status and money
   * columns a human reads directly rather than feeds back into the system.
   */
  async ordersCsv(fromStr?: string, toStr?: string): Promise<CsvExport> {
    const range = parseRange(fromStr, toStr);

    const orders = await this.prisma.order.findMany({
      where: { placedAt: { gte: range.from, lte: range.to } },
      orderBy: { placedAt: 'asc' },
      select: {
        number: true,
        placedAt: true,
        status: true,
        guestName: true,
        shippingAddress: true,
        itemsSubtotal: true,
        stitchingSubtotal: true,
        shippingFee: true,
        grandTotal: true,
        user: { select: { firstName: true, lastName: true } },
        // Latest payment record stands for "the current payment status" —
        // a retried or corrected payment is a new row, so the newest one is
        // the one still true.
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true },
        },
      },
    });

    const header = [
      'Number',
      'Placed At',
      'Status',
      'Customer Name',
      'City',
      'Items Subtotal (Rs)',
      'Stitching Subtotal (Rs)',
      'Shipping Fee (Rs)',
      'Grand Total (Rs)',
      'Payment Status',
    ];

    const rows = orders.map((order) => [
      order.number,
      order.placedAt.toISOString(),
      order.status,
      customerName(order.guestName, order.user),
      cityOf(order.shippingAddress),
      // Paisa -> rupees, unlike every other money value this API returns.
      // This CSV is read by a person in a spreadsheet, never fed back into
      // order-total math, so it is one of the few places that crosses from
      // the database's integer-paisa convention to a human rupee figure
      // outside the admin UI's usual ×100-on-save/÷100-on-load pattern.
      toRupees(order.itemsSubtotal),
      toRupees(order.stitchingSubtotal),
      toRupees(order.shippingFee),
      toRupees(order.grandTotal),
      order.payments[0]?.status ?? '',
    ]);

    return { filename: `orders_${range.fromLabel}_${range.toLabel}.csv`, header, rows };
  }

  /** One row per calendar day in the range, including days with no orders. */
  async salesByDayCsv(fromStr?: string, toStr?: string): Promise<CsvExport> {
    const range = parseRange(fromStr, toStr);

    const dayRows = await this.prisma.$queryRaw<
      Array<{ day: Date; orders: bigint; revenue: bigint }>
    >`
      SELECT date_trunc('day', "placedAt") AS day,
             COUNT(*) AS orders,
             COALESCE(SUM("grandTotal"), 0) AS revenue
      FROM "Order"
      WHERE "placedAt" >= ${range.from}
        AND "placedAt" <= ${range.to}
        -- Cancelled/returned orders never count as a sale. Matches the
        -- dashboard's revenue definition (analytics.service.ts); duplicated
        -- here rather than imported so reports stays decoupled from its
        -- sibling module.
        AND "status" NOT IN ('CANCELLED', 'RETURNED')
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const byDate = new Map(dayRows.map((row) => [row.day.toISOString().slice(0, 10), row]));
    const totalDays = Math.floor((range.to.getTime() - range.from.getTime()) / DAY_MS) + 1;

    const rows: CsvExport['rows'] = [];
    for (let offset = 0; offset < totalDays; offset += 1) {
      const day = new Date(range.from);
      day.setUTCDate(day.getUTCDate() + offset);
      const dateLabel = day.toISOString().slice(0, 10);
      const found = byDate.get(dateLabel);
      rows.push([dateLabel, found ? Number(found.orders) : 0, found ? toRupees(Number(found.revenue)) : 0]);
    }

    return {
      filename: `sales-by-day_${range.fromLabel}_${range.toLabel}.csv`,
      header: ['Date', 'Order Count', 'Revenue (Rs)'],
      rows,
    };
  }

  /** One row per variant, current stock as of the moment of export. */
  async stockCsv(lowStockOnly: boolean): Promise<CsvExport> {
    const variants = await this.prisma.productVariant.findMany({
      where: lowStockOnly
        ? {
            isActive: true,
            // Same "at or below its own threshold" definition the dashboard's
            // lowStockVariants count uses.
            stock: { lte: this.prisma.productVariant.fields.lowStockThreshold },
          }
        : {},
      orderBy: { sku: 'asc' },
      select: {
        sku: true,
        size: true,
        color: true,
        stock: true,
        lowStockThreshold: true,
        isActive: true,
        product: {
          select: {
            slug: true,
            translations: { where: { locale: 'en' }, select: { name: true }, take: 1 },
          },
        },
      },
    });

    const header = [
      'SKU',
      'Product Name',
      'Size',
      'Color',
      'Stock',
      'Low Stock Threshold',
      'Active',
    ];

    const rows = variants.map((variant) => [
      variant.sku,
      variant.product.translations[0]?.name ?? variant.product.slug,
      variant.size ?? '',
      variant.color ?? '',
      variant.stock,
      variant.lowStockThreshold,
      variant.isActive ? 'true' : 'false',
    ]);

    const today = new Date().toISOString().slice(0, 10);
    return {
      filename: `stock_${lowStockOnly ? 'low_' : ''}${today}.csv`,
      header,
      rows,
    };
  }
}

/** Divides an integer-paisa amount into rupees for a human-facing export. */
function toRupees(paisa: number): number {
  return paisa / 100;
}

function customerName(
  guestName: string | null,
  user: { firstName: string | null; lastName: string | null } | null,
): string {
  if (guestName) return guestName;
  if (!user) return '';
  return [user.firstName, user.lastName].filter(Boolean).join(' ');
}

/** shippingAddress is a Json snapshot (see orders.prisma); city is read defensively. */
function cityOf(address: unknown): string {
  if (address && typeof address === 'object' && !Array.isArray(address)) {
    const city = (address as Record<string, unknown>).city;
    if (typeof city === 'string') return city;
  }
  return '';
}

/**
 * Resolves the from/to query strings into a validated, inclusive UTC day
 * range: real dates, `from` not after `to`, and capped at MAX_RANGE_DAYS so a
 * report over unbounded history can't be requested.
 */
function parseRange(fromStr?: string, toStr?: string): DateRange {
  const today = new Date().toISOString().slice(0, 10);
  const toLabel = toStr ?? today;
  const to = endOfDay(toLabel);

  let fromLabel = fromStr;
  if (!fromLabel) {
    const implied = new Date(to);
    implied.setUTCDate(implied.getUTCDate() - (DEFAULT_RANGE_DAYS - 1));
    fromLabel = implied.toISOString().slice(0, 10);
  }
  const from = startOfDay(fromLabel);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new BadRequestException('`from` and `to` must be valid dates (YYYY-MM-DD).');
  }
  if (from > to) {
    throw new BadRequestException('`from` must not be after `to`.');
  }

  const rangeDays = Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new BadRequestException(
      `Reports cover at most ${MAX_RANGE_DAYS} days; narrow the date range.`,
    );
  }

  return { from, to, fromLabel: from.toISOString().slice(0, 10), toLabel: to.toISOString().slice(0, 10) };
}

function startOfDay(dateStr: string): Date {
  const date = new Date(dateStr);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function endOfDay(dateStr: string): Date {
  const date = new Date(dateStr);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}
