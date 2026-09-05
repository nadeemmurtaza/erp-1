import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { InventoryService, InsufficientStockError } from './inventory.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { AuditService } from '../../core/audit/audit.service';
import { StockIntakeRegistry } from '../../core/extension-points/stock-intake.registry';

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
  let defaultLocationId: string;
  let secondLocationId: string;
  let productId: string;
  const createdVariantIds: string[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        InventoryService,
        PrismaService,
        StockIntakeRegistry,
        { provide: EventBusService, useValue: { publish: jest.fn() } },
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
