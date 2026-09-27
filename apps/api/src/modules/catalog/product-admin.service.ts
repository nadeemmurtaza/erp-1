import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_LOCALE, LOCALES, slugifyWithFallback, uniqueSlug } from '@newax/shared';
import { AuditService } from '../../core/audit/audit.service';
import { DomainEvent } from '../../core/events/domain-events';
import { EventBusService } from '../../core/events/event-bus.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { StorageService } from '../../core/storage/storage.service';
import { InventoryService } from '../inventory/inventory.service';
import type { Prisma, ProductKind } from '../../core/prisma/client';
import { paginated } from '../../core/common/dto/pagination.dto';
import type { AdminProductQueryDto } from './dto/product-query.dto';
import type { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { syncOptionModel } from './sync-option-model';
import { RedirectService } from './redirect.service';
import { ProductOptionAdminService } from './product-option-admin.service';
import { checkPublishGate, type PublishGateInput } from './publish-gate';

const adminInclude = {
  translations: true,
  images: { orderBy: [{ isPrimary: 'desc' }, { order: 'asc' }], include: { translations: true } },
  variants: { orderBy: { order: 'asc' } },
  category: { include: { translations: true } },
  garmentTypes: true,
  options: { include: { translations: true, values: { include: { translations: true } } }, orderBy: { order: 'asc' } },
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
    private readonly events: EventBusService,
    private readonly redirects: RedirectService,
    private readonly productOptions: ProductOptionAdminService,
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
          brandId: dto.brandId || null,
          fabric: normaliseTag(dto.fabric),
          season: normaliseTag(dto.season),
          tags: (dto.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean),
          pieceCount: dto.pieceCount ?? null,
          fabricMeters: dto.fabricMeters ?? null,
          stitchingAvailable: dto.kind === 'UNSTITCHED' && (dto.stitchingAvailable ?? false),
          garmentTypeId: dto.kind === 'STITCHING_SERVICE' ? (dto.garmentTypeId ?? null) : null,
          featuredRank: dto.featuredRank ?? 0,
          isConsumable: dto.isConsumable ?? false,
          publishedAt: dto.status === 'ACTIVE' ? new Date() : null,
          code: dto.code?.trim().toUpperCase() || slug.toUpperCase().replace(/-/g, '').slice(0, 12),
          noindex: dto.noindex ?? false,
          canonicalOverride: dto.canonicalOverride?.trim() || null,
          translations: {
            create: dto.translations.map((translation) => ({
              locale: translation.locale,
              name: translation.name.trim(),
              description: translation.description?.trim() || null,
              careInstructions: translation.careInstructions?.trim() || null,
              metaTitle: translation.metaTitle?.trim() || null,
              metaDescription: translation.metaDescription?.trim() || null,
              focusKeyword: translation.focusKeyword?.trim() || null,
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
              skuIsManual: variant.skuIsManual ?? false,
              barcode: variant.barcode?.trim() || null,
              costPrice: variant.costPrice ?? 0,
              reorderPoint: variant.reorderPoint ?? null,
              reorderQuantity: variant.reorderQuantity ?? null,
              preferredSupplierId: variant.preferredSupplierId || null,
              lotTracked: variant.lotTracked ?? false,
              tracksSerials: variant.tracksSerials ?? false,
              warrantyMonths: variant.warrantyMonths ?? null,
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
        const createdVariant = product.variants[index];
        if (requestedStock !== 0) {
          await this.inventory.move({
            variantId: createdVariant.id,
            locationId,
            delta: requestedStock,
            reason: 'ADJUSTMENT',
            actorId,
            note: 'Product created',
          }, tx);
        }
        if (variant.optionValueKeys?.length) {
          await this.productOptions.syncVariantOptionValues(tx, product.id, createdVariant.id, variant.optionValueKeys);
        }
      }

      // WO-3.2 dual-write: every write that touches size/color also derives
      // ProductOption/ProductOptionValue from it, unconditionally — see
      // sync-option-model.ts's own doc comment for why this never conflicts
      // with a custom axis written above via syncVariantOptionValues.
      await syncOptionModel(tx, { productIds: [product.id] });

      await this.audit.record({
        actorId,
        action: 'product.created',
        entity: 'Product',
        entityId: product.id,
        data: { slug },
      });

      if (product.status === 'ACTIVE') {
        await this.events.publish(
          DomainEvent.ProductPublished,
          {
            productId: product.id,
            slug: product.slug,
            nameEn: product.translations.find((t) => t.locale === DEFAULT_LOCALE)?.name ?? product.slug,
            basePriceMinor: product.basePrice,
          },
          tx,
        );
      }
      await this.events.publish(DomainEvent.ProductChanged, { productId: product.id }, tx);

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
    if (dto.brandId !== undefined) {
      // ProductUpdateInput takes the relation, not the scalar key: connect to
      // the brand, or disconnect when the field is cleared.
      data.brand = dto.brandId ? { connect: { id: dto.brandId } } : { disconnect: true };
    }
    if (dto.fabric !== undefined) data.fabric = normaliseTag(dto.fabric);
    if (dto.season !== undefined) data.season = normaliseTag(dto.season);
    if (dto.tags !== undefined) {
      data.tags = dto.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
    }
    if (dto.pieceCount !== undefined) data.pieceCount = dto.pieceCount;
    if (dto.fabricMeters !== undefined) data.fabricMeters = dto.fabricMeters;
    if (dto.featuredRank !== undefined) data.featuredRank = dto.featuredRank;
    if (dto.isConsumable !== undefined) data.isConsumable = dto.isConsumable;
    if (dto.stitchingAvailable !== undefined) {
      data.stitchingAvailable = kind === 'UNSTITCHED' && dto.stitchingAvailable;
    }
    if (dto.slug) data.slug = dto.slug;
    if (dto.code !== undefined) data.code = dto.code?.trim().toUpperCase() || null;
    if (dto.noindex !== undefined) data.noindex = dto.noindex;
    if (dto.canonicalOverride !== undefined) data.canonicalOverride = dto.canonicalOverride?.trim() || null;

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

    const enteringActive = dto.status === 'ACTIVE' && existing.status !== 'ACTIVE';

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
              focusKeyword: translation.focusKeyword?.trim() || null,
            },
            update: {
              name: translation.name.trim(),
              description: translation.description?.trim() || null,
              careInstructions: translation.careInstructions?.trim() || null,
              metaTitle: translation.metaTitle?.trim() || null,
              metaDescription: translation.metaDescription?.trim() || null,
              focusKeyword: translation.focusKeyword?.trim() || null,
              // 166-unified-product-reference-registry.md WO-166.4 — an
              // ordinary edit through this form is a deliberate local
              // override; clearing the marker here is what stops the next
              // sync delivery from silently clobbering it back.
              sourcedFromGlobalReferenceId: null,
              sourcedFromReferenceUpdatedAt: null,
            },
          });
        }
      }

      if (dto.variants) {
        await this.syncVariants(actorId, tx, id, dto.variants, existing.variants);
      }

      // WO-3.2 dual-write, unconditional (see create()'s own comment).
      await syncOptionModel(tx, { productIds: [id] });

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

      // WO-3.9 — a live product's slug changing 301s the old URL, so a link
      // or a search-engine ranking is never silently broken. A DRAFT slug
      // change creates nothing (doc's own instruction).
      if (dto.slug && dto.slug !== existing.slug && existing.status === 'ACTIVE') {
        await this.redirects.recordSlugChange(tx, 'product', existing.slug, dto.slug);
      }

      const refreshed = await tx.product.findUniqueOrThrow({ where: { id }, include: adminInclude });

      // WO-3.7's publish gate — enforced only on the transition INTO ACTIVE.
      // An already-ACTIVE product is grandfathered (never deactivated
      // retroactively); its own gaps surface through the SEO health list
      // instead of blocking an unrelated save.
      if (enteringActive) {
        const gate = checkPublishGate(toPublishGateInput(refreshed));
        if (!gate.passed) {
          throw new BadRequestException(
            `Cannot publish — ${gate.failures.join(' ')}`,
          );
        }
      }

      return refreshed;
    });

    await this.audit.record({
      actorId,
      action: 'product.updated',
      entity: 'Product',
      entityId: id,
      data: { changed: Object.keys(dto) },
    });

    if (dto.basePrice !== undefined && dto.basePrice !== existing.basePrice) {
      await this.events.publish(DomainEvent.ProductPriceChanged, {
        productId: product.id,
        slug: product.slug,
        nameEn: product.translations.find((t) => t.locale === DEFAULT_LOCALE)?.name ?? product.slug,
        oldPriceMinor: existing.basePrice,
        newPriceMinor: dto.basePrice,
      });
    }
    await this.events.publish(DomainEvent.ProductChanged, { productId: product.id });

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

  /** The editor sidebar's live completeness indicator — same gate, never blocking here. */
  async checkPublishGate(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: adminInclude });
    if (!product) throw new NotFoundException('That product no longer exists.');
    return checkPublishGate(toPublishGateInput(product));
  }

  async addImage(
    actorId: string,
    productId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    alt?: string,
    locale: string = DEFAULT_LOCALE,
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
        order: product.images.length,
        // The first image uploaded becomes the listing thumbnail.
        isPrimary: product.images.length === 0,
        // WO-3.6: alt text is per locale now (translations), never the
        // legacy `alt` column — see the migration's own doc comment.
        translations: alt?.trim() ? { create: [{ locale, alt: alt.trim() }] } : undefined,
      },
      include: { translations: true },
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

  /**
   * Alt text is the one thing addImage() cannot get right on its own — a
   * filename is not a description of what's in the photo. Editable after
   * the fact, so staff can fix it without re-uploading.
   */
  async updateImageAlt(actorId: string, imageId: string, alt: string, locale: string = DEFAULT_LOCALE) {
    const image = await this.prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image) throw new NotFoundException('That image no longer exists.');

    const updated = await this.prisma.productImageTranslation.upsert({
      where: { imageId_locale: { imageId, locale } },
      create: { imageId, locale, alt: alt.trim() },
      update: { alt: alt.trim() },
    });

    await this.audit.record({
      actorId,
      action: 'product.image_alt_updated',
      entity: 'Product',
      entityId: image.productId,
      data: { imageId, locale },
    });

    return updated;
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
        skuIsManual: variant.skuIsManual ?? false,
        barcode: variant.barcode?.trim() || null,
        costPrice: variant.costPrice ?? 0,
        reorderPoint: variant.reorderPoint ?? null,
        reorderQuantity: variant.reorderQuantity ?? null,
        preferredSupplierId: variant.preferredSupplierId || null,
        lotTracked: variant.lotTracked ?? false,
        tracksSerials: variant.tracksSerials ?? false,
        warrantyMonths: variant.warrantyMonths ?? null,
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

      if (variant.optionValueKeys?.length) {
        await this.productOptions.syncVariantOptionValues(tx, productId, pvId, variant.optionValueKeys);
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

/**
 * Catches the two ways a hand-typed variant list contradicts itself before
 * either reaches the database: the same SKU twice (Prisma's unique
 * constraint would catch this too, but only after the transaction has
 * already done other work, and with a generic P2002 message), and the same
 * size/colour combination twice (nothing else checks this at all — the
 * schema has no constraint on it, since two variants can legitimately share
 * a size or a colour, just never both at once).
 */
export function assertUniqueSkus(variants: CreateProductDto['variants']): void {
  if (!variants?.length) return;

  const skus = variants.map((variant) => variant.sku.trim().toUpperCase());
  const duplicateSkus = skus.filter((sku, index) => skus.indexOf(sku) !== index);

  if (duplicateSkus.length > 0) {
    throw new BadRequestException(
      `Duplicate SKU(s) in this product: ${[...new Set(duplicateSkus)].join(', ')}`,
    );
  }

  const combos = variants.map(
    (variant) => `${variant.size?.trim().toUpperCase() ?? ''} ${variant.color?.trim().toUpperCase() ?? ''}`,
  );
  const duplicateComboIndex = combos.findIndex((combo, index) => combos.indexOf(combo) !== index);

  if (duplicateComboIndex !== -1) {
    const variant = variants[duplicateComboIndex]!;
    const label = [variant.size, variant.color].filter(Boolean).join(' / ') || '(no size or colour)';
    throw new BadRequestException(
      `Two variants share the same size and colour: ${label}. Each combination may only appear once.`,
    );
  }
}

function normaliseTag(value: string | null | undefined): string | null {
  return value?.trim().toLowerCase() || null;
}

type AdminProduct = Prisma.ProductGetPayload<{ include: typeof adminInclude }>;

/** Maps the admin-shaped product into the publish gate's own input shape (WO-3.7). */
function toPublishGateInput(product: AdminProduct): PublishGateInput {
  return {
    translations: product.translations.map((t) => ({
      locale: t.locale,
      metaTitle: t.metaTitle,
      metaDescription: t.metaDescription,
    })),
    images: product.images.map((image) => ({
      isPrimary: image.isPrimary,
      altByLocale: Object.fromEntries(
        LOCALES.map((locale) => [
          locale,
          image.translations.find((t) => t.locale === locale)?.alt ?? (locale === DEFAULT_LOCALE ? image.alt : null),
        ]),
      ),
    })),
    variants: product.variants.map((v) => ({
      isActive: v.isActive,
      sku: v.sku,
      price: v.priceOverride ?? product.basePrice,
      costPrice: v.costPrice,
    })),
  };
}

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
