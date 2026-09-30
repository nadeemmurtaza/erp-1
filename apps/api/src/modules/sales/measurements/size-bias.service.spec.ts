import { Test, TestingModule } from '@nestjs/testing';
import { SizeBiasService } from './size-bias.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';

describe('SizeBiasService', () => {
  let service: SizeBiasService;
  let prisma: any;
  let settings: any;

  beforeEach(async () => {
    prisma = {
      review: { groupBy: jest.fn().mockResolvedValue([]) },
      returnRequestItem: { groupBy: jest.fn().mockResolvedValue([]) },
      returnReasonCode: { findMany: jest.fn().mockResolvedValue([]) },
      productSizeBias: { upsert: jest.fn().mockResolvedValue({}) },
      productReviewSummary: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    settings = {
      get: jest.fn(async (key: string) => {
        if (key === SettingKey.SizeBiasShiftThresholdPct) return 40;
        if (key === SettingKey.SizeBiasMinSampleSize) return 5;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SizeBiasService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();

    service = module.get(SizeBiasService);
  });

  it('upserts a zeroed bias row with shift 0 when there is no feedback at all', async () => {
    await service.recompute('prod1');

    expect(prisma.productSizeBias.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId: 'prod1' },
        create: expect.objectContaining({ tooSmallPct: 0, trueToSizePct: 0, tooLargePct: 0, sampleSize: 0, shift: 0 }),
      }),
    );
  });

  it('shifts up when too_small crosses the threshold with enough sample size', async () => {
    prisma.review.groupBy.mockResolvedValue([
      { fitFeedback: 'too_small', _count: { _all: 5 } },
      { fitFeedback: 'true_to_size', _count: { _all: 5 } },
    ]);

    await service.recompute('prod1');

    expect(prisma.productSizeBias.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ sampleSize: 10, tooSmallPct: 50, shift: 1 }),
      }),
    );
  });

  it('shifts down when too_large crosses the threshold', async () => {
    prisma.review.groupBy.mockResolvedValue([
      { fitFeedback: 'too_large', _count: { _all: 4 } },
      { fitFeedback: 'true_to_size', _count: { _all: 2 } },
    ]);

    await service.recompute('prod1');

    expect(prisma.productSizeBias.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ shift: -1 }) }),
    );
  });

  it('never shifts below the minimum sample size, even at 100% too_small', async () => {
    prisma.review.groupBy.mockResolvedValue([{ fitFeedback: 'too_small', _count: { _all: 3 } }]);

    await service.recompute('prod1');

    expect(prisma.productSizeBias.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ sampleSize: 3, shift: 0 }) }),
    );
  });

  describe('WO-9.9 — ProductReviewSummary.fitSignal corroboration', () => {
    it('falls back to fitSignal when the structured sample is below the minimum', async () => {
      prisma.review.groupBy.mockResolvedValue([{ fitFeedback: 'too_small', _count: { _all: 2 } }]);
      prisma.productReviewSummary.findUnique.mockResolvedValue({ fitSignal: 'too_small' });

      await service.recompute('prod1');

      expect(prisma.productSizeBias.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ sampleSize: 2, shift: 1 }) }),
      );
    });

    it('applies a too_large fitSignal the same way', async () => {
      prisma.productReviewSummary.findUnique.mockResolvedValue({ fitSignal: 'too_large' });

      await service.recompute('prod1');

      expect(prisma.productSizeBias.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ shift: -1 }) }),
      );
    });

    it('never consults fitSignal once the structured sample alone is enough to decide', async () => {
      prisma.review.groupBy.mockResolvedValue([
        { fitFeedback: 'too_small', _count: { _all: 5 } },
        { fitFeedback: 'true_to_size', _count: { _all: 5 } },
      ]);
      // A contradicting AI signal must never override a decision the real counts already made.
      prisma.productReviewSummary.findUnique.mockResolvedValue({ fitSignal: 'too_large' });

      await service.recompute('prod1');

      expect(prisma.productReviewSummary.findUnique).not.toHaveBeenCalled();
      expect(prisma.productSizeBias.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ shift: 1 }) }),
      );
    });

    it('stays at shift 0 when there is no cached summary yet', async () => {
      prisma.productReviewSummary.findUnique.mockResolvedValue(null);

      await service.recompute('prod1');

      expect(prisma.productSizeBias.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ shift: 0 }) }),
      );
    });
  });

  it('folds in return-reason counts keyed exactly too_small/too_large, ignoring other reason keys', async () => {
    prisma.review.groupBy.mockResolvedValue([
      { fitFeedback: 'too_small', _count: { _all: 2 } },
      { fitFeedback: 'true_to_size', _count: { _all: 2 } },
    ]);
    prisma.returnRequestItem.groupBy.mockResolvedValue([
      { reasonId: 'r1', _count: { _all: 3 } },
      { reasonId: 'r2', _count: { _all: 1 } },
    ]);
    prisma.returnReasonCode.findMany.mockResolvedValue([
      { id: 'r1', key: 'too_small' },
      { id: 'r2', key: 'damaged' },
    ]);

    await service.recompute('prod1');

    // 2 (review) + 3 (return, too_small) = 5 too_small; the "damaged" reason is not counted at all.
    expect(prisma.productSizeBias.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ sampleSize: 7, shift: 1 }) }),
    );
  });

  it('updates an existing row (not just create) on a later recompute', async () => {
    prisma.review.groupBy.mockResolvedValue([{ fitFeedback: 'true_to_size', _count: { _all: 10 } }]);

    await service.recompute('prod1');

    expect(prisma.productSizeBias.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ trueToSizePct: 100, shift: 0, computedAt: expect.any(Date) }),
      }),
    );
  });
});
