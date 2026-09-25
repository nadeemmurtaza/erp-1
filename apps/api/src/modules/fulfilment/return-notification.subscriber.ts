import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@newax/shared';
import { DomainEvent, type ReturnRequestStatusChangedPayload } from '../../core/events/domain-events';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Tells the customer what is happening to their return — same idiom as
 * orders/notification.subscriber.ts's STATUSES_WORTH_AN_EMAIL, just for the
 * return's own status machine instead of the order's.
 */
const STATUSES_WORTH_AN_EMAIL = new Set(['APPROVED', 'REJECTED', 'REFUNDED']);

@Injectable()
export class ReturnNotificationSubscriber {
  private readonly logger = new Logger(ReturnNotificationSubscriber.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @OnDomainEvent(DomainEvent.ReturnRequestStatusChanged)
  async onStatusChanged(payload: ReturnRequestStatusChangedPayload): Promise<void> {
    if (!STATUSES_WORTH_AN_EMAIL.has(payload.toStatus)) return;

    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      select: {
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        userId: true,
        user: { select: { email: true } },
      },
    });
    const email = order?.guestEmail ?? order?.user?.email ?? null;
    if (!order || !email) return;

    const locale = await this.localeFor(order.userId);

    // 'return.status_changed' has no registered template (email/catalog.ts)
    // — EmailChannel's own fallback wraps subject/body in the standard
    // branded shell, the same as any untemplated message. A dedicated
    // layout is cosmetic work, not a functional gap.
    await this.notifications.send({
      template: 'return.status_changed',
      recipient: { name: order.guestName, email, phone: order.guestPhone, userId: order.userId, locale },
      subject: `Return ${payload.returnNumber} — ${payload.toStatus.toLowerCase()}`,
      body: `Your return ${payload.returnNumber} is now ${payload.toStatus.toLowerCase()}.`,
      data: { returnNumber: payload.returnNumber, status: payload.toStatus },
    });

    this.logger.log(`Sent return status email for ${payload.returnNumber} (${payload.toStatus})`);
  }

  private async localeFor(userId: string | null): Promise<Locale> {
    if (!userId) return DEFAULT_LOCALE;
    const device = await this.prisma.deviceToken.findFirst({
      where: { userId, locale: { not: null } },
      orderBy: { lastSeenAt: 'desc' },
      select: { locale: true },
    });
    const locale = device?.locale?.split('-')[0];
    return locale && isLocale(locale) ? locale : DEFAULT_LOCALE;
  }
}
