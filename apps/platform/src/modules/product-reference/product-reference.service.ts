import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { GlobalProductReference } from '../../core/prisma/client';
import type { RegisterProductReferenceDto, UpdateProductReferenceDto } from './dto/product-reference.dto';

const referenceInclude = { translations: true, images: { orderBy: { order: 'asc' as const } } };

type ReferenceWithDetails = GlobalProductReference & {
  translations: { locale: string; name: string; description: string | null; careInstructions: string | null }[];
  images: { id: string; url: string; altText: string; order: number }[];
};

/**
 * Doc 166's own registry service. Every method here reads or writes
 * `GlobalProductReference` and its child tables — never a tenant's own
 * `Product`/`ProductVariant` (that stays entirely on the erp-1 side, per
 * doc 39's isolation; this app never touches a tenant's own database).
 */
@Injectable()
export class ProductReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** `GET /marketplace/v1/product-references/:barcode` — a REQUEST,
   *  refusable by returning null: the caller falls back to manual entry,
   *  exactly as doc 166's own "absent collaborator" lens describes. */
  async lookup(barcode: string): Promise<ReferenceWithDetails | null> {
    return this.prisma.globalProductReference.findUnique({
      where: { barcode },
      include: referenceInclude,
    });
  }

  /** `POST /marketplace/v1/product-references/bulk-lookup` — an offline
   *  deployment pre-warming its local cache. Silently skips a barcode with
   *  no match rather than erroring the whole batch — the caller already
   *  knows which of its requested barcodes came back by checking the
   *  result's own `barcode` field against its input list. */
  async bulkLookup(barcodes: string[]): Promise<ReferenceWithDetails[]> {
    return this.prisma.globalProductReference.findMany({
      where: { barcode: { in: barcodes } },
      include: referenceInclude,
    });
  }

  /** `POST /marketplace/v1/product-references` — refuses a barcode already
   *  registered (the caller should look it up, then either link to it or
   *  flag it, never silently create a second reference for one barcode). */
  async register(tenantId: string, dto: RegisterProductReferenceDto): Promise<ReferenceWithDetails> {
    const existing = await this.prisma.globalProductReference.findUnique({ where: { barcode: dto.barcode } });
    if (existing) {
      throw new BadRequestException(`Barcode ${dto.barcode} is already registered — look it up instead of re-registering.`);
    }

    return this.prisma.globalProductReference.create({
      data: {
        barcode: dto.barcode,
        registeredByTenantId: tenantId,
        attributes: (dto.attributes ?? {}) as object,
        translations: { create: dto.translations },
        images: { create: dto.images ?? [] },
      },
      include: referenceInclude,
    });
  }

  private async getOwnedOrThrow(tenantId: string, id: string): Promise<GlobalProductReference> {
    const reference = await this.prisma.globalProductReference.findUnique({ where: { id } });
    if (!reference) throw new NotFoundException(`No product reference with id ${id}`);
    // The toxic-pair guard doc 166 exists to enforce: only the tenant that
    // first registered this barcode may edit its canonical record. Every
    // other tenant's only write path is a flag (see flag() below).
    if (reference.registeredByTenantId !== tenantId) {
      throw new ForbiddenException('Only the tenant that registered this product reference may edit it.');
    }
    return reference;
  }

  /**
   * `PATCH /marketplace/v1/product-references/:id` — registering tenant
   * only. A provided `translations`/`images` array fully replaces the
   * existing set (delete-then-recreate inside one transaction) rather than
   * a per-field merge, since a caller sending a translation array is
   * always sending the complete, current picture for those locales, the
   * same "PUT-like" semantics `UpdateProductDto` already uses on the
   * erp-1 side.
   */
  async update(tenantId: string, id: string, dto: UpdateProductReferenceDto): Promise<ReferenceWithDetails> {
    await this.getOwnedOrThrow(tenantId, id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.translations) {
        await tx.globalProductReferenceTranslation.deleteMany({ where: { referenceId: id } });
        await tx.globalProductReferenceTranslation.createMany({
          data: dto.translations.map((t) => ({ ...t, referenceId: id })),
        });
      }

      if (dto.images) {
        await tx.globalProductReferenceImage.deleteMany({ where: { referenceId: id } });
        await tx.globalProductReferenceImage.createMany({
          data: dto.images.map((image) => ({ ...image, referenceId: id })),
        });
      }

      return tx.globalProductReference.update({
        where: { id },
        data: dto.attributes !== undefined ? { attributes: dto.attributes as object } : {},
        include: referenceInclude,
      });
    });
  }

  /**
   * `POST /marketplace/v1/product-references/:id/link` — any tenant
   * holding a credential may link, regardless of who registered the
   * reference (linking is "I stock this too," not an edit). Re-linking the
   * same `variantRef` to a different reference re-points the existing row
   * rather than erroring — doc 166's own "second copy of the write" lens:
   * `@@unique([tenantId, variantRef])` is what makes this an update, not a
   * duplicate.
   */
  async link(tenantId: string, referenceId: string, variantRef: string): Promise<void> {
    const reference = await this.prisma.globalProductReference.findUnique({ where: { id: referenceId } });
    if (!reference) throw new NotFoundException(`No product reference with id ${referenceId}`);

    await this.prisma.globalProductReferenceLink.upsert({
      where: { tenantId_variantRef: { tenantId, variantRef } },
      update: { referenceId, linkedAt: new Date() },
      create: { tenantId, variantRef, referenceId },
    });
  }

  async unlink(tenantId: string, variantRef: string): Promise<void> {
    await this.prisma.globalProductReferenceLink.deleteMany({ where: { tenantId, variantRef } });
  }

  /** `POST /marketplace/v1/product-references/:id/flags` — the only write
   *  path a non-registering tenant has. Never mutates the canonical
   *  record; a human reviews it (WO-166.5, not yet built). */
  async flag(tenantId: string, referenceId: string, reason: string): Promise<void> {
    const reference = await this.prisma.globalProductReference.findUnique({ where: { id: referenceId } });
    if (!reference) throw new NotFoundException(`No product reference with id ${referenceId}`);

    await this.prisma.globalProductReferenceFlag.create({
      data: { referenceId, flaggedByTenantId: tenantId, reason },
    });
  }

  /**
   * `GET /marketplace/v1/product-references/export` — the pull path for an
   * offline-capable deployment (doc 166 §2's "Bulk pull"). Scoped
   * exclusively to references the calling tenant has already linked — this
   * is a resync of a tenant's own known catalog, never a way to discover
   * new barcodes (that is `lookup()`/`bulkLookup()`'s job). `since` is
   * compared against the reference's own `updatedAt`, never the link's own
   * `linkedAt`, so an edit to the canonical text is what triggers a resync,
   * not the age of the link itself.
   */
  async exportSince(tenantId: string, since?: Date): Promise<ReferenceWithDetails[]> {
    const links = await this.prisma.globalProductReferenceLink.findMany({
      where: { tenantId },
      select: { referenceId: true },
    });
    const referenceIds = links.map((link) => link.referenceId);
    if (referenceIds.length === 0) return [];

    return this.prisma.globalProductReference.findMany({
      where: {
        id: { in: referenceIds },
        ...(since ? { updatedAt: { gt: since } } : {}),
      },
      include: referenceInclude,
    });
  }
}
