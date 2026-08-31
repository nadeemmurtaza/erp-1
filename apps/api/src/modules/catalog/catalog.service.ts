import { Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale } from '@yaseen/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../core/prisma/client';
import { paginated, type PaginatedResult } from '../../core/common/dto/pagination.dto';
import type { ProductQueryDto } from './dto/product-query.dto';

/** A product flattened into one locale, ready for the storefront. */
export interface LocalisedProduct {
  id: string;
  slug: string;
  kind: string;
  name: string;
  description: string | null;
  careInstructions: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  brand: string | null;
  fabric: string | null;
  season: string | null;
  tags: string[];
  pieceCount: number | null;
  fabricMeters: number | null;
  stitchingAvailable: boolean;
  images: Array<{ url: string; alt: string | null; isPrimary: boolean }>;
  variants: Array<{
    id: string;
    sku: string;
    size: string | null;
    color: string | null;
    colorHex: string | null;
    price: number;
    stock: number;
    inStock: boolean;
  }>;
  category: { id: string; slug: string; name: string } | null;
  /** UNSTITCHED: the garments this fabric can be made into. STITCHED: the garments backing this product's size chart. */
  garmentTypes: Array<{ id: string; key: string; label: string }>;
  /** STITCHING_SERVICE only: the garment this service stitches. */
  serviceGarment: { id: string; key: string; label: string } | null;
  inStock: boolean;
  /** Cheapest variant price, which is what a listing card should show. */
  fromPrice: number;
}

const productInclude = {
  translations: true,
  images: { orderBy: [{ isPrimary: 'desc' }, { order: 'asc' }] },
  variants: { where: { isActive: true }, orderBy: { order: 'asc' } },
  category: { include: { translations: true } },
    garmentTypes: true,
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

/**
 * Storefront reads. Only ACTIVE products are ever returned here — drafts and
 * archived products are visible through the admin service alone.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(query: ProductQueryDto): Promise<PaginatedResult<LocalisedProduct>> {
    const where = await this.buildWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: sortOrder(query.sort),
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.product.count({ where }),
    ]);

    return paginated(
      await Promise.all(rows.map((row) => localise(this.prisma, row, query.locale))),
      total,
      query,
    );
  }

  async getProductBySlug(slug: string, locale: Locale = DEFAULT_LOCALE) {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: 'ACTIVE' },
      include: productInclude,
    });

    if (!product) {
      throw new NotFoundException(`No product at "${slug}".`);
    }
    return await localise(this.prisma, product, locale);
  }

  /**
   * Stitching services offered for a garment type — what the "get it stitched"
   * panel lists once the customer has picked kameez, shalwar or trouser.
   */
  async listStitchingServices(garmentTypeId?: string, locale: Locale = DEFAULT_LOCALE) {
    const services = await this.prisma.product.findMany({
      where: {
        kind: 'STITCHING_SERVICE',
        status: 'ACTIVE',
        ...(garmentTypeId
          ? { OR: [{ garmentTypeId }, { garmentTypeId: garmentTypeId }] }
          : {}),
      },
      include: productInclude,
      orderBy: { basePrice: 'asc' },
    });

    return Promise.all(services.map(service => localise(this.prisma, service, locale)));
  }

  /** Category tree in one locale, for the storefront navigation. */
  async listCategories(locale: Locale = DEFAULT_LOCALE) {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      include: { translations: true },
      orderBy: { order: 'asc' },
    });

    const nodes = categories.map((category) => ({
      id: category.id,
      slug: category.slug,
      parentId: category.parentId,
      imageUrl: category.imageUrl,
      name: pickTranslation(category.translations, locale)?.name ?? category.slug,
      description: pickTranslation(category.translations, locale)?.description ?? null,
      children: [] as Array<Record<string, unknown>>,
    }));

    const byId = new Map(nodes.map((node) => [node.id, node]));
    const roots: typeof nodes = [];

    for (const node of nodes) {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  /** Distinct fabrics, seasons and piece counts, for the listing filter panel. */
  async getFilterFacets() {
    const products = await this.prisma.product.findMany({
      where: { status: 'ACTIVE' },
      select: { fabric: true, season: true, pieceCount: true, basePrice: true },
    });

    const distinct = (values: Array<string | null>) =>
      [...new Set(values.filter((value): value is string => Boolean(value)))].sort();

    const prices = products.map((product) => product.basePrice);

    return {
      fabrics: distinct(products.map((product) => product.fabric)),
      seasons: distinct(products.map((product) => product.season)),
      pieceCounts: [
        ...new Set(
          products
            .map((product) => product.pieceCount)
            .filter((count): count is number => count !== null),
        ),
      ].sort((a, b) => a - b),
      priceRange: {
        min: prices.length > 0 ? Math.min(...prices) : 0,
        max: prices.length > 0 ? Math.max(...prices) : 0,
      },
    };
  }

  private async buildWhere(query: ProductQueryDto): Promise<Prisma.ProductWhereInput> {
    const where: Prisma.ProductWhereInput = { status: 'ACTIVE' };

    if (query.kind) {
      where.kind = query.kind;
    } else {
      // A stitching service is a line item on fabric, not something to browse;
      // it only appears in listings when explicitly asked for.
      where.kind = { in: ['STITCHED', 'UNSTITCHED'] };
    }

    if (query.category) {
      const category = await this.prisma.category.findFirst({
        where: { OR: [{ slug: query.category }, { id: query.category }] },
        select: { id: true },
      });
      // An unknown category must return nothing, not everything.
      where.categoryId = category?.id ?? '__no_such_category__';
    }

    if (query.fabric?.length) where.fabric = { in: query.fabric };
    if (query.season?.length) where.season = { in: query.season };
    if (query.pieceCount?.length) {
      const counts = query.pieceCount
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value));
      if (counts.length > 0) where.pieceCount = { in: counts };
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.basePrice = {
        ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
      };
    }

    if (query.q?.trim()) {
      const term = query.q.trim();
      where.OR = [
        { translations: { some: { name: { contains: term, mode: 'insensitive' } } } },
        { translations: { some: { description: { contains: term, mode: 'insensitive' } } } },
        { tags: { has: term.toLowerCase() } },
        { variants: { some: { sku: { contains: term, mode: 'insensitive' } } } },
      ];
    }

    return where;
  }
}

function sortOrder(
  sort: ProductQueryDto['sort'],
): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'price_asc':
      return [{ basePrice: 'asc' }];
    case 'price_desc':
      return [{ basePrice: 'desc' }];
    case 'newest':
      return [{ createdAt: 'desc' }];
    case 'name':
      return [{ slug: 'asc' }];
    case 'featured':
    default:
      return [{ featuredRank: 'desc' }, { createdAt: 'desc' }];
  }
}

/** Falls back to English, then to whatever translation exists. */
export function pickTranslation<T extends { locale: string }>(
  translations: T[],
  locale: string,
): T | undefined {
  return (
    translations.find((row) => row.locale === locale) ??
    translations.find((row) => row.locale === DEFAULT_LOCALE) ??
    translations[0]
  );
}

export async function localise(
  prisma: PrismaService,
  product: ProductWithRelations,
  locale: Locale,
): Promise<LocalisedProduct> {
  const translation = pickTranslation(product.translations, locale);
  const categoryTranslation = product.category
    ? pickTranslation(product.category.translations, locale)
    : undefined;

  const variants = product.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    size: variant.size,
    color: variant.color,
    colorHex: variant.colorHex,
    price: variant.priceOverride ?? product.basePrice,
    stock: variant.stock,
    inStock: variant.stock > 0,
  }));

  const prices = variants.map((variant) => variant.price);

  const garmentTypeIds = product.garmentTypes.map(link => link.garmentTypeId);
  const fetchedGarments = garmentTypeIds.length > 0 
    ? await prisma.garmentType.findMany({ where: { id: { in: garmentTypeIds } } })
    : [];
  
  const serviceGarmentDb = product.garmentTypeId 
    ? await prisma.garmentType.findUnique({ where: { id: product.garmentTypeId } })
    : null;

  const garmentTypes = fetchedGarments.map((g) => ({
    id: g.id,
    key: g.key,
    label: locale === 'ur' ? g.labelUr : g.labelEn,
  }));

  const serviceGarment = serviceGarmentDb
    ? {
        id: serviceGarmentDb.id,
        key: serviceGarmentDb.key,
        label: locale === 'ur' ? serviceGarmentDb.labelUr : serviceGarmentDb.labelEn,
      }
    : null;

  return {
    id: product.id,
    slug: product.slug,
    kind: product.kind,
    name: translation?.name ?? product.slug,
    description: translation?.description ?? null,
    careInstructions: translation?.careInstructions ?? null,
    basePrice: product.basePrice,
    compareAtPrice: product.compareAtPrice,
    brand: product.brand,
    fabric: product.fabric,
    season: product.season,
    tags: product.tags,
    pieceCount: product.pieceCount,
    fabricMeters: product.fabricMeters,
    stitchingAvailable: product.stitchingAvailable,
    images: product.images.map((image) => ({
      url: image.url,
      alt: image.alt,
      isPrimary: image.isPrimary,
    })),
    variants,
    category: product.category
      ? {
          id: product.category.id,
          slug: product.category.slug,
          name: categoryTranslation?.name ?? product.category.slug,
        }
      : null,
    garmentTypes,
    serviceGarment,
    inStock: variants.some((variant) => variant.inStock),
    fromPrice: prices.length > 0 ? Math.min(...prices) : product.basePrice,
  };
}
