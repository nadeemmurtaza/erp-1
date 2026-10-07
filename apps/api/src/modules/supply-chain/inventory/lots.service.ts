import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { Lot, Prisma } from '../../../core/prisma/client';
import { allocateFefo, type LotAllocationCandidate, type LotAllocationResult } from './lot-allocation';

export interface RegisterLotReceiptInput {
  variantId: string;
  locationId: string;
  lotCode: string;
  expiresOn?: Date | null;
  quantity: number;
  sourceReceiptId?: string | null;
}

export interface RecordLotDeductionInput {
  variantId: string;
  locationId: string;
  quantity: number;
  stockMovementId: string;
  preferredLotId?: string;
}

/**
 * 32-lots-batch-expiry-fefo.md. The one writer for lot identity and FEFO
 * allocation — `Lot`/`LotStock`/`LotAllocation` are a sub-ledger UNDER the
 * existing `VariantLocationStock` row, never a second stock model.
 * `InventoryService.move()` stays the only writer of stock itself;
 * `recordReceipt()`/`recordDeduction()` are called alongside it, inside the
 * SAME transaction, by whichever call site already knows the variant is
 * lot-tracked (purchasing's goods receipt, an order's sale deduction,
 * production's raw-material consumption per doc 71) — never reimplemented
 * at any of those call sites.
 */
@Injectable()
export class LotsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds-or-creates the `Lot` (unique per variant+lotCode — the "second
   * copy of the write" guard: a redelivered goods-receipt event resolves to
   * the existing row rather than minting a duplicate) and increments
   * `LotStock` for that location. Never rewrites an existing lot's own
   * `expiresOn` — the same physical batch always means the same expiry;
   * correcting a wrongly-typed one is a new `Lot` plus a stock transfer
   * (doc 32's own "undo fan-out" answer), never an in-place edit here.
   */
  async recordReceipt(
    input: RegisterLotReceiptInput,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Lot> {
    const lot = await tx.lot.upsert({
      where: { productVariantId_lotCode: { productVariantId: input.variantId, lotCode: input.lotCode } },
      create: {
        productVariantId: input.variantId,
        lotCode: input.lotCode,
        expiresOn: input.expiresOn ?? null,
        sourceReceiptId: input.sourceReceiptId ?? null,
      },
      update: {},
    });

    await tx.lotStock.upsert({
      where: { lotId_locationId: { lotId: lot.id, locationId: input.locationId } },
      create: { lotId: lot.id, locationId: input.locationId, quantity: input.quantity },
      update: { quantity: { increment: input.quantity } },
    });

    return lot;
  }

  /**
   * The one writer for a lot-tracked deduction. Returns `[]` — a correct,
   * silent no-op — when the variant has no `Lot` rows at this location at
   * all: an ordinary, non-lot-tracked sale behaves exactly as it does
   * today, proven by running `inventory.service.spec.ts` unchanged (doc
   * 32's own Acceptance criteria). Throws `InsufficientLotStockError` when
   * lot-tracked stock cannot cover the request — caught by whichever
   * transaction called this and rolled back together with it, the same
   * failure path an ordinary `InsufficientStockError` already produces.
   */
  async recordDeduction(
    input: RecordLotDeductionInput,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<LotAllocationResult[]> {
    const lots = await this.eligibleLots(input.variantId, input.locationId, tx);
    if (lots.length === 0) return [];

    const allocations = allocateFefo(lots, input.quantity, input.preferredLotId);

    for (const allocation of allocations) {
      await tx.lotStock.update({
        where: { lotId_locationId: { lotId: allocation.lotId, locationId: input.locationId } },
        data: { quantity: { decrement: allocation.quantity } },
      });
    }

    await tx.lotAllocation.createMany({
      data: allocations.map((allocation) => ({
        lotId: allocation.lotId,
        stockMovementId: input.stockMovementId,
        quantity: allocation.quantity,
      })),
      skipDuplicates: true,
    });

    return allocations;
  }

  /** "Which lots would this sale draw from" — pure over already-loaded rows, called before committing anything (doc 32's own "dry run before live" answer). */
  async previewAllocation(
    variantId: string,
    locationId: string,
    quantity: number,
    preferredLotId?: string,
  ): Promise<LotAllocationResult[]> {
    const lots = await this.eligibleLots(variantId, locationId, this.prisma);
    if (lots.length === 0) return [];
    return allocateFefo(lots, quantity, preferredLotId);
  }

  /** One lot's own identity and remaining stock per location — the basic facts a lot detail screen needs, gated by the ordinary `inventory.lots.manage` (never `inventory.recall`, which stays narrower for who bought from it). */
  async getDetail(lotId: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      include: {
        variant: { select: { id: true, sku: true, label: true } },
        stocks: { include: { location: { select: { id: true, name: true, code: true } } } },
      },
    });
    if (!lot) throw new NotFoundException('That lot no longer exists.');

    return {
      id: lot.id,
      lotCode: lot.lotCode,
      expiresOn: lot.expiresOn,
      receivedOn: lot.receivedOn,
      sourceReceiptId: lot.sourceReceiptId,
      variantId: lot.variant.id,
      sku: lot.variant.sku,
      label: lot.variant.label,
      totalQuantity: lot.stocks.reduce((sum, stock) => sum + stock.quantity, 0),
      stocks: lot.stocks
        .filter((stock) => stock.quantity > 0)
        .map((stock) => ({ locationId: stock.locationId, locationName: stock.location.name, quantity: stock.quantity })),
    };
  }

  async listForVariant(variantId: string) {
    const lots = await this.prisma.lot.findMany({
      where: { productVariantId: variantId },
      include: { stocks: { include: { location: { select: { id: true, name: true, code: true } } } } },
      orderBy: [{ expiresOn: 'asc' }, { receivedOn: 'asc' }],
    });
    return lots.map((lot) => ({
      id: lot.id,
      lotCode: lot.lotCode,
      expiresOn: lot.expiresOn,
      receivedOn: lot.receivedOn,
      totalQuantity: lot.stocks.reduce((sum, stock) => sum + stock.quantity, 0),
      stocks: lot.stocks
        .filter((stock) => stock.quantity > 0)
        .map((stock) => ({ locationId: stock.locationId, locationName: stock.location.name, quantity: stock.quantity })),
    }));
  }

  /**
   * `recallLookup(lotCode) -> every LotAllocation -> every StockMovement it
   * belongs to -> every Order line that movement served` (doc 32 §3). No new
   * table — this query is the whole value of the ledger. `StockMovement`'s
   * own `refType`/`refId` are bare scalars (inventory/orders module
   * decoupling), so the Order join is a second, explicit fetch keyed on
   * those, never a Prisma relation across the module boundary.
   */
  async recallLookup(lotId: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      select: { id: true, lotCode: true, expiresOn: true, productVariantId: true },
    });
    if (!lot) throw new NotFoundException('That lot no longer exists.');

    const allocations = await this.prisma.lotAllocation.findMany({
      where: { lotId },
      include: {
        stockMovement: { select: { id: true, refType: true, refId: true, delta: true, createdAt: true, locationId: true } },
      },
      orderBy: { allocatedAt: 'asc' },
    });

    const orderIds = [
      ...new Set(
        allocations.filter((a) => a.stockMovement.refType === 'Order').map((a) => a.stockMovement.refId!),
      ),
    ];
    const orders =
      orderIds.length > 0
        ? await this.prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, number: true, placedAt: true, contactId: true },
          })
        : [];
    const orderById = new Map(orders.map((order) => [order.id, order]));

    return {
      lot,
      allocations: allocations.map((allocation) => ({
        quantity: allocation.quantity,
        allocatedAt: allocation.allocatedAt,
        stockMovementId: allocation.stockMovement.id,
        movementCreatedAt: allocation.stockMovement.createdAt,
        order:
          allocation.stockMovement.refType === 'Order' && allocation.stockMovement.refId
            ? (orderById.get(allocation.stockMovement.refId) ?? null)
            : null,
      })),
    };
  }

  /**
   * 156's own low-stock/expiry-alerting shape, correctly this time — the
   * audience is `inventory.manage`'s own holders (a capability, not
   * `store.supportEmail`, the standing counter-example `CLAUDE.md` itself
   * names). Returns candidates only; `InventoryCron` sends the notification
   * and records the alert timestamp so this stays a pure read.
   */
  async expiringLotsWithStock(withinDays: number) {
    const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
    const lots = await this.prisma.lot.findMany({
      where: { expiresOn: { not: null, lte: cutoff, gt: new Date() } },
      include: {
        variant: { select: { id: true, sku: true, label: true } },
        stocks: { where: { quantity: { gt: 0 } }, include: { location: { select: { id: true, name: true } } } },
      },
    });
    return lots
      .filter((lot) => lot.stocks.length > 0)
      .map((lot) => ({
        lotId: lot.id,
        lotCode: lot.lotCode,
        expiresOn: lot.expiresOn!,
        variantId: lot.variant.id,
        sku: lot.variant.sku,
        label: lot.variant.label,
        unsoldQuantity: lot.stocks.reduce((sum, stock) => sum + stock.quantity, 0),
        locations: lot.stocks.map((stock) => ({ locationId: stock.locationId, locationName: stock.location.name, quantity: stock.quantity })),
      }));
  }

  private async eligibleLots(
    variantId: string,
    locationId: string,
    tx: Prisma.TransactionClient | PrismaService,
  ): Promise<LotAllocationCandidate[]> {
    const rows = await tx.lotStock.findMany({
      where: { locationId, quantity: { gt: 0 }, lot: { productVariantId: variantId } },
      include: { lot: { select: { id: true, expiresOn: true } } },
    });
    return rows.map((row) => ({ id: row.lot.id, quantity: row.quantity, expiresOn: row.lot.expiresOn }));
  }
}
