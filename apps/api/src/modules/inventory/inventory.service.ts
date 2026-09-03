import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_LOCALE, getPersonFullName } from '@yaseen/shared';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma, StockMovement, StockMovementReason } from '../../core/prisma/client';
import { EventBusService } from '../../core/events/event-bus.service';
import { DomainEvent } from '../../core/events/domain-events';

const variantListInclude = {
  product: {
    include: { translations: { where: { locale: DEFAULT_LOCALE }, take: 1 } },
  },
  salesStat: true,
} satisfies Prisma.ProductVariantInclude;

type VariantWithProduct = Prisma.ProductVariantGetPayload<{ include: typeof variantListInclude }>;

export interface StockMoveInput {
  variantId: string;
  /** Which physical location this movement happened at — B6, MULTI-SECTOR.md.
   * Resolve via defaultLocationId() for a single-location shop; this is
   * never optional at the call site even though the column itself is
   * nullable for one release (expand/contract, 00-HOUSE-RULES.md §4). */
  locationId: string;
  /** Positive in, negative out. Zero is rejected. */
  delta: number;
  reason: StockMovementReason;
  refType?: string;
  refId?: string;
  unitCost?: number;
  note?: string;
  actorId?: string | null;
}

export class InsufficientStockError extends BadRequestException {
  constructor(
    public readonly variantId: string,
    public readonly sku: string,
    public readonly available: number,
    public readonly requestedDelta: number,
  ) {
    super(`${sku} has ${available} in stock; that adjustment would take it negative.`);
    this.name = 'InsufficientStockError';
  }
}

/**
 * Stock levels and their audit trail.
 *
 * ProductVariant.stock is the live number the storefront checks against; every
 * change to it is paired, inside one transaction, with a StockMovement row
 * recording who moved it, by how much, and why — so "why is stock 4" always has
 * an answer without replaying deltas.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
  ) {}

  async list(query: { filter?: string; search?: string }) {
    const where: Prisma.ProductVariantWhereInput = { isActive: true };

    if (query.filter === 'low') {
      where.stock = { lte: this.prisma.productVariant.fields.lowStockThreshold };
    } else if (query.filter === 'out') {
      where.stock = 0;
    } else if (query.filter === 'slow') {
      where.salesStat = { isSlowMover: true };
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

  async getReorderSuggestions() {
    const variants = await this.prisma.productVariant.findMany({
      where: {
        isActive: true,
        reorderPoint: { not: null },
        stock: { lte: this.prisma.productVariant.fields.reorderPoint },
        preferredSupplierId: { not: null }
      },
      include: {
        ...variantListInclude,
        preferredSupplier: { select: { id: true, name: true } },
        supplierProducts: true
      },
      orderBy: { stock: 'asc' },
    });
    return variants.map((v) => {
      const sp = v.supplierProducts.find((s) => s.supplierId === v.preferredSupplierId);
      return {
        ...toVariantView(v),
        reorderPoint: v.reorderPoint,
        reorderQuantity: v.reorderQuantity,
        preferredSupplier: v.preferredSupplier,
        lastCost: sp?.lastCost ?? 0,
        moq: sp?.moq ?? 1,
      };
    });
  }

  async getSlowMovers() {
    const variants = await this.prisma.productVariant.findMany({
      where: {
        isActive: true,
        stock: { gt: 0 },
        salesStat: { isSlowMover: true }
      },
      include: variantListInclude,
      orderBy: { salesStat: { ageDays: 'desc' } }
    });
    return variants.map(toVariantView);
  }

  /**
   * The MAIN location's id — a single-location shop resolves this once per
   * transaction and passes it to every move()/moveMany() call. Every
   * deployment has exactly one Location with isDefault: true, guaranteed by
   * the backfill migration (B6, 17-inventory-locations.md).
   */
  async defaultLocationId(tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<string> {
    const location = await tx.location.findFirstOrThrow({ where: { isDefault: true } });
    return location.id;
  }

  /**
   * The ONLY way stock changes. Callers inside a transaction pass their tx
   * client so the movement row and the stock change commit together.
   *
   * Stock is tracked per (variantId, locationId) in VariantLocationStock —
   * that composite key is what the predicate-on-write guard (House Rule 10)
   * actually locks. ProductVariant.stock stays a denormalized SUM across
   * every location for that variant, recomputed in this same transaction, so
   * every existing reader (storefront stock check, admin list, reorder job)
   * keeps working unmodified — B6, 17-inventory-locations.md.
   */
  async move(input: StockMoveInput, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<StockMovement> {
    if (input.delta === 0) {
      throw new BadRequestException('Stock movement delta cannot be zero.');
    }

    // We must read the old (aggregate) stock before the update if we want to
    // know whether this movement crosses the low-stock threshold.
    const beforeVariant = await tx.productVariant.findUnique({
      where: { id: input.variantId },
      select: { stock: true, lowStockThreshold: true, productId: true, sku: true },
    });

    if (!beforeVariant) {
      throw new NotFoundException('That variant no longer exists.');
    }

    const wasAboveThreshold = beforeVariant.stock > beforeVariant.lowStockThreshold;

    // A variant may not yet have touched this location — lazily ensure the
    // row exists before the guarded update below. Idempotent: a concurrent
    // upsert on the same (variantId, locationId) either inserts or becomes a
    // no-op update after waiting on the row lock, never a duplicate row.
    await tx.variantLocationStock.upsert({
      where: { variantId_locationId: { variantId: input.variantId, locationId: input.locationId } },
      create: { variantId: input.variantId, locationId: input.locationId, quantity: 0 },
      update: {},
    });

    // The predicate-on-write idiom (House Rule 10), now keyed on the
    // composite (variantId, locationId) — the database arbitrates whether
    // THIS location has enough stock, not a read-then-write guess.
    const updated = await tx.variantLocationStock.updateMany({
      where:
        input.delta < 0
          ? {
              variantId: input.variantId,
              locationId: input.locationId,
              quantity: { gte: -input.delta },
            }
          : { variantId: input.variantId, locationId: input.locationId },
      data: { quantity: { increment: input.delta } },
    });

    if (updated.count === 0) {
      const row = await tx.variantLocationStock.findUnique({
        where: { variantId_locationId: { variantId: input.variantId, locationId: input.locationId } },
      });
      throw new InsufficientStockError(input.variantId, beforeVariant.sku, row?.quantity ?? 0, input.delta);
    }

    // Recompute the aggregate and write it in ONE atomic UPDATE, not a
    // separate SELECT-then-write — the exact race House Rule 10 exists to
    // prevent, here at the variant level: two locations of the SAME variant
    // moving concurrently must not let one recompute clobber the other's.
    // Postgres re-evaluates this subquery against the fresh committed row
    // once it acquires the lock, so a transaction that was blocked here
    // (because a concurrent move() at a different location for this same
    // variant held the row) sees that commit's result before computing its
    // own sum, not a stale snapshot from before it blocked.
    const [{ stock: resultingStock }] = await tx.$queryRaw<[{ stock: number }]>`
      UPDATE "ProductVariant"
      SET stock = COALESCE(
        (SELECT SUM(quantity) FROM "VariantLocationStock" WHERE "variantId" = "ProductVariant"."id"),
        0
      )
      WHERE id = ${input.variantId}
      RETURNING stock
    `;

    const movement = await tx.stockMovement.create({
      data: {
        variantId: input.variantId,
        locationId: input.locationId,
        delta: input.delta,
        resultingStock,
        reason: input.reason,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        unitCost: input.unitCost ?? null,
        note: input.note?.trim() || null,
        actorId: input.actorId ?? null,
      },
    });

    if (wasAboveThreshold && resultingStock <= beforeVariant.lowStockThreshold) {
      await this.events.publish(
        DomainEvent.ProductLowStock,
        {
          productId: beforeVariant.productId,
          variantId: input.variantId,
          sku: beforeVariant.sku,
          stock: resultingStock,
          threshold: beforeVariant.lowStockThreshold,
        },
        tx,
      );
    }

    // The audit write is deliberately outside the caller's transaction because
    // AuditService is best-effort and never throws.
    await this.audit.record({
      actorId: input.actorId ?? undefined,
      action: 'inventory.stock_adjusted',
      entity: 'ProductVariant',
      entityId: input.variantId,
      data: { delta: input.delta, resultingStock: movement.resultingStock, reason: input.reason, locationId: input.locationId },
    });

    return movement;
  }

  async moveMany(inputs: StockMoveInput[], tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<StockMovement[]> {
    // Sort by the composite (variantId, locationId) — the actual key every
    // upsert/updateMany in move() locks — to prevent deadlocks when two
    // concurrent multi-line operations touch the same rows in opposite order.
    const sortedInputs = [...inputs].sort((a, b) =>
      `${a.variantId}:${a.locationId}`.localeCompare(`${b.variantId}:${b.locationId}`),
    );

    const movements: StockMovement[] = [];
    for (const input of sortedInputs) {
      movements.push(await this.move(input, tx));
    }
    return movements;
  }

  async history(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true },
    });
    if (!variant) {
      throw new NotFoundException('That variant no longer exists.');
    }

    const movements = await this.prisma.stockMovement.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, firstName: true, lastName: true } } },
    });

    return movements.map((row) => ({
      id: row.id,
      delta: row.delta,
      resultingStock: row.resultingStock,
      reason: row.reason,
      refType: row.refType,
      refId: row.refId,
      unitCost: row.unitCost,
      note: row.note,
      createdAt: row.createdAt,
      actorId: row.actorId,
      actorName: row.actor ? getPersonFullName(row.actor) : null,
    }));
  }
}

function toVariantView(variant: VariantWithProduct) {
  return {
    id: variant.id,
    sku: variant.sku,
    barcode: variant.barcode,
    size: variant.size,
    color: variant.color,
    stock: variant.stock,
    lowStockThreshold: variant.lowStockThreshold,
    isActive: variant.isActive,
    costPrice: variant.costPrice,
    salesStat: variant.salesStat ? {
      daysOfCover: variant.salesStat.daysOfCover,
      lastSoldAt: variant.salesStat.lastSoldAt,
      ageDays: variant.salesStat.ageDays,
    } : null,
    product: {
      id: variant.product.id,
      name: variant.product.translations[0]?.name ?? variant.product.id,
    },
  };
}
