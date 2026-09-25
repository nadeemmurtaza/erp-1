import { Injectable } from '@nestjs/common';
import { recommendSize, type SizeChartRow } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import { toFieldDefs } from './measurements.service';

export interface SizeRecommendationResponse {
  garmentTypeId: string;
  garmentTypeLabel: string;
  profileId: string;
  recommendedSize: string;
  matchedSize: string;
  confidence: 'high' | 'medium' | 'low';
  /** Structured signals — the storefront composes its own localized sentence from these (apps/web/messages/*.json), never English prose from the API. */
  shiftedForFit: 'up' | 'down' | null;
  unavailableFallback: boolean;
}

/**
 * WO-9.2 (09-ai-layer.md) — "Based on your measurements, take M." Reads
 * Product/ProductVariant/ProductGarmentType via direct Prisma rather than
 * importing CatalogService — a cross-module read, not the same-transaction
 * write KNOWN_MODULE_COUPLINGS exists for (matches search's own read of
 * catalog tables in search.service.ts).
 */
@Injectable()
export class SizeRecommendationService {
  constructor(private readonly prisma: PrismaService) {}

  async recommendForProduct(
    userId: string | null,
    productId: string,
    locale: 'en' | 'ur' = 'en',
  ): Promise<SizeRecommendationResponse | null> {
    if (!userId) return null;

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        garmentTypes: { select: { garmentTypeId: true } },
        variants: { where: { isActive: true }, select: { size: true } },
      },
    });
    if (!product || product.garmentTypes.length === 0) return null;

    const availableSizeTokens = Array.from(
      new Set(product.variants.map((variant) => variant.size).filter((size): size is string => Boolean(size))),
    );
    if (availableSizeTokens.length === 0) return null;

    const garmentTypeIds = product.garmentTypes.map((link) => link.garmentTypeId);
    const garmentTypes = await this.prisma.garmentType.findMany({
      where: { id: { in: garmentTypeIds }, isActive: true },
      orderBy: { order: 'asc' },
      include: { fields: { where: { isActive: true }, orderBy: { order: 'asc' } }, sizeChart: true },
    });

    for (const garmentType of garmentTypes) {
      const profile = await this.prisma.measurementProfile.findFirst({
        where: { userId, garmentTypeId: garmentType.id },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });
      if (!profile) continue;
      if (garmentType.sizeChart.length === 0) continue;

      const bias = await this.prisma.productSizeBias.findUnique({ where: { productId } });

      const chart: SizeChartRow[] = garmentType.sizeChart.map((row) => ({
        sizeToken: row.sizeToken as SizeChartRow['sizeToken'],
        values: row.values as Record<string, number>,
      }));

      const result = recommendSize({
        fields: toFieldDefs(garmentType.fields),
        profile: profile.values as Record<string, number>,
        chart,
        availableSizeTokens,
        biasShift: bias?.shift ?? 0,
      });
      if (!result) continue;

      return {
        garmentTypeId: garmentType.id,
        garmentTypeLabel: locale === 'ur' ? garmentType.labelUr : garmentType.labelEn,
        profileId: profile.id,
        recommendedSize: result.recommendedSize,
        matchedSize: result.matchedSize,
        confidence: result.confidence,
        shiftedForFit: result.shiftedForFit,
        unavailableFallback: result.unavailableFallback,
      };
    }

    return null;
  }
}
