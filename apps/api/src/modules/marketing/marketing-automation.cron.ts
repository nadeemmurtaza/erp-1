import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DEFAULT_LOCALE, formatMoney, isLocale, pickTranslation, type Locale } from '@yaseen/shared';
import { AppConfigService } from '../../core/config/app-config.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import type {
  OrderEmailItem,
  MarketingProduct,
} from '../../core/notifications/email/templates';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../core/prisma/client';
import { SettingKey } from '../../core/settings/settings.defaults';
import { SettingsService } from '../../core/settings/settings.service';
import { unsubscribeToken } from '../../core/security/unsubscribe-token';

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

const cartMarketingInclude = {
  user: { select: { email: true, firstName: true } },
  items: {
    include: {
      product: {
        select: {
          slug: true,
          basePrice: true,
          translations: { select: { locale: true, name: true } },
          images: { where: { isPrimary: true }, take: 1, select: { url: true } },
        },
      },
      variant: { select: { size: true, color: true, priceOverride: true } },
    },
  },
} satisfies Prisma.CartInclude;

type CartForMarketing = Prisma.CartGetPayload<{ include: typeof cartMarketingInclude }>;

/**
 * Lifecycle marketing email: the automation gap that used to sit behind
 * every marketing template's `trigger: 'manual'` note in email/catalog.ts.
 *
 * Scoped to LOGGED-IN customers only, across all three sends below. A guest
 * checkout has no account to record consent (marketingEmailOptOut) or an
 * unsubscribe token against, and a guest cart has no email at all until
 * checkout — sending marketing mail to either would mean no working opt-out,
 * which this codebase will not do. Covering guests needs its own consent
 * capture built first, not a shortcut taken here.
 *
 * Runs nightly; every threshold below is a Setting an owner edits from
 * /admin/marketing, and the whole thing no-ops while
 * marketing.automation_enabled is off (the ship-safe default — see
 * tax.enabled for the same pattern).
 */
@Injectable()
export class MarketingAutomationCron {
  private readonly logger = new Logger(MarketingAutomationCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly config: AppConfigService,
  ) {}

  @Cron('0 3 * * *')
  async run(): Promise<void> {
    const enabled = await this.settings.get<boolean>(SettingKey.MarketingAutomationEnabled);
    if (!enabled) return;

    const [reminders, incentives, reviews, replenishments] = await Promise.all([
      this.sendAbandonedCartReminders(),
      this.sendAbandonedCartIncentives(),
      this.sendReviewRequests(),
      this.sendReplenishmentReminders(),
    ]);

    const total = reminders + incentives + reviews + replenishments;
    if (total > 0) {
      this.logger.log(
        `Marketing automation: ${reminders} cart reminder(s), ${incentives} cart incentive(s), ` +
          `${reviews} review request(s), ${replenishments} replenishment reminder(s)`,
      );
    }
  }

  async sendAbandonedCartReminders(): Promise<number> {
    const hours = await this.settings.get<number>(SettingKey.MarketingAbandonedCartReminderHours);
    const cutoff = new Date(Date.now() - hours * HOUR_MS);

    const carts = await this.prisma.cart.findMany({
      where: {
        userId: { not: null },
        reminderSentAt: null,
        updatedAt: { lte: cutoff },
        items: { some: {} },
        user: { marketingEmailOptOut: false },
      },
      include: cartMarketingInclude,
    });

    let sent = 0;
    for (const cart of carts) {
      try {
        const didSend = await this.sendCartEmail(cart, 'marketing.abandoned_cart_reminder');
        if (didSend) {
          await this.prisma.cart.update({
            where: { id: cart.id },
            data: { reminderSentAt: new Date() },
          });
          sent += 1;
        }
      } catch (error) {
        this.logger.error(`abandoned-cart reminder failed for cart ${cart.id}: ${describe(error)}`);
      }
    }
    return sent;
  }

  async sendAbandonedCartIncentives(): Promise<number> {
    const hours = await this.settings.get<number>(SettingKey.MarketingAbandonedCartIncentiveHours);
    const cutoff = new Date(Date.now() - hours * HOUR_MS);

    const carts = await this.prisma.cart.findMany({
      where: {
        userId: { not: null },
        reminderSentAt: { not: null, lte: cutoff },
        incentiveSentAt: null,
        items: { some: {} },
        user: { marketingEmailOptOut: false },
      },
      include: cartMarketingInclude,
    });

    let sent = 0;
    for (const cart of carts) {
      try {
        const didSend = await this.sendCartEmail(cart, 'marketing.abandoned_cart_incentive');
        if (didSend) {
          await this.prisma.cart.update({
            where: { id: cart.id },
            data: { incentiveSentAt: new Date() },
          });
          sent += 1;
        }
      } catch (error) {
        this.logger.error(`abandoned-cart incentive failed for cart ${cart.id}: ${describe(error)}`);
      }
    }
    return sent;
  }

  async sendReviewRequests(): Promise<number> {
    const days = await this.settings.get<number>(SettingKey.MarketingReviewRequestDays);
    const cutoff = new Date(Date.now() - days * DAY_MS);

    const orders = await this.prisma.order.findMany({
      where: {
        status: 'DELIVERED',
        userId: { not: null },
        deliveredAt: { not: null, lte: cutoff },
        reviewRequestSentAt: null,
        user: { marketingEmailOptOut: false },
      },
      include: {
        user: { select: { email: true, firstName: true } },
        items: { select: { nameEn: true, nameUr: true, imageUrl: true, unitPrice: true } },
      },
    });

    let sent = 0;
    for (const order of orders) {
      if (!order.user?.email || !order.userId) continue;
      try {
        const locale = await this.localeFor(order.userId);
        await this.notifications.send({
          template: 'marketing.review_request',
          recipient: {
            name: order.user.firstName,
            email: order.user.email,
            userId: order.userId,
            locale,
          },
          subject: `How was order ${order.number}?`,
          body: "We'd love your feedback.",
          data: {
            orderNumber: order.number,
            items: order.items.map(
              (item): MarketingProduct => ({
                name: (locale === 'ur' ? item.nameUr : item.nameEn) || item.nameEn,
                imageUrl: item.imageUrl,
                price: formatMoney(item.unitPrice, locale),
              }),
            ),
            unsubscribeUrl: this.unsubscribeUrl(order.userId, locale),
          } satisfies { orderNumber: string; items: MarketingProduct[]; unsubscribeUrl: string },
        });
        await this.prisma.order.update({
          where: { id: order.id },
          data: { reviewRequestSentAt: new Date() },
        });
        sent += 1;
      } catch (error) {
        this.logger.error(`review request failed for order ${order.number}: ${describe(error)}`);
      }
    }
    return sent;
  }

  async sendReplenishmentReminders(): Promise<number> {
    const days = await this.settings.get<number>(SettingKey.MarketingReplenishmentReminderDays);
    const cutoff = new Date(Date.now() - days * DAY_MS);

    const items = await this.prisma.orderItem.findMany({
      where: {
        replenishmentReminderSentAt: null,
        product: { isConsumable: true },
        order: {
          status: 'DELIVERED',
          userId: { not: null },
          deliveredAt: { not: null, lte: cutoff },
          user: { marketingEmailOptOut: false },
        },
      },
      include: {
        order: {
          select: { id: true, userId: true, user: { select: { email: true, firstName: true } } },
        },
        product: {
          select: {
            slug: true,
            basePrice: true,
            translations: { select: { locale: true, name: true } },
            images: { where: { isPrimary: true }, take: 1, select: { url: true } },
          },
        },
      },
    });

    let sent = 0;
    for (const item of items) {
      const email = item.order.user?.email;
      const userId = item.order.userId;
      if (!email || !userId || !item.product) continue;

      try {
        const locale = await this.localeFor(userId);
        const name = pickTranslation(item.product.translations, locale)?.name ?? item.nameEn;
        const product: MarketingProduct = {
          name,
          imageUrl: item.product.images[0]?.url ?? null,
          // Today's price, not what they paid last time — a reorder nudge
          // showing a stale historical price would be a real correctness bug.
          price: formatMoney(item.product.basePrice, locale),
          url: `${this.storefrontUrl()}/${locale}/product/${item.product.slug}`,
        };

        await this.notifications.send({
          template: 'marketing.replenishment_reminder',
          recipient: { name: item.order.user?.firstName, email, userId, locale },
          subject: `Running low on ${name}?`,
          body: 'Time to reorder?',
          data: {
            product,
            unsubscribeUrl: this.unsubscribeUrl(userId, locale),
          } satisfies { product: MarketingProduct; unsubscribeUrl: string },
        });
        await this.prisma.orderItem.update({
          where: { id: item.id },
          data: { replenishmentReminderSentAt: new Date() },
        });
        sent += 1;
      } catch (error) {
        this.logger.error(`replenishment reminder failed for order item ${item.id}: ${describe(error)}`);
      }
    }
    return sent;
  }

  /** False when the cart has no user email to send to — the caller does not record a send. */
  private async sendCartEmail(
    cart: CartForMarketing,
    template: 'marketing.abandoned_cart_reminder' | 'marketing.abandoned_cart_incentive',
  ): Promise<boolean> {
    if (!cart.user?.email || !cart.userId) return false;

    const locale = await this.localeFor(cart.userId);
    const items: OrderEmailItem[] = cart.items.map((item) => {
      const name =
        pickTranslation(item.product.translations, locale)?.name ??
        item.product.translations[0]?.name ??
        item.product.slug;
      const unitPrice = item.variant.priceOverride ?? item.product.basePrice;
      return {
        name,
        variantLabel: [item.variant.size, item.variant.color].filter(Boolean).join(' / ') || null,
        imageUrl: item.product.images[0]?.url ?? null,
        quantity: item.quantity,
        lineTotal: unitPrice * item.quantity,
      };
    });

    await this.notifications.send({
      template,
      recipient: { name: cart.user.firstName, email: cart.user.email, userId: cart.userId, locale },
      subject: 'Still thinking it over?',
      body: 'You left something in your cart.',
      data: {
        items,
        cartUrl: `${this.storefrontUrl()}/${locale}/cart`,
        unsubscribeUrl: this.unsubscribeUrl(cart.userId, locale),
      },
    });
    return true;
  }

  private storefrontUrl(): string {
    return this.config.get('STOREFRONT_URL').replace(/\/+$/, '');
  }

  private unsubscribeUrl(userId: string, locale: Locale): string {
    const key = this.config.get('APP_ENCRYPTION_KEY');
    const token = unsubscribeToken(userId, key);
    return `${this.storefrontUrl()}/${locale}/unsubscribe?u=${encodeURIComponent(
      userId,
    )}&t=${encodeURIComponent(token)}`;
  }

  /**
   * Same resolution as OrderNotificationSubscriber.localeFor(): the only
   * language preference the schema records is on DeviceToken (set when the
   * mobile app registers for push), so anyone without one gets English.
   */
  private async localeFor(userId: string): Promise<Locale> {
    const device = await this.prisma.deviceToken.findFirst({
      where: { userId, locale: { not: null } },
      orderBy: { lastSeenAt: 'desc' },
      select: { locale: true },
    });
    const locale = device?.locale?.split('-')[0];
    return locale && isLocale(locale) ? locale : DEFAULT_LOCALE;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
