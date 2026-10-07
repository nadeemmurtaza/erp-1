import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AiSuggestionsService } from './ai-suggestions.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AiService } from '../../../core/ai/ai.service';
import { AuditService } from '../../../core/audit/audit.service';
import { EventBusService } from '../../../core/events/event-bus.service';
import { DomainEvent } from '../../../core/events/domain-events';
import { SeoHealthService } from './seo-health.service';

describe('AiSuggestionsService', () => {
  let service: AiSuggestionsService;
  let prisma: any;
  let tx: any;
  let ai: any;
  let audit: any;
  let events: any;
  let seoHealth: any;

  const baseProduct = (overrides: Partial<any> = {}) => ({
    id: 'prod1',
    slug: 'lawn-suit',
    fabric: 'Lawn',
    season: 'Summer',
    translations: [
      { locale: 'en', name: 'Lawn Suit', description: null, careInstructions: null, metaTitle: null, metaDescription: null, focusKeyword: null },
    ],
    category: null,
    images: [],
    variants: [],
    ...overrides,
  });

  beforeEach(async () => {
    tx = {
      productImageTranslation: { upsert: jest.fn() },
      productTranslation: { update: jest.fn() },
      productAiSuggestion: { update: jest.fn() },
    };

    prisma = {
      product: { findUnique: jest.fn() },
      productAiSuggestion: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };

    ai = {
      describeImage: jest.fn(),
      complete: jest.fn(),
    };

    audit = { record: jest.fn().mockResolvedValue(undefined) };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    seoHealth = { list: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiSuggestionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: ai },
        { provide: AuditService, useValue: audit },
        { provide: EventBusService, useValue: events },
        { provide: SeoHealthService, useValue: seoHealth },
      ],
    }).compile();

    service = module.get(AiSuggestionsService);
  });

  describe('generateForProduct', () => {
    it('404s for a product that no longer exists', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.generateForProduct('gone')).rejects.toThrow(NotFoundException);
    });

    it('drafts alt text in both locales for an image with none, and every blank copy field', async () => {
      prisma.product.findUnique.mockResolvedValue(
        baseProduct({ images: [{ id: 'img1', url: 'https://cdn/lawn.jpg', variantId: null, translations: [] }] }),
      );
      ai.describeImage.mockResolvedValue({ text: 'A lawn suit on a hanger.', inputTokens: 10, outputTokens: 5, model: 'claude-sonnet-5' });
      ai.complete.mockResolvedValue({ text: 'Great lawn suit', inputTokens: 20, outputTokens: 10, model: 'claude-sonnet-5' });

      const result = await service.generateForProduct('prod1');

      // 2 locales of alt text + 4 blank copy fields (metaTitle, metaDescription, description, careInstructions)
      expect(result.created).toBe(6);
      expect(ai.describeImage).toHaveBeenCalledTimes(2);
      expect(ai.complete).toHaveBeenCalledTimes(4);
      expect(prisma.productAiSuggestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ productId: 'prod1', imageId: 'img1', kind: 'ALT_TEXT', locale: 'en' }),
        }),
      );
    });

    it('never re-drafts an image locale that already has alt text', async () => {
      prisma.product.findUnique.mockResolvedValue(
        baseProduct({
          images: [
            {
              id: 'img1',
              url: 'https://cdn/lawn.jpg',
              variantId: null,
              translations: [{ locale: 'en', alt: 'Already described' }],
            },
          ],
        }),
      );
      ai.describeImage.mockResolvedValue({ text: 'x', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-5' });
      ai.complete.mockResolvedValue(null);

      await service.generateForProduct('prod1');

      // Only 'ur' is missing; 'en' already has alt text.
      expect(ai.describeImage).toHaveBeenCalledTimes(1);
      expect(ai.describeImage).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining('Urdu'));
    });

    it('skips a job that already has a PENDING suggestion, to keep a repeated bulk run cheap', async () => {
      prisma.product.findUnique.mockResolvedValue(baseProduct());
      prisma.productAiSuggestion.findMany.mockResolvedValue([{ imageId: null, kind: 'META_TITLE', locale: 'en' }]);
      ai.complete.mockResolvedValue({ text: 'Copy', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-5' });

      const result = await service.generateForProduct('prod1');

      // META_TITLE skipped (already pending); META_DESCRIPTION, DESCRIPTION, CARE_INSTRUCTIONS still drafted.
      expect(result.created).toBe(3);
      expect(ai.complete).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ prompt: expect.stringContaining('meta title') }),
      );
    });

    it('creates nothing for a job where the AI provider returns null (no provider, budget exhausted, timeout)', async () => {
      prisma.product.findUnique.mockResolvedValue(baseProduct());
      ai.complete.mockResolvedValue(null);

      const result = await service.generateForProduct('prod1');

      expect(result.created).toBe(0);
      expect(prisma.productAiSuggestion.create).not.toHaveBeenCalled();
    });

    it('truncates an over-long completion to the field\'s own limit before storing it', async () => {
      prisma.product.findUnique.mockResolvedValue(baseProduct());
      ai.complete.mockResolvedValue({ text: 'x'.repeat(500), inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-5' });

      await service.generateForProduct('prod1');

      const metaTitleCall = prisma.productAiSuggestion.create.mock.calls.find(
        (call: any) => call[0].data.kind === 'META_TITLE',
      );
      expect(metaTitleCall[0].data.suggestedText.length).toBe(70);
    });
  });

  describe('generateBulk', () => {
    it('runs generateForProduct across every product failing the SEO gate and sums the totals', async () => {
      seoHealth.list.mockResolvedValue([{ id: 'prod1' }, { id: 'prod2' }]);
      prisma.product.findUnique.mockResolvedValue(baseProduct());
      ai.complete.mockResolvedValue(null);
      ai.describeImage.mockResolvedValue(null);

      const result = await service.generateBulk();

      expect(result.productsProcessed).toBe(2);
      expect(prisma.product.findUnique).toHaveBeenCalledTimes(2);
    });

    it('processes zero products when nothing is failing the gate', async () => {
      seoHealth.list.mockResolvedValue([]);

      const result = await service.generateBulk();

      expect(result).toEqual({ productsProcessed: 0, suggestionsCreated: 0 });
      expect(prisma.product.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('listQueue', () => {
    it('defaults to PENDING and maps each row for the review queue', async () => {
      prisma.productAiSuggestion.findMany = jest.fn().mockResolvedValue([
        {
          id: 'sug1',
          productId: 'prod1',
          product: { slug: 'lawn-suit', translations: [{ locale: 'en', name: 'Lawn Suit' }] },
          image: { url: 'https://cdn/lawn.jpg' },
          kind: 'ALT_TEXT',
          locale: 'en',
          suggestedText: 'A lawn suit.',
          status: 'PENDING',
          createdAt: new Date('2026-01-01'),
          reviewedAt: null,
        },
      ]);

      const rows = await service.listQueue();

      expect(prisma.productAiSuggestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'PENDING' } }),
      );
      expect(rows).toEqual([
        expect.objectContaining({ id: 'sug1', productName: 'Lawn Suit', imageUrl: 'https://cdn/lawn.jpg' }),
      ]);
    });
  });

  describe('approve', () => {
    it('404s for a suggestion that no longer exists', async () => {
      prisma.productAiSuggestion.findUnique.mockResolvedValue(null);

      await expect(service.approve('gone', 'user1')).rejects.toThrow(NotFoundException);
    });

    it('refuses to re-approve a suggestion that was already reviewed', async () => {
      prisma.productAiSuggestion.findUnique.mockResolvedValue({ id: 'sug1', status: 'APPROVED' });

      await expect(service.approve('sug1', 'user1')).rejects.toThrow(BadRequestException);
    });

    it('applies an ALT_TEXT suggestion to ProductImageTranslation and publishes ProductChanged', async () => {
      prisma.productAiSuggestion.findUnique.mockResolvedValue({
        id: 'sug1',
        productId: 'prod1',
        imageId: 'img1',
        kind: 'ALT_TEXT',
        locale: 'en',
        suggestedText: 'A lawn suit.',
        status: 'PENDING',
      });

      const result = await service.approve('sug1', 'user1');

      expect(result).toEqual({ id: 'sug1', status: 'APPROVED' });
      expect(tx.productImageTranslation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { imageId_locale: { imageId: 'img1', locale: 'en' } },
          create: { imageId: 'img1', locale: 'en', alt: 'A lawn suit.' },
          update: { alt: 'A lawn suit.' },
        }),
      );
      expect(tx.productAiSuggestion.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sug1' }, data: expect.objectContaining({ status: 'APPROVED', reviewedById: 'user1' }) }),
      );
      expect(events.publish).toHaveBeenCalledWith(DomainEvent.ProductChanged, { productId: 'prod1' });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'catalog.ai_suggestion_approved' }));
    });

    it('applies a META_DESCRIPTION suggestion to the matching ProductTranslation row', async () => {
      prisma.productAiSuggestion.findUnique.mockResolvedValue({
        id: 'sug2',
        productId: 'prod1',
        imageId: null,
        kind: 'META_DESCRIPTION',
        locale: 'en',
        suggestedText: 'Shop this lawn suit.',
        status: 'PENDING',
      });

      await service.approve('sug2', 'user1');

      expect(tx.productTranslation.update).toHaveBeenCalledWith({
        where: { productId_locale: { productId: 'prod1', locale: 'en' } },
        data: { metaDescription: 'Shop this lawn suit.' },
      });
    });
  });

  describe('reject', () => {
    it('marks a PENDING suggestion REJECTED without touching the product', async () => {
      prisma.productAiSuggestion.findUnique.mockResolvedValue({
        id: 'sug1',
        productId: 'prod1',
        kind: 'DESCRIPTION',
        locale: 'en',
        status: 'PENDING',
      });

      const result = await service.reject('sug1', 'user1');

      expect(result).toEqual({ id: 'sug1', status: 'REJECTED' });
      expect(prisma.productAiSuggestion.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sug1' }, data: expect.objectContaining({ status: 'REJECTED' }) }),
      );
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('refuses to reject an already-reviewed suggestion', async () => {
      prisma.productAiSuggestion.findUnique.mockResolvedValue({ id: 'sug1', status: 'REJECTED' });

      await expect(service.reject('sug1', 'user1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('approveBulk', () => {
    it('approves what it can and collects an error per id that fails', async () => {
      prisma.productAiSuggestion.findUnique
        .mockResolvedValueOnce({ id: 'sug1', productId: 'prod1', imageId: null, kind: 'META_TITLE', locale: 'en', suggestedText: 'T', status: 'PENDING' })
        .mockResolvedValueOnce(null);

      const result = await service.approveBulk(['sug1', 'missing'], 'user1');

      expect(result.approved).toBe(1);
      expect(result.errors).toEqual([{ id: 'missing', message: expect.stringContaining('no longer exists') }]);
    });
  });
});
