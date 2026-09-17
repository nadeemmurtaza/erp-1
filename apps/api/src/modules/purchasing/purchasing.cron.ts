import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
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
      },
    });

    let drafted = 0;
    for (const variant of variants) {
      if (!variant.preferredSupplierId || variant.reorderPoint === null) continue;

      let quantity = variant.reorderQuantity ?? variant.reorderPoint - variant.stock;
      if (quantity < 1) quantity = 1;

      await this.purchasing.upsertReorderDraftLine({
        supplierId: variant.preferredSupplierId,
        variantId: variant.id,
        quantity,
        unitCost: variant.costPrice,
      });
      drafted += 1;
    }

    this.logger.log(`Nightly reorder sweep: ${drafted} variant(s) drafted or topped up`);
  }
}
