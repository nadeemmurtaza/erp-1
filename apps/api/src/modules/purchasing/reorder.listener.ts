import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { DomainEvent, type ProductReorderPointReachedPayload } from '../../core/events/domain-events';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PurchasingService } from './purchasing.service';

/**
 * Turns a real-time reorder-point crossing into an immediate DRAFT PO line,
 * for variants sourced from an external supplier. The mirror case —
 * producedInHouse variants — is handled by production's own
 * reorder-work-order.listener.ts; the two never fire for the same variant.
 */
@Injectable()
export class PurchasingReorderListener {
  private readonly logger = new Logger(PurchasingReorderListener.name);

  constructor(
    private readonly purchasing: PurchasingService,
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @OnDomainEvent(DomainEvent.ProductReorderPointReached)
  async onReorderPointReached(payload: ProductReorderPointReachedPayload): Promise<void> {
    if (payload.producedInHouse) return;
    if (!payload.preferredSupplierId) return;

    const autoDraft = await this.settings.get<boolean>(SettingKey.PurchasingAutoDraftReorder);
    if (!autoDraft) return;

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: payload.variantId },
      select: { costPrice: true },
    });

    let quantity = payload.reorderQuantity ?? payload.reorderPoint - payload.stock;
    if (quantity < 1) quantity = 1;

    await this.purchasing.upsertReorderDraftLine({
      supplierId: payload.preferredSupplierId,
      variantId: payload.variantId,
      quantity,
      unitCost: variant?.costPrice ?? 0,
    });

    this.logger.log(`Real-time reorder: drafted PO line for ${payload.sku} (qty ${quantity})`);
  }
}
