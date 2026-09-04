import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@yaseen/shared';
import {
  DomainEvent,
  type OrderPlacedPayload,
  type OrderStatusChangedPayload,
} from '../../core/events/domain-events';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { NotificationsService } from '../../core/notifications/notifications.service';
import type {
  OrderEmailAddress,
  OrderEmailData,
} from '../../core/notifications/email/templates';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Tells the customer what is happening to their order.
 *
 * Sends through NotificationsService rather than touching a mail transport, so
 * the same event reaches whichever channels are switched on — the log in
 * development, email in production, a push to the app if they have it.
 *
 * Statuses worth an email are listed rather than inferred. Every transition is
 * interesting to the shop; only some are interesting to the customer, and
 * mailing on all of them is how a store teaches people to ignore its mail.
 *
 * CANCELLED never actually reaches this set through OrderStatusChanged —
 * orders.service.ts fires the separate order.cancelled event for that
 * transition (see onCancelled below) — but it stays listed so the intent is
 * visible in one place and the set matches the copy in email/copy.ts.
 */
const STATUSES_WORTH_AN_EMAIL = new Set(['SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED']);

/**
 * Some statuses get their own dedicated template rather than the generic
 * "your order is now X" one — a real shipping-confirmation layout, not a
 * sentence with the status word swapped in. Anything not listed here (today:
 * RETURNED) falls back to the generic 'order.status_changed' template.
 *
 * SHIPPED's copy also covers "out for delivery": the schema has no distinct
 * status between SHIPPED and DELIVERED (adding one would mean a new courier
 * hand-off signal nothing currently produces), so the shipped mail is worded
 * to cover the whole "on its way" window rather than promising a second mail
 * that nothing would ever trigger.
 */
const STATUS_TEMPLATE: Record<string, string> = {
  SHIPPED: 'order.shipped',
  DELIVERED: 'order.delivered',
  CANCELLED: 'order.cancelled',
};

@Injectable()
export class OrderNotificationSubscriber {
  private readonly logger = new Logger(OrderNotificationSubscriber.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * The order confirmation.
   *
   * Outbox delivery is at-least-once, and this handler is not idempotent —
   * a retry sends a second copy. That is deliberate for now: it matches how
   * the stitching subscriber already behaves, and a duplicate confirmation is
   * a far better failure than a missing one. Making it exactly-once needs a
   * sent-notification table to check against, which is a migration.
   */
  @OnDomainEvent(DomainEvent.OrderPlaced)
  async onOrderPlaced(payload: OrderPlacedPayload): Promise<void> {
    if (!payload.customerEmail && !payload.userId) return;

    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      include: {
        items: {
          select: {
            nameEn: true,
            nameUr: true,
            variantLabel: true,
            imageUrl: true,
            quantity: true,
            lineTotal: true,
            stitchingServiceId: true,
          },
        },
        payments: {
          select: { provider: true, status: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        user: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    // At-least-once delivery means a retry can land after the order is gone.
    // Nothing to tell anyone about, so treat it as done rather than burning
    // the event's remaining attempts on a lookup that will never succeed.
    if (!order) {
      this.logger.warn(
        `Order ${payload.orderNumber} no longer exists — skipping confirmation email.`,
      );
      return;
    }

    const email = payload.customerEmail ?? order.user?.email ?? null;
    if (!email) return;

    const locale = await this.localeFor(payload.userId);
    const payment = order.payments[0];

    const data: OrderEmailData = {
      orderNumber: order.number,
      items: order.items.map((item) => ({
        name: (locale === 'ur' ? item.nameUr : item.nameEn) || item.nameEn,
        variantLabel: item.variantLabel,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
        stitched: Boolean(item.stitchingServiceId),
      })),
      itemsSubtotal: order.itemsSubtotal,
      stitchingSubtotal: order.stitchingSubtotal,
      discountTotal: order.itemDiscountTotal + order.orderDiscount,
      shippingFee: order.shippingFee,
      codFee: order.codFee,
      grandTotal: order.grandTotal,
      shippingAddress: asAddress(order.shippingAddress),
      billingAddress: asAddress(order.billingAddress),
      paymentProvider: payment?.provider ?? null,
      // The bank details panel is the whole point of the mail for a transfer
      // customer: it is where they learn what to pay and where to send proof.
      awaitingBankTransfer:
        payment?.provider === 'bank_transfer' && payment.status !== 'PAID',
    };

    await this.notifications.send({
      template: 'order.confirmed',
      recipient: {
        name: payload.customerName,
        email,
        phone: payload.customerPhone,
        userId: payload.userId,
        locale,
      },
      subject: `Order ${order.number} confirmed`,
      body: `Thank you for your order. We are getting ${order.number} ready.`,
      data: data as unknown as Record<string, unknown>,
    });

    this.logger.log(`Sent order confirmation for ${order.number}`);
  }

  /**
   * OrdersService.changeStatus fires this as its own event rather than
   * through order.status_changed when toStatus is CANCELLED, so this needs
   * its own subscription — onStatusChanged never actually sees
   * toStatus: 'CANCELLED' on its own. Same payload shape, same handling.
   */
  @OnDomainEvent(DomainEvent.OrderCancelled)
  async onCancelled(payload: OrderStatusChangedPayload): Promise<void> {
    await this.onStatusChanged(payload);
  }

  @OnDomainEvent(DomainEvent.OrderStatusChanged)
  async onStatusChanged(payload: OrderStatusChangedPayload): Promise<void> {
    if (!STATUSES_WORTH_AN_EMAIL.has(payload.toStatus)) return;

    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      select: {
        number: true,
        userId: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        user: { select: { email: true } },
        payments: {
          select: { provider: true, status: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const email = order?.guestEmail ?? order?.user?.email ?? null;
    if (!order || !email) return;

    const locale = await this.localeFor(order.userId);
    const template = STATUS_TEMPLATE[payload.toStatus] ?? 'order.status_changed';
    const payment = order.payments[0];
    // A COD order was never paid, so there is nothing to refund; anything
    // else that reached PAID owes the customer their money back.
    const awaitingRefund = payload.toStatus === 'CANCELLED' && payment?.status === 'PAID';

    await this.notifications.send({
      template,
      recipient: {
        name: order.guestName,
        email,
        phone: order.guestPhone,
        userId: order.userId,
        locale,
      },
      subject: `${order.number} — ${payload.toStatus.toLowerCase()}`,
      body: `Order ${order.number} is now ${payload.toStatus.toLowerCase()}.`,
      data: { orderNumber: order.number, status: payload.toStatus, awaitingRefund },
    });
  }

  /**
   * Which language to write in.
   *
   * The only language preference the schema records today is on DeviceToken,
   * set when the mobile app registers for push, so app customers get Urdu mail
   * and everyone else gets English. Capturing the storefront's locale on the
   * order at checkout would cover web customers too — a nullable `locale`
   * column on Order, read from the locale-prefixed route the order came from.
   */
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

/**
 * Reads an address snapshot off the order.
 *
 * These are Json columns rather than relations — the address book is editable,
 * so the order keeps its own copy — which means Prisma types them as JsonValue
 * and the shape has to be narrowed here rather than trusted.
 */
function asAddress(value: unknown): OrderEmailAddress | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const str = (key: string): string | null =>
    typeof raw[key] === 'string' ? (raw[key] as string) : null;

  return {
    fullName: str('fullName'),
    phone: str('phone'),
    line1: str('line1'),
    line2: str('line2'),
    city: str('city'),
    province: str('province'),
    postalCode: str('postalCode'),
    country: str('country'),
  };
}
