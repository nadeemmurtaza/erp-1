import { BadRequestException, Body, Controller, Get, NotFoundException, Post, Query } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { DEFAULT_LOCALE } from '@newax/shared';
import { RequirePermission } from '../../core/auth/decorators';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MarketplaceService } from './marketplace.service';
import { ProductReferenceSyncService } from './product-reference-sync.service';
import {
  ApplyProductReferenceDto,
  LookupProductReferenceQueryDto,
  RegisterProductReferenceDto,
} from './dto/product-reference.dto';

/**
 * 166-unified-product-reference-registry.md, WO-166.3 — the erp-1-side
 * barcode-autofill API the product editor calls. Same permission and same
 * `MarketplaceService` credential as doc 165's listings controller; this is
 * a second capability of the one marketplace credential, never a second key
 * to manage.
 */
@Controller('admin/marketplace/product-references')
@RequirePermission('catalog.manage')
export class ProductReferencesController {
  private readonly logger = new Logger(ProductReferencesController.name);

  constructor(
    private readonly marketplace: MarketplaceService,
    private readonly sync: ProductReferenceSyncService,
    private readonly prisma: PrismaService,
  ) {}

  /** Fires on the barcode field's blur — a REQUEST, refusable by 404: the
   *  form falls back to a blank field exactly as it does today. */
  @Get('lookup')
  async lookup(@Query() query: LookupProductReferenceQueryDto) {
    const reference = await this.marketplace.lookupProductReference(query.barcode);
    if (!reference) throw new NotFoundException(`No shared listing registered for barcode ${query.barcode}`);
    return reference;
  }

  /**
   * "Fill from shared listing?" accepted. Runs AFTER the product's own
   * normal save already wrote whatever the staff member kept or edited —
   * this call re-fetches the canonical reference by the variant's own
   * barcode (never trusting a client-supplied payload as "the registry
   * says"), stamps provenance via `adopt()`, and links this tenant to the
   * reference so a future push sync reaches it. A link failure is logged,
   * never surfaced: the local prefill already succeeded, and a missed link
   * only means this tenant does not yet receive future sync deliveries.
   */
  @Post('apply')
  async apply(@Body() dto: ApplyProductReferenceDto) {
    const variant = await this.variantWithBarcode(dto.variantId);
    const reference = await this.marketplace.lookupProductReference(variant.barcode!);
    if (!reference) {
      throw new NotFoundException(`No shared listing registered for barcode ${variant.barcode}`);
    }

    await this.sync.adopt({
      productId: variant.productId,
      referenceId: reference.id,
      referenceUpdatedAt: new Date(reference.updatedAt),
      payload: reference,
    });

    try {
      await this.marketplace.linkProductReference(reference.id, variant.id);
    } catch (error) {
      this.logger.warn(
        `Adopted reference ${reference.id} onto variant ${variant.id} but could not record the link — ${error instanceof Error ? error.message : error}`,
      );
    }

    return { referenceId: reference.id };
  }

  /**
   * The barcode had no match when looked up — register this tenant's own
   * just-saved data as the canonical reference, so the next business in
   * the chain finds it instead of a blank form. Best-effort: a
   * malformed barcode or an unreachable platform never blocks the product
   * that was already saved successfully.
   */
  @Post('register')
  async register(@Body() dto: RegisterProductReferenceDto) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.variantId },
      include: { product: { include: { translations: true, images: { include: { translations: true } } } } },
    });
    if (!variant) throw new NotFoundException('That product variant no longer exists.');
    if (!variant.barcode) throw new BadRequestException('This variant has no barcode set.');

    const englishName = variant.product.translations.find((t) => t.locale === DEFAULT_LOCALE)?.name ?? variant.product.slug;
    const images = variant.product.images
      .filter((image) => !image.variantId || image.variantId === variant.id)
      .map((image, index) => ({
        url: image.url,
        altText: image.translations.find((t) => t.locale === DEFAULT_LOCALE)?.alt || image.alt || englishName,
        order: image.order ?? index,
      }));

    const reference = await this.marketplace.registerProductReference({
      barcode: variant.barcode,
      translations: variant.product.translations.map((t) => ({
        locale: t.locale,
        name: t.name,
        description: t.description,
        careInstructions: t.careInstructions,
      })),
      images: images.length > 0 ? images : undefined,
      attributes: {
        ...(variant.product.fabric ? { fabric: variant.product.fabric } : {}),
        ...(variant.product.season ? { season: variant.product.season } : {}),
      },
    });

    await this.sync.adopt({
      productId: variant.productId,
      referenceId: reference.id,
      referenceUpdatedAt: new Date(reference.updatedAt),
      payload: reference,
    });

    try {
      await this.marketplace.linkProductReference(reference.id, variant.id);
    } catch (error) {
      this.logger.warn(
        `Registered reference ${reference.id} for variant ${variant.id} but could not record the link — ${error instanceof Error ? error.message : error}`,
      );
    }

    return { referenceId: reference.id };
  }

  private async variantWithBarcode(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('That product variant no longer exists.');
    if (!variant.barcode) throw new BadRequestException('This variant has no barcode set.');
    return variant;
  }
}
