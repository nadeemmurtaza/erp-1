import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AuditService } from '../../core/audit/audit.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { InventoryService } from '../inventory/inventory.service';
import { StockIntakeRegistry } from '../../core/extension-points/stock-intake.registry';
import { EntityEnrichmentRegistry } from '../../core/extension-points/entity-enrichment.registry';
import { PartiesService } from '../parties/parties.service';
import { PurchasingService } from '../purchasing/purchasing.service';
import { CatalogService } from '../catalog/catalog.service';
import { BomService } from './bom.service';
import { RawMaterialService } from './raw-material.service';
import { RawMaterialQueryDto } from './dto/raw-material.dto';

function query(overrides: Partial<RawMaterialQueryDto> = {}): RawMaterialQueryDto {
  return Object.assign(new RawMaterialQueryDto(), overrides);
}

/**
 * WO-23.2's WO-C.1 (10-admin-dashboard.md §C, ADR-020). Real PrismaService
 * against the seeded test database, same idiom as finance.spec.ts — a raw
 * material is not a new kind of thing (D5), so the acceptance criterion this
 * whole design rests on is that it flows through the EXISTING purchasing and
 * catalog services completely unmodified; the integration test below proves
 * that by driving the real PurchasingService.receiveGoods(), not a stub.
 */
describe('bom module — raw materials', () => {
  let rawMaterials: RawMaterialService;
  let bom: BomService;
  let prisma: PrismaService;
  let purchasing: PurchasingService;
  let catalog: CatalogService;
  let actorId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RawMaterialService,
        BomService,
        PurchasingService,
        CatalogService,
        PrismaService,
        SettingsService,
        AuditService,
        InventoryService,
        { provide: PartiesService, useValue: {} },
        { provide: AppConfigService, useValue: { nodeRole: 'STANDALONE', nodeId: 'main' } },
        { provide: EventBusService, useValue: { publish: jest.fn() } },
        { provide: StockIntakeRegistry, useValue: { register: jest.fn() } },
        { provide: EntityEnrichmentRegistry, useValue: { register: jest.fn() } },
      ],
    }).compile();

    rawMaterials = module.get(RawMaterialService);
    bom = module.get(BomService);
    prisma = module.get(PrismaService);
    purchasing = module.get(PurchasingService);
    catalog = module.get(CatalogService);

    // A real, seeded User — PurchaseOrder.createdById and GoodsReceipt.receivedById are FKs.
    actorId = (await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } })).id;
  });

  afterEach(async () => {
    // Purchase orders raised against a test material's variant in the
    // receiving integration test outlive the material unless cleared first —
    // PurchaseOrderItem/GoodsReceiptItem have no cascade from ProductVariant.
    const suppliers = await prisma.supplier.findMany({
      where: { name: { startsWith: 'bom.spec ' } },
      select: { id: true },
    });
    if (suppliers.length > 0) {
      const supplierIds = suppliers.map((s) => s.id);
      const orders = await prisma.purchaseOrder.findMany({
        where: { supplierId: { in: supplierIds } },
        select: { id: true },
      });
      const orderIds = orders.map((o) => o.id);
      if (orderIds.length > 0) {
        await prisma.goodsReceiptItem.deleteMany({ where: { goodsReceipt: { purchaseOrderId: { in: orderIds } } } });
        await prisma.goodsReceipt.deleteMany({ where: { purchaseOrderId: { in: orderIds } } });
        await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: { in: orderIds } } });
        await prisma.purchaseOrder.deleteMany({ where: { id: { in: orderIds } } });
      }
    }

    const products = await prisma.product.findMany({
      where: { translations: { some: { name: { startsWith: 'bom.spec ' } } } },
      select: { id: true },
    });
    if (products.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: products.map((p) => p.id) } } });
    }
    await prisma.supplier.deleteMany({ where: { name: { startsWith: 'bom.spec ' } } });
  });

  function name(label: string): string {
    return `bom.spec ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  describe('resolveCategoryId', () => {
    it('resolves the seeded raw-materials Category', async () => {
      const categoryId = await bom.resolveCategoryId();
      const category = await prisma.category.findUniqueOrThrow({ where: { id: categoryId } });
      expect(category.slug).toBe('raw-materials');
    });
  });

  describe('create', () => {
    it('creates a DRAFT UNSTITCHED Product with one variant, filed under raw-materials, and a RawMaterial marker row', async () => {
      const materialName = name('Ferozi Lawn');

      const created = await rawMaterials.create({
        name: materialName,
        kind: 'fabric',
        unit: 'GAZ',
        unitScale: 1000,
      });

      expect(created.name).toBe(materialName);
      expect(created.unit).toBe('GAZ');
      expect(created.unitScale).toBe(1000);
      expect(created.stockBase).toBe(0);
      expect(created.stockDisplay).toBe(0);
      expect(created.isActive).toBe(true);

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: created.variantId },
        include: { product: { include: { category: true, translations: true } }, rawMaterial: true },
      });

      expect(variant.product.kind).toBe('UNSTITCHED');
      expect(variant.product.status).toBe('DRAFT');
      expect(variant.product.category?.slug).toBe('raw-materials');
      expect(variant.product.translations.find((t) => t.locale === 'en')?.name).toBe(materialName);
      expect(variant.stock).toBe(0);
      expect(variant.rawMaterial?.id).toBe(created.id);
    });

    it('generates a unique SKU even for two materials with the same name', async () => {
      const materialName = name('Duplicate Trim');

      const first = await rawMaterials.create({ name: materialName, unit: 'PIECE' });
      const second = await rawMaterials.create({ name: materialName, unit: 'PIECE' });

      expect(first.sku).not.toBe(second.sku);
    });
  });

  describe('unitScale immutability', () => {
    it('rejects a unitScale change once the variant has stock (409)', async () => {
      const created = await rawMaterials.create({ name: name('Scale Guard'), unit: 'GAZ', unitScale: 1000 });

      // Simulate stock having arrived, the same way a PO receipt would —
      // this test asserts the guard, not how stock gets there.
      await prisma.productVariant.update({ where: { id: created.variantId }, data: { stock: 500 } });

      await expect(rawMaterials.update(created.id, { unitScale: 100 })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects a unitScale change once a StockMovement exists, even at zero current stock', async () => {
      const created = await rawMaterials.create({ name: name('History Guard'), unit: 'GAZ', unitScale: 1000 });

      await prisma.stockMovement.create({
        data: {
          variantId: created.variantId,
          delta: 10,
          resultingStock: 10,
          reason: 'ADJUSTMENT',
        },
      });
      // Stock itself is back at 0 (e.g. fully consumed), but history exists.
      await prisma.productVariant.update({ where: { id: created.variantId }, data: { stock: 0 } });

      await expect(rawMaterials.update(created.id, { unitScale: 100 })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('allows a unitScale change while the material has never moved', async () => {
      const created = await rawMaterials.create({ name: name('Untouched'), unit: 'GAZ', unitScale: 1000 });

      const updated = await rawMaterials.update(created.id, { unitScale: 500 });

      expect(updated.unitScale).toBe(500);
    });

    it('allows editing name/kind/notes without touching unitScale', async () => {
      const created = await rawMaterials.create({ name: name('Editable'), unit: 'PIECE' });
      await prisma.productVariant.update({ where: { id: created.variantId }, data: { stock: 5 } });

      const renamed = name('Renamed');
      const updated = await rawMaterials.update(created.id, { name: renamed, notes: 'updated note' });

      expect(updated.name).toBe(renamed);
    });
  });

  describe('deactivate', () => {
    it('archives the Product, deactivates the variant, and flips RawMaterial.isActive', async () => {
      const created = await rawMaterials.create({ name: name('To Retire'), unit: 'SPOOL' });

      const deactivated = await rawMaterials.deactivate(created.id);
      expect(deactivated.isActive).toBe(false);

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: created.variantId },
        include: { product: true },
      });
      expect(variant.isActive).toBe(false);
      expect(variant.product.status).toBe('ARCHIVED');
    });
  });

  describe('list/get', () => {
    it('filters by the active/inactive/all status filter', async () => {
      const created = await rawMaterials.create({ name: name('Filter Me'), unit: 'GRAM' });
      await rawMaterials.deactivate(created.id);

      const activeOnly = await rawMaterials.list(query({ filter: 'active', pageSize: 50 }));
      expect(activeOnly.data.some((row) => row.id === created.id)).toBe(false);

      const inactiveOnly = await rawMaterials.list(query({ filter: 'inactive', pageSize: 50 }));
      expect(inactiveOnly.data.some((row) => row.id === created.id)).toBe(true);
    });

    it('get() includes recent stock movements', async () => {
      const created = await rawMaterials.create({ name: name('History'), unit: 'METRE' });
      await prisma.stockMovement.create({
        data: { variantId: created.variantId, delta: 20, resultingStock: 20, reason: 'ADJUSTMENT' },
      });

      const detail = await rawMaterials.get(created.id);
      expect(detail.recentMovements).toHaveLength(1);
      expect(detail.recentMovements[0].delta).toBe(20);
    });
  });

  /**
   * The proof the whole design rests on (10-admin-dashboard.md WO-C.1): a
   * raw material's variant receives against a real PO through the existing
   * PurchasingService, completely unmodified, and costPrice updates via the
   * same weightedAverageCost() path every other variant uses.
   */
  describe('purchasing integration — no changes to purchasing.service.ts', () => {
    it('updates costPrice via weightedAverageCost when a PO against the raw material is received', async () => {
      const created = await rawMaterials.create({ name: name('Receivable Fabric'), unit: 'GAZ', unitScale: 1000 });

      const supplier = await prisma.supplier.create({ data: { name: name('Supplier') } });

      const po = await purchasing.createPurchaseOrder(
        {
          supplierId: supplier.id,
          items: [{ variantId: created.variantId, quantityOrdered: 100, unitCost: 200 }],
        },
        actorId,
      );
      await purchasing.markPurchaseOrderSent(po.id);

      const poItem = await prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
      await purchasing.receiveGoods(
        po.id,
        { items: [{ purchaseOrderItemId: poItem.id, quantity: 100 }] },
        actorId,
      );

      const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: created.variantId } });
      expect(variant.stock).toBe(100);
      // First receipt against a variant with costPrice 0: weighted average
      // collapses to the received unit cost.
      expect(variant.costPrice).toBe(200);
      expect(variant.lastReceivedAt).not.toBeNull();
    });
  });

  describe('storefront visibility', () => {
    it('is never returned by the public catalog endpoint (DRAFT status)', async () => {
      const created = await rawMaterials.create({ name: name('Hidden Fabric'), unit: 'GAZ' });

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: created.variantId },
        select: { product: { select: { slug: true } } },
      });

      await expect(catalog.getProductBySlug(variant.product.slug)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
