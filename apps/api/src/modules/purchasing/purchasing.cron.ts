import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { resolveLeadTimeDays, suggestReorderQuantity } from '@newax/shared';
import { PurchasingService } from './purchasing.service';

/**
 * The nightly safety-net sweep for reorder drafting. reorder.listener.ts is
 * the primary, real-time path (fires the moment InventoryService.move()
 * crosses a variant's reorderPoint); this cron exists only to catch what
 * that path could miss — a bulk stock import that bypasses move(), an
 * outbox delivery still retrying, a setting flipped on after stock was
 * already below the point. Calls the exact same
 * PurchasingService.upsertReorderDraftLine() the listener does, so a variant
 * caught by both never ends up with two draft lines.
 *
 * WO-9.3 (09-ai-layer.md): a variant's own static reorderQuantity, when a
 * buyer set one, always wins outright. Only when it's unset does this reach
 * for VariantForecast (populated by the SAME night's InventoryCron pass) to
 * suggest covering lead time plus a safety buffer at the forecasted daily
 * rate, with the forecast's own seasonal reasoning carried onto the line as
 * a note — never silently replacing a human's own number.
 */
@Injectable()
export class PurchasingCron {
  private readonly logger = new Logger(PurchasingCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly purchasing: PurchasingService,
  ) {}

  @Cron('0 3 * * *')
  async sweepReorderCandidates(): Promise<void> {
    const autoDraft = await this.settings.get<boolean>(SettingKey.PurchasingAutoDraftReorder);
    if (!autoDraft) return;

    const variants = await this.prisma.productVariant.findMany({
      where: {
        isActive: true,
        producedInHouse: false,
        reorderPoint: { not: null },
        stock: { lte: this.prisma.productVariant.fields.reorderPoint },
        preferredSupplierId: { not: null },
      },
      select: {
        id: true,
        sku: true,
        stock: true,
        reorderPoint: true,
        reorderQuantity: true,
        preferredSupplierId: true,
        costPrice: true,
        forecast: { select: { forecastedDailyDemand: true, reasonEn: true } },
      },
    });

    // WO-9.3 (09-ai-layer.md) — same lead-time resolution InventoryCron uses
    // to compute VariantForecast in the first place, so the two never disagree.
    const supplierIds = [
      ...new Set(variants.map((v) => v.preferredSupplierId).filter((id): id is string => id !== null)),
    ];
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
    const safetyStockDays = await this.settings.get<number>(SettingKey.DemandForecastSafetyStockDays);

    let drafted = 0;
    for (const variant of variants) {
      if (!variant.preferredSupplierId || variant.reorderPoint === null) continue;

      let quantity = variant.reorderQuantity ?? 0;
      let note: string | undefined;

      if (!variant.reorderQuantity && variant.forecast) {
        const leadTimeDays = resolveLeadTimeDays(
          variant.preferredSupplierId,
          variant.id,
          defaultLeadTimeBySupplier,
          leadTimeOverrideByKey,
        );
        if (leadTimeDays !== null) {
          quantity = suggestReorderQuantity(variant.forecast.forecastedDailyDemand, leadTimeDays, safetyStockDays);
          note = variant.forecast.reasonEn ?? undefined;
        }
      }

      if (!quantity) quantity = variant.reorderPoint - variant.stock;
      if (quantity < 1) quantity = 1;

      await this.purchasing.upsertReorderDraftLine({
        supplierId: variant.preferredSupplierId,
        variantId: variant.id,
        quantity,
        unitCost: variant.costPrice,
        note,
      });
      drafted += 1;
    }

    this.logger.log(`Nightly reorder sweep: ${drafted} variant(s) drafted or topped up`);
  }
}
