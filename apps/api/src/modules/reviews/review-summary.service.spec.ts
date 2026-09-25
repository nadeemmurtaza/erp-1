import { Test, TestingModule } from '@nestjs/testing';
import { ReviewSummaryService } from './review-summary.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AiService } from '../../core/ai/ai.service';
import { SettingKey } from '../../core/settings/settings.defaults';

describe('ReviewSummaryService', () => {
  let service: ReviewSummaryService;
  let prisma: any;
  let settings: any;
  let ai: any;

  beforeEach(async () => {
    prisma = {
      review: { count: jest.fn(), findMany: jest.fn() },
      productReviewSummary: { findUnique: jest.fn(), upsert: jest.fn().mockResolvedValue({}) },
    };
    settings = { get: jest.fn().mockImplementation(async (key: string) => (key === SettingKey.ReviewSummaryThreshold ? 10 : null)) };
    ai = { isAvailable: jest.fn().mockReturnValue(true), complete: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewSummaryService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
        { provide: AiService, useValue: ai },
      ],
    }).compile();

    service = module.get(ReviewSummaryService);
  });

  describe('maybeRegenerate — threshold gating', () => {
    it('does nothing below the threshold', async () => {
      prisma.review.count.mockResolvedValue(5);
      prisma.productReviewSummary.findUnique.mockResolvedValue(null);

      await service.maybeRegenerate('p1');

      expect(ai.complete).not.toHaveBeenCalled();
    });

    it('regenerates the first time count reaches the threshold', async () => {
      prisma.review.count.mockResolvedValue(10);
      prisma.productReviewSummary.findUnique.mockResolvedValue(null);
      prisma.review.findMany.mockResolvedValue([{ rating: 3, title: null, body: 'runs small', fitFeedback: 'too_small' }]);
      ai.complete.mockResolvedValue({
        text: JSON.stringify({ summaryText: 'Runs small', fitSignal: 'too_small', qualitySignal: null, commonComplaints: [] }),
        inputTokens: 1,
        outputTokens: 1,
        model: 'test',
      });

      await service.maybeRegenerate('p1');

      expect(ai.complete).toHaveBeenCalledTimes(1);
    });

    it('does not regenerate again before the next multiple of the threshold', async () => {
      prisma.review.count.mockResolvedValue(15);
      prisma.productReviewSummary.findUnique.mockResolvedValue({ reviewCountAtGeneration: 10 });

      await service.maybeRegenerate('p1');

      expect(ai.complete).not.toHaveBeenCalled();
    });

    it('regenerates again once count crosses the next multiple', async () => {
      prisma.review.count.mockResolvedValue(20);
      prisma.productReviewSummary.findUnique.mockResolvedValue({ reviewCountAtGeneration: 10 });
      prisma.review.findMany.mockResolvedValue([{ rating: 4, title: null, body: 'great', fitFeedback: null }]);
      ai.complete.mockResolvedValue({
        text: JSON.stringify({ summaryText: 'Loved by customers', fitSignal: null, qualitySignal: 'sturdy fabric', commonComplaints: [] }),
        inputTokens: 1,
        outputTokens: 1,
        model: 'test',
      });

      await service.maybeRegenerate('p1');

      expect(ai.complete).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the threshold setting is 0 or negative', async () => {
      settings.get.mockResolvedValue(0);

      await service.maybeRegenerate('p1');

      expect(prisma.review.count).not.toHaveBeenCalled();
    });
  });

  describe('regeneration — degradation and validation', () => {
    beforeEach(() => {
      prisma.review.count.mockResolvedValue(10);
      prisma.productReviewSummary.findUnique.mockResolvedValue(null);
    });

    it('skips entirely when no AI provider is available, without touching the cached row', async () => {
      ai.isAvailable.mockReturnValue(false);
      prisma.review.findMany.mockResolvedValue([{ rating: 3, title: null, body: 'ok', fitFeedback: null }]);

      await service.maybeRegenerate('p1');

      expect(ai.complete).not.toHaveBeenCalled();
      expect(prisma.productReviewSummary.upsert).not.toHaveBeenCalled();
    });

    it('leaves the cached summary alone when the AI call fails', async () => {
      prisma.review.findMany.mockResolvedValue([{ rating: 3, title: null, body: 'ok', fitFeedback: null }]);
      ai.complete.mockResolvedValue(null);

      await service.maybeRegenerate('p1');

      expect(prisma.productReviewSummary.upsert).not.toHaveBeenCalled();
    });

    it('leaves the cached summary alone when the model output is unparseable', async () => {
      prisma.review.findMany.mockResolvedValue([{ rating: 3, title: null, body: 'ok', fitFeedback: null }]);
      ai.complete.mockResolvedValue({ text: 'not json at all', inputTokens: 1, outputTokens: 1, model: 'test' });

      await service.maybeRegenerate('p1');

      expect(prisma.productReviewSummary.upsert).not.toHaveBeenCalled();
    });

    it('rejects a fitSignal outside the recognised vocabulary rather than storing it', async () => {
      prisma.review.findMany.mockResolvedValue([{ rating: 3, title: null, body: 'ok', fitFeedback: null }]);
      ai.complete.mockResolvedValue({
        text: JSON.stringify({ summaryText: 'ok', fitSignal: 'kind of small maybe', qualitySignal: null, commonComplaints: [] }),
        inputTokens: 1,
        outputTokens: 1,
        model: 'test',
      });

      await service.maybeRegenerate('p1');

      expect(prisma.productReviewSummary.upsert).not.toHaveBeenCalled();
    });

    it('caps commonComplaints at 3', async () => {
      prisma.review.findMany.mockResolvedValue([{ rating: 3, title: null, body: 'ok', fitFeedback: null }]);
      ai.complete.mockResolvedValue({
        text: JSON.stringify({
          summaryText: 'ok',
          fitSignal: null,
          qualitySignal: null,
          commonComplaints: ['a', 'b', 'c', 'd', 'e'],
        }),
        inputTokens: 1,
        outputTokens: 1,
        model: 'test',
      });

      await service.maybeRegenerate('p1');

      expect(prisma.productReviewSummary.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ commonComplaints: ['a', 'b', 'c'] }) }),
      );
    });

    it('extracts a JSON object even when the model wraps it in prose', async () => {
      prisma.review.findMany.mockResolvedValue([{ rating: 3, title: null, body: 'ok', fitFeedback: null }]);
      ai.complete.mockResolvedValue({
        text: 'Sure:\n{"summaryText":"Great fabric","fitSignal":null,"qualitySignal":"soft fabric","commonComplaints":[]}\nHope this helps!',
        inputTokens: 1,
        outputTokens: 1,
        model: 'test',
      });

      await service.maybeRegenerate('p1');

      expect(prisma.productReviewSummary.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ summaryText: 'Great fabric' }) }),
      );
    });

    it('stores the Urdu counterpart alongside the English summary (House Rule 1)', async () => {
      prisma.review.findMany.mockResolvedValue([{ rating: 3, title: null, body: 'runs small', fitFeedback: 'too_small' }]);
      ai.complete.mockResolvedValue({
        text: JSON.stringify({
          summaryText: 'Most customers say it runs small',
          summaryTextUr: 'زیادہ تر گاہک کہتے ہیں کہ یہ چھوٹا ہے',
          fitSignal: 'too_small',
          qualitySignal: null,
          commonComplaints: [],
        }),
        inputTokens: 1,
        outputTokens: 1,
        model: 'test',
      });

      await service.maybeRegenerate('p1');

      expect(prisma.productReviewSummary.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ summaryTextUr: 'زیادہ تر گاہک کہتے ہیں کہ یہ چھوٹا ہے' }),
        }),
      );
    });

    it('still caches the English summary when the model omits summaryTextUr', async () => {
      prisma.review.findMany.mockResolvedValue([{ rating: 3, title: null, body: 'ok', fitFeedback: null }]);
      ai.complete.mockResolvedValue({
        text: JSON.stringify({ summaryText: 'Great fabric', fitSignal: null, qualitySignal: null, commonComplaints: [] }),
        inputTokens: 1,
        outputTokens: 1,
        model: 'test',
      });

      await service.maybeRegenerate('p1');

      expect(prisma.productReviewSummary.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ summaryText: 'Great fabric', summaryTextUr: null }) }),
      );
    });

    it('stores the current review count as reviewCountAtGeneration', async () => {
      prisma.review.findMany.mockResolvedValue([{ rating: 3, title: null, body: 'ok', fitFeedback: null }]);
      ai.complete.mockResolvedValue({
        text: JSON.stringify({ summaryText: 'ok', fitSignal: null, qualitySignal: null, commonComplaints: [] }),
        inputTokens: 1,
        outputTokens: 1,
        model: 'test',
      });

      await service.maybeRegenerate('p1');

      expect(prisma.productReviewSummary.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ reviewCountAtGeneration: 10 }) }),
      );
    });
  });

  describe('getSummary', () => {
    it('reads the cached row for the product', async () => {
      prisma.productReviewSummary.findUnique.mockResolvedValue({ productId: 'p1', summaryText: 'ok' });
      const result = await service.getSummary('p1');
      expect(result).toEqual({ productId: 'p1', summaryText: 'ok' });
    });
  });
});
