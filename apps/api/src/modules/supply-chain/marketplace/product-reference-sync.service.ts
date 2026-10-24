import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE } from '@newax/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { Prisma } from '../../../core/prisma/client';

/** Loose on purpose: shared by a `ProductReferenceView` (marketplace.service.ts,
 *  always `string | null`) and a validated webhook DTO (class-validator,
 *  `string | undefined` on an optional field) — both are valid inputs here. */
export interface SyncableTranslation {
  locale: string;
  name: string;
  description?: string | null;
  careInstructions?: string | null;
}

export interface SyncableImage {
  url: string;
  altText: string;
  order?: number;
}

export interface ProductReferenceSyncPayload {
  referenceId: string;
  barcode: string;
  updatedAt: string;
  translations: SyncableTranslation[];
  images?: SyncableImage[];
}

/** What `adopt()` needs from a reference — deliberately excludes
 *  `referenceId`, which the caller already has separately (either
 *  `ProductReferenceView.id` from a lookup/register response, or a
 *  webhook payload's own `referenceId` field). */
export interface ProductReferenceContent {
  barcode: string;
  translations: SyncableTranslation[];
  images?: SyncableImage[];
}

/**
 * 166-unified-product-reference-registry.md, WO-166.4 — the erp-1-side
 * consumer of a `GlobalProductReference`. Every write here is scoped to a
 * `Product` this tenant already owns, found by matching
 * `ProductVariant.barcode` — the join key doc 166's own text names, never a
 * separate link table on this side (that bookkeeping lives on the platform,
 * in `GlobalProductReferenceLink`).
 */
@Injectable()
export class ProductReferenceSyncService {
  private readonly logger = new Logger(ProductReferenceSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * "Fill from shared listing?" accepted (WO-166.3), called once, right
   * after the product form's own normal save already wrote whatever the
   * staff member kept or edited from the preview. Deliberately never
   * overwrites `name`/`description`/`careInstructions` on a translation row
   * that already exists — that content is already correct from the save
   * that just happened, possibly hand-edited, and re-fetching the
   * "canonical" text here would silently discard that edit. This method's
   * only two jobs are: stamp provenance so a FUTURE sync delivery is
   * allowed to apply, and bring in the reference's own images, which the
   * ordinary upload form has no way to pull in from a remote URL.
   */
  async adopt(input: { productId: string; referenceId: string; referenceUpdatedAt: Date; payload: ProductReferenceContent }): Promise<void> {
    const { productId, referenceId, referenceUpdatedAt, payload } = input;

    await this.prisma.$transaction(async (tx) => {
      for (const translation of payload.translations) {
        const existing = await tx.productTranslation.findUnique({
          where: { productId_locale: { productId, locale: translation.locale } },
        });

        if (existing) {
          await tx.productTranslation.update({
            where: { productId_locale: { productId, locale: translation.locale } },
            data: { sourcedFromGlobalReferenceId: referenceId, sourcedFromReferenceUpdatedAt: referenceUpdatedAt },
          });
        } else {
          // A locale the reference has but this product's own save didn't
          // include (e.g. the reference carries Urdu, the staff only typed
          // English) — genuinely new content the tenant gains for free.
          await tx.productTranslation.create({
            data: {
              productId,
              locale: translation.locale,
              name: translation.name,
              description: translation.description ?? null,
              careInstructions: translation.careInstructions ?? null,
              sourcedFromGlobalReferenceId: referenceId,
              sourcedFromReferenceUpdatedAt: referenceUpdatedAt,
            },
          });
        }
      }

      await this.replaceSourcedImages(tx, productId, referenceId, payload.images ?? []);
    });

    this.logger.log(`Adopted product reference ${referenceId} (barcode ${payload.barcode}) onto product ${productId}`);
  }

  /**
   * A push delivery from the platform, once its own outbound dispatcher
   * exists (not yet built — see doc 166's own status note). Unlike
   * `adopt()`, this DOES overwrite text — that propagation is the entire
   * point of a sync — but only for a translation row still carrying THIS
   * reference's own provenance marker. A row with no marker (never
   * adopted) or a different one (a local override since the last sync, or
   * cleared by `ProductAdminService.update()`) is left untouched — "never
   * silently clobbered" (doc 166 §2). The reference's own `updatedAt`
   * guards a redelivered (at-least-once) sync from being a redundant
   * rewrite of the same content.
   */
  async apply(payload: ProductReferenceSyncPayload): Promise<{ applied: boolean }> {
    const variant = await this.prisma.productVariant.findUnique({ where: { barcode: payload.barcode } });
    if (!variant) {
      // Not stocked here (yet) — nothing to update. Doc 166's own "absent
      // collaborator" lens: a tenant that never linked this barcode sees no
      // behavior change.
      return { applied: false };
    }

    const referenceUpdatedAt = new Date(payload.updatedAt);

    await this.prisma.$transaction(async (tx) => {
      for (const translation of payload.translations) {
        const existing = await tx.productTranslation.findUnique({
          where: { productId_locale: { productId: variant.productId, locale: translation.locale } },
        });

        if (existing) {
          const isSourcedFromThisReference = existing.sourcedFromGlobalReferenceId === payload.referenceId;
          if (!isSourcedFromThisReference) continue;

          const alreadyApplied =
            existing.sourcedFromReferenceUpdatedAt !== null && existing.sourcedFromReferenceUpdatedAt >= referenceUpdatedAt;
          if (alreadyApplied) continue;
        }

        await tx.productTranslation.upsert({
          where: { productId_locale: { productId: variant.productId, locale: translation.locale } },
          create: {
            productId: variant.productId,
            locale: translation.locale,
            name: translation.name,
            description: translation.description ?? null,
            careInstructions: translation.careInstructions ?? null,
            sourcedFromGlobalReferenceId: payload.referenceId,
            sourcedFromReferenceUpdatedAt: referenceUpdatedAt,
          },
          update: {
            name: translation.name,
            description: translation.description ?? null,
            careInstructions: translation.careInstructions ?? null,
            sourcedFromGlobalReferenceId: payload.referenceId,
            sourcedFromReferenceUpdatedAt: referenceUpdatedAt,
          },
        });
      }

      await this.replaceSourcedImages(tx, variant.productId, payload.referenceId, payload.images ?? []);
    });

    this.logger.log(`Applied product reference ${payload.referenceId} sync to product ${variant.productId} (barcode ${payload.barcode})`);
    return { applied: true };
  }

  /**
   * Delete-then-recreate every image this product holds under this exact
   * reference id, then write the incoming set fresh — mirrors the
   * platform's own `ProductReferenceService.update()` semantics for images
   * (doc 166's own precedent) and never touches a staff-uploaded image
   * (`sourcedFromGlobalReferenceId` null on those rows).
   */
  private async replaceSourcedImages(
    tx: Prisma.TransactionClient,
    productId: string,
    referenceId: string,
    images: SyncableImage[],
  ): Promise<void> {
    await tx.productImage.deleteMany({ where: { productId, sourcedFromGlobalReferenceId: referenceId } });
    if (images.length === 0) return;

    for (const [index, image] of images.entries()) {
      const created = await tx.productImage.create({
        data: {
          productId,
          url: image.url,
          order: image.order ?? index,
          sourcedFromGlobalReferenceId: referenceId,
        },
      });
      // Alt text is customer-facing (House Rule 6) and locale-keyed
      // (03-variants-sku-seo.md WO-3.6) — the registry's own `altText` is a
      // single string, so it lands as this deployment's default locale.
      await tx.productImageTranslation.create({
        data: { imageId: created.id, locale: DEFAULT_LOCALE, alt: image.altText },
      });
    }
  }
}
