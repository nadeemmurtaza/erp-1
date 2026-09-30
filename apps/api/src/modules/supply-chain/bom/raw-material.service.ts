import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_LOCALE, fromBaseUnits, slugifyWithFallback, uniqueSlug } from '@newax/shared';
import { paginated } from '../../../core/common/dto/pagination.dto';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { BomService } from './bom.service';
import type { CreateRawMaterialDto, RawMaterialQueryDto, UpdateRawMaterialDto } from './dto/raw-material.dto';
import type { Prisma, RawMaterial, ProductVariant } from '../../../core/prisma/client';

/**
 * A raw material is an ordinary ProductVariant with a RawMaterial marker row
 * (D5, bom.prisma). This service owns only that marker row and the thin
 * Product/Variant shell around it — stock, cost and the movement ledger stay
 * exactly where every other variant keeps them, reached through the normal
 * inventory/purchasing services, never duplicated here.
 */
@Injectable()
export class RawMaterialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bom: BomService,
  ) {}

  async list(query: RawMaterialQueryDto) {
    const filter = query.filter ?? 'active';
    const where: Prisma.RawMaterialWhereInput = {
      ...(filter === 'active' ? { isActive: true } : filter === 'inactive' ? { isActive: false } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.rawMaterial.findMany({
        where,
        include: { variant: true },
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.rawMaterial.count({ where }),
    ]);

    return paginated(
      rows.map((row) => this.toListItem(row, row.variant)),
      total,
      query,
    );
  }

  async get(id: string) {
    const row = await this.prisma.rawMaterial.findUnique({ where: { id }, include: { variant: true } });
    if (!row) throw new NotFoundException('That raw material no longer exists.');

    const recentMovements = await this.prisma.stockMovement.findMany({
      where: { variantId: row.variantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      ...this.toListItem(row, row.variant),
      notes: row.notes,
      recentMovements: recentMovements.map((movement) => ({
        id: movement.id,
        delta: movement.delta,
        resultingStock: movement.resultingStock,
        reason: movement.reason,
        unitCost: movement.unitCost,
        note: movement.note,
        createdAt: movement.createdAt,
      })),
    };
  }

  /**
   * Product (DRAFT, UNSTITCHED, raw-materials category) + ProductVariant +
   * RawMaterial in one transaction — the same shape ProductAdminService.create
   * uses, minus everything a raw material has no use for (options, images,
   * garment types) and minus initial stock: stock arrives only through normal
   * PO receiving (ADR-020), never a bare number typed in here.
   */
  async create(dto: CreateRawMaterialDto) {
    const categoryId = await this.bom.resolveCategoryId();
    const sku = await this.bom.generateSku(dto.name);
    const slug = await this.resolveProductSlug(dto.name);
    const name = dto.name.trim();

    const created = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          slug,
          kind: 'UNSTITCHED',
          status: 'DRAFT',
          categoryId,
          basePrice: 0,
          translations: { create: [{ locale: DEFAULT_LOCALE, name }] },
          variants: { create: [{ sku, stock: 0, isActive: true }] },
        },
        include: { variants: true },
      });

      const variant = product.variants[0];

      const rawMaterial = await tx.rawMaterial.create({
        data: {
          variantId: variant.id,
          name,
          kind: dto.kind ?? 'fabric',
          unit: dto.unit,
          unitScale: dto.unitScale ?? 1,
          notes: dto.notes?.trim() || null,
        },
      });

      return { rawMaterial, variant };
    });

    return this.toListItem(created.rawMaterial, created.variant);
  }

  /**
   * unitScale is effectively immutable once the variant has moved: changing
   * it would silently reinterpret every stock number and historical cost
   * already on record. Write this test first (10-admin-dashboard.md WO-C.1).
   */
  async update(id: string, dto: UpdateRawMaterialDto) {
    const existing = await this.prisma.rawMaterial.findUnique({ where: { id }, include: { variant: true } });
    if (!existing) throw new NotFoundException('That raw material no longer exists.');

    if (dto.unitScale !== undefined && dto.unitScale !== existing.unitScale) {
      const hasMoved =
        existing.variant.stock !== 0 ||
        (await this.prisma.stockMovement.count({ where: { variantId: existing.variantId } })) > 0;
      if (hasMoved) {
        throw new ConflictException(
          'This raw material already has stock or stock history — its unit scale can no longer change. Create a new raw material instead.',
        );
      }
    }

    const name = dto.name?.trim();

    const updated = await this.prisma.$transaction(async (tx) => {
      const rawMaterial = await tx.rawMaterial.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
          ...(dto.unitScale !== undefined ? { unitScale: dto.unitScale } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        },
        include: { variant: true },
      });

      if (name !== undefined) {
        await tx.productTranslation.updateMany({
          where: { productId: rawMaterial.variant.productId, locale: DEFAULT_LOCALE },
          data: { name },
        });
      }

      return rawMaterial;
    });

    return this.toListItem(updated, updated.variant);
  }

  /**
   * The 409-while-an-ACTIVE-recipe-references-it guard belongs here once
   * BomComponent exists (WO-C.2); today nothing can reference a raw material
   * yet, so this is the plain isActive toggle every product archive already
   * uses (ProductAdminService.archive).
   */
  async deactivate(id: string) {
    const existing = await this.prisma.rawMaterial.findUnique({ where: { id }, include: { variant: true } });
    if (!existing) throw new NotFoundException('That raw material no longer exists.');

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: existing.variant.productId }, data: { status: 'ARCHIVED' } });
      await tx.productVariant.update({ where: { id: existing.variantId }, data: { isActive: false } });
      return tx.rawMaterial.update({ where: { id }, data: { isActive: false }, include: { variant: true } });
    });

    return this.toListItem(updated, updated.variant);
  }

  private async resolveProductSlug(name: string): Promise<string> {
    const base = slugifyWithFallback(name, 'raw-material');
    const clashes = await this.prisma.product.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });
    return uniqueSlug(
      base,
      clashes.map((row) => row.slug),
    );
  }

  private toListItem(row: RawMaterial, variant: ProductVariant) {
    return {
      id: row.id,
      variantId: variant.id,
      sku: variant.sku,
      name: row.name,
      kind: row.kind,
      unit: row.unit,
      unitScale: row.unitScale,
      isActive: row.isActive,
      stockBase: variant.stock,
      stockDisplay: fromBaseUnits(variant.stock, row.unitScale),
      costPrice: variant.costPrice,
      lastReceivedAt: variant.lastReceivedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
