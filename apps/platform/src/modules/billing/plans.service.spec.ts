import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PlansService } from './plans.service';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('PlansService', () => {
  let prisma: any;
  let service: PlansService;

  beforeEach(async () => {
    prisma = { platformPlan: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn(), update: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlansService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(PlansService);
  });

  it('refuses a duplicate plan key', async () => {
    prisma.platformPlan.findUnique.mockResolvedValue({ id: 'p1' });
    await expect(
      service.create({ key: 'solo-shared', editionCap: 'SOLO', includedResourceTier: 'STANDARD', pricingModel: 'FLAT_MONTHLY' }),
    ).rejects.toThrow(ConflictException);
  });

  it('requires perSeatPriceMinor for PER_SEAT', async () => {
    prisma.platformPlan.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ key: 'chain', editionCap: 'CHAIN', includedResourceTier: 'PLUS', pricingModel: 'PER_SEAT' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires oneTimeLicenseMinor and licenseDeploymentMode for ONE_TIME_LICENSE', async () => {
    prisma.platformPlan.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ key: 'perpetual', editionCap: 'ORG', includedResourceTier: 'DEDICATED', pricingModel: 'ONE_TIME_LICENSE' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a FLAT_MONTHLY plan with only its own fields set', async () => {
    prisma.platformPlan.findUnique.mockResolvedValue(null);
    prisma.platformPlan.create.mockResolvedValue({ id: 'p1' });

    await service.create({ key: 'solo', editionCap: 'SOLO', includedResourceTier: 'STANDARD', pricingModel: 'FLAT_MONTHLY', monthlyPriceMinor: 9900 });

    expect(prisma.platformPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ monthlyPriceMinor: 9900, perSeatPriceMinor: null, oneTimeLicenseMinor: null, licenseDeploymentMode: null }),
    });
  });

  it('creates a PER_SEAT plan with only its own fields set', async () => {
    prisma.platformPlan.findUnique.mockResolvedValue(null);
    prisma.platformPlan.create.mockResolvedValue({ id: 'p1' });

    await service.create({ key: 'chain', editionCap: 'CHAIN', includedResourceTier: 'PLUS', pricingModel: 'PER_SEAT', perSeatPriceMinor: 500 });

    expect(prisma.platformPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ monthlyPriceMinor: 0, perSeatPriceMinor: 500, oneTimeLicenseMinor: null }),
    });
  });

  it('requires transactionFeeBps for USAGE_BASED', async () => {
    prisma.platformPlan.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ key: 'usage', editionCap: 'CHAIN', includedResourceTier: 'PLUS', pricingModel: 'USAGE_BASED' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a USAGE_BASED plan with only its own fields set', async () => {
    prisma.platformPlan.findUnique.mockResolvedValue(null);
    prisma.platformPlan.create.mockResolvedValue({ id: 'p1' });

    await service.create({
      key: 'usage', editionCap: 'CHAIN', includedResourceTier: 'PLUS', pricingModel: 'USAGE_BASED',
      transactionFeeBps: 100, usageRateCardMinor: { messages_sent: 100 }, includedAllowances: { products: 1000 },
    });

    expect(prisma.platformPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        transactionFeeBps: 100,
        usageRateCardMinor: { messages_sent: 100 },
        includedAllowances: { products: 1000 },
        perSeatPriceMinor: null,
        oneTimeLicenseMinor: null,
      }),
    });
  });

  // doc 154 — headline flag/order + public copy, and the read the pricing
  // page is built on.
  describe('update (doc 154)', () => {
    it('404s for a missing plan', async () => {
      prisma.platformPlan.findUnique.mockResolvedValue(null);
      await expect(service.update('missing', { isHeadline: true, headlineOrder: 0 })).rejects.toThrow(NotFoundException);
    });

    it('refuses to mark a PER_SEAT plan headline — doc 154 §1\'s "never a fourth tile"', async () => {
      prisma.platformPlan.findUnique.mockResolvedValue({ id: 'p1', pricingModel: 'PER_SEAT', isHeadline: false, headlineOrder: null });
      await expect(service.update('p1', { isHeadline: true, headlineOrder: 0 })).rejects.toThrow(BadRequestException);
      expect(prisma.platformPlan.update).not.toHaveBeenCalled();
    });

    it('requires a headlineOrder when marking isHeadline true and the plan has none yet', async () => {
      prisma.platformPlan.findUnique.mockResolvedValue({ id: 'p1', pricingModel: 'FLAT_MONTHLY', isHeadline: false, headlineOrder: null });
      await expect(service.update('p1', { isHeadline: true })).rejects.toThrow(BadRequestException);
    });

    it('marks a FLAT_MONTHLY plan headline with its order and public copy', async () => {
      prisma.platformPlan.findUnique.mockResolvedValue({ id: 'p1', pricingModel: 'FLAT_MONTHLY', isHeadline: false, headlineOrder: null });
      prisma.platformPlan.update.mockResolvedValue({ id: 'p1' });

      await service.update('p1', {
        isHeadline: true,
        headlineOrder: 1,
        displayName: 'Per Month',
        priceDescription: 'From Rs 9,900/month',
        bestFor: 'Predictable recurring cost.',
        ctaLabel: 'Start subscription',
      });

      expect(prisma.platformPlan.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: expect.objectContaining({
          isHeadline: true,
          headlineOrder: 1,
          displayName: 'Per Month',
          priceDescription: 'From Rs 9,900/month',
          bestFor: 'Predictable recurring cost.',
          ctaLabel: 'Start subscription',
        }),
      });
    });

    it('clears headlineOrder when un-marking a plan headline — doc 154\'s own "afterlife" lens', async () => {
      prisma.platformPlan.findUnique.mockResolvedValue({ id: 'p1', pricingModel: 'USAGE_BASED', isHeadline: true, headlineOrder: 2 });
      prisma.platformPlan.update.mockResolvedValue({ id: 'p1' });

      await service.update('p1', { isHeadline: false });

      expect(prisma.platformPlan.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: expect.objectContaining({ isHeadline: false, headlineOrder: null }),
      });
    });

    it('keeps an already-headline plan\'s own order when only its copy changes', async () => {
      prisma.platformPlan.findUnique.mockResolvedValue({ id: 'p1', pricingModel: 'ONE_TIME_LICENSE', isHeadline: true, headlineOrder: 0 });
      prisma.platformPlan.update.mockResolvedValue({ id: 'p1' });

      await service.update('p1', { ctaLabel: 'Buy once' });

      expect(prisma.platformPlan.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: expect.objectContaining({ isHeadline: true, headlineOrder: 0, ctaLabel: 'Buy once' }),
      });
    });
  });

  describe('getPlanComparison (doc 154)', () => {
    it('returns an empty array with no headline plans — the pricing page\'s own empty state', async () => {
      prisma.platformPlan.findMany.mockResolvedValue([]);
      await expect(service.getPlanComparison()).resolves.toEqual([]);
    });

    it('reads only isHeadline + isActive rows, ordered by headlineOrder', async () => {
      prisma.platformPlan.findMany.mockResolvedValue([]);
      await service.getPlanComparison();
      expect(prisma.platformPlan.findMany).toHaveBeenCalledWith({
        where: { isHeadline: true, isActive: true },
        orderBy: { headlineOrder: 'asc' },
      });
    });

    it('maps the three headline shapes to their doc 154 §1 names and never exposes an internal billing field', async () => {
      prisma.platformPlan.findMany.mockResolvedValue([
        {
          key: 'lifetime', pricingModel: 'ONE_TIME_LICENSE', licenseDeploymentMode: 'OFFLINE',
          displayName: 'Lifetime License', priceDescription: 'One-time, from Rs 50,000', bestFor: 'Own it outright.', ctaLabel: 'Buy once',
          oneTimeLicenseMinor: 5000000,
        },
        {
          key: 'per-month', pricingModel: 'FLAT_MONTHLY', licenseDeploymentMode: null,
          displayName: 'Per Month', priceDescription: 'From Rs 9,900/month', bestFor: 'Predictable cost.', ctaLabel: 'Start subscription',
          monthlyPriceMinor: 9900,
        },
        {
          key: 'pay-as-you-grow', pricingModel: 'USAGE_BASED', licenseDeploymentMode: null,
          displayName: 'Pay As You Grow', priceDescription: '1% of sales + usage', bestFor: 'Zero upfront cost.', ctaLabel: 'Start free',
          transactionFeeBps: 100, usageRateCardMinor: { messages_sent: 100 },
        },
      ]);

      const rows = await service.getPlanComparison();

      expect(rows).toEqual([
        { planKey: 'LIFETIME_LICENSE', key: 'lifetime', displayName: 'Lifetime License', priceDescription: 'One-time, from Rs 50,000', hostingMode: 'OFFLINE', bestFor: 'Own it outright.', ctaLabel: 'Buy once' },
        { planKey: 'PER_MONTH', key: 'per-month', displayName: 'Per Month', priceDescription: 'From Rs 9,900/month', hostingMode: 'ONLINE', bestFor: 'Predictable cost.', ctaLabel: 'Start subscription' },
        { planKey: 'PAY_AS_YOU_GROW', key: 'pay-as-you-grow', displayName: 'Pay As You Grow', priceDescription: '1% of sales + usage', hostingMode: 'ONLINE', bestFor: 'Zero upfront cost.', ctaLabel: 'Start free' },
      ]);
      // doc 154's own "whose rows, and which columns" scope lens — the
      // exact transactionFeeBps/usageRateCardMinor value is never present
      // anywhere on a returned row.
      rows.forEach((row) => {
        expect(row).not.toHaveProperty('transactionFeeBps');
        expect(row).not.toHaveProperty('usageRateCardMinor');
      });
    });

    it('falls back to the plan key and a generic CTA when public copy was never set', async () => {
      prisma.platformPlan.findMany.mockResolvedValue([
        { key: 'usage-headline', pricingModel: 'USAGE_BASED', licenseDeploymentMode: null, displayName: null, priceDescription: null, bestFor: null, ctaLabel: null },
      ]);
      const [row] = await service.getPlanComparison();
      expect(row.displayName).toBe('usage-headline');
      expect(row.ctaLabel).toBe('Get started');
    });

    it('drops a headline row whose pricingModel has no doc 154 §1 headline name — defensive, never a mislabeled tile', async () => {
      prisma.platformPlan.findMany.mockResolvedValue([
        { key: 'per-seat-mistake', pricingModel: 'PER_SEAT', licenseDeploymentMode: null, displayName: 'x', priceDescription: 'x', bestFor: 'x', ctaLabel: 'x' },
      ]);
      await expect(service.getPlanComparison()).resolves.toEqual([]);
    });
  });
});
