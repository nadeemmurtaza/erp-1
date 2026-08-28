import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { DomainEvent, ProductLowStockPayload } from '../../core/events/domain-events';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey, StoreSettings } from '../../core/settings/settings.defaults';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class InventoryListener {
  private readonly logger = new Logger(InventoryListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @OnDomainEvent(DomainEvent.ProductLowStock)
  async handleLowStock(payload: ProductLowStockPayload) {
    const now = new Date();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    // Check debounce using VariantSalesStat
    const stat = await this.prisma.variantSalesStat.findUnique({
      where: { variantId: payload.variantId }
    });

    if (stat && stat.lastLowStockAlertAt) {
      const timeSinceLastAlert = now.getTime() - stat.lastLowStockAlertAt.getTime();
      if (timeSinceLastAlert < ONE_DAY) {
        return; // Debounced
      }
    }

    // Persist new alert time
    await this.prisma.variantSalesStat.upsert({
      where: { variantId: payload.variantId },
      create: {
        variantId: payload.variantId,
        lastLowStockAlertAt: now,
      },
      update: {
        lastLowStockAlertAt: now,
      }
    });

    this.logger.log(`Low stock alert triggered for variant ${payload.variantId}`);

    const store = await this.settings.get<StoreSettings>(SettingKey.Store);

    await this.notifications.send({
      template: 'inventory.low_stock',
      recipient: { email: store.supportEmail, name: store.nameEn },
      subject: `Low Stock Alert: ${payload.sku}`,
      body: `Variant ${payload.sku} has fallen to ${payload.stock} units, which is at or below the threshold of ${payload.threshold}.`,
      data: { ...payload },
    });
  }
}
