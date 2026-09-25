import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { DomainEvent, type StockReplenishedPayload } from '../../core/events/domain-events';
import { PrismaService } from '../../core/prisma/prisma.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { NotificationPreferencesService } from '../../core/notifications/notification-preferences.service';

/**
 * WO-7.6's back-in-stock alert. `StockReplenishedPayload` is per-location
 * (Phase 1's ledger), so this re-reads the variant's own cached total
 * (`ProductVariant.stock`) rather than trusting the event's own delta —
 * a variant with stock at a second location was never actually at zero, and
 * this must not fire for it.
 *
 * Deletes every request it sends for — the same "delete on send" idiom
 * `BackorderListener` doesn't need but this alert does, per the brief's own
 * words: "guard against a flapping stock level notifying repeatedly — send
 * once per request, and delete on send." A customer who asks again after
 * the alert creates a fresh row, which is the intended way to ask twice.
 */
@Injectable()
export class BackInStockListener {
  private readonly logger = new Logger(BackInStockListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly preferences: NotificationPreferencesService,
  ) {}

  @OnDomainEvent(DomainEvent.StockReplenished)
  async onStockReplenished(payload: StockReplenishedPayload): Promise<void> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: payload.variantId },
      include: { product: { include: { translations: true } } },
    });
    if (!variant || variant.stock <= 0) return;

    const waiting = await this.prisma.backInStockRequest.findMany({
      where: { variantId: payload.variantId },
      include: { user: { select: { id: true, email: true, firstName: true } } },
    });
    if (waiting.length === 0) return;

    const name = variant.product.translations.find((t) => t.locale === 'en')?.name ?? variant.product.translations[0]?.name ?? '';

    // Only a request actually sent (or hopelessly unsendable — no email on
    // file) is deleted. A genuine send failure keeps its row so the NEXT
    // replenishment retries it, rather than silently dropping the alert.
    const sentRequestIds: string[] = [];
    for (const request of waiting) {
      const wantsIt = await this.preferences.isEnabled(request.user.id, 'EMAIL', 'BACK_IN_STOCK');
      if (!request.user.email || !wantsIt) {
        sentRequestIds.push(request.id);
        continue;
      }
      try {
        await this.notifications.send({
          template: 'wishlist.back_in_stock',
          recipient: { name: request.user.firstName, email: request.user.email, userId: request.user.id },
          subject: `${name} is back in stock`,
          body: `${name} is available again.`,
          data: { productSlug: variant.productId, variantId: variant.id },
        });
        sentRequestIds.push(request.id);
      } catch (error) {
        this.logger.error(`back-in-stock notify failed for user ${request.userId}: ${(error as Error).message}`);
      }
    }

    if (sentRequestIds.length > 0) {
      await this.prisma.backInStockRequest.deleteMany({ where: { id: { in: sentRequestIds } } });
    }
  }
}
