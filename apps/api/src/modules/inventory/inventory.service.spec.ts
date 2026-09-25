import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { InventoryService, InsufficientStockError } from './inventory.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { AuditService } from '../../core/audit/audit.service';
import { StockIntakeRegistry } from '../../core/extension-points/stock-intake.registry';
import { EntityEnrichmentRegistry } from '../../core/extension-points/entity-enrichment.registry';

/**
 * B6 (17-inventory-locations.md) — the riskiest of the scoped blockers,
 * because ProductVariant.stock changes what it MEANS: a denormalized SUM
 * over VariantLocationStock rather than the source of truth. These tests
 * are the acceptance criteria from that doc: two locations must be able to
 * sell independently and concurrently, one location running out must never
 * borrow from another, and the aggregate must never drift from the sum of
 * its parts — not just at migration time, but after every movement.
 */
describe('InventoryService — locations (B6)', () => {
  let inventory: InventoryService;
  let prisma: PrismaService;
  let events: { publish: jest.Mock };
  let defaultLocationId: string;
  let secondLocationId: string;
  let productId: string;
  const createdVariantIds: string[] = [];

  beforeAll(async () => {
    events = { publish: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        InventoryService,
        PrismaService,
        StockIntakeRegistry,
        EntityEnrichmentRegistry,
        { provide: EventBusService, useValue: events },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    inventory = module.get(InventoryService);
    prisma = module.get(PrismaService);

    defaultLocationId = await inventory.defaultLocationId();

    const product = await prisma.product.findFirstOrThrow({ select: { id: true } });
    productId = product.id;

    const secondLocation = await prisma.location.create({
      data: { name: 'Test Warehouse', code: `TEST-${Date.now()}`, isDefault: false },
    });
    secondLocationId = secondLocation.id;
  });

  afterAll(async () => {
    // Cascades to each variant's VariantLocationStock and StockMovement rows.
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
    await prisma.location.delete({ where: { id: secondLocationId } });
  });

  async function freshVariant() {
    const variant = await prisma.productVariant.create({
      data: { productId, sku: `B6-TEST-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
    createdVariantIds.push(variant.id);
    return variant;
  }

  async function totalAcrossLocations(variantId: string): Promise<number> {
    const rows = await prisma.variantLocationStock.findMany({ where: { variantId } });
    return rows.reduce((sum, row) => sum + row.quantity, 0);
  }

  it('keeps ProductVariant.stock equal to the sum of VariantLocationStock across every location', async () => {
    const variant = await freshVariant();

    await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 10, reason: 'ADJUSTMENT' });
    await inventory.move({ variantId: variant.id, locationId: secondLocationId, delta: 5, reason: 'ADJUSTMENT' });

    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(after.stock).toBe(15);
    expect(await totalAcrossLocations(variant.id)).toBe(15);
  });

  it('lets two locations sell concurrently and independently, with the aggregate reflecting both', async () => {
    const variant = await freshVariant();
    await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 5, reason: 'ADJUSTMENT' });
    await inventory.move({ variantId: variant.id, locationId: secondLocationId, delta: 5, reason: 'ADJUSTMENT' });

    // Two genuinely separate transactions, run at once — the real shape of
    // two simultaneous checkouts against different locations.
    const [saleAtDefault, saleAtSecond] = await Promise.all([
      prisma.$transaction((tx) =>
        inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: -3, reason: 'SALE' }, tx),
      ),
      prisma.$transaction((tx) =>
        inventory.move({ variantId: variant.id, locationId: secondLocationId, delta: -2, reason: 'SALE' }, tx),
      ),
    ]);

    expect(saleAtDefault).toBeDefined();
    expect(saleAtSecond).toBeDefined();

    const defaultStock = await prisma.variantLocationStock.findUniqueOrThrow({
      where: { variantId_locationId: { variantId: variant.id, locationId: defaultLocationId } },
    });
    const secondStock = await prisma.variantLocationStock.findUniqueOrThrow({
      where: { variantId_locationId: { variantId: variant.id, locationId: secondLocationId } },
    });
    expect(defaultStock.quantity).toBe(2);
    expect(secondStock.quantity).toBe(3);

    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(after.stock).toBe(5);
    expect(await totalAcrossLocations(variant.id)).toBe(5);
  });

  it('never borrows stock from another location — insufficient stock at ONE location fails even when another has plenty', async () => {
    const variant = await freshVariant();
    await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 1, reason: 'ADJUSTMENT' });
    await inventory.move({ variantId: variant.id, locationId: secondLocationId, delta: 10, reason: 'ADJUSTMENT' });

    await expect(
      inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: -2, reason: 'SALE' }),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(after.stock).toBe(11);
    expect(await totalAcrossLocations(variant.id)).toBe(11);
  });

  it('rejects a movement that is never applied to any location, keeping the aggregate untouched', async () => {
    const variant = await freshVariant();
    await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 4, reason: 'ADJUSTMENT' });

    await expect(
      inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: -5, reason: 'SALE' }),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(after.stock).toBe(4);
    expect(await totalAcrossLocations(variant.id)).toBe(4);
  });
});

/**
 * RETAIL-ERP.md R5 — a POS sale that already happened must never be
 * rejected by sync. postUnconditional() is the escape hatch move() does
 * not have: it applies the delta regardless of what's on the shelf, and
 * when that drives a location negative it opens a StockVariance instead of
 * throwing InsufficientStockError.
 */
describe('InventoryService — postUnconditional (R5 oversell)', () => {
  let inventory: InventoryService;
  let prisma: PrismaService;
  let events: { publish: jest.Mock };
  let defaultLocationId: string;
  let productId: string;
  const createdVariantIds: string[] = [];

  beforeAll(async () => {
    events = { publish: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        InventoryService,
        PrismaService,
        StockIntakeRegistry,
        EntityEnrichmentRegistry,
        { provide: EventBusService, useValue: events },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    inventory = module.get(InventoryService);
    prisma = module.get(PrismaService);
    defaultLocationId = await inventory.defaultLocationId();

    const product = await prisma.product.findFirstOrThrow({ select: { id: true } });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
  });

  beforeEach(() => events.publish.mockClear());

  async function freshVariant() {
    const variant = await prisma.productVariant.create({
      data: { productId, sku: `POS-VARIANCE-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
    createdVariantIds.push(variant.id);
    return variant;
  }

  it('applies the delta even when it takes a location negative, never throwing InsufficientStockError', async () => {
    const variant = await freshVariant();
    await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 2, reason: 'ADJUSTMENT' });

    const movement = await inventory.postUnconditional({
      variantId: variant.id,
      locationId: defaultLocationId,
      delta: -5,
      reason: 'POS_SALE',
      refType: 'Order',
      refId: 'test-order-1',
    });

    expect(movement.reason).toBe('POS_OFFLINE_VARIANCE');
    const stock = await prisma.variantLocationStock.findUniqueOrThrow({
      where: { variantId_locationId: { variantId: variant.id, locationId: defaultLocationId } },
    });
    expect(stock.quantity).toBe(-3);
  });

  it('opens a StockVariance row sized to the overshoot, paired to the movement', async () => {
    const variant = await freshVariant();
    await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 2, reason: 'ADJUSTMENT' });

    const movement = await inventory.postUnconditional({
      variantId: variant.id,
      locationId: defaultLocationId,
      delta: -5,
      reason: 'POS_SALE',
    });

    const variance = await prisma.stockVariance.findUniqueOrThrow({ where: { stockMovementId: movement.id } });
    expect(variance.overshootQty).toBe(3);
    expect(variance.status).toBe('OPEN');
    expect(variance.variantId).toBe(variant.id);

    expect(events.publish).toHaveBeenCalledWith(
      'inventory.stock_variance_recorded',
      expect.objectContaining({ stockVarianceId: variance.id, overshootQty: 3 }),
      expect.anything(),
    );
  });

  it('does not open a StockVariance when the sale stays within stock', async () => {
    const variant = await freshVariant();
    await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 5, reason: 'ADJUSTMENT' });

    const movement = await inventory.postUnconditional({
      variantId: variant.id,
      locationId: defaultLocationId,
      delta: -3,
      reason: 'POS_SALE',
    });

    expect(movement.reason).toBe('POS_SALE');
    const variance = await prisma.stockVariance.findUnique({ where: { stockMovementId: movement.id } });
    expect(variance).toBeNull();
    expect(events.publish).not.toHaveBeenCalledWith(
      'inventory.stock_variance_recorded',
      expect.anything(),
      expect.anything(),
    );
  });

  it('move() still refuses to oversell — postUnconditional() did not weaken the guard', async () => {
    const variant = await freshVariant();
    await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 2, reason: 'ADJUSTMENT' });

    await expect(
      inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: -5, reason: 'SALE' }),
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });

  // 156-single-employee-branch-loss-prevention.md §1 — a variance opened
  // while a shift is open at that location is attributed to it, in the SAME
  // transaction, so a branch's own variance history is queryable by shift.
  describe('shift attribution (156-single-employee-branch-loss-prevention.md)', () => {
    let terminalId: string;
    let userId: string;

    beforeAll(async () => {
      const user = await prisma.user.findFirstOrThrow({ select: { id: true } });
      userId = user.id;
      const terminal = await prisma.posTerminal.create({
        data: { code: `SHIFT-TEST-${Date.now()}`, label: 'Test till', locationId: defaultLocationId },
      });
      terminalId = terminal.id;
    });

    afterAll(async () => {
      await prisma.posShift.deleteMany({ where: { terminalId } });
      await prisma.posTerminal.delete({ where: { id: terminalId } });
    });

    it('attributes the variance to the OPEN shift at that location', async () => {
      const shift = await prisma.posShift.create({
        data: { terminalId, openedByUserId: userId, openingCashMinor: 0, status: 'OPEN' },
      });
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 2, reason: 'ADJUSTMENT' });

      const movement = await inventory.postUnconditional({
        variantId: variant.id,
        locationId: defaultLocationId,
        delta: -5,
        reason: 'POS_SALE',
      });

      const variance = await prisma.stockVariance.findUniqueOrThrow({ where: { stockMovementId: movement.id } });
      expect(variance.posShiftId).toBe(shift.id);

      await prisma.posShift.update({ where: { id: shift.id }, data: { status: 'CLOSED', closedAt: new Date() } });
    });

    it('leaves posShiftId null when no shift is open at that location', async () => {
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 2, reason: 'ADJUSTMENT' });

      const movement = await inventory.postUnconditional({
        variantId: variant.id,
        locationId: defaultLocationId,
        delta: -5,
        reason: 'POS_SALE',
      });

      const variance = await prisma.stockVariance.findUniqueOrThrow({ where: { stockMovementId: movement.id } });
      expect(variance.posShiftId).toBeNull();
    });
  });
});

describe('InventoryService — reorder point and replenishment events', () => {
  let inventory: InventoryService;
  let prisma: PrismaService;
  let events: { publish: jest.Mock };
  let defaultLocationId: string;
  let productId: string;
  const createdVariantIds: string[] = [];

  beforeAll(async () => {
    events = { publish: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        InventoryService,
        PrismaService,
        StockIntakeRegistry,
        EntityEnrichmentRegistry,
        { provide: EventBusService, useValue: events },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    inventory = module.get(InventoryService);
    prisma = module.get(PrismaService);
    defaultLocationId = await inventory.defaultLocationId();

    const product = await prisma.product.findFirstOrThrow({ select: { id: true } });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
  });

  beforeEach(() => events.publish.mockClear());

  async function variantWithReorderPoint(overrides: { reorderPoint: number; producedInHouse?: boolean; preferredSupplierId?: string | null }) {
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: `REORDER-TEST-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        reorderPoint: overrides.reorderPoint,
        reorderQuantity: 20,
        producedInHouse: overrides.producedInHouse ?? false,
        preferredSupplierId: overrides.preferredSupplierId,
      },
    });
    createdVariantIds.push(variant.id);
    return variant;
  }

  it('fires ProductReorderPointReached exactly when stock crosses reorderPoint', async () => {
    const variant = await variantWithReorderPoint({ reorderPoint: 5 });
    await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 10, reason: 'ADJUSTMENT' });
    expect(events.publish).not.toHaveBeenCalledWith('catalog.product_reorder_point_reached', expect.anything(), expect.anything());

    await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: -6, reason: 'SALE' });

    expect(events.publish).toHaveBeenCalledWith(
      'catalog.product_reorder_point_reached',
      expect.objectContaining({ variantId: variant.id, stock: 4, reorderPoint: 5 }),
      expect.anything(),
    );
  });

  it('does not re-fire ProductReorderPointReached while stock stays below the point', async () => {
    const variant = await variantWithReorderPoint({ reorderPoint: 5 });
    await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 4, reason: 'ADJUSTMENT' });
    events.publish.mockClear();

    await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: -1, reason: 'SALE' });

    expect(events.publish).not.toHaveBeenCalledWith(
      'catalog.product_reorder_point_reached',
      expect.anything(),
      expect.anything(),
    );
  });

  it('fires StockReplenished on any positive movement, not on a negative one', async () => {
    const variant = await variantWithReorderPoint({ reorderPoint: 5 });

    await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 10, reason: 'ADJUSTMENT' });
    expect(events.publish).toHaveBeenCalledWith(
      'inventory.stock_replenished',
      expect.objectContaining({ variantId: variant.id, delta: 10, resultingStock: 10 }),
      expect.anything(),
    );

    events.publish.mockClear();
    await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: -3, reason: 'SALE' });
    expect(events.publish).not.toHaveBeenCalledWith('inventory.stock_replenished', expect.anything(), expect.anything());
  });
});

describe('InventoryService — getChainStatus', () => {
  let inventory: InventoryService;
  let mockPrisma: any;
  let enrichment: { enrich: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      productVariant: { findUnique: jest.fn() },
      variantLocationStock: { findMany: jest.fn().mockResolvedValue([]) },
      purchaseOrderItem: { findMany: jest.fn().mockResolvedValue([]) },
      workOrder: { findMany: jest.fn().mockResolvedValue([]) },
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    enrichment = { enrich: jest.fn().mockResolvedValue(new Map()) };

    const module = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StockIntakeRegistry, useValue: { register: jest.fn() } },
        { provide: EntityEnrichmentRegistry, useValue: enrichment },
        { provide: EventBusService, useValue: { publish: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    inventory = module.get(InventoryService);
  });

  it('throws NotFoundException for a missing variant', async () => {
    mockPrisma.productVariant.findUnique.mockResolvedValue(null);
    await expect(inventory.getChainStatus('missing')).rejects.toThrow('That variant no longer exists.');
  });

  it('aggregates stock, open POs, open work orders and pending order lines with their stitching status', async () => {
    mockPrisma.productVariant.findUnique.mockResolvedValue({ id: 'v1', sku: 'SKU1', stock: 4 });
    mockPrisma.variantLocationStock.findMany.mockResolvedValue([
      { locationId: 'loc1', quantity: 4, location: { name: 'Main', code: 'MAIN' } },
    ]);
    mockPrisma.purchaseOrderItem.findMany.mockResolvedValue([
      {
        quantityOrdered: 20,
        quantityReceived: 0,
        purchaseOrder: { id: 'po1', number: 'PO-2026-0001', status: 'SENT', expectedAt: null, supplier: { id: 's1', name: 'Acme' } },
      },
    ]);
    mockPrisma.workOrder.findMany.mockResolvedValue([
      { id: 'wo1', number: 'WO-2026-0001', status: 'RELEASED', source: 'MANUAL', quantityOrdered: 5, quantityCompleted: 0 },
    ]);
    mockPrisma.orderItem.findMany.mockResolvedValue([
      { id: 'oi1', quantity: 2, order: { id: 'o1', number: 'YSN-2026-0001', status: 'PENDING', placedAt: new Date('2026-01-01') } },
    ]);
    enrichment.enrich.mockResolvedValue(new Map([['oi1', { number: 'JOB-2026-0001', stage: 'CUTTING', dueAt: null }]]));

    const result = await inventory.getChainStatus('v1');

    expect(result.stock).toEqual([{ locationId: 'loc1', locationName: 'Main', locationCode: 'MAIN', quantity: 4 }]);
    expect(result.openPurchaseOrders).toEqual([
      expect.objectContaining({ number: 'PO-2026-0001', status: 'SENT', quantityOrdered: 20 }),
    ]);
    expect(result.openWorkOrders).toEqual([expect.objectContaining({ number: 'WO-2026-0001', status: 'RELEASED' })]);
    expect(result.pendingOrderLines).toEqual([
      expect.objectContaining({ orderItemId: 'oi1', orderNumber: 'YSN-2026-0001', stitchingJob: { number: 'JOB-2026-0001', stage: 'CUTTING', dueAt: null } }),
    ]);
    expect(enrichment.enrich).toHaveBeenCalledWith('orderItem.stitchingJob', ['oi1']);
  });

  it('excludes shipped/delivered/cancelled/returned orders from pending lines', async () => {
    mockPrisma.productVariant.findUnique.mockResolvedValue({ id: 'v1', sku: 'SKU1' });

    await inventory.getChainStatus('v1');

    expect(mockPrisma.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { variantId: 'v1', order: { status: { notIn: ['SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'] } } },
      }),
    );
  });
});
