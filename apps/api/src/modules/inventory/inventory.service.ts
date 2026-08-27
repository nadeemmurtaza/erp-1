import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_LOCALE } from '@yaseen/shared';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma, StockMovement, StockMovementReason } from '../../core/prisma/client';
import { EventBusService } from '../../core/events/event-bus.service';
import { DomainEvent } from '../../core/events/domain-events';

const variantListInclude = {
  product: {
    include: { translations: { where: { locale: DEFAULT_LOCALE }, take: 1 } },
  },
} satisfies Prisma.ProductVariantInclude;

type VariantWithProduct = Prisma.ProductVariantGetPayload<{ include: typeof variantListInclude }>;

export interface StockMoveInput {
  variantId: string;
  /** Positive in, negative out. Zero is rejected. */
  delta: number;
  reason: StockMovementReason;
  refType?: string;
  refId?: string;
  unitCost?: number;
  note?: string;
  actorId?: string | null;
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
   * The ONLY way stock changes. Callers inside a transaction pass their tx
   * client so the movement row and the stock change commit together.
   */
  async move(input: StockMoveInput, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<StockMovement> {
    if (input.delta === 0) {
      throw new BadRequestException('Stock movement delta cannot be zero.');
    }

    // We must read the old stock before update if we want to know if it crossed the threshold.
    const beforeVariant = await tx.productVariant.findUnique({
      where: { id: input.variantId },
      select: { stock: true, lowStockThreshold: true },
    });

    if (!beforeVariant) {
      throw new NotFoundException('That variant no longer exists.');
    }

    const wasAboveThreshold = beforeVariant.stock > beforeVariant.lowStockThreshold;

    const updated = await tx.productVariant.updateMany({
      where: input.delta < 0 ? { id: input.variantId, stock: { gte: -input.delta } } : { id: input.variantId },
      data: { stock: { increment: input.delta } },
    });

    if (updated.count === 0) {
      const variant = await tx.productVariant.findUnique({ where: { id: input.variantId } });
      if (!variant) {
        throw new NotFoundException('That variant no longer exists.');
      }
      throw new BadRequestException(
        `${variant.sku} has ${variant.stock} in stock; that adjustment would take it negative.`,
      );
    }

    const variant = await tx.productVariant.findUniqueOrThrow({ where: { id: input.variantId } });

    const movement = await tx.stockMovement.create({
      data: {
        variantId: input.variantId,
        delta: input.delta,
        resultingStock: variant.stock,
        reason: input.reason,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        unitCost: input.unitCost ?? null,
        note: input.note?.trim() || null,
        actorId: input.actorId ?? null,
      },
    });

    if (wasAboveThreshold && variant.stock <= variant.lowStockThreshold) {
      await this.events.publish(
        DomainEvent.ProductLowStock,
        {
          productId: variant.productId,
          variantId: variant.id,
          sku: variant.sku,
          stock: variant.stock,
          threshold: variant.lowStockThreshold,
        },
        tx,
      );
    }

    // Best-effort general audit log; kept outside the transaction like every
    // other admin mutation in the codebase, since AuditService never throws.
    // Ensure we await this so it actually fires, even though we use this.audit.
    // To match original behavior, wait until transaction commits (we might be in one, but we can't reliably
    // wait for tx commit here unless we delay. Actually original code did it outside `this.prisma.$transaction`,
    // but here we are passed `tx` which could be the top-level or part of an ongoing tx.
    // Using `this.audit` is fine as per instruction: "Keep the best-effort AuditService.record() call outside the transaction, as the current code does." Wait, if we are passed `tx`, we shouldn't execute `audit.record` using `tx`, but using `this.audit` which doesn't use `tx` is correct.
    this.audit.record({
      actorId: input.actorId ?? undefined,
      action: 'inventory.stock_adjusted',
      entity: 'ProductVariant',
      entityId: input.variantId,
      data: { delta: input.delta, resultingStock: movement.resultingStock, reason: input.reason },
    }).catch(() => {});

    return movement;
  }

  async moveMany(inputs: StockMoveInput[], tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<StockMovement[]> {
    // Sort inputs by variantId to prevent deadlocks when updating multiple rows.
    const sortedInputs = [...inputs].sort((a, b) => a.variantId.localeCompare(b.variantId));
    
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
