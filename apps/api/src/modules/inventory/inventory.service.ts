import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_LOCALE } from '@yaseen/shared';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../core/prisma/client';
import type { AdjustStockDto } from './dto/inventory.dto';

const variantListInclude = {
  product: {
    include: { translations: { where: { locale: DEFAULT_LOCALE }, take: 1 } },
  },
} satisfies Prisma.ProductVariantInclude;

type VariantWithProduct = Prisma.ProductVariantGetPayload<{ include: typeof variantListInclude }>;

/**
 * Stock levels and their audit trail.
 *
 * ProductVariant.stock is the live number the storefront checks against; every
 * change to it is paired, inside one transaction, with a StockAdjustment row
 * recording who moved it, by how much, and why — so "why is stock 4" always has
 * an answer without replaying deltas.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: { lowStockOnly?: boolean; search?: string }) {
    const where: Prisma.ProductVariantWhereInput = { isActive: true };

    if (query.lowStockOnly) {
      // Postgres cannot compare two columns through Prisma's filter syntax, so
      // "at or below the threshold" is expressed as a raw column reference —
      // the same idiom product-admin.service.ts uses for the catalogue list.
      where.stock = { lte: this.prisma.productVariant.fields.lowStockThreshold };
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { sku: { contains: term, mode: 'insensitive' } },
        {
          product: {
            translations: {
              some: { locale: DEFAULT_LOCALE, name: { contains: term, mode: 'insensitive' } },
            },
          },
        },
      ];
    }

    const variants = await this.prisma.productVariant.findMany({
      where,
      include: variantListInclude,
      // Lowest stock first: the list is a to-do list, not a catalogue browse.
      orderBy: [{ stock: 'asc' }, { sku: 'asc' }],
    });

    return variants.map(toVariantView);
  }

  /**
   * Moves stock by `delta` and files the audit row in the same transaction, so
   * the two can never drift apart — a crash between them rolls both back.
   */
  async adjust(actorId: string, variantId: string, dto: AdjustStockDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      // A read-then-write here would let two concurrent adjustments both pass
      // the negative-stock check against the same stale read and oversell —
      // the predicate belongs on the UPDATE itself, the same way
      // orders.service.ts's checkout decrement guards against overselling.
      const updated = await tx.productVariant.updateMany({
        where: { id: variantId, stock: { gte: -dto.delta } },
        data: { stock: { increment: dto.delta } },
      });

      if (updated.count === 0) {
        const variant = await tx.productVariant.findUnique({ where: { id: variantId } });
        if (!variant) {
          throw new NotFoundException('That variant no longer exists.');
        }
        throw new BadRequestException(
          `${variant.sku} has ${variant.stock} in stock; that adjustment would take it negative.`,
        );
      }

      const variant = await tx.productVariant.findUniqueOrThrow({ where: { id: variantId } });

      const adjustment = await tx.stockAdjustment.create({
        data: {
          variantId,
          delta: dto.delta,
          resultingStock: variant.stock,
          reason: dto.reason,
          note: dto.note?.trim() || null,
          actorId,
        },
      });

      return { variant, adjustment };
    });

    // Best-effort general audit log; kept outside the transaction like every
    // other admin mutation in the codebase, since AuditService never throws.
    await this.audit.record({
      actorId,
      action: 'inventory.stock_adjusted',
      entity: 'ProductVariant',
      entityId: variantId,
      data: { delta: dto.delta, resultingStock: result.adjustment.resultingStock, reason: dto.reason },
    });

    return result;
  }

  async history(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true },
    });
    if (!variant) {
      throw new NotFoundException('That variant no longer exists.');
    }

    const adjustments = await this.prisma.stockAdjustment.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, firstName: true, lastName: true } } },
    });

    return adjustments.map((row) => ({
      id: row.id,
      delta: row.delta,
      resultingStock: row.resultingStock,
      reason: row.reason,
      note: row.note,
      createdAt: row.createdAt,
      actorId: row.actorId,
      actorName: row.actor
        ? [row.actor.firstName, row.actor.lastName].filter(Boolean).join(' ')
        : null,
    }));
  }
}

function toVariantView(variant: VariantWithProduct) {
  return {
    id: variant.id,
    sku: variant.sku,
    size: variant.size,
    color: variant.color,
    stock: variant.stock,
    lowStockThreshold: variant.lowStockThreshold,
    isActive: variant.isActive,
    product: {
      id: variant.product.id,
      name: variant.product.translations[0]?.name ?? variant.product.id,
    },
  };
}
