import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { AnalyticsService } from './analytics.service';
import { MetricRegistryService } from '../../core/metrics/metric-registry.service';

/**
 * WO-D.4 (10-admin-dashboard.md Track D) — covers only `inventoryValuation()`
 * and `inventoryMovements()`. Real PrismaService + SettingsService against
 * the seeded test database, same idiom as the rest of Track D's spec files.
 */
describe('AnalyticsService — WO-D.4 inventory valuation/movements', () => {
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
    await prisma.stockMovement.deleteMany({ where: { variant: { sku: { startsWith: 'd4-spec-' } } } });
    await prisma.variantSalesStat.deleteMany({ where: { variant: { sku: { startsWith: 'd4-spec-' } } } });
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: 'd4-spec-' } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: 'd4-spec-' } } });
    await prisma.categoryTranslation.deleteMany({ where: { name: { startsWith: 'd4-spec ' } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: 'd4-spec-' } } });
  });

  let seq = 0;
  function uid(): string {
    seq += 1;
    return `d4-spec-${Date.now()}-${seq}`;
  }

  async function makeProduct(categoryId?: string, kind: 'GOODS' | 'STITCHED' = 'GOODS') {
    return prisma.product.create({ data: { slug: uid(), kind, basePrice: 1000, categoryId } });
  }

  async function makeVariant(productId: string, opts: { stock: number; costPrice: number }) {
    return prisma.productVariant.create({
      data: { productId, sku: uid(), stock: opts.stock, costPrice: opts.costPrice },
    });
  }

  describe('inventoryValuation', () => {
    it('sums units and value as stock × costPrice, excluding zero-stock variants entirely', async () => {
      const product = await makeProduct();
      const before = await service.inventoryValuation();

      await makeVariant(product.id, { stock: 10, costPrice: 500 });
      await makeVariant(product.id, { stock: 0, costPrice: 999 }); // must not count at all

      const after = await service.inventoryValuation();
      expect(after.totals.value - before.totals.value).toBe(5000);
      expect(after.totals.units - before.totals.units).toBe(10);
    });

    it('counts unknownCostVariants only among in-stock variants with costPrice 0', async () => {
      const product = await makeProduct();
      const before = await service.inventoryValuation();

      await makeVariant(product.id, { stock: 5, costPrice: 0 }); // counts
      await makeVariant(product.id, { stock: 0, costPrice: 0 }); // excluded — no stock
      await makeVariant(product.id, { stock: 3, costPrice: 0 }); // counts

      const after = await service.inventoryValuation();
      expect(after.totals.unknownCostVariants).toBe(before.totals.unknownCostVariants + 2);
    });

    it('groups by category (Uncategorised when null) and by product kind', async () => {
      const category = await prisma.category.create({
        data: { slug: uid(), translations: { create: { locale: 'en', name: `d4-spec ${uid()}` } } },
        include: { translations: true },
      });
      const categorised = await makeProduct(category.id, 'STITCHED');
      await makeVariant(categorised.id, { stock: 4, costPrice: 250 });
      const uncategorised = await makeProduct(undefined, 'GOODS');
      await makeVariant(uncategorised.id, { stock: 2, costPrice: 100 });

      const result = await service.inventoryValuation();

      const categorisedRow = result.byCategory.find((row) => row.categoryId === category.id);
      expect(categorisedRow?.value).toBe(1000);

      const stitchedRow = result.byKind.find((row) => row.kind === 'STITCHED');
      expect(stitchedRow).toBeDefined();
      expect(stitchedRow!.value).toBeGreaterThanOrEqual(1000);
    });

    it('buckets ageing by VariantSalesStat.ageDays, treating a variant with no stat row as freshest', async () => {
      const product = await makeProduct();
      const old = await makeVariant(product.id, { stock: 1, costPrice: 100 });
      await prisma.variantSalesStat.create({ data: { variantId: old.id, ageDays: 95 } });
      await makeVariant(product.id, { stock: 1, costPrice: 100 }); // no salesStat row at all

      const result = await service.inventoryValuation();
      expect(result.ageing.map((bucket) => bucket.label)).toEqual(['0-30 days', '31-60 days', '61-90 days', '90+ days']);

      const over90 = result.ageing.find((bucket) => bucket.label === '90+ days')!;
      const zeroTo30 = result.ageing.find((bucket) => bucket.label === '0-30 days')!;
      expect(over90.value).toBeGreaterThanOrEqual(100);
      expect(zeroTo30.value).toBeGreaterThanOrEqual(100);
    });

    it('renders a well-shaped, non-throwing response with no fixtures of its own', async () => {
      await expect(service.inventoryValuation()).resolves.toEqual(
        expect.objectContaining({
          totals: expect.objectContaining({ units: expect.any(Number), value: expect.any(Number), unknownCostVariants: expect.any(Number) }),
          byCategory: expect.any(Array),
          byKind: expect.any(Array),
          ageing: expect.any(Array),
        }),
      );
    });
  });

  describe('inventoryMovements', () => {
    async function makeMovement(variantId: string, opts: { delta: number; reason: string; createdAt: Date }) {
      return prisma.stockMovement.create({
        data: {
          variantId,
          delta: opts.delta,
          resultingStock: 0,
          reason: opts.reason as never,
          createdAt: opts.createdAt,
        },
      });
    }

    it('splits delta into in/out by sign, aggregated by day', async () => {
      const product = await makeProduct();
      const variant = await makeVariant(product.id, { stock: 10, costPrice: 100 });
      const now = new Date();

      await makeMovement(variant.id, { delta: 20, reason: 'PURCHASE_RECEIPT', createdAt: now });
      await makeMovement(variant.id, { delta: -5, reason: 'SALE', createdAt: now });

      const result = await service.inventoryMovements(7);
      const totalIn = result.series.reduce((sum, point) => sum + point.in, 0);
      const totalOut = result.series.reduce((sum, point) => sum + point.out, 0);
      expect(totalIn).toBeGreaterThanOrEqual(20);
      expect(totalOut).toBeGreaterThanOrEqual(5);
    });

    it('groups by reason with correct in/out magnitude and count', async () => {
      const product = await makeProduct();
      const variant = await makeVariant(product.id, { stock: 10, costPrice: 100 });
      const now = new Date();

      await makeMovement(variant.id, { delta: 7, reason: 'PRODUCTION_RECEIPT', createdAt: now });
      await makeMovement(variant.id, { delta: 7, reason: 'PRODUCTION_RECEIPT', createdAt: now });

      const result = await service.inventoryMovements(7);
      const row = result.byReason.find((r) => r.reason === 'PRODUCTION_RECEIPT');
      expect(row?.in).toBeGreaterThanOrEqual(14);
      expect(row?.out).toBe(0);
      expect(row?.count).toBeGreaterThanOrEqual(2);
    });

    it('lists the single most recent movement first, with sku/name resolved', async () => {
      // Only the NEWEST row's position is asserted — the full suite shares
      // one long-lived test database, so a fixed-size `recent` list (capped
      // at 20, same as every other Track D ranking query) can't guarantee
      // an older row of this test's own still appears once enough other
      // suites' own movements exist. The one guarantee that always holds
      // regardless of accumulated state: nothing can be created with a
      // later `createdAt` than "right now", so this row is always first.
      const product = await makeProduct();
      const variant = await makeVariant(product.id, { stock: 10, costPrice: 100 });
      const newest = await makeMovement(variant.id, { delta: 1, reason: 'ADJUSTMENT', createdAt: new Date() });

      const result = await service.inventoryMovements(7);
      expect(result.recent[0]?.id).toBe(newest.id);
      expect(result.recent[0]?.sku).toBe(variant.sku);
    });

    it('renders a well-shaped, non-throwing response with no fixtures of its own', async () => {
      await expect(service.inventoryMovements(7)).resolves.toEqual(
        expect.objectContaining({ series: expect.any(Array), byReason: expect.any(Array), recent: expect.any(Array) }),
      );
    });
  });
});
