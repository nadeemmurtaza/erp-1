import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { MarketingAutomationCron } from './marketing-automation.cron';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { AppConfigService } from '../../../core/config/app-config.service';

describe('MarketingAutomationCron', () => {
  let cron: MarketingAutomationCron;
  let prisma: any;
  let settings: any;
  let notifications: any;

  const cart = (overrides: Partial<any> = {}) => ({
    id: 'cart1',
    userId: 'user1',
    user: { email: 'buyer@example.com', firstName: 'Ayesha', marketingEmailOptOut: false },
    items: [
      {
        quantity: 2,
        product: {
          slug: 'lawn-suit',
          basePrice: 450000,
          translations: [{ locale: 'en', name: 'Lawn Suit' }],
          images: [{ url: 'https://cdn/lawn.jpg' }],
        },
        variant: { size: 'M', color: 'Blue', priceOverride: null },
      },
    ],
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      cart: { findMany: jest.fn(), update: jest.fn() },
      order: { findMany: jest.fn(), update: jest.fn() },
      orderItem: { findMany: jest.fn(), update: jest.fn() },
      deviceToken: { findFirst: jest.fn().mockResolvedValue(null) },
      discount: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'discount1' }) },
      promoCode: { create: jest.fn().mockResolvedValue({ id: 'promo1', code: 'ABCD1234' }) },
      phoneOptOut: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    settings = {
      get: jest.fn(async (key: string) => {
        if (key === SettingKey.MarketingAutomationEnabled) return true;
        if (key === SettingKey.MarketingAbandonedCartFirstTouchHours) return 1;
        if (key === SettingKey.MarketingAbandonedCartReminderHours) return 24;
        if (key === SettingKey.MarketingAbandonedCartIncentiveHours) return 72;
        if (key === SettingKey.MarketingAbandonedCartDiscountBps) return 1000;
        if (key === SettingKey.MarketingAbandonedCartDiscountMaxOff) return null;
        if (key === SettingKey.MarketingAbandonedCartDiscountValidDays) return 7;
        if (key === SettingKey.MarketingAbandonedCartDiscountId) return null;
        if (key === SettingKey.MarketingReviewRequestDays) return 7;
        if (key === SettingKey.MarketingReplenishmentReminderDays) return 30;
        return null;
      }),
      set: jest.fn().mockResolvedValue(undefined),
    };

    notifications = { send: jest.fn().mockResolvedValue(undefined) };

    const config = {
      get: jest.fn((key: string) => {
        if (key === 'STOREFRONT_URL') return 'https://shop.example.com';
        if (key === 'APP_ENCRYPTION_KEY') return 'a'.repeat(32);
        return '';
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketingAutomationCron,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
        { provide: NotificationsService, useValue: notifications },
        { provide: AppConfigService, useValue: config },
      ],
    }).compile();

    cron = module.get<MarketingAutomationCron>(MarketingAutomationCron);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  describe('sendAbandonedCartReminders', () => {
    it('sends once and sets reminderSentAt', async () => {
      prisma.cart.findMany.mockResolvedValue([cart()]);

      const sent = await cron.sendAbandonedCartReminders();

      expect(sent).toBe(1);
      expect(notifications.send).toHaveBeenCalledTimes(1);
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'marketing.abandoned_cart_reminder' }),
      );
      expect(prisma.cart.update).toHaveBeenCalledWith({
        where: { id: 'cart1' },
        data: { reminderSentAt: expect.any(Date) },
      });
    });

    it('is excluded by the query once reminderSentAt is set (no re-fire)', async () => {
      // The where-clause filters reminderSentAt: null; a cart already reminded
      // simply never comes back from findMany on the next run.
      prisma.cart.findMany.mockResolvedValue([]);

      const sent = await cron.sendAbandonedCartReminders();

      expect(sent).toBe(0);
      expect(notifications.send).not.toHaveBeenCalled();
      expect(prisma.cart.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ reminderSentAt: null }),
        }),
      );
    });

    it('scopes the query to a logged-in opted-in user OR a consented guest phone', async () => {
      prisma.cart.findMany.mockResolvedValue([]);

      await cron.sendAbandonedCartReminders();

      expect(prisma.cart.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { userId: { not: null }, user: { marketingEmailOptOut: false } },
              { userId: null, guestPhone: { not: null }, guestMarketingConsentAt: { not: null } },
            ],
          }),
        }),
      );
    });
  });

  describe('sendAbandonedCartFirstTouch', () => {
    it("is WO-8.5's own new stage 1 — fires on firstTouchSentAt, before any reminder", async () => {
      prisma.cart.findMany.mockResolvedValue([cart()]);

      const sent = await cron.sendAbandonedCartFirstTouch();

      expect(sent).toBe(1);
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'marketing.abandoned_cart_first_touch' }),
      );
      expect(prisma.cart.update).toHaveBeenCalledWith({
        where: { id: 'cart1' },
        data: { firstTouchSentAt: expect.any(Date) },
      });
    });

    it('never carries a discount — the doc: sending one immediately trains customers to abandon', async () => {
      prisma.cart.findMany.mockResolvedValue([cart()]);

      await cron.sendAbandonedCartFirstTouch();

      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ discountCode: undefined }) }),
      );
      expect(prisma.promoCode.create).not.toHaveBeenCalled();
    });

    it('sends a guest cart with a consented phone over WhatsApp/SMS instead of email', async () => {
      const guestCart = cart({ userId: null, user: null, guestPhone: '+923001234567', guestMarketingConsentAt: new Date() });
      prisma.cart.findMany.mockResolvedValue([guestCart]);

      const sent = await cron.sendAbandonedCartFirstTouch();

      expect(sent).toBe(1);
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: expect.objectContaining({ phone: '+923001234567' }) }),
      );
    });

    it('never sends to a guest phone that has opted out', async () => {
      const guestCart = cart({ userId: null, user: null, guestPhone: '+923001234567', guestMarketingConsentAt: new Date() });
      prisma.cart.findMany.mockResolvedValue([guestCart]);
      prisma.phoneOptOut.findUnique.mockResolvedValue({ phoneE164: '+923001234567' });

      const sent = await cron.sendAbandonedCartFirstTouch();

      expect(sent).toBe(0);
      expect(notifications.send).not.toHaveBeenCalled();
    });
  });

  describe('sendAbandonedCartIncentives', () => {
    it('only queries carts whose reminder already fired', async () => {
      prisma.cart.findMany.mockResolvedValue([]);

      await cron.sendAbandonedCartIncentives();

      expect(prisma.cart.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            reminderSentAt: { not: null, lte: expect.any(Date) },
            incentiveSentAt: null,
          }),
        }),
      );
    });

    it('sends once, mints a real single-use PromoCode, and records both on the cart', async () => {
      prisma.cart.findMany.mockResolvedValue([cart({ reminderSentAt: new Date() })]);

      const sent = await cron.sendAbandonedCartIncentives();

      expect(sent).toBe(1);
      expect(prisma.promoCode.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ discountId: 'discount1', usageLimit: 1 }) }),
      );
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'marketing.abandoned_cart_incentive',
          data: expect.objectContaining({ discountCode: 'ABCD1234' }),
        }),
      );
      expect(prisma.cart.update).toHaveBeenCalledWith({
        where: { id: 'cart1' },
        data: { incentiveSentAt: expect.any(Date), incentivePromoCodeId: 'promo1' },
      });
    });

    it('creates the system recovery Discount only once, reusing its id from Settings thereafter', async () => {
      settings.get.mockImplementation(async (key: string) => {
        if (key === SettingKey.MarketingAutomationEnabled) return true;
        if (key === SettingKey.MarketingAbandonedCartIncentiveHours) return 72;
        if (key === SettingKey.MarketingAbandonedCartDiscountBps) return 1000;
        if (key === SettingKey.MarketingAbandonedCartDiscountValidDays) return 7;
        if (key === SettingKey.MarketingAbandonedCartDiscountId) return 'existing-discount';
        return null;
      });
      prisma.discount.findUnique.mockResolvedValue({ id: 'existing-discount' });
      prisma.cart.findMany.mockResolvedValue([cart({ reminderSentAt: new Date() })]);

      await cron.sendAbandonedCartIncentives();

      expect(prisma.discount.create).not.toHaveBeenCalled();
      expect(prisma.promoCode.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ discountId: 'existing-discount' }) }),
      );
    });

    it('still sends without a discount if minting the code fails, rather than dropping the send', async () => {
      prisma.promoCode.create.mockRejectedValueOnce(new Error('db down'));
      prisma.cart.findMany.mockResolvedValue([cart({ reminderSentAt: new Date() })]);

      const sent = await cron.sendAbandonedCartIncentives();

      expect(sent).toBe(1);
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ discountCode: undefined }) }),
      );
    });
  });

  describe('sendReviewRequests', () => {
    const order = (overrides: Partial<any> = {}) => ({
      id: 'order1',
      number: 'ORD-1',
      userId: 'user1',
      user: { email: 'buyer@example.com', firstName: 'Ayesha' },
      items: [{ nameEn: 'Lawn Suit', nameUr: 'لان سوٹ', imageUrl: null, unitPrice: 450000 }],
      ...overrides,
    });

    it('fires once per delivered order and sets reviewRequestSentAt', async () => {
      prisma.order.findMany.mockResolvedValue([order()]);

      const sent = await cron.sendReviewRequests();

      expect(sent).toBe(1);
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'marketing.review_request' }),
      );
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order1' },
        data: { reviewRequestSentAt: expect.any(Date) },
      });
    });

    it('queries only delivered, unsent, non-opted-out, logged-in orders', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await cron.sendReviewRequests();

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'DELIVERED',
            userId: { not: null },
            reviewRequestSentAt: null,
            user: { marketingEmailOptOut: false },
          }),
        }),
      );
    });

    it('skips a guest order defensively even if it slipped through the query', async () => {
      prisma.order.findMany.mockResolvedValue([order({ userId: null, user: null })]);

      const sent = await cron.sendReviewRequests();

      expect(sent).toBe(0);
      expect(notifications.send).not.toHaveBeenCalled();
    });
  });

  describe('sendReplenishmentReminders', () => {
    const item = (overrides: Partial<any> = {}) => ({
      id: 'item1',
      nameEn: 'Lawn Suit',
      order: { id: 'order1', userId: 'user1', user: { email: 'buyer@example.com', firstName: 'Ayesha' } },
      product: {
        slug: 'lawn-suit',
        basePrice: 450000,
        translations: [{ locale: 'en', name: 'Lawn Suit' }],
        images: [],
      },
      ...overrides,
    });

    it('only queries consumable-product items on delivered, non-opted-out orders', async () => {
      prisma.orderItem.findMany.mockResolvedValue([]);

      await cron.sendReplenishmentReminders();

      expect(prisma.orderItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            replenishmentReminderSentAt: null,
            product: { isConsumable: true },
            order: expect.objectContaining({
              status: 'DELIVERED',
              userId: { not: null },
              user: { marketingEmailOptOut: false },
            }),
          }),
        }),
      );
    });

    it('sends once and sets replenishmentReminderSentAt', async () => {
      prisma.orderItem.findMany.mockResolvedValue([item()]);

      const sent = await cron.sendReplenishmentReminders();

      expect(sent).toBe(1);
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'marketing.replenishment_reminder' }),
      );
      expect(prisma.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'item1' },
        data: { replenishmentReminderSentAt: expect.any(Date) },
      });
    });

    it('skips a guest order item defensively', async () => {
      prisma.orderItem.findMany.mockResolvedValue([item({ order: { id: 'order1', userId: null, user: null } })]);

      const sent = await cron.sendReplenishmentReminders();

      expect(sent).toBe(0);
      expect(notifications.send).not.toHaveBeenCalled();
    });
  });

  describe('run', () => {
    it('no-ops entirely while marketing.automation_enabled is off', async () => {
      settings.get.mockImplementation(async (key: string) => {
        if (key === SettingKey.MarketingAutomationEnabled) return false;
        return null;
      });

      await cron.run();

      expect(prisma.cart.findMany).not.toHaveBeenCalled();
      expect(prisma.order.findMany).not.toHaveBeenCalled();
      expect(prisma.orderItem.findMany).not.toHaveBeenCalled();
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('runs all five sends when enabled', async () => {
      prisma.cart.findMany.mockResolvedValue([]);
      prisma.order.findMany.mockResolvedValue([]);
      prisma.orderItem.findMany.mockResolvedValue([]);

      await cron.run();

      expect(prisma.cart.findMany).toHaveBeenCalledTimes(3);
      expect(prisma.order.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.orderItem.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
