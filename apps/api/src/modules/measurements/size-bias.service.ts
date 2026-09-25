import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';

const FIT_KEYS = ['too_small', 'true_to_size', 'too_large'] as const;
/** The only ReturnReasonCode.key values this feature recognises as fit-related — a shop's own free-text reason keys are never pattern-matched or guessed at. */
const FIT_RETURN_REASON_KEYS = ['too_small', 'too_large'] as const;

/**
 * WO-9.2 (09-ai-layer.md) — "aggregate Review.fitFeedback per product to
 * compute ProductSizeBias.shift." Corroborated by return reasons ONLY when a
 * shop has actually created a ReturnReasonCode row keyed exactly `too_small`
 * or `too_large` (fulfilment/returns.service.ts's `reasons` are free-text,
 * admin-defined — this never pattern-matches an arbitrary label). Reads
 * Review and ReturnRequestItem directly via Prisma rather than importing
 * ReviewsService/ReturnsService — a read across modules, not the
 * same-transaction write KNOWN_MODULE_COUPLINGS exists for.
 */
@Injectable()
export class SizeBiasService {
  private readonly logger = new Logger(SizeBiasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async recompute(productId: string): Promise<void> {
    const [reviewCounts, returnCounts] = await Promise.all([
      this.prisma.review.groupBy({
        by: ['fitFeedback'],
        where: { productId, status: 'PUBLISHED', fitFeedback: { in: [...FIT_KEYS] } },
        _count: { _all: true },
      }),
      this.prisma.returnRequestItem.groupBy({
        by: ['reasonId'],
        where: { orderItem: { productId }, reason: { key: { in: [...FIT_RETURN_REASON_KEYS] } } },
        _count: { _all: true },
      }),
    ]);

    let tooSmall = reviewCounts.find((row) => row.fitFeedback === 'too_small')?._count._all ?? 0;
    const trueToSize = reviewCounts.find((row) => row.fitFeedback === 'true_to_size')?._count._all ?? 0;
    let tooLarge = reviewCounts.find((row) => row.fitFeedback === 'too_large')?._count._all ?? 0;

    if (returnCounts.length > 0) {
      const reasonIds = returnCounts.map((row) => row.reasonId);
      const reasons = await this.prisma.returnReasonCode.findMany({
        where: { id: { in: reasonIds } },
        select: { id: true, key: true },
      });
      const keyById = new Map(reasons.map((reason) => [reason.id, reason.key]));
      for (const row of returnCounts) {
        const key = keyById.get(row.reasonId);
        if (key === 'too_small') tooSmall += row._count._all;
        else if (key === 'too_large') tooLarge += row._count._all;
      }
    }

    const sampleSize = tooSmall + trueToSize + tooLarge;
    const pct = (count: number) => (sampleSize > 0 ? (count / sampleSize) * 100 : 0);

    const [thresholdPct, minSampleSize] = await Promise.all([
      this.settings.get<number>(SettingKey.SizeBiasShiftThresholdPct),
      this.settings.get<number>(SettingKey.SizeBiasMinSampleSize),
    ]);

    let shift = 0;
    if (sampleSize >= minSampleSize) {
      if (pct(tooSmall) >= thresholdPct) shift = 1;
      else if (pct(tooLarge) >= thresholdPct) shift = -1;
    }

    await this.prisma.productSizeBias.upsert({
      where: { productId },
      create: {
        productId,
        tooSmallPct: pct(tooSmall),
        trueToSizePct: pct(trueToSize),
        tooLargePct: pct(tooLarge),
        sampleSize,
        shift,
      },
      update: {
        tooSmallPct: pct(tooSmall),
        trueToSizePct: pct(trueToSize),
        tooLargePct: pct(tooLarge),
        sampleSize,
        shift,
        computedAt: new Date(),
      },
    });

    this.logger.debug(
      `size bias for ${productId}: ${sampleSize} sample(s), too_small ${pct(tooSmall).toFixed(0)}%, too_large ${pct(tooLarge).toFixed(0)}%, shift ${shift}`,
    );
  }
}
