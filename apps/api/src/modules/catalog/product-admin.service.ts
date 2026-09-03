import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_LOCALE, slugifyWithFallback, uniqueSlug } from '@yaseen/shared';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { StorageService } from '../../core/storage/storage.service';
import { InventoryService } from '../inventory/inventory.service';
import type { Prisma, ProductKind } from '../../core/prisma/client';
import { paginated } from '../../core/common/dto/pagination.dto';
import type { AdminProductQueryDto } from './dto/product-query.dto';
import type { CreateProductDto, UpdateProductDto } from './dto/product.dto';

const adminInclude = {
  translations: true,
  images: { orderBy: [{ isPrimary: 'desc' }, { order: 'asc' }] },
  variants: { orderBy: { order: 'asc' } },
  category: { include: { translations: true } },
    garmentTypes: true,
} satisfies Prisma.ProductInclude;

/**
 * Product and service management for the dashboard.
 *
 * The same editor handles ready-made clothes, unstitched fabric and stitching
 * services — they differ only by `kind` and the fields that kind requires,
 * which is why `assertKindRules` is the one place those rules live.
 */
@Injectable()
export class ProductAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly inventory: InventoryService,
  ) {}

  async list(query: AdminProductQueryDto) {
    const where: Prisma.ProductWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.kind) where.kind = query.kind;
    if (query.category) where.categoryId = query.category;
    if (query.lowStock === 'true') {
      // Postgres cannot compare two columns through Prisma's filter syntax, so
      // "at or below the threshold" is expressed as a raw column reference.
      where.variants = {
        some: { isActive: true, stock: { lte: this.prisma.productVariant.fields.lowStockThreshold } },
      };
    }
    if (query.q?.trim()) {
      const term = query.q.trim();
      where.OR = [
        { translations: { some: { name: { contains: term, mode: 'insensitive' } } } },
        { slug: { contains: term, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: term, mode: 'insensitive' } } } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: adminInclude,
        orderBy: { updatedAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.product.count({ where }),
    ]);

    return paginated(rows.map(toAdminView), total, query);
  }

  async get(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: adminInclude,
    });
    if (!product) throw new NotFoundException('That product no longer exists.');
    return toAdminView(product);
  }

  async create(actorId: string, dto: CreateProductDto) {
    assertKindRules(dto.kind, dto);
    assertTranslations(dto.translations);
    assertUniqueSkus(dto.variants);

    const slug = await this.resolveSlug(dto.slug, dto.translations);

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          slug,
          kind: dto.kind,
          status: dto.status ?? 'DRAFT',
          categoryId: dto.categoryId || null,
          basePrice: dto.basePrice,
          compareAtPrice: dto.compareAtPrice ?? null,
          brand: dto.brand?.trim() || null,
          fabric: normaliseTag(dto.fabric),
          season: normaliseTag(dto.season),
          tags: (dto.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean),
          pieceCount: dto.pieceCount ?? null,
          fabricMeters: dto.fabricMeters ?? null,
          stitchingAvailable: dto.kind === 'UNSTITCHED' && (dto.stitchingAvailable ?? false),
          garmentTypeId: dto.kind === 'STITCHING_SERVICE' ? (dto.garmentTypeId ?? null) : null,
          featuredRank: dto.featuredRank ?? 0,
          publishedAt: dto.status === 'ACTIVE' ? new Date() : null,
          translations: {
            create: dto.translations.map((translation) => ({
              locale: translation.locale,
              name: translation.name.trim(),
              description: translation.description?.trim() || null,
              careInstructions: translation.careInstructions?.trim() || null,
              metaTitle: translation.metaTitle?.trim() || null,
              metaDescription: translation.metaDescription?.trim() || null,
            })),
          },
          variants: {
            create: (dto.variants ?? []).map((variant, index) => ({
              sku: variant.sku.trim().toUpperCase(),
              size: variant.size?.trim() || null,
              color: variant.color?.trim() || null,
              colorHex: variant.colorHex?.trim() || null,
              priceOverride: variant.priceOverride ?? null,
              stock: 0,
              lowStockThreshold: variant.lowStockThreshold ?? 3,
              isActive: variant.isActive ?? true,
              order: variant.order ?? index,
            })),
          },
          ...((dto.kind === 'UNSTITCHED' || dto.kind === 'STITCHED') && dto.garmentTypeIds?.length
            ? {
                garmentTypes: {
                  create: dto.garmentTypeIds.map((garmentTypeId) => ({ garmentTypeId })),
                },
              }
            : {}),
        },
        include: adminInclude,
      });

      const locationId = await this.inventory.defaultLocationId(tx);
      for (const [index, variant] of (dto.variants ?? []).entries()) {
        const requestedStock = variant.stock ?? 0;
        if (requestedStock !== 0) {
          const createdVariant = product.variants[index];
          await this.inventory.move({
            variantId: createdVariant.id,
            locationId,
            delta: requestedStock,
            reason: 'ADJUSTMENT',
            actorId,
            note: 'Product created',
          }, tx);
        }
      }

      await this.audit.record({
        actorId,
        action: 'product.created',
        entity: 'Product',
        entityId: product.id,
        data: { slug },
      });

      return toAdminView(await tx.product.findUniqueOrThrow({ where: { id: product.id }, include: adminInclude }));
    });
  }

  async update(actorId: string, id: string, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: { variants: true },
    });
    if (!existing) throw new NotFoundException('That product no longer exists.');

    const kind = dto.kind ?? existing.kind;
    assertKindRules(kind, { ...existing, ...dto });
    if (dto.translations) assertTranslations(dto.translations);
    assertUniqueSkus(dto.variants);

    const data: Prisma.ProductUpdateInput = {};
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.basePrice !== undefined) data.basePrice = dto.basePrice;
    if (dto.compareAtPrice !== undefined) data.compareAtPrice = dto.compareAtPrice;
    if (dto.brand !== undefined) data.brand = dto.brand.trim() || null;
    if (dto.fabric !== undefined) data.fabric = normaliseTag(dto.fabric);
    if (dto.season !== undefined) data.season = normaliseTag(dto.season);
    if (dto.tags !== undefined) {
      data.tags = dto.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
    }
    if (dto.pieceCount !== undefined) data.pieceCount = dto.pieceCount;
    if (dto.fabricMeters !== undefined) data.fabricMeters = dto.fabricMeters;
    if (dto.featuredRank !== undefined) data.featuredRank = dto.featuredRank;
    if (dto.stitchingAvailable !== undefined) {
      data.stitchingAvailable = kind === 'UNSTITCHED' && dto.stitchingAvailable;
    }
    if (dto.slug) data.slug = dto.slug;

    if (dto.categoryId !== undefined) {
      data.category = dto.categoryId
        ? { connect: { id: dto.categoryId } }
        : { disconnect: true };
    }
    if (dto.garmentTypeId !== undefined) {
      data.garmentTypeId = kind === 'STITCHING_SERVICE' && dto.garmentTypeId ? dto.garmentTypeId : null;
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
      // Stamp the first publish so listings can sort by "new in".
      if (dto.status === 'ACTIVE' && !existing.publishedAt) data.publishedAt = new Date();
    }

    const product = await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data });

      if (dto.translations) {
        for (const translation of dto.translations) {
          await tx.productTranslation.upsert({
            where: { productId_locale: { productId: id, locale: translation.locale } },
            create: {
              productId: id,
              locale: translation.locale,
              name: translation.name.trim(),
              description: translation.description?.trim() || null,
              careInstructions: translation.careInstructions?.trim() || null,
              metaTitle: translation.metaTitle?.trim() || null,
              metaDescription: translation.metaDescription?.trim() || null,
            },
            update: {
              name: translation.name.trim(),
              description: translation.description?.trim() || null,
              careInstructions: translation.careInstructions?.trim() || null,
              metaTitle: translation.metaTitle?.trim() || null,
              metaDescription: translation.metaDescription?.trim() || null,
            },
          });
        }
      }

      if (dto.variants) {
        await this.syncVariants(actorId, tx, id, dto.variants, existing.variants);
      }

      if (dto.garmentTypeIds && (kind === 'UNSTITCHED' || kind === 'STITCHED')) {
        await tx.productGarmentType.deleteMany({ where: { productId: id } });
        if (dto.garmentTypeIds.length > 0) {
          await tx.productGarmentType.createMany({
            data: dto.garmentTypeIds.map((garmentTypeId) => ({
              productId: id,
              garmentTypeId,
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.product.findUniqueOrThrow({ where: { id }, include: adminInclude });
    });

    await this.audit.record({
      actorId,
      action: 'product.updated',
      entity: 'Product',
      entityId: id,
      data: { changed: Object.keys(dto) },
    });

    return toAdminView(product);
  }

  /**
   * Archives a product rather than deleting it — order history references it,
   * and a deleted row would take the customer's receipt with it.
   */
  async archive(actorId: string, id: string) {
    const product = await this.prisma.product.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    await this.audit.record({
      actorId,
      action: 'product.archived',
      entity: 'Product',
      entityId: id,
      data: { slug: product.slug },
    });

    return toAdminView(
      await this.prisma.product.findUniqueOrThrow({ where: { id }, include: adminInclude }),
    );
  }

  async addImage(
    actorId: string,
    productId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    alt?: string,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { images: true },
    });
    if (!product) throw new NotFoundException('That product no longer exists.');

    const stored = await this.storage.putImage({
      folder: 'products',
      filename: file.originalname,
      contentType: file.mimetype,
      body: file.buffer,
    });

    const image = await this.prisma.productImage.create({
      data: {
        productId,
        url: stored.url,
        alt: alt?.trim() || null,
        order: product.images.length,
        // The first image uploaded becomes the listing thumbnail.
        isPrimary: product.images.length === 0,
      },
    });

    await this.audit.record({
      actorId,
      action: 'product.image_added',
      entity: 'Product',
      entityId: productId,
      data: { imageId: image.id, key: stored.key },
    });

    return image;
  }

  async reorderImages(productId: string, imageIds: string[]) {
    const images = await this.prisma.productImage.findMany({ where: { productId } });
    const known = new Set(images.map((image) => image.id));

    const unknown = imageIds.filter((imageId) => !known.has(imageId));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown image id(s): ${unknown.join(', ')}`);
    }

    await this.prisma.$transaction(
      imageIds.map((imageId, index) =>
        this.prisma.productImage.update({
          where: { id: imageId },
          data: { order: index, isPrimary: index === 0 },
        }),
      ),
    );

    return this.prisma.productImage.findMany({
      where: { productId },
      orderBy: { order: 'asc' },
    });
  }

  async deleteImage(imageId: string): Promise<void> {
    const image = await this.prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image) throw new NotFoundException('That image no longer exists.');

    await this.prisma.productImage.delete({ where: { id: imageId } });

    // Promote the next image so the product is never left without a thumbnail.
    if (image.isPrimary) {
      const next = await this.prisma.productImage.findFirst({
        where: { productId: image.productId },
        orderBy: { order: 'asc' },
      });
      if (next) {
        await this.prisma.productImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }
  }

  async updateStock(actorId: string, variantId: string, stock: number) {
    const pv = await this.prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    if (pv.stock !== stock) {
      const locationId = await this.inventory.defaultLocationId();
      await this.inventory.move({
        variantId,
        locationId,
        delta: stock - pv.stock,
        reason: 'ADJUSTMENT',
        actorId,
        note: 'Admin manual stock update',
      });
    }

    return this.prisma.productVariant.findUnique({ where: { id: variantId } });
  }

  private async syncVariants(
    actorId: string,
    tx: Prisma.TransactionClient,
    productId: string,
    incoming: NonNullable<UpdateProductDto['variants']>,
    existing: Array<{ id: string; sku: string; stock: number }>,
  ): Promise<void> {
    const keptIds = new Set(
      incoming.map((variant) => variant.id).filter((id): id is string => Boolean(id)),
    );

    // A variant that is gone from the form is deactivated, not deleted: order
    // items point at it.
    const removed = existing.filter((variant) => !keptIds.has(variant.id));
    if (removed.length > 0) {
      await tx.productVariant.updateMany({
        where: { id: { in: removed.map((variant) => variant.id) } },
        data: { isActive: false },
      });
    }

    const locationId = await this.inventory.defaultLocationId(tx);
    for (const [index, variant] of incoming.entries()) {
      const data = {
        sku: variant.sku.trim().toUpperCase(),
        size: variant.size?.trim() || null,
        color: variant.color?.trim() || null,
        colorHex: variant.colorHex?.trim() || null,
        priceOverride: variant.priceOverride ?? null,
        lowStockThreshold: variant.lowStockThreshold ?? 3,
        isActive: variant.isActive ?? true,
        order: variant.order ?? index,
      };

      const requestedStock = variant.stock ?? 0;
      let pvId: string;
      let currentStock = 0;

      if (variant.id) {
        pvId = variant.id;
        const existVariant = existing.find((v) => v.id === variant.id);
        if (existVariant) currentStock = existVariant.stock;
        await tx.productVariant.updateMany({ where: { id: pvId }, data });
      } else {
        const created = await tx.productVariant.create({ data: { ...data, stock: 0, productId } });
        pvId = created.id;
      }

      if (requestedStock !== currentStock) {
        await this.inventory.move({
          variantId: pvId,
          locationId,
          delta: requestedStock - currentStock,
          reason: 'ADJUSTMENT',
          actorId,
          note: 'Product admin form save',
        }, tx);
      }
    }
  }

  private async resolveSlug(
    requested: string | undefined,
    translations: CreateProductDto['translations'],
  ): Promise<string> {
    const english = translations.find((row) => row.locale === DEFAULT_LOCALE);
    const base = slugifyWithFallback(requested ?? english?.name ?? '', 'product');

    const clashes = await this.prisma.product.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });

    return uniqueSlug(
      base,
      clashes.map((row) => row.slug),
    );
  }
}

/**
 * The rules that distinguish the three product kinds. Kept in one function so
 * the create and update paths cannot drift apart.
 */
export function assertKindRules(
  kind: ProductKind,
  input: {
    garmentTypeId?: string | null;
    pieceCount?: number | null;
    stitchingAvailable?: boolean | null;
  },
): void {
  if (kind === 'STITCHING_SERVICE' && !input.garmentTypeId) {
    throw new BadRequestException(
      'A stitching service must say which garment it stitches (garmentTypeId).',
    );
  }

  if (kind !== 'UNSTITCHED') {
    if (input.pieceCount) {
      throw new BadRequestException('pieceCount only applies to unstitched fabric.');
    }
    if (input.stitchingAvailable) {
      throw new BadRequestException(
        'Stitching can only be offered on unstitched fabric.',
      );
    }
  }
}

function assertTranslations(translations: CreateProductDto['translations']): void {
  if (!translations.some((row) => row.locale === DEFAULT_LOCALE)) {
    throw new BadRequestException('An English name is required for every product.');
  }

  const locales = translations.map((row) => row.locale);
  if (new Set(locales).size !== locales.length) {
    throw new BadRequestException('Each language may only appear once.');
  }
}

function assertUniqueSkus(variants: CreateProductDto['variants']): void {
  if (!variants?.length) return;

  const skus = variants.map((variant) => variant.sku.trim().toUpperCase());
  const duplicates = skus.filter((sku, index) => skus.indexOf(sku) !== index);

  if (duplicates.length > 0) {
    throw new BadRequestException(
      `Duplicate SKU(s) in this product: ${[...new Set(duplicates)].join(', ')}`,
    );
  }
}

function normaliseTag(value: string | null | undefined): string | null {
  return value?.trim().toLowerCase() || null;
}

type AdminProduct = Prisma.ProductGetPayload<{ include: typeof adminInclude }>;

/** Admin view: both locales side by side, plus stock roll-ups for the table. */
export function toAdminView(product: AdminProduct) {
  const totalStock = product.variants
    .filter((variant) => variant.isActive)
    .reduce((sum, variant) => sum + variant.stock, 0);

  return {
    ...product,
    garmentTypeIds: product.garmentTypes.map((link) => link.garmentTypeId),
    totalStock,
    lowStockVariants: product.variants.filter(
      (variant) => variant.isActive && variant.stock <= variant.lowStockThreshold,
    ).length,
  };
}
