import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DEFAULT_LOCALE, getPersonFullName } from '@newax/shared';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma, StockMovement, StockMovementReason, type LocationType } from '../../core/prisma/client';
import { EventBusService } from '../../core/events/event-bus.service';
import { DomainEvent } from '../../core/events/domain-events';
import { StockIntakeRegistry } from '../../core/extension-points/stock-intake.registry';
import { EntityEnrichmentRegistry } from '../../core/extension-points/entity-enrichment.registry';
import { IntentRouterService } from '../../core/intent/intent-router.service';

const variantListInclude = {
  product: {
    include: { translations: { where: { locale: DEFAULT_LOCALE }, take: 1 } },
  },
  salesStat: true,
  forecast: { select: { projectedStockoutAt: true } },
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
export class InventoryService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
    private readonly stockIntake: StockIntakeRegistry,
    private readonly enrichment: EntityEnrichmentRegistry,
    private readonly intents: IntentRouterService,
  ) {}

  /**
   * Registers this module's stock-write surface for StockIntakeRegistry, so
   * `catalog`'s CSV import can set an opening stock without importing
   * InventoryService directly — the core-internal counterpart to how
   * `stitching`/`measurements` register against CartLineValidatorRegistry
   * from a pack. `move()` itself stays the direct call for anything that
   * must commit in the same transaction as its caller (order placement, a
   * purchase-order receipt); this registration only ever backs a
   * best-effort write outside such a transaction.
   *
   * Also registers `check_inventory_chain_status` with `IntentRouterService`
   * (135-intent-router-voice-video-agent.md WO-135.1) — the curated,
   * explicitly-permissioned proof that routing an `Intent` to this exact
   * method produces the identical result `GET /admin/inventory/:variantId
   * /chain` already returns, with zero change to `getChainStatus()` itself.
   * A blanket "expose every service method" registration is exactly the
   * speculative capability `CLAUDE.md`'s "no speculative functionality"
   * rule forbids — this one method is registered because doc 116's own
   * worked example named inventory lookup as the concrete case, not because
   * every read method in this service should be reachable this way.
   */
  onModuleInit(): void {
    this.stockIntake.register({
      defaultLocationId: () => this.defaultLocationId(),
      move: (input) => this.move(input).then(() => undefined),
    });

    this.intents.register({
      name: 'check_inventory_chain_status',
      description: "A SKU's full supply-chain status: stock, open POs, open work orders, pending order lines.",
      requiredPermissions: ['production.view_chain'],
      handler: (parameters: { variantId?: unknown }) => {
        if (typeof parameters.variantId !== 'string' || !parameters.variantId) {
          throw new BadRequestException('variantId is required.');
        }
        return this.getChainStatus(parameters.variantId);
      },
    });
  }

  async list(query: { filter?: string; search?: string }) {
    const where: Prisma.ProductVariantWhereInput = { isActive: true };

    if (query.filter === 'low') {
      where.stock = { lte: this.prisma.productVariant.fields.lowStockThreshold };
    } else if (query.filter === 'out') {
      where.stock = 0;
    } else if (query.filter === 'slow') {
      where.salesStat = { isSlowMover: true };
    } else if (query.filter === 'stockout-risk') {
      // WO-9.3 (09-ai-layer.md) — "flag stock that will run out before its
      // supplier lead time allows a reorder to land": VariantForecast.projectedStockoutAt
      // is non-null ONLY when that's true (see demand-forecast.ts), so this filter
      // never needs its own date arithmetic.
      where.forecast = { projectedStockoutAt: { not: null } };
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
   * Every real, active location — a store or a warehouse, never an
   * IN_TRANSIT bucket a StockTransfer (WO-22.1) created for itself. The one
   * place anything that needs to let staff pick a location (a transfer's
   * source/destination, a future terminal setup screen) should read from,
   * rather than querying Prisma's Location table directly and re-deriving
   * this exclusion.
   */
  async listLocations(): Promise<
    { id: string; name: string; code: string; isDefault: boolean; type: LocationType; retailBrandId: string | null }[]
  > {
    return this.prisma.location.findMany({
      where: { isActive: true, type: { not: 'IN_TRANSIT' } },
      // WO-23.3d: type/retailBrandId added so a source/destination picker
      // (transfers) can tell an org warehouse from a branded store — every
      // existing caller already only destructured the four original fields,
      // so this is additive, not a breaking change to any of them.
      select: { id: true, name: true, code: true, isDefault: true, type: true, retailBrandId: true },
      orderBy: { name: 'asc' },
    });
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
    return this.applyMovement(input, tx, { unconditional: false });
  }

  /**
   * The oversell path (RETAIL-ERP.md R5): a POS sale that already happened
   * must never be rejected by sync, so this never throws InsufficientStockError
   * — it applies the delta regardless of what's on the shelf. A DELIBERATE
   * second method, not a flag on move(), because a flag would let a caller
   * silently pass `unconditional: true` into the one guard the rest of the
   * system relies on; this name has to be grepped for and chosen on purpose.
   * When it drives a location negative, the movement's own reason becomes
   * POS_OFFLINE_VARIANCE and a paired StockVariance row opens the exception
   * queue a manager works from (R15's shrinkage journal follows from that row).
   */
  async postUnconditional(
    input: StockMoveInput,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<StockMovement> {
    return this.applyMovement(input, tx, { unconditional: true });
  }

  private async applyMovement(
    input: StockMoveInput,
    tx: Prisma.TransactionClient | PrismaService,
    opts: { unconditional: boolean },
  ): Promise<StockMovement> {
    if (input.delta === 0) {
      throw new BadRequestException('Stock movement delta cannot be zero.');
    }

    // We must read the old (aggregate) stock before the update if we want to
    // know whether this movement crosses the low-stock threshold.
    const beforeVariant = await tx.productVariant.findUnique({
      where: { id: input.variantId },
      select: {
        stock: true,
        lowStockThreshold: true,
        productId: true,
        sku: true,
        reorderPoint: true,
        reorderQuantity: true,
        producedInHouse: true,
        preferredSupplierId: true,
      },
    });

    if (!beforeVariant) {
      throw new NotFoundException('That variant no longer exists.');
    }

    const wasAboveThreshold = beforeVariant.stock > beforeVariant.lowStockThreshold;
    const wasAboveReorderPoint =
      beforeVariant.reorderPoint !== null && beforeVariant.stock > beforeVariant.reorderPoint;

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
    // postUnconditional() skips the predicate entirely (R5) rather than
    // widening it — the till already happened, there is nothing left to guard.
    const updated = await tx.variantLocationStock.updateMany({
      where:
        !opts.unconditional && input.delta < 0
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

    // postUnconditional() may have driven THIS location negative. Read it
    // back — updateMany() doesn't return rows — and if so, the movement
    // records the variance reason and gets a paired StockVariance opened.
    let overshootQty: number | null = null;
    if (opts.unconditional) {
      const locationRow = await tx.variantLocationStock.findUnique({
        where: { variantId_locationId: { variantId: input.variantId, locationId: input.locationId } },
        select: { quantity: true },
      });
      if (locationRow && locationRow.quantity < 0) {
        overshootQty = -locationRow.quantity;
      }
    }

    const movement = await tx.stockMovement.create({
      data: {
        variantId: input.variantId,
        locationId: input.locationId,
        delta: input.delta,
        resultingStock,
        reason: overshootQty !== null ? 'POS_OFFLINE_VARIANCE' : input.reason,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        unitCost: input.unitCost ?? null,
        note: input.note?.trim() || null,
        actorId: input.actorId ?? null,
      },
    });

    if (overshootQty !== null) {
      // 156-single-employee-branch-loss-prevention.md §1: attribute the
      // variance to whichever shift had custody, in the SAME transaction as
      // the variance itself — written once, never reassigned after the
      // fact. Null when no shift was open (a non-POS location).
      const openShift = await tx.posShift.findFirst({
        where: { terminal: { locationId: input.locationId }, status: 'OPEN', openedAt: { lte: movement.createdAt } },
        orderBy: { openedAt: 'desc' },
        select: { id: true },
      });

      const variance = await tx.stockVariance.create({
        data: {
          variantId: input.variantId,
          locationId: input.locationId,
          overshootQty,
          stockMovementId: movement.id,
          refType: input.refType ?? null,
          refId: input.refId ?? null,
          posShiftId: openShift?.id ?? null,
        },
      });
      await this.events.publish(
        DomainEvent.StockVarianceRecorded,
        {
          stockVarianceId: variance.id,
          variantId: input.variantId,
          locationId: input.locationId,
          overshootQty,
          unitCost: input.unitCost ?? null,
        },
        tx,
      );
    }

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

    if (
      wasAboveReorderPoint &&
      beforeVariant.reorderPoint !== null &&
      resultingStock <= beforeVariant.reorderPoint
    ) {
      await this.events.publish(
        DomainEvent.ProductReorderPointReached,
        {
          productId: beforeVariant.productId,
          variantId: input.variantId,
          sku: beforeVariant.sku,
          stock: resultingStock,
          reorderPoint: beforeVariant.reorderPoint,
          reorderQuantity: beforeVariant.reorderQuantity,
          producedInHouse: beforeVariant.producedInHouse,
          preferredSupplierId: beforeVariant.preferredSupplierId,
        },
        tx,
      );
    }

    if (input.delta > 0) {
      await this.events.publish(
        DomainEvent.StockReplenished,
        {
          variantId: input.variantId,
          locationId: input.locationId,
          delta: input.delta,
          resultingStock,
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

  /**
   * Everything about one SKU's place in the chain, in one call: stock per
   * location, purchase orders still in flight, work orders still open,
   * order lines still owed to a customer, and (via the existing
   * "orderItem.stitchingJob" enrichment point stitching already registers)
   * each of those lines' tailoring stage when it has one. Read-only, no
   * write-path risk — safe to ship ahead of or alongside anything else.
   */
  async getChainStatus(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true, sku: true, label: true, stock: true, producedInHouse: true, reorderPoint: true },
    });
    if (!variant) throw new NotFoundException('That variant no longer exists.');

    const [stocks, openPurchaseOrderItems, openWorkOrders, pendingOrderItems] = await Promise.all([
      this.prisma.variantLocationStock.findMany({
        where: { variantId },
        include: { location: { select: { id: true, name: true, code: true } } },
      }),
      this.prisma.purchaseOrderItem.findMany({
        where: { variantId, purchaseOrder: { status: { in: ['DRAFT', 'SENT', 'PARTIAL'] } } },
        include: {
          purchaseOrder: {
            select: { id: true, number: true, status: true, expectedAt: true, supplier: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.workOrder.findMany({
        where: { variantId, status: { in: ['DRAFT', 'RELEASED'] } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.orderItem.findMany({
        where: { variantId, order: { status: { notIn: ['SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'] } } },
        select: {
          id: true,
          quantity: true,
          fulfillmentStatus: true,
          awaitingSince: true,
          order: { select: { id: true, number: true, status: true, placedAt: true } },
        },
      }),
    ]);

    const stitchingByOrderItem = await this.enrichment.enrich<{ number: string; stage: string; dueAt: Date | null }>(
      'orderItem.stitchingJob',
      pendingOrderItems.map((item) => item.id),
    );

    return {
      variant,
      stock: stocks.map((row) => ({
        locationId: row.locationId,
        locationName: row.location.name,
        locationCode: row.location.code,
        quantity: row.quantity,
      })),
      openPurchaseOrders: openPurchaseOrderItems.map((item) => ({
        purchaseOrderId: item.purchaseOrder.id,
        number: item.purchaseOrder.number,
        status: item.purchaseOrder.status,
        expectedAt: item.purchaseOrder.expectedAt,
        supplier: item.purchaseOrder.supplier,
        quantityOrdered: item.quantityOrdered,
        quantityReceived: item.quantityReceived,
      })),
      openWorkOrders: openWorkOrders.map((wo) => ({
        id: wo.id,
        number: wo.number,
        status: wo.status,
        source: wo.source,
        quantityOrdered: wo.quantityOrdered,
        quantityCompleted: wo.quantityCompleted,
      })),
      pendingOrderLines: pendingOrderItems.map((item) => ({
        orderItemId: item.id,
        orderId: item.order.id,
        orderNumber: item.order.number,
        orderStatus: item.order.status,
        placedAt: item.order.placedAt,
        quantity: item.quantity,
        fulfillmentStatus: item.fulfillmentStatus,
        awaitingSince: item.awaitingSince,
        stitchingJob: stitchingByOrderItem.get(item.id) ?? null,
      })),
    };
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
    projectedStockoutAt: variant.forecast?.projectedStockoutAt ?? null,
    product: {
      id: variant.product.id,
      name: variant.product.translations[0]?.name ?? variant.product.id,
    },
  };
}
