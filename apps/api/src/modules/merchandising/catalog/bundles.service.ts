import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_LOCALE } from '@newax/shared';
import { AuditService } from '../../../core/audit/audit.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import type { Prisma, ProductBundle, BundleComponent, StockMovementReason } from '../../../core/prisma/client';
import { InventoryService } from '../../supply-chain/inventory/inventory.service';
import type { CreateBundleDto, UpdateBundleDto } from './dto/bundle.dto';

type BundleWithComponents = ProductBundle & { components: BundleComponent[] };

/** A bundle as the admin screen (WO-150.6) reads it — `variantId`/
 *  `componentVariantId` are deliberately bare scalars in the schema (never
 *  a raw id shown to a human, per doc 150's own "Click the number" lens). */
export interface BundleView extends ProductBundle {
  variantLabel: string;
  components: (BundleComponent & { label: string })[];
}

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

  async list(): Promise<BundleView[]> {
    const bundles = await this.prisma.productBundle.findMany({ include: { components: true }, orderBy: { createdAt: 'desc' } });
    return this.withLabels(bundles);
  }

  async get(id: string): Promise<BundleView> {
    const bundle = await this.findOrThrow(id);
    return (await this.withLabels([bundle]))[0]!;
  }

  /** The raw row, no label enrichment — `update()`/`remove()`'s own
   *  existence check needs `variantId`/`isActive`/`components.length`
   *  only, never a display label. */
  private async findOrThrow(id: string): Promise<BundleWithComponents> {
    const bundle = await this.prisma.productBundle.findUnique({ where: { id }, include: { components: true } });
    if (!bundle) throw new NotFoundException(`No bundle with id ${id}`);
    return bundle;
  }

  /** `variantId`/`componentVariantId` are bare scalars in the schema
   *  (ADR-012's own reasoning), so a human-readable label is resolved here,
   *  once per response, rather than a raw id ever reaching the admin
   *  screen. */
  private async withLabels(bundles: BundleWithComponents[]): Promise<BundleView[]> {
    const variantIds = new Set<string>();
    for (const bundle of bundles) {
      variantIds.add(bundle.variantId);
      for (const component of bundle.components) variantIds.add(component.componentVariantId);
    }

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: [...variantIds] } },
      select: {
        id: true,
        sku: true,
        label: true,
        product: { select: { translations: { where: { locale: DEFAULT_LOCALE }, select: { name: true } } } },
      },
    });
    const labelById = new Map(
      variants.map((variant) => {
        const name = variant.product.translations[0]?.name ?? variant.sku;
        return [variant.id, variant.label ? `${name} — ${variant.label} (${variant.sku})` : `${name} (${variant.sku})`];
      }),
    );

    return bundles.map((bundle) => ({
      ...bundle,
      variantLabel: labelById.get(bundle.variantId) ?? bundle.variantId,
      components: bundle.components.map((component) => ({
        ...component,
        label: labelById.get(component.componentVariantId) ?? component.componentVariantId,
      })),
    }));
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
    const existing = await this.findOrThrow(id);

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
    const existing = await this.findOrThrow(id);
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
