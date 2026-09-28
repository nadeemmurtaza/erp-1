import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PermissionsResolverService } from '../../core/auth/permissions.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { computeDemandForecast, computeMarkdownSuggestion, resolveLeadTimeDays } from '@newax/shared';
import { LotsService } from './lots.service';
import { SpotCheckService } from './spot-check.service';

const EXPIRING_LOT_WINDOW_DAYS = 30;

@Injectable()
export class InventoryCron {
  private readonly logger = new Logger(InventoryCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly spotChecks: SpotCheckService,
    private readonly lots: LotsService,
    private readonly permissions: PermissionsResolverService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * 32-lots-batch-expiry-fefo.md WO-32.5. One consolidated digest to every
   * `inventory.manage` holder — never a ping per expiring lot — resolved as
   * a capability, not `store.supportEmail` (CLAUDE.md's own named
   * counter-example). A zero-holder deployment still gets the escalation
   * this codebase's tooling can actually do today: a structured error log,
   * since no APM/pager is wired (CLAUDE.md's Observable row).
   */
  @Cron('0 6 * * *')
  async alertExpiringLots() {
    try {
      const expiring = await this.lots.expiringLotsWithStock(EXPIRING_LOT_WINDOW_DAYS);
      if (expiring.length === 0) return;

      const holders = await this.permissions.usersWithPermission('inventory.manage');
      if (holders.length === 0) {
        this.logger.error(
          `${expiring.length} lot(s) expiring within ${EXPIRING_LOT_WINDOW_DAYS} days with unsold stock, but no user currently holds inventory.manage to be notified.`,
        );
        return;
      }

      const lines = expiring
        .map(
          (lot) =>
            `${lot.lotCode} — ${lot.label} (${lot.sku}): ${lot.unsoldQuantity} unit(s), expires ${lot.expiresOn.toISOString().slice(0, 10)}`,
        )
        .join('\n');
      const subject = `${expiring.length} lot(s) expiring within ${EXPIRING_LOT_WINDOW_DAYS} days`;
      const body = `The following lots have unsold stock and expire within ${EXPIRING_LOT_WINDOW_DAYS} days:\n\n${lines}`;

      await Promise.all(
        holders.map((holder) =>
          this.notifications.send({
            template: 'inventory.lots_expiring',
            recipient: {
              name: [holder.firstName, holder.lastName].filter(Boolean).join(' ') || null,
              email: holder.email,
              userId: holder.id,
            },
            subject,
            body,
            data: { lotIds: expiring.map((lot) => lot.lotId) },
          }),
        ),
      );
      this.logger.log(`Sent expiring-lot digest for ${expiring.length} lot(s) to ${holders.length} inventory.manage holder(s).`);
    } catch (error) {
      this.logger.error('alertExpiringLots failed', error instanceof Error ? error.stack : String(error));
    }
  }

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
    const markdownVelocityMultiplier = await this.settings.get<number>(SettingKey.MarkdownVelocityMultiplierPer10Pct);
    const markdownTargetClearancePct = await this.settings.get<number>(SettingKey.MarkdownTargetClearancePct);
    const markdownMinMarginBps = await this.settings.get<number>(SettingKey.MarkdownMinMarginBps);

    const variants = await this.prisma.productVariant.findMany({
      where: { isActive: true },
      select: {
        id: true,
        stock: true,
        createdAt: true,
        preferredSupplierId: true,
        priceOverride: true,
        costPrice: true,
        product: { select: { basePrice: true } },
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

      // 3. WO-9.8 (09-ai-layer.md) — markdown suggestions, only for stock
      // this same pass just flagged ageing, and only when one isn't already
      // sitting in the review queue (never re-drafts a genuine duplicate,
      // same idiom as AiSuggestionsService's own generateForProduct()).
      if (isSlowMover || isDeadStock) {
        const alreadyPending = await this.prisma.markdownSuggestion.findFirst({
          where: { variantId: variant.id, status: 'PENDING' },
          select: { id: true },
        });

        if (!alreadyPending) {
          const suggestion = computeMarkdownSuggestion({
            stock: variant.stock,
            costPricePaisa: variant.costPrice,
            currentPricePaisa: variant.priceOverride ?? variant.product.basePrice,
            units90,
            velocityMultiplierPer10Pct: markdownVelocityMultiplier,
            targetClearancePct: markdownTargetClearancePct,
            minMarginBps: markdownMinMarginBps,
          });

          if (suggestion) {
            await this.prisma.markdownSuggestion.create({
              data: { variantId: variant.id, ...suggestion },
            });
          }
        }
      }
    }

    // Reorder-PO drafting moved to purchasing.cron.ts (PurchasingCron) —
    // it belongs with the module that owns PurchaseOrder, and now shares its
    // implementation with the real-time reorder.listener.ts instead of
    // duplicating this loop's old inline version.

    this.logger.log('Nightly inventory computation complete');
  }
}
