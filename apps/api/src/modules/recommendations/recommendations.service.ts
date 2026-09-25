import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { ProductCrossSellKind } from '../../core/prisma/client';

const RELATED_LIMIT = 8;
const FREQUENTLY_BOUGHT_LIMIT = 4;
const PERSONALIZED_LIMIT = 8;
/** How many of a session's most recent product views to look at when nothing more specific applies. */
const RECENT_VIEWS_TO_CONSIDER = 5;

/** Lower sorts first — "MANUAL rows always outrank CO_OCCURRENCE/EMBEDDING ones at read time" (ProductCrossSell's own doc comment). */
const KIND_PRIORITY: Record<ProductCrossSellKind, number> = {
  MANUAL: 0,
  CO_OCCURRENCE: 1,
  EMBEDDING: 2,
};

export interface RelatedProductsResult {
  slugs: string[];
  /** True when at least one MANUAL row exists — the storefront labels the section "Complete the look" rather than a generic "You may also like" when a merchandiser actually curated it. */
  hasManualCuration: boolean;
}

/**
 * WO-9.6 (09-ai-layer.md) — reads ProductCrossSell, which RecommendationsCron
 * (CO_OCCURRENCE/EMBEDDING) and the admin cross-sell screen (MANUAL) are the
 * only writers of. This service never computes a score itself; it only
 * reads the cache and enforces the one rule that isn't encoded in the table:
 * MANUAL always wins.
 */
@Injectable()
export class RecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Storefront ------------------------------------------------------------

  /** The public catalogue addresses a product by slug, never its internal id. */
  async relatedForSlug(slug: string, limit = RELATED_LIMIT): Promise<RelatedProductsResult> {
    const product = await this.prisma.product.findUnique({ where: { slug }, select: { id: true } });
    if (!product) throw new NotFoundException(`Product "${slug}" not found`);
    return this.relatedFor(product.id, limit);
  }

  async frequentlyBoughtWithSlug(slug: string, limit = FREQUENTLY_BOUGHT_LIMIT): Promise<string[]> {
    const product = await this.prisma.product.findUnique({ where: { slug }, select: { id: true } });
    if (!product) throw new NotFoundException(`Product "${slug}" not found`);
    return this.frequentlyBoughtWith(product.id, limit);
  }

  async relatedFor(productId: string, limit = RELATED_LIMIT): Promise<RelatedProductsResult> {
    const rows = await this.prisma.productCrossSell.findMany({
      where: { productId, relatedProduct: { status: 'ACTIVE' } },
      select: { relatedProduct: { select: { slug: true } }, kind: true, order: true },
    });

    const sorted = rows.sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || a.order - b.order);

    return {
      slugs: sorted.slice(0, limit).map((row) => row.relatedProduct.slug),
      hasManualCuration: rows.some((row) => row.kind === 'MANUAL'),
    };
  }

  async frequentlyBoughtWith(productId: string, limit = FREQUENTLY_BOUGHT_LIMIT): Promise<string[]> {
    const rows = await this.prisma.productCrossSell.findMany({
      where: { productId, kind: 'CO_OCCURRENCE', relatedProduct: { status: 'ACTIVE' } },
      select: { relatedProduct: { select: { slug: true } }, order: true },
      orderBy: { order: 'asc' },
      take: limit,
    });
    return rows.map((row) => row.relatedProduct.slug);
  }

  /**
   * "Personalised homepage from browse... history" (the doc's own words) —
   * driven by this anonymous session's own recent page views
   * (AnalyticsEvent, never joined to a user), so it works identically for a
   * guest and a signed-in customer. Returns an empty result rather than a
   * generic fallback list when there is genuinely no signal yet — a
   * "personalised" section showing the same thing to everyone would be
   * dishonest, not a smaller version of the feature.
   */
  async personalizedFor(sessionId: string, limit = PERSONALIZED_LIMIT): Promise<string[]> {
    if (!sessionId) return [];

    const views = await this.prisma.analyticsEvent.findMany({
      where: { sessionId, type: 'page_view', path: { contains: '/product/' } },
      select: { path: true },
      orderBy: { createdAt: 'desc' },
      take: RECENT_VIEWS_TO_CONSIDER,
    });
    if (views.length === 0) return [];

    const viewedSlugs = [...new Set(views.map((v) => extractProductSlug(v.path)).filter((s): s is string => s !== null))];
    if (viewedSlugs.length === 0) return [];

    const viewedProducts = await this.prisma.product.findMany({
      where: { slug: { in: viewedSlugs } },
      select: { id: true, slug: true },
    });
    // Most-recently-viewed product with a resolvable id wins — one product's
    // own related list, not a blend, so the section reads as "because you
    // viewed X" rather than an unexplained grab-bag.
    const mostRecentSlug = viewedSlugs[0];
    const anchor = viewedProducts.find((p) => p.slug === mostRecentSlug) ?? viewedProducts[0];
    if (!anchor) return [];

    const related = await this.relatedFor(anchor.id, limit);
    // Never recommend back the thing they just looked at.
    return related.slugs.filter((slug) => slug !== anchor.slug);
  }

  // --- Admin (manual cross-sell curation) -------------------------------------

  async listCrossSells(productId: string) {
    await this.assertProductExists(productId);
    const rows = await this.prisma.productCrossSell.findMany({
      where: { productId },
      include: { relatedProduct: { include: { translations: { where: { locale: 'en' }, take: 1 } } } },
      orderBy: [{ kind: 'asc' }, { order: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      order: row.order,
      relatedProduct: {
        id: row.relatedProduct.id,
        slug: row.relatedProduct.slug,
        name: row.relatedProduct.translations[0]?.name ?? row.relatedProduct.slug,
      },
    }));
  }

  /** Creates a MANUAL link, or promotes an existing algorithmic row to MANUAL — a merchandiser's own pick always wins from here on, never silently overwritten by the next cron run. */
  async addManualCrossSell(productId: string, relatedProductId: string) {
    if (productId === relatedProductId) {
      throw new BadRequestException('A product cannot be related to itself.');
    }
    await this.assertProductExists(productId);
    await this.assertProductExists(relatedProductId);

    const maxOrder = await this.prisma.productCrossSell.aggregate({
      where: { productId, kind: 'MANUAL' },
      _max: { order: true },
    });

    return this.prisma.productCrossSell.upsert({
      where: { productId_relatedProductId: { productId, relatedProductId } },
      create: { productId, relatedProductId, kind: 'MANUAL', order: (maxOrder._max.order ?? -1) + 1 },
      update: { kind: 'MANUAL' },
    });
  }

  async reorderManualCrossSells(productId: string, orderedRelatedProductIds: string[]): Promise<void> {
    await this.prisma.$transaction(
      orderedRelatedProductIds.map((relatedProductId, index) =>
        this.prisma.productCrossSell.update({
          where: { productId_relatedProductId: { productId, relatedProductId } },
          data: { order: index },
        }),
      ),
    );
  }

  async removeCrossSell(productId: string, relatedProductId: string): Promise<void> {
    await this.prisma.productCrossSell.delete({
      where: { productId_relatedProductId: { productId, relatedProductId } },
    });
  }

  private async assertProductExists(productId: string): Promise<void> {
    const exists = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!exists) throw new NotFoundException(`Product ${productId} not found`);
  }
}

/** "/en/product/lawn-suit-42" -> "lawn-suit-42", "/ur/product/lawn-suit-42?x=1" -> "lawn-suit-42". */
function extractProductSlug(path: string | null): string | null {
  if (!path) return null;
  const match = /\/product\/([^/?]+)/.exec(path);
  return match ? match[1] : null;
}
