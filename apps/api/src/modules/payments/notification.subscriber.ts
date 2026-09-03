import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@yaseen/shared';
import { DomainEvent, type PaymentPayload } from '../../core/events/domain-events';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Tells the customer their money arrived.
 *
 * This is the second half of the bank-transfer flow: the order confirmation
 * carries the account details and says the order is pending, and this closes
 * the loop once staff verify the deposit. Without it the customer transfers
 * money and hears nothing, which is when they message WhatsApp asking whether
 * the order is real.
 *
 * Cash on delivery is skipped — there is no transfer to acknowledge, and the
 * "payment succeeded" event only fires there when the courier settles up,
 * long after the customer stopped caring.
 */
@Injectable()
export class PaymentNotificationSubscriber {
  private readonly logger = new Logger(PaymentNotificationSubscriber.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @OnDomainEvent(DomainEvent.PaymentSucceeded)
  async onPaymentSucceeded(payload: PaymentPayload): Promise<void> {
    if (payload.provider === 'cod') return;

    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      select: {
        number: true,
        userId: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        user: { select: { email: true } },
      },
    });

    const email = order?.guestEmail ?? order?.user?.email ?? null;
    if (!order || !email) return;

    const locale = await this.localeFor(order.userId);

    await this.notifications.send({
      template: 'payment.received',
      recipient: {
        name: order.guestName,
        email,
        phone: order.guestPhone,
        userId: order.userId,
        locale,
      },
      subject: `Payment received for ${order.number}`,
      body: `We have received your payment for ${order.number}.`,
      data: { orderNumber: order.number, amount: payload.amount },
    });

    this.logger.log(`Sent payment receipt for ${order.number}`);
  }

  /**
   * Tells the customer their online payment did not go through, so they know
   * to retry rather than assume the order is quietly stuck. Cash on delivery
   * never reaches this path (see onPaymentSucceeded) and bank transfer has no
   * automatic callback, so in practice this only fires for a declined
   * JazzCash/Easypaisa attempt.
   */
  @OnDomainEvent(DomainEvent.PaymentFailed)
  async onPaymentFailed(payload: PaymentPayload): Promise<void> {
    if (payload.provider === 'cod') return;

    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      select: {
        number: true,
        userId: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        user: { select: { email: true } },
      },
    });

    const email = order?.guestEmail ?? order?.user?.email ?? null;
    if (!order || !email) return;

    const locale = await this.localeFor(order.userId);

    await this.notifications.send({
      template: 'payment.failed',
      recipient: {
        name: order.guestName,
        email,
        phone: order.guestPhone,
        userId: order.userId,
        locale,
      },
      subject: `Payment did not go through — ${order.number}`,
      body: `Your payment for order ${order.number} could not be completed. Please try again.`,
      data: { orderNumber: order.number, amount: payload.amount },
    });

    this.logger.log(`Sent payment-failed notice for ${order.number}`);
  }

  /** Same resolution as the orders subscriber; see the note there. */
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
