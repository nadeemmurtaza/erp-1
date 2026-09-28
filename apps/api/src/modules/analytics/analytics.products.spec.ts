import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { AnalyticsService } from './analytics.service';
import { MetricRegistryService } from '../../core/metrics/metric-registry.service';

/**
 * WO-D.3 (10-admin-dashboard.md Track D) — covers only `productsTopSellers()`,
 * `productsSlowSellers()` and `productsCategories()`. Real PrismaService +
 * SettingsService against the seeded test database, same idiom as the rest
 * of Track D's own spec files.
 */
describe('AnalyticsService — WO-D.3 products top/slow-sellers, categories', () => {
  let service: AnalyticsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        MetricRegistryService,
        PrismaService,
        SettingsService,
        // Settings' shared L2 is not under test here: Redis reads as not connected, so every read is Postgres's.
        { provide: RedisService, useValue: { isReady: () => false } },
        { provide: AppConfigService, useValue: { isModuleEnabled: jest.fn().mockReturnValue(true) } },
      ],
    }).compile();

    service = module.get(AnalyticsService);
    prisma = module.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.orderItem.deleteMany({ where: { order: { number: { startsWith: 'd3-spec-' } } } });
    await prisma.order.deleteMany({ where: { number: { startsWith: 'd3-spec-' } } });
    await prisma.variantSalesStat.deleteMany({ where: { variant: { sku: { startsWith: 'd3-spec-' } } } });
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: 'd3-spec-' } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: 'd3-spec-' } } });
    await prisma.categoryTranslation.deleteMany({ where: { name: { startsWith: 'd3-spec ' } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: 'd3-spec-' } } });
  });

  let seq = 0;
  function uid(): string {
    seq += 1;
    return `d3-spec-${Date.now()}-${seq}`;
  }

  /**
   * Exact `n * 24h` before now, never a calendar-date subtraction pinned to
   * a fixed clock time. `productsSlowSellers()` derives `daysSinceLastSale`
   * as `Math.floor((now - lastSoldAt) / 86_400_000)` — a pure duration, not
   * a calendar-day difference — so anchoring this fixture to a fixed
   * wall-clock hour (the previous version pinned to 12:00 UTC) made the
   * test's `n` and the service's floor() disagree whenever the suite ran
   * before that hour: the elapsed duration would be a few hours short of a
   * full `n` days and floor to `n - 1`. Exact millisecond subtraction keeps
   * the two computations in agreement regardless of what time of day the
   * suite runs.
   */
  function daysAgo(n: number): Date {
    return new Date(Date.now() - n * 86_400_000);
  }

  async function makeProduct(categoryId?: string) {
    return prisma.product.create({ data: { slug: uid(), kind: 'GOODS', basePrice: 1000, categoryId } });
  }

  async function makeVariant(productId: string) {
    return prisma.productVariant.create({ data: { productId, sku: uid() } });
  }

  async function makeOrderWithItem(opts: {
    productId: string;
    variantId: string;
    sku: string;
    nameEn: string;
    unitPrice: number;
    unitCost: number;
    quantity: number;
    placedAt: Date;
    status?: 'DELIVERED' | 'CANCELLED' | 'RETURNED';
  }) {
    const lineTotal = opts.unitPrice * opts.quantity;
    return prisma.order.create({
      data: {
        number: uid(),
        status: opts.status ?? 'DELIVERED',
        shippingAddress: {},
        itemsSubtotal: lineTotal,
        grandTotal: lineTotal,
        placedAt: opts.placedAt,
        items: {
          create: [
            {
              productId: opts.productId,
              variantId: opts.variantId,
              kind: 'GOODS',
              nameEn: opts.nameEn,
              sku: opts.sku,
              unitPrice: opts.unitPrice,
              unitCost: opts.unitCost,
              quantity: opts.quantity,
              lineTotal,
            },
          ],
        },
      },
    });
  }

  describe('productsTopSellers', () => {
    it('groups by the order item\'s own snapshot columns and sums units/revenue', async () => {
      const product = await makeProduct();
      const variant = await makeVariant(product.id);
      const sku = uid();
      const name = `d3-spec Item ${uid()}`;

      await makeOrderWithItem({
        productId: product.id, variantId: variant.id, sku, nameEn: name,
        unitPrice: 500, unitCost: 200, quantity: 3, placedAt: daysAgo(1),
      });
      await makeOrderWithItem({
        productId: product.id, variantId: variant.id, sku, nameEn: name,
        unitPrice: 500, unitCost: 200, quantity: 2, placedAt: daysAgo(2),
      });

      const result = await service.productsTopSellers(30, true);
      const row = result.rows.find((r) => r.sku === sku);
      expect(row).toBeDefined();
      expect(row!.units).toBe(5);
      expect(row!.revenue).toBe(2500);
      expect(row!.cogs).toBe(1000);
      expect(row!.marginBps).toBe(6000); // (2500-1000)/2500
    });

    it('excludes a CANCELLED order', async () => {
      const product = await makeProduct();
      const variant = await makeVariant(product.id);
      const sku = uid();

      await makeOrderWithItem({
        productId: product.id, variantId: variant.id, sku, nameEn: 'd3-spec cancelled item',
        unitPrice: 500, unitCost: 200, quantity: 3, placedAt: daysAgo(1), status: 'CANCELLED',
      });

      const result = await service.productsTopSellers(30, true);
      expect(result.rows.find((r) => r.sku === sku)).toBeUndefined();
    });

    it('omits cogs/marginBps entirely (not null) without inventory.view_cost', async () => {
      const product = await makeProduct();
      const variant = await makeVariant(product.id);
      const sku = uid();

      await makeOrderWithItem({
        productId: product.id, variantId: variant.id, sku, nameEn: 'd3-spec no-cost item',
        unitPrice: 500, unitCost: 200, quantity: 1, placedAt: daysAgo(1),
      });

      const result = await service.productsTopSellers(30, false);
      const row = result.rows.find((r) => r.sku === sku)!;
      expect(row.revenue).toBe(500);
      expect('cogs' in row).toBe(false);
      expect('marginBps' in row).toBe(false);
    });

    it('renders a well-shaped, non-throwing response with no fixtures of its own', async () => {
      await expect(service.productsTopSellers(30, false)).resolves.toEqual(
        expect.objectContaining({ rows: expect.any(Array) }),
      );
    });
  });

  describe('productsSlowSellers', () => {
    it('lists only active, in-stock variants flagged isSlowMover, deriving daysSinceLastSale from lastSoldAt', async () => {
      const product = await makeProduct();
      const variant = await prisma.productVariant.create({
        data: { productId: product.id, sku: uid(), isActive: true, stock: 5 },
      });
      const lastSoldAt = daysAgo(40);
      await prisma.variantSalesStat.create({
        data: { variantId: variant.id, isSlowMover: true, ageDays: 40, lastSoldAt },
      });

      const result = await service.productsSlowSellers();
      const row = result.rows.find((r) => r.variantId === variant.id);
      expect(row).toBeDefined();
      expect(row!.daysSinceLastSale).toBeCloseTo(40, 0);
      expect(row!.ageDays).toBe(40);
    });

    it('excludes a variant with stock 0 even if flagged isSlowMover', async () => {
      const product = await makeProduct();
      const variant = await prisma.productVariant.create({
        data: { productId: product.id, sku: uid(), isActive: true, stock: 0 },
      });
      await prisma.variantSalesStat.create({
        data: { variantId: variant.id, isSlowMover: true, ageDays: 40 },
      });

      const result = await service.productsSlowSellers();
      expect(result.rows.find((r) => r.variantId === variant.id)).toBeUndefined();
    });

    it('falls back to ageDays for a variant that has never sold (no lastSoldAt)', async () => {
      const product = await makeProduct();
      const variant = await prisma.productVariant.create({
        data: { productId: product.id, sku: uid(), isActive: true, stock: 5 },
      });
      await prisma.variantSalesStat.create({
        data: { variantId: variant.id, isSlowMover: true, ageDays: 90, lastSoldAt: null },
      });

      const result = await service.productsSlowSellers();
      const row = result.rows.find((r) => r.variantId === variant.id);
      expect(row?.daysSinceLastSale).toBe(90);
    });
  });

  describe('productsCategories', () => {
    it('groups revenue/units/productCount by category, Uncategorised when categoryId is null', async () => {
      const category = await prisma.category.create({
        data: {
          slug: uid(),
          translations: { create: { locale: 'en', name: `d3-spec ${uid()}` } },
        },
        include: { translations: true },
      });
      const categorised = await makeProduct(category.id);
      const categorisedVariant = await makeVariant(categorised.id);
      const uncategorised = await makeProduct();
      const uncategorisedVariant = await makeVariant(uncategorised.id);

      await makeOrderWithItem({
        productId: categorised.id, variantId: categorisedVariant.id, sku: uid(), nameEn: 'd3-spec categorised item',
        unitPrice: 400, unitCost: 100, quantity: 2, placedAt: daysAgo(1),
      });
      await makeOrderWithItem({
        productId: uncategorised.id, variantId: uncategorisedVariant.id, sku: uid(), nameEn: 'd3-spec uncategorised item',
        unitPrice: 300, unitCost: 100, quantity: 1, placedAt: daysAgo(1),
      });

      const result = await service.productsCategories(30);
      const categorisedRow = result.rows.find((r) => r.categoryId === category.id);
      expect(categorisedRow).toBeDefined();
      expect(categorisedRow!.name).toBe(category.translations[0]!.name);
      expect(categorisedRow!.revenue).toBe(800);
      expect(categorisedRow!.productCount).toBe(1);

      const uncategorisedRow = result.rows.find((r) => r.categoryId === null);
      expect(uncategorisedRow?.name).toBe('Uncategorised');
    });

    it('returns a daily revenue series alongside the category rows, and a non-throwing response with no fixtures', async () => {
      await expect(service.productsCategories(7)).resolves.toEqual(
        expect.objectContaining({ rows: expect.any(Array), series: expect.any(Array) }),
      );
    });
  });
});
