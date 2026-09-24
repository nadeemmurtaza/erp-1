import { Injectable } from '@nestjs/common';
import { DEFAULT_LOCALE } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import { checkPublishGate, type PublishGateInput } from './publish-gate';

/**
 * WO-3.7's "Catalogue -> SEO health" (03-variants-sku-seo.md) — every
 * product scored against the publish gate, worst first. Existing ACTIVE
 * products are grandfathered against the gate itself (never deactivated
 * retroactively); this list is precisely the backlog that grandfathering
 * leaves unfixed, so it never goes undiscovered.
 */
@Injectable()
export class SeoHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const products = await this.prisma.product.findMany({
      where: { status: { in: ['ACTIVE', 'DRAFT'] } },
      include: {
        translations: true,
        images: { include: { translations: true } },
        variants: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const scored = products.map((product) => {
      const input: PublishGateInput = {
        translations: product.translations.map((t) => ({
          locale: t.locale,
          metaTitle: t.metaTitle,
          metaDescription: t.metaDescription,
        })),
        images: product.images.map((image) => ({
          isPrimary: image.isPrimary,
          altByLocale: {
            en: image.translations.find((t) => t.locale === 'en')?.alt ?? image.alt,
            ur: image.translations.find((t) => t.locale === 'ur')?.alt ?? null,
          },
        })),
        variants: product.variants.map((v) => ({
          isActive: v.isActive,
          sku: v.sku,
          price: v.priceOverride ?? product.basePrice,
          costPrice: v.costPrice,
        })),
      };

      const gate = checkPublishGate(input);
      return {
        id: product.id,
        slug: product.slug,
        status: product.status,
        name: product.translations.find((t) => t.locale === DEFAULT_LOCALE)?.name ?? product.slug,
        passed: gate.passed,
        failures: gate.failures,
      };
    });

    return scored.filter((row) => !row.passed).sort((a, b) => b.failures.length - a.failures.length);
  }
}
