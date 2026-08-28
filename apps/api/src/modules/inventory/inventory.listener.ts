import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvent, ProductLowStockPayload } from '../../core/events/domain-events';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey, StoreSettings } from '../../core/settings/settings.defaults';

@Injectable()
export class InventoryListener {
  private readonly logger = new Logger(InventoryListener.name);
  // Simple in-memory debounce: variantId -> timestamp
  private lastNotified = new Map<string, number>();

  constructor(
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  @OnEvent(DomainEvent.ProductLowStock, { async: true })
  async handleLowStock(payload: ProductLowStockPayload) {
    const now = Date.now();
    const last = this.lastNotified.get(payload.variantId) || 0;
    const ONE_DAY = 24 * 60 * 60 * 1000;

    if (now - last < ONE_DAY) {
      return; // Debounced
    }

    this.lastNotified.set(payload.variantId, now);
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
