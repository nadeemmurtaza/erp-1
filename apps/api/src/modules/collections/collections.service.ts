import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { pickTranslation, type CollectionRule } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma } from '../../core/prisma/client';
import { ruleToProductWhere } from './collection-rule-engine';
import type {
  AddCollectionProductDto,
  CreateCollectionDto,
  ReorderCollectionProductsDto,
  UpdateCollectionDto,
} from './dto/collections.dto';

const collectionInclude = {
  translations: true,
  products: { orderBy: { order: 'asc' as const }, include: { product: { select: { id: true, slug: true } } } },
} satisfies Prisma.CollectionInclude;

interface CandidateProduct {
  id: string;
  slug: string;
  basePrice: number;
  createdAt: Date;
  featuredRank: number;
}

/**
 * WO-8.2. Deliberately reads Product/ProductVariant/OrderItem through the
 * shared Prisma client rather than importing CatalogService — a read across
 * modules is not the same-transaction-write case KNOWN_MODULE_COUPLINGS
 * exists for (scripts/check-module-boundaries.mjs), and the full
 * StorefrontProduct shape (price-from-variants, stock, garment types) stays
 * owned by catalog. Public reads here resolve to product SLUGS only; the
 * storefront page fetches each product's full card data from the existing
 * public /catalog/products/:slug endpoint — the same thing the CMS's
 * product_grid block already does. That is N cached fetches instead of one
 * batch call, an accepted trade-off at a collection page's page size; a
 * batch-by-slug endpoint is the natural next step if traffic ever justifies
 * it, not something to fake here.
 */
@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Admin CRUD ---------------------------------------------------------

  listCollections() {
    return this.prisma.collection.findMany({
      include: { translations: true, _count: { select: { products: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCollection(id: string) {
    const collection = await this.prisma.collection.findUnique({ where: { id }, include: collectionInclude });
    if (!collection) throw new NotFoundException('Collection not found');
    return collection;
  }

  private async getCollectionOrThrow(id: string) {
    const collection = await this.prisma.collection.findUnique({ where: { id } });
    if (!collection) throw new NotFoundException('Collection not found');
    return collection;
  }

  async createCollection(dto: CreateCollectionDto) {
    if (dto.rule) validateRule(dto.rule);
    return this.prisma.collection.create({
      data: {
        slug: dto.slug,
        rule: dto.rule as Prisma.InputJsonValue | undefined,
        sortStrategy: dto.sortStrategy,
        imageUrl: dto.imageUrl,
        isActive: dto.isActive ?? true,
        translations: { create: dto.translations },
      },
      include: collectionInclude,
    });
  }

  async updateCollection(id: string, dto: UpdateCollectionDto) {
    await this.getCollectionOrThrow(id);
    if (dto.rule) validateRule(dto.rule);

    return this.prisma.$transaction(async (tx) => {
      if (dto.translations) {
        for (const t of dto.translations) {
          await tx.collectionTranslation.upsert({
            where: { collectionId_locale: { collectionId: id, locale: t.locale } },
            create: { collectionId: id, ...t },
            update: t,
          });
        }
      }
      return tx.collection.update({
        where: { id },
        data: {
          rule: dto.rule === null ? Prisma.JsonNull : (dto.rule as Prisma.InputJsonValue | undefined),
          sortStrategy: dto.sortStrategy,
          imageUrl: dto.imageUrl,
          isActive: dto.isActive,
        },
        include: collectionInclude,
      });
    });
  }

  async deleteCollection(id: string): Promise<void> {
    await this.getCollectionOrThrow(id);
    await this.prisma.collection.delete({ where: { id } });
  }

  async addProduct(collectionId: string, dto: AddCollectionProductDto) {
    await this.getCollectionOrThrow(collectionId);
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');

    const order = dto.order ?? (await this.prisma.collectionProduct.count({ where: { collectionId } }));
    await this.prisma.collectionProduct.upsert({
      where: { collectionId_productId: { collectionId, productId: dto.productId } },
      create: { collectionId, productId: dto.productId, order },
      update: { order },
    });
    return this.getCollection(collectionId);
  }

  async removeProduct(collectionId: string, productId: string) {
    await this.getCollectionOrThrow(collectionId);
    await this.prisma.collectionProduct.deleteMany({ where: { collectionId, productId } });
    return this.getCollection(collectionId);
  }

  async reorderProducts(collectionId: string, dto: ReorderCollectionProductsDto) {
    await this.getCollectionOrThrow(collectionId);
    await this.prisma.$transaction(
      dto.productIds.map((productId, order) =>
        this.prisma.collectionProduct.updateMany({ where: { collectionId, productId }, data: { order } }),
      ),
    );
    return this.getCollection(collectionId);
  }

  // --- Public reads -------------------------------------------------------

  async listPublished(locale: string) {
    const collections = await this.prisma.collection.findMany({
      where: { isActive: true },
      include: { translations: true },
      orderBy: { createdAt: 'desc' },
    });
    return collections.map((c) => ({ ...c, translation: pickTranslation(c.translations, locale) }));
  }

  /** Resolves a published collection's member product slugs, sorted and paged. */
  async getPublishedBySlug(
    slug: string,
    locale: string,
    page: number,
    pageSize: number,
  ): Promise<{
    collection: { id: string; slug: string; imageUrl: string | null; translation: unknown };
    productSlugs: string[];
    total: number;
  }> {
    const collection = await this.prisma.collection.findFirst({
      where: { slug, isActive: true },
      include: collectionInclude,
    });
    if (!collection) throw new NotFoundException('Collection not found');

    const candidates = await this.resolveCandidates(collection);
    const sorted = await this.applySortStrategy(candidates, collection.sortStrategy, Boolean(collection.rule));
    const total = sorted.length;
    const page_ = sorted.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    return {
      collection: {
        id: collection.id,
        slug: collection.slug,
        imageUrl: collection.imageUrl,
        translation: pickTranslation(collection.translations, locale),
      },
      productSlugs: page_.map((p) => p.slug),
      total,
    };
  }

  private async resolveCandidates(
    collection: Prisma.CollectionGetPayload<{ include: typeof collectionInclude }>,
  ): Promise<CandidateProduct[]> {
    if (collection.rule) {
      return this.prisma.product.findMany({
        where: ruleToProductWhere(collection.rule as unknown as CollectionRule),
        select: { id: true, slug: true, basePrice: true, createdAt: true, featuredRank: true },
      });
    }

    const rows = await this.prisma.collectionProduct.findMany({
      where: { collectionId: collection.id },
      orderBy: { order: 'asc' },
      include: {
        product: { select: { id: true, slug: true, basePrice: true, createdAt: true, featuredRank: true, status: true } },
      },
    });
    return rows.filter((r) => r.product.status === 'ACTIVE').map((r) => r.product);
  }

  private async applySortStrategy(
    candidates: CandidateProduct[],
    strategy: string,
    isRuleBased: boolean,
  ): Promise<CandidateProduct[]> {
    switch (strategy) {
      case 'NEWEST':
        return [...candidates].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      case 'PRICE_ASC':
        return [...candidates].sort((a, b) => a.basePrice - b.basePrice);
      case 'PRICE_DESC':
        return [...candidates].sort((a, b) => b.basePrice - a.basePrice);
      case 'BEST_SELLING': {
        if (candidates.length === 0) return candidates;
        const sold = await this.prisma.orderItem.groupBy({
          by: ['productId'],
          where: { productId: { in: candidates.map((c) => c.id) } },
          _sum: { quantity: true },
        });
        const soldMap = new Map(sold.map((s) => [s.productId, s._sum.quantity ?? 0]));
        return [...candidates].sort((a, b) => (soldMap.get(b.id) ?? 0) - (soldMap.get(a.id) ?? 0));
      }
      case 'MARGIN': {
        if (candidates.length === 0) return candidates;
        const variants = await this.prisma.productVariant.groupBy({
          by: ['productId'],
          where: { productId: { in: candidates.map((c) => c.id) } },
          _avg: { costPrice: true },
        });
        const costMap = new Map(variants.map((v) => [v.productId, v._avg.costPrice ?? 0]));
        return [...candidates].sort((a, b) => {
          const marginA = a.basePrice - (costMap.get(a.id) ?? 0);
          const marginB = b.basePrice - (costMap.get(b.id) ?? 0);
          return marginB - marginA;
        });
      }
      case 'MANUAL':
      default:
        // MANUAL only means anything for a curated collection — resolveCandidates
        // already returned it in CollectionProduct.order for that case. A
        // rule-based collection with MANUAL selected (no manual order exists)
        // falls back to merchandising rank, same default the catalog uses.
        return isRuleBased ? [...candidates].sort((a, b) => b.featuredRank - a.featuredRank) : candidates;
    }
  }
}

function validateRule(rule: Record<string, unknown>): void {
  if (!Array.isArray((rule as { all?: unknown }).all)) {
    throw new BadRequestException('A collection rule must be shaped { all: CollectionRuleCondition[] }');
  }
}
