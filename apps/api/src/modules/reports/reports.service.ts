import { BadRequestException, Injectable } from '@nestjs/common';
import { getOrderCustomerName, getPersonFullName } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import {
  endOfShopDayFromKey,
  shopDayExpr,
  shopDayKey,
  shopDayKeys,
  shopDaysBetween,
  startOfShopDayFromKey,
} from '../../core/time/shop-time';

/** A CSV export ready to stream: a filename, a header row, and data rows in column order. */
export interface CsvExport {
  filename: string;
  header: string[];
  rows: Array<Array<string | number | null | undefined>>;
}

const MAX_RANGE_DAYS = 366;
const DEFAULT_RANGE_DAYS = 30;

interface DateRange {
  from: Date;
  to: Date;
  /** The zone `from`/`to` were resolved in; every label derived from them uses it. */
  timeZone: string;
  fromLabel: string;
  toLabel: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** The zone every date in every export is resolved in. */
  private timeZone(): Promise<string> {
    return this.settings.get<string>(SettingKey.StoreTimezone);
  }

  /**
   * One row per order placed in the range: identifying, status and money
   * columns a human reads directly rather than feeds back into the system.
   */
  async ordersCsv(fromStr?: string, toStr?: string): Promise<CsvExport> {
    const range = parseRange(fromStr, toStr, await this.timeZone());

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
      getOrderCustomerName(order) ?? '',
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
    const range = parseRange(fromStr, toStr, await this.timeZone());

    const timeZone = range.timeZone;

    const [dayRows, stitchingDayRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ day: string; orders: bigint; revenue: bigint }>>(
        // Grouped AND formatted in the shop's zone, and returned as a string so
        // the driver cannot reinterpret it into a neighbouring day. This must
        // stay in step with analytics.service.ts, or the dashboard and this
        // export will disagree about which day a sale belongs to.
        `SELECT ${shopDayExpr('"placedAt"', timeZone)} AS day,
                COUNT(*) AS orders,
                COALESCE(SUM("grandTotal"), 0) AS revenue
         FROM "Order"
         WHERE "placedAt" >= $1
           AND "placedAt" <= $2
           -- Cancelled/returned orders never count as a sale. Matches the
           -- dashboard's revenue definition (analytics.service.ts); duplicated
           -- here rather than imported so reports stays decoupled from its
           -- sibling module.
           AND "status" NOT IN ('CANCELLED', 'RETURNED')
         GROUP BY 1
         ORDER BY 1 ASC`,
        range.from,
        range.to,
      ),
      // "Bring your own fabric" bookings (StitchingOrder) never become an
      // Order, so their revenue lived nowhere in this report until now —
      // broken out in its own column rather than folded silently into
      // "Revenue" so a reader can still tell the two sale types apart.
      this.prisma.$queryRawUnsafe<Array<{ day: string; revenue: bigint }>>(
        `SELECT ${shopDayExpr('"createdAt"', timeZone)} AS day,
                COALESCE(SUM("quotedFee"), 0) AS revenue
         FROM "StitchingOrder"
         WHERE "createdAt" >= $1
           AND "createdAt" <= $2
           AND "status" != 'CANCELLED'
           AND "quotedFee" IS NOT NULL
         GROUP BY 1
         ORDER BY 1 ASC`,
        range.from,
        range.to,
      ),
    ]);

    const byDate = new Map(dayRows.map((row) => [row.day, row]));
    const stitchingByDate = new Map(stitchingDayRows.map((row) => [row.day, Number(row.revenue)]));
    const totalDays = shopDaysBetween(range.from, range.to, timeZone);

    const rows: CsvExport['rows'] = [];
    for (const dateLabel of shopDayKeys(range.from, totalDays, timeZone)) {
      const found = byDate.get(dateLabel);
      const orderRevenue = found ? Number(found.revenue) : 0;
      const stitchingRevenue = stitchingByDate.get(dateLabel) ?? 0;
      rows.push([
        dateLabel,
        found ? Number(found.orders) : 0,
        toRupees(orderRevenue),
        toRupees(stitchingRevenue),
        toRupees(orderRevenue + stitchingRevenue),
      ]);
    }

    return {
      filename: `sales-by-day_${range.fromLabel}_${range.toLabel}.csv`,
      header: [
        'Date',
        'Order Count',
        'Order Revenue (Rs)',
        'Stitching Booking Revenue (Rs)',
        'Total Revenue (Rs)',
      ],
      rows,
    };
  }

  /**
   * One row per "bring your own fabric" booking quoted or completed in the
   * range — the counterpart to ordersCsv for revenue that never becomes an
   * Order (see the note on StitchingOrder in stitching.prisma).
   */
  async stitchingBookingsCsv(fromStr?: string, toStr?: string): Promise<CsvExport> {
    const range = parseRange(fromStr, toStr, await this.timeZone());

    const bookings = await this.prisma.stitchingOrder.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      orderBy: { createdAt: 'asc' },
      select: {
        number: true,
        createdAt: true,
        status: true,
        guestName: true,
        guestPhone: true,
        quotedFee: true,
        jobs: { select: { id: true } },
      },
    });

    const header = [
      'Number',
      'Created At',
      'Status',
      'Customer Name',
      'Phone',
      'Garment Count',
      'Quoted Fee (Rs)',
    ];

    const rows = bookings.map((booking) => [
      booking.number,
      booking.createdAt.toISOString(),
      booking.status,
      booking.guestName ?? '',
      booking.guestPhone ?? '',
      booking.jobs.length,
      booking.quotedFee != null ? toRupees(booking.quotedFee) : '',
    ]);

    return {
      filename: `stitching-bookings_${range.fromLabel}_${range.toLabel}.csv`,
      header,
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

    const today = shopDayKey(new Date(), await this.timeZone());
    return {
      filename: `stock_${lowStockOnly ? 'low_' : ''}${today}.csv`,
      header,
      rows,
    };
  }
  async stockValuationCsv(): Promise<CsvExport> {
    const variants = await this.prisma.productVariant.findMany({
      orderBy: { sku: 'asc' },
      select: {
        sku: true,
        size: true,
        color: true,
        stock: true,
        costPrice: true,
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
      'Cost Price (Rs)',
      'Stock Value (Rs)',
    ];

    const rows: Array<(string | number)>[] = [];
    let totalValue = 0;

    for (const variant of variants) {
      const val = variant.stock * variant.costPrice;
      totalValue += val;
      rows.push([
        variant.sku,
        variant.product.translations[0]?.name ?? variant.product.slug,
        variant.size ?? '',
        variant.color ?? '',
        variant.stock,
        toRupees(variant.costPrice),
        toRupees(val),
      ]);
    }

    rows.push(['', 'TOTAL', '', '', '', '', toRupees(totalValue)]);

    const today = shopDayKey(new Date(), await this.timeZone());
    return {
      filename: `stock-valuation_${today}.csv`,
      header,
      rows,
    };
  }

  async purchasesBySupplierCsv(fromStr?: string, toStr?: string): Promise<CsvExport> {
    const range = parseRange(fromStr, toStr, await this.timeZone());
    
    const rowsRaw = await this.prisma.$queryRaw<
      Array<{ supplier: string; pocount: bigint; valuereceived: bigint }>
    >`
      SELECT s.name as supplier,
             COUNT(DISTINCT po.id) as pocount,
             COALESCE(SUM(gri.quantity * gri."landedUnitCost"), 0) as valuereceived
      FROM "Supplier" s
      JOIN "PurchaseOrder" po ON po."supplierId" = s.id
      LEFT JOIN "GoodsReceipt" gr ON gr."purchaseOrderId" = po.id
      LEFT JOIN "GoodsReceiptItem" gri ON gri."goodsReceiptId" = gr.id
      WHERE po."createdAt" >= ${range.from} AND po."createdAt" <= ${range.to}
      GROUP BY s.id, s.name
      ORDER BY s.name ASC
    `;

    const header = ['Period', 'Supplier', 'PO Count', 'Value Received (Rs)'];
    const rows = rowsRaw.map((r) => [
      `${range.fromLabel} to ${range.toLabel}`,
      r.supplier,
      Number(r.pocount),
      toRupees(Number(r.valuereceived))
    ]);

    return { filename: `purchases-by-supplier_${range.fromLabel}_${range.toLabel}.csv`, header, rows };
  }

  async stockLedgerCsv(fromStr?: string, toStr?: string): Promise<CsvExport> {
    const range = parseRange(fromStr, toStr, await this.timeZone());

    const movements = await this.prisma.stockMovement.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      orderBy: { createdAt: 'desc' },
      include: {
        variant: {
          select: {
            sku: true,
            product: { select: { slug: true, translations: { where: { locale: 'en' }, select: { name: true }, take: 1 } } }
          }
        },
        actor: { select: { firstName: true, lastName: true } }
      }
    });

    const header = [
      'Date', 'Product Name', 'SKU', 'Delta', 'Resulting Stock', 
      'Reason', 'Ref Type', 'Ref ID', 'Unit Cost (Rs)', 'Actor'
    ];

    const rows = movements.map(m => [
      m.createdAt.toISOString(),
      m.variant.product.translations[0]?.name ?? m.variant.product.slug,
      m.variant.sku,
      m.delta,
      m.resultingStock,
      m.reason,
      m.refType ?? '',
      m.refId ?? '',
      m.unitCost != null ? toRupees(m.unitCost) : '',
      m.actor ? getPersonFullName(m.actor) ?? '' : ''
    ]);

    return { filename: `stock-ledger_${range.fromLabel}_${range.toLabel}.csv`, header, rows };
  }

  async slowMoversCsv(): Promise<CsvExport> {
    const variants = await this.prisma.productVariant.findMany({
      where: {
        isActive: true,
        stock: { gt: 0 },
        salesStat: { isSlowMover: true }
      },
      orderBy: { salesStat: { ageDays: 'desc' } },
      include: {
        product: { select: { slug: true, translations: { where: { locale: 'en' }, select: { name: true }, take: 1 } } },
        salesStat: true
      }
    });

    const header = ['SKU', 'Product Name', 'Stock', 'Days of Cover', 'Last Sold At', 'Age Days', 'Stock Value (Rs)'];
    
    const rows = variants.map(v => [
      v.sku,
      v.product.translations[0]?.name ?? v.product.slug,
      v.stock,
      v.salesStat?.daysOfCover ?? '',
      v.salesStat?.lastSoldAt ? v.salesStat.lastSoldAt.toISOString() : 'Never',
      v.salesStat?.ageDays ?? 0,
      toRupees(v.stock * v.costPrice)
    ]);

    const today = shopDayKey(new Date(), await this.timeZone());
    return { filename: `slow-movers_${today}.csv`, header, rows };
  }

}

/** Divides an integer-paisa amount into rupees for a human-facing export. */
function toRupees(paisa: number): number {
  return paisa / 100;
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
function parseRange(fromStr: string | undefined, toStr: string | undefined, timeZone: string): DateRange {
  // "Yesterday" means the shop's yesterday. Resolving these in UTC would give a
  // Karachi shop the wrong day for the five hours either side of midnight.
  const toLabel = toStr ?? shopDayKey(new Date(), timeZone);
  const to = endOfShopDayFromKey(toLabel, timeZone);

  let fromLabel = fromStr;
  if (!fromLabel) {
    const impliedKeys = shopDayKeys(
      startOfShopDayFromKey(toLabel, timeZone),
      1,
      timeZone,
    );
    const [y, m, d] = impliedKeys[0].split('-').map(Number);
    const shifted = new Date(Date.UTC(y, m - 1, d - (DEFAULT_RANGE_DAYS - 1)));
    fromLabel = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
  }
  const from = startOfShopDayFromKey(fromLabel, timeZone);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new BadRequestException('`from` and `to` must be valid dates (YYYY-MM-DD).');
  }
  if (from > to) {
    throw new BadRequestException('`from` must not be after `to`.');
  }

  const rangeDays = shopDaysBetween(from, to, timeZone);
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new BadRequestException(
      `Reports cover at most ${MAX_RANGE_DAYS} days; narrow the date range.`,
    );
  }

  return {
    from,
    to,
    timeZone,
    fromLabel: shopDayKey(from, timeZone),
    toLabel: shopDayKey(to, timeZone),
  };
}
