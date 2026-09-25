import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { computeDemandForecast, resolveLeadTimeDays } from '@newax/shared';
import { SpotCheckService } from './spot-check.service';

@Injectable()
export class InventoryCron {
  private readonly logger = new Logger(InventoryCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly spotChecks: SpotCheckService,
  ) {}

  // 156-single-employee-branch-loss-prevention.md §3. Checked hourly, but
  // only sometimes fires — the point is unpredictability, not the cron
  // interval itself. A failure for one location is logged and never blocks
  // the rest (services.md).
  @Cron('0 * * * *')
  async maybeTriggerSpotCheck() {
    try {
      const created = await this.spotChecks.maybeTriggerDueChecks();
      if (created.length > 0) this.logger.log(`Triggered ${created.length} spot check(s): ${created.join(', ')}`);
    } catch (error) {
      this.logger.error('maybeTriggerSpotCheck failed', error instanceof Error ? error.stack : String(error));
    }
  }

  @Cron('0 2 * * *')
  async computeNightlyStats() {
    this.logger.log('Starting nightly inventory computation');

    const slowMoverDays = await this.settings.get<number>(SettingKey.InventorySlowMoverDays);
    const deadStockDays = await this.settings.get<number>(SettingKey.InventoryDeadStockDays);
    const minLastYearUnits = await this.settings.get<number>(SettingKey.DemandForecastMinLastYearUnits);

    const variants = await this.prisma.productVariant.findMany({
      where: { isActive: true },
      select: {
        id: true,
        stock: true,
        createdAt: true,
        preferredSupplierId: true,
      }
    });

    // Batched up front rather than per variant (WO-9.3, 09-ai-layer.md) — a
    // SupplierProduct.leadTimeDays override, falling back to Supplier's own
    // default, resolved once per (supplier, variant) pair this pass needs.
    const supplierIds = [...new Set(variants.map((v) => v.preferredSupplierId).filter((id): id is string => id !== null))];
    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, leadTimeDays: true },
    });
    const defaultLeadTimeBySupplier = new Map(suppliers.map((s) => [s.id, s.leadTimeDays]));
    const supplierProducts = await this.prisma.supplierProduct.findMany({
      where: { supplierId: { in: supplierIds }, leadTimeDays: { not: null } },
      select: { supplierId: true, variantId: true, leadTimeDays: true },
    });
    const leadTimeOverrideByKey = new Map(
      supplierProducts
        .filter((sp): sp is typeof sp & { leadTimeDays: number } => sp.leadTimeDays !== null)
        .map((sp) => [`${sp.supplierId}:${sp.variantId}`, sp.leadTimeDays]),
    );

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (const variant of variants) {
      // 1. Compute sales stats
      const sales = await this.prisma.stockMovement.findMany({
        where: {
          variantId: variant.id,
          reason: 'SALE',
        },
        select: { delta: true, createdAt: true }
      });

      let units30 = 0;
      let units90 = 0;
      let lastSoldAt: Date | null = null;

      for (const sale of sales) {
        const qty = -sale.delta;
        if (sale.createdAt >= ninetyDaysAgo) {
          units90 += qty;
        }
        if (sale.createdAt >= thirtyDaysAgo) {
          units30 += qty;
        }
        if (!lastSoldAt || sale.createdAt > lastSoldAt) {
          lastSoldAt = sale.createdAt;
        }
      }

      const velocityPerDay = units30 / 30;
      const daysOfCover = velocityPerDay > 0 ? variant.stock / velocityPerDay : null;

      const lastReceipt = await this.prisma.stockMovement.findFirst({
        where: { variantId: variant.id, reason: 'PURCHASE_RECEIPT' },
        orderBy: { createdAt: 'desc' }
      });
      
      const ageDays = lastReceipt 
        ? Math.floor((now.getTime() - lastReceipt.createdAt.getTime()) / (24 * 60 * 60 * 1000))
        : null;

      const daysSinceLastSale = lastSoldAt 
        ? Math.floor((now.getTime() - lastSoldAt.getTime()) / (24 * 60 * 60 * 1000))
        : (ageDays ?? 0);

      let isSlowMover = false;
      let isDeadStock = false;

      if (variant.stock > 0) {
        if (daysSinceLastSale >= deadStockDays) {
          isDeadStock = true;
        } else if (daysSinceLastSale >= slowMoverDays) {
          isSlowMover = true;
        }
      }

      await this.prisma.variantSalesStat.upsert({
        where: { variantId: variant.id },
        create: {
          variantId: variant.id,
          units30,
          units90,
          lastSoldAt,
          daysOfCover,
          ageDays,
          isSlowMover,
          isDeadStock,
          computedAt: now
        },
        update: {
          units30,
          units90,
          lastSoldAt,
          daysOfCover,
          ageDays,
          isSlowMover,
          isDeadStock,
          computedAt: now
        }
      });

      // 2. WO-9.3 (09-ai-layer.md) — demand forecast, same pass, same sales
      // rows already fetched above. "Start without a model": a trailing
      // average nudged by a same-period-last-year factor, never an AiProvider call.
      const leadTimeDays = resolveLeadTimeDays(
        variant.preferredSupplierId,
        variant.id,
        defaultLeadTimeBySupplier,
        leadTimeOverrideByKey,
      );

      const forecast = computeDemandForecast({
        stock: variant.stock,
        sales: sales.map((sale) => ({ qty: -sale.delta, occurredAt: sale.createdAt })),
        now,
        minLastYearUnits,
        leadTimeDays,
      });

      await this.prisma.variantForecast.upsert({
        where: { variantId: variant.id },
        create: { variantId: variant.id, ...forecast, computedAt: now },
        update: { ...forecast, computedAt: now },
      });
    }

    // Reorder-PO drafting moved to purchasing.cron.ts (PurchasingCron) —
    // it belongs with the module that owns PurchaseOrder, and now shares its
    // implementation with the real-time reorder.listener.ts instead of
    // duplicating this loop's old inline version.

    this.logger.log('Nightly inventory computation complete');
  }
}
