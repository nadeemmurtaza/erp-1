import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import type { Prisma, ProductBundle, BundleComponent, StockMovementReason } from '../../core/prisma/client';
import { InventoryService } from '../inventory/inventory.service';
import type { CreateBundleDto, UpdateBundleDto } from './dto/bundle.dto';

type BundleWithComponents = ProductBundle & { components: BundleComponent[] };

/**
 * 150-product-kitting-bundles.md — a bundle is a sellable shell over
 * existing variants, never a new physical item; every stock write here
 * goes through `InventoryService.move()`, the one existing writer, never a
 * second inventory-writing path. Reuses the SALE/RETURN/WRITE_OFF reasons
 * an ordinary line already posts under — deliberately not a new
 * `BUNDLE_SALE` reason this document's own sketch named, so a manager's
 * "how much did I sell today" report by reason already includes a
 * bundle's own component decrements without needing to know bundles
 * exist as a concept; provenance is `refType: 'Order', refId` on each
 * component's own movement, per this document's own "Click the number"
 * lens, not a reason code.
 */
@Injectable()
export class BundlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  /** Batch lookup — never one query per order line. A variant absent from
   *  the returned map is an ordinary, non-bundle variant. */
  async bundlesByVariantId(
    variantIds: string[],
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Map<string, BundleWithComponents>> {
    if (variantIds.length === 0) return new Map();
    const bundles = await tx.productBundle.findMany({
      where: { variantId: { in: variantIds }, isActive: true },
      include: { components: true },
    });
    return new Map(bundles.map((b) => [b.variantId, b]));
  }

  /**
   * Decrements every component atomically, inside the caller's own
   * transaction — never a partial bundle: `InventoryService.move()`'s own
   * `InsufficientStockError` on any one component aborts the whole
   * transaction, so a bundle sale is one unit or nothing at all, per this
   * document's own "Request or record" and "The failure path" lenses.
   */
  async sellBundle(
    bundle: BundleWithComponents,
    quantity: number,
    orderId: string,
    locationId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const componentVariantIds = bundle.components.map((c) => c.componentVariantId);
    const componentVariants = await tx.productVariant.findMany({
      where: { id: { in: componentVariantIds } },
      select: { id: true, costPrice: true },
    });
    const costByVariant = new Map(componentVariants.map((v) => [v.id, v.costPrice]));

    for (const component of bundle.components) {
      await this.inventory.move(
        {
          variantId: component.componentVariantId,
          locationId,
          delta: -(component.quantity * quantity),
          reason: 'SALE',
          refType: 'Order',
          refId: orderId,
          unitCost: costByVariant.get(component.componentVariantId) ?? 0,
        },
        tx,
      );
    }
  }

  /**
   * The reverse of sellBundle() — a returned bundle line restocks every
   * component individually, each its own StockMovement, never a single
   * opaque "bundle returned" adjustment (this document's own "The reversal
   * document" lens).
   */
  async restockBundle(
    bundle: BundleWithComponents,
    quantity: number,
    reason: StockMovementReason,
    refId: string,
    locationId: string,
    actorId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    for (const component of bundle.components) {
      await this.inventory.move(
        {
          variantId: component.componentVariantId,
          locationId,
          delta: component.quantity * quantity,
          reason,
          refType: 'ReturnRequest',
          refId,
          actorId,
        },
        tx,
      );
    }
  }

  /**
   * Definitionally computed, never stored — the same discipline R26
   * already establishes for online allotment: a maintained counter could
   * drift from the components' own real stock, a pure read over
   * `VariantLocationStock` cannot.
   */
  async bundleAvailableStock(bundleVariantId: string, locationId: string): Promise<number> {
    const bundle = await this.prisma.productBundle.findUnique({
      where: { variantId: bundleVariantId, isActive: true },
      include: { components: true },
    });
    if (!bundle || bundle.components.length === 0) return 0;

    const componentVariantIds = bundle.components.map((c) => c.componentVariantId);
    const stocks = await this.prisma.variantLocationStock.findMany({
      where: { variantId: { in: componentVariantIds }, locationId },
    });
    const stockByVariant = new Map(stocks.map((s) => [s.variantId, s.quantity]));

    return Math.min(
      ...bundle.components.map((c) => Math.floor((stockByVariant.get(c.componentVariantId) ?? 0) / c.quantity)),
    );
  }

  // --- Admin CRUD (WO-150.6) ---

  async list() {
    return this.prisma.productBundle.findMany({ include: { components: true }, orderBy: { createdAt: 'desc' } });
  }

  async get(id: string) {
    const bundle = await this.prisma.productBundle.findUnique({ where: { id }, include: { components: true } });
    if (!bundle) throw new NotFoundException(`No bundle with id ${id}`);
    return bundle;
  }

  async create(actor: AuthenticatedUser, dto: CreateBundleDto): Promise<ProductBundle> {
    const existing = await this.prisma.productBundle.findUnique({ where: { variantId: dto.variantId } });
    if (existing) throw new BadRequestException(`Variant ${dto.variantId} is already a bundle.`);
    if (dto.components.some((c) => c.componentVariantId === dto.variantId)) {
      throw new BadRequestException('A bundle cannot list itself as its own component.');
    }

    const bundle = await this.prisma.productBundle.create({
      data: {
        variantId: dto.variantId,
        components: { create: dto.components.map((c) => ({ componentVariantId: c.componentVariantId, quantity: c.quantity ?? 1 })) },
      },
      include: { components: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'catalog.bundle_created',
      entity: 'ProductBundle',
      entityId: bundle.id,
      data: { after: { variantId: bundle.variantId, componentCount: bundle.components.length } },
    });

    return bundle;
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateBundleDto): Promise<ProductBundle> {
    const existing = await this.get(id);

    if (dto.components?.some((c) => c.componentVariantId === existing.variantId)) {
      throw new BadRequestException('A bundle cannot list itself as its own component.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.components) {
        await tx.bundleComponent.deleteMany({ where: { bundleId: id } });
        await tx.bundleComponent.createMany({
          data: dto.components.map((c) => ({ bundleId: id, componentVariantId: c.componentVariantId, quantity: c.quantity ?? 1 })),
        });
      }
      return tx.productBundle.update({
        where: { id },
        data: { isActive: dto.isActive },
        include: { components: true },
      });
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'catalog.bundle_updated',
      entity: 'ProductBundle',
      entityId: id,
      data: {
        before: { isActive: existing.isActive, componentCount: existing.components.length },
        after: { isActive: updated.isActive, componentCount: updated.components.length },
      },
    });

    return updated;
  }

  async remove(actor: AuthenticatedUser, id: string): Promise<void> {
    const existing = await this.get(id);
    await this.prisma.productBundle.delete({ where: { id } });

    await this.audit.record({
      actorId: actor.id,
      action: 'catalog.bundle_removed',
      entity: 'ProductBundle',
      entityId: id,
      data: { before: { variantId: existing.variantId } },
    });
  }
}
