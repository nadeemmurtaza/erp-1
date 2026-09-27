import { Injectable } from '@nestjs/common';
import { DEFAULT_LOCALE } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { startOfShopDay } from '../../core/time/shop-time';
import { VOID_ORDER_STATUSES as VOID_STATUSES } from '../../core/common/sales-revenue';

export interface PosDashboardLowStockRow {
  variantId: string;
  sku: string;
  productName: string;
  variantLabel: string;
  stock: number;
  reorderPoint: number;
}

export interface PosDashboardSummary {
  dailySales: { revenue: number; orderCount: number };
  totalCustomers: number;
  lowStockVariants: PosDashboardLowStockRow[];
}

/**
 * pos-hardware/76-pos-mobile-dashboard.md (WO-76.1) — the till's own
 * glance-view, scoped to one `locationId` exclusively (doc 76's own "Whose
 * rows, and which columns" lens: a floor manager cares about this branch's
 * shelf, never an organization-wide read on a single till). Delegates to
 * the SAME figures `AnalyticsService.summary()` already computes — this
 * file adds no new aggregation logic, only a location-scoped read of the
 * same facts (`Order`, `Contact`, `VariantLocationStock`/`ProductVariant`).
 *
 * `totalCustomers` is intentionally not location-filtered: `Contact` carries
 * no `locationId` today, and at chain scale a branch is its own node with
 * its own database (RETAIL-ERP.md R7) — its `Contact` table already holds
 * only that node's own customers, so a plain `count()` is already
 * branch-scoped by construction there. At Solo scale it is the shop's own
 * whole customer count, which is exactly what a single till should show.
 */
@Injectable()
export class PosDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async summary(locationId: string): Promise<PosDashboardSummary> {
    const timeZone = await this.settings.get<string>(SettingKey.StoreTimezone);
    const startOfToday = startOfShopDay(new Date(), timeZone);

    const [salesAgg, totalCustomers, lowStockRows] = await Promise.all([
      this.prisma.order.aggregate({
        where: { locationId, placedAt: { gte: startOfToday }, status: { notIn: VOID_STATUSES } },
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
      this.prisma.contact.count(),
      this.prisma.$queryRaw<
        Array<{ variantId: string; sku: string; productName: string; variantLabel: string; stock: number; reorderPoint: number }>
      >`
        SELECT vls."variantId" AS "variantId",
               pv.sku AS sku,
               COALESCE(pt.name, p.slug) AS "productName",
               COALESCE(pv.label, pv.sku) AS "variantLabel",
               vls.quantity AS stock,
               pv."lowStockThreshold" AS "reorderPoint"
        FROM "VariantLocationStock" vls
        JOIN "ProductVariant" pv ON pv.id = vls."variantId"
        JOIN "Product" p ON p.id = pv."productId"
        LEFT JOIN "ProductTranslation" pt ON pt."productId" = p.id AND pt.locale = ${DEFAULT_LOCALE}
        WHERE vls."locationId" = ${locationId}
          AND pv."isActive" = true
          AND vls.quantity <= pv."lowStockThreshold"
        ORDER BY vls.quantity ASC
        LIMIT 20
      `,
    ]);

    return {
      dailySales: { revenue: salesAgg._sum.grandTotal ?? 0, orderCount: salesAgg._count._all },
      totalCustomers,
      lowStockVariants: lowStockRows.map((row) => ({ ...row, stock: Number(row.stock), reorderPoint: Number(row.reorderPoint) })),
    };
  }
}
