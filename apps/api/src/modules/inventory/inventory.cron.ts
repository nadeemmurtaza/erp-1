import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';

@Injectable()
export class InventoryCron {
  private readonly logger = new Logger(InventoryCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  @Cron('0 2 * * *')
  async computeNightlyStats() {
    this.logger.log('Starting nightly inventory computation');

    const slowMoverDays = await this.settings.get<number>(SettingKey.InventorySlowMoverDays);
    const deadStockDays = await this.settings.get<number>(SettingKey.InventoryDeadStockDays);

    const variants = await this.prisma.productVariant.findMany({
      where: { isActive: true },
      select: {
        id: true,
        stock: true,
        createdAt: true
      }
    });

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
    }

    // Reorder-PO drafting moved to purchasing.cron.ts (PurchasingCron) —
    // it belongs with the module that owns PurchaseOrder, and now shares its
    // implementation with the real-time reorder.listener.ts instead of
    // duplicating this loop's old inline version.

    this.logger.log('Nightly inventory computation complete');
  }
}
