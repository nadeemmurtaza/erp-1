import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DEFAULT_LOCALE, formatMoney, generateHumanCode, isLocale, pickTranslation, type Locale } from '@newax/shared';
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

type CartTemplate =
  | 'marketing.abandoned_cart_first_touch'
  | 'marketing.abandoned_cart_reminder'
  | 'marketing.abandoned_cart_incentive';

/**
 * Lifecycle marketing email/SMS/WhatsApp: the automation gap that used to sit
 * behind every marketing template's `trigger: 'manual'` note in
 * email/catalog.ts.
 *
 * WO-8.5 closed three gaps the doc's own audit found: a two-step sequence
 * where the doc wants 1h/24h/72h (firstTouch is the new stage), guest carts
 * excluded entirely (a guest with a phone AND marketing consent captured at
 * checkout — Cart.guestPhone/guestMarketingConsentAt — now gets the same
 * three-stage sequence over WhatsApp/SMS instead of email), and the
 * incentive stage going out with no real discount code (it now mints a
 * genuine single-use PromoCode).
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

    const [firstTouches, reminders, incentives, reviews, replenishments] = await Promise.all([
      this.sendAbandonedCartFirstTouch(),
      this.sendAbandonedCartReminders(),
      this.sendAbandonedCartIncentives(),
      this.sendReviewRequests(),
      this.sendReplenishmentReminders(),
    ]);

    const total = firstTouches + reminders + incentives + reviews + replenishments;
    if (total > 0) {
      this.logger.log(
        `Marketing automation: ${firstTouches} cart first-touch(es), ${reminders} cart reminder(s), ${incentives} cart incentive(s), ` +
          `${reviews} review request(s), ${replenishments} replenishment reminder(s)`,
      );
    }
  }

  /** WO-8.5's own stage 1 of the doc's 1h/24h/72h sequence — a soft nudge, never an incentive. */
  async sendAbandonedCartFirstTouch(): Promise<number> {
    const hours = await this.settings.get<number>(SettingKey.MarketingAbandonedCartFirstTouchHours);
    const cutoff = new Date(Date.now() - hours * HOUR_MS);

    const carts = await this.abandonedCandidates({ firstTouchSentAt: null, updatedAt: { lte: cutoff } });

    let sent = 0;
    for (const cart of carts) {
      try {
        const didSend = await this.sendCartTouch(cart, 'marketing.abandoned_cart_first_touch');
        if (didSend) {
          await this.prisma.cart.update({ where: { id: cart.id }, data: { firstTouchSentAt: new Date() } });
          sent += 1;
        }
      } catch (error) {
        this.logger.error(`abandoned-cart first touch failed for cart ${cart.id}: ${describe(error)}`);
      }
    }
    return sent;
  }

  async sendAbandonedCartReminders(): Promise<number> {
    const hours = await this.settings.get<number>(SettingKey.MarketingAbandonedCartReminderHours);
    const cutoff = new Date(Date.now() - hours * HOUR_MS);

    const carts = await this.abandonedCandidates({ reminderSentAt: null, firstTouchSentAt: { not: null, lte: cutoff } });

    let sent = 0;
    for (const cart of carts) {
      try {
        const didSend = await this.sendCartTouch(cart, 'marketing.abandoned_cart_reminder');
        if (didSend) {
          await this.prisma.cart.update({ where: { id: cart.id }, data: { reminderSentAt: new Date() } });
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

    const carts = await this.abandonedCandidates({ incentiveSentAt: null, reminderSentAt: { not: null, lte: cutoff } });

    let sent = 0;
    for (const cart of carts) {
      try {
        const discount = await this.mintRecoveryCode(cart);
        const didSend = await this.sendCartTouch(cart, 'marketing.abandoned_cart_incentive', discount ?? undefined);
        if (didSend) {
          await this.prisma.cart.update({
            where: { id: cart.id },
            data: { incentiveSentAt: new Date(), incentivePromoCodeId: discount?.promoCodeId },
          });
          sent += 1;
        }
      } catch (error) {
        this.logger.error(`abandoned-cart incentive failed for cart ${cart.id}: ${describe(error)}`);
      }
    }
    return sent;
  }

  /**
   * Every stage's candidate set: a logged-in user (opted in) OR a guest with
   * a phone AND marketing consent captured at checkout — the doc's own two
   * routes to "an identifiable customer". `stageFilter` adds that stage's own
   * dedup/timing condition on top.
   */
  private async abandonedCandidates(stageFilter: Prisma.CartWhereInput): Promise<CartForMarketing[]> {
    return this.prisma.cart.findMany({
      where: {
        items: { some: {} },
        ...stageFilter,
        OR: [
          { userId: { not: null }, user: { marketingEmailOptOut: false } },
          { userId: null, guestPhone: { not: null }, guestMarketingConsentAt: { not: null } },
        ],
      },
      include: cartMarketingInclude,
    });
  }

  /**
   * Lazily creates (once) the system Discount every incentive-stage PromoCode
   * is minted against, remembering its id in Settings so the SAME Discount
   * row is reused forever after — an owner can still edit its rate from
   * Marketing → Discounts, this is only how the cron finds it again.
   */
  private async recoveryDiscountId(): Promise<string> {
    const existingId = await this.settings.get<string | null>(SettingKey.MarketingAbandonedCartDiscountId);
    if (existingId) {
      const existing = await this.prisma.discount.findUnique({ where: { id: existingId } });
      if (existing) return existing.id;
    }

    const bps = await this.settings.get<number>(SettingKey.MarketingAbandonedCartDiscountBps);
    const maxOff = await this.settings.get<number | null>(SettingKey.MarketingAbandonedCartDiscountMaxOff);
    const discount = await this.prisma.discount.create({
      data: {
        name: 'Abandoned cart recovery',
        type: 'PERCENTAGE',
        scope: 'ORDER',
        value: bps,
        maxDiscount: maxOff ?? undefined,
        isActive: true,
        isStackable: false,
      },
    });
    await this.settings.set(SettingKey.MarketingAbandonedCartDiscountId, discount.id);
    return discount.id;
  }

  /**
   * A single-use PromoCode for this specific cart. Not routed through
   * PromotionsService — a scheduled job minting a resource is not the same-
   * transaction-write case KNOWN_MODULE_COUPLINGS exists for, so this reads/
   * writes promotions' own tables directly via Prisma, same as
   * SearchService/CollectionsService read catalog's Product elsewhere in
   * Phase 8. generateHumanCode's 8-character unambiguous alphabet makes a
   * collision vanishingly rare (promotions.service.ts's own reasoning); one
   * failed attempt is logged and simply skips the discount for this cart
   * tonight rather than retrying and risking a duplicate send.
   */
  private async mintRecoveryCode(
    cart: CartForMarketing,
  ): Promise<{ code: string; label: string; promoCodeId: string } | null> {
    try {
      const discountId = await this.recoveryDiscountId();
      const validDays = await this.settings.get<number>(SettingKey.MarketingAbandonedCartDiscountValidDays);
      const bps = await this.settings.get<number>(SettingKey.MarketingAbandonedCartDiscountBps);
      const code = generateHumanCode(8);

      const promoCode = await this.prisma.promoCode.create({
        data: {
          discountId,
          code,
          usageLimit: 1,
          restrictedToUserId: cart.userId ?? undefined,
          expiresAt: new Date(Date.now() + validDays * DAY_MS),
        },
      });

      return { code: promoCode.code, label: `${Math.round(bps / 100)}% off`, promoCodeId: promoCode.id };
    } catch (error) {
      this.logger.error(`failed to mint a recovery code for cart ${cart.id}: ${describe(error)}`);
      return null;
    }
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

  /**
   * False when there is nowhere to actually send this — the caller does not
   * record a send in that case. A logged-in cart sends email (unchanged
   * behaviour); a guest cart with a consented phone sends WhatsApp/SMS
   * instead (WO-8.5), checked against PhoneOptOut since consent can be
   * withdrawn independently of the checkout-time flag.
   */
  private async sendCartTouch(
    cart: CartForMarketing,
    template: CartTemplate,
    discount?: { code: string; label: string },
  ): Promise<boolean> {
    if (cart.userId) return this.sendCartEmail(cart, template, discount);
    if (cart.guestPhone) return this.sendCartPhoneMessage(cart, template, discount);
    return false;
  }

  private async sendCartEmail(
    cart: CartForMarketing,
    template: CartTemplate,
    discount?: { code: string; label: string },
  ): Promise<boolean> {
    if (!cart.user?.email || !cart.userId) return false;

    const locale = await this.localeFor(cart.userId);
    await this.notifications.send({
      template,
      recipient: { name: cart.user.firstName, email: cart.user.email, userId: cart.userId, locale },
      subject: 'Still thinking it over?',
      body: 'You left something in your cart.',
      data: {
        items: this.cartItemsForEmail(cart, locale),
        cartUrl: `${this.storefrontUrl()}/${locale}/cart`,
        discountCode: discount?.code,
        discountLabel: discount?.label,
        unsubscribeUrl: this.unsubscribeUrl(cart.userId, locale),
      },
    });
    return true;
  }

  /** No account, so no unsubscribe token and no locale preference on record — English, and an unsubscribe reachable by replying STOP (the gateway's own convention) rather than a signed link. */
  private async sendCartPhoneMessage(
    cart: CartForMarketing,
    template: CartTemplate,
    discount?: { code: string; label: string },
  ): Promise<boolean> {
    if (!cart.guestPhone) return false;
    const optedOut = await this.prisma.phoneOptOut.findUnique({ where: { phoneE164: cart.guestPhone } });
    if (optedOut) return false;

    const locale: Locale = DEFAULT_LOCALE;
    const cartUrl = `${this.storefrontUrl()}/${locale}/cart`;
    const itemNames = this.cartItemsForEmail(cart, locale)
      .map((item) => item.name)
      .join(', ');

    const body = discount?.code
      ? `You left ${itemNames} in your cart. Use code ${discount.code} for ${discount.label}: ${cartUrl}`
      : `You left ${itemNames} in your cart: ${cartUrl}`;

    await this.notifications.send({
      template,
      recipient: { phone: cart.guestPhone, locale },
      subject: 'Still in your cart',
      body,
      data: { cartUrl, discountCode: discount?.code, discountLabel: discount?.label },
    });
    return true;
  }

  private cartItemsForEmail(cart: CartForMarketing, locale: Locale): OrderEmailItem[] {
    return cart.items.map((item) => {
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
  }

  /**
   * WO-8.5's own "the one marketing number that is unambiguous" — every
   * order whose sourceCart (orders.service.ts's place(), set at checkout)
   * had a marketing touch before it was placed. Grouped by which stage did
   * the work, so an owner can see whether the free nudge or the paid
   * incentive is actually earning its keep.
   */
  async recoveredRevenueReport(since: Date): Promise<{
    firstTouch: { orders: number; revenue: number };
    reminder: { orders: number; revenue: number };
    incentive: { orders: number; revenue: number };
  }> {
    const orders = await this.prisma.order.findMany({
      where: { sourceCartId: { not: null }, placedAt: { gte: since } },
      select: {
        grandTotal: true,
        placedAt: true,
        sourceCart: { select: { firstTouchSentAt: true, reminderSentAt: true, incentiveSentAt: true } },
      },
    });

    const totals = {
      firstTouch: { orders: 0, revenue: 0 },
      reminder: { orders: 0, revenue: 0 },
      incentive: { orders: 0, revenue: 0 },
    };

    for (const order of orders) {
      const cart = order.sourceCart;
      if (!cart) continue;
      // Attribute to the LATEST stage that actually fired before this order
      // was placed — an order recovered after the incentive email is an
      // incentive-recovered order, not also a first-touch one.
      if (cart.incentiveSentAt && cart.incentiveSentAt <= order.placedAt) {
        totals.incentive.orders += 1;
        totals.incentive.revenue += order.grandTotal;
      } else if (cart.reminderSentAt && cart.reminderSentAt <= order.placedAt) {
        totals.reminder.orders += 1;
        totals.reminder.revenue += order.grandTotal;
      } else if (cart.firstTouchSentAt && cart.firstTouchSentAt <= order.placedAt) {
        totals.firstTouch.orders += 1;
        totals.firstTouch.revenue += order.grandTotal;
      }
    }

    return totals;
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
