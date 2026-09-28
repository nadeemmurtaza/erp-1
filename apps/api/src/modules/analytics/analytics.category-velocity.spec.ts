import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { AnalyticsService } from './analytics.service';
import { MetricRegistryService } from '../../core/metrics/metric-registry.service';

/**
 * WO-57.1 (57-multiday-category-velocity.md) — `categoryVelocity()`. Real
 * PrismaService/SettingsService against the seeded test database, same
 * idiom as `analytics.products.spec.ts`'s own `productsCategories` suite.
 */
describe('AnalyticsService.categoryVelocity — WO-57.1', () => {
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
    await prisma.orderItem.deleteMany({ where: { order: { number: { startsWith: 'wo57-spec-' } } } });
    await prisma.order.deleteMany({ where: { number: { startsWith: 'wo57-spec-' } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: 'wo57-spec-' } } });
    await prisma.categoryTranslation.deleteMany({ where: { name: { startsWith: 'wo57-spec ' } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: 'wo57-spec-' } } });
  });

  let seq = 0;
  function uid(): string {
    seq += 1;
    return `wo57-spec-${Date.now()}-${seq}`;
  }

  async function makeCategory(name: string) {
    return prisma.category.create({
      data: { slug: uid(), translations: { create: [{ locale: 'en', name: `wo57-spec ${name}` }] } },
    });
  }

  async function makeSale(opts: { categoryId?: string; lineTotal: number; placedAt: Date; status?: 'DELIVERED' | 'CANCELLED' }) {
    const product = await prisma.product.create({ data: { slug: uid(), kind: 'GOODS', basePrice: opts.lineTotal, categoryId: opts.categoryId } });
    return prisma.order.create({
      data: {
        number: uid(),
        status: opts.status ?? 'DELIVERED',
        shippingAddress: {},
        itemsSubtotal: opts.lineTotal,
        grandTotal: opts.lineTotal,
        placedAt: opts.placedAt,
        items: {
          create: [
            {
              productId: product.id,
              kind: 'GOODS',
              nameEn: 'wo57-spec item',
              unitPrice: opts.lineTotal,
              unitCost: 0,
              quantity: 1,
              lineTotal: opts.lineTotal,
            },
          ],
        },
      },
    });
  }

  function daysAgo(n: number): Date {
    return new Date(Date.now() - n * 86_400_000);
  }

  it("per-category daily totals sum to the identical category total productsCategories(days) already reports", async () => {
    const category = await makeCategory('Apparel');
    await makeSale({ categoryId: category.id, lineTotal: 500_00, placedAt: daysAgo(1) });
    await makeSale({ categoryId: category.id, lineTotal: 300_00, placedAt: daysAgo(3) });
    await makeSale({ categoryId: category.id, lineTotal: 100_00, placedAt: daysAgo(20), status: 'CANCELLED' });

    const [velocity, snapshot] = await Promise.all([service.categoryVelocity(14), service.productsCategories(14)]);

    const series = velocity.series.find((s) => s.label === `wo57-spec Apparel`);
    expect(series).toBeDefined();
    const sumFromVelocity = velocity.days.reduce((sum, day) => sum + (day[series!.key] ?? 0), 0);

    const snapshotRow = snapshot.rows.find((r) => r.categoryId === category.id);
    expect(sumFromVelocity).toBe(snapshotRow?.revenue ?? 0);
    expect(sumFromVelocity).toBe(800_00);
  });

  it('never renders more than 5 named category series plus one "Other" bucket', async () => {
    for (let i = 0; i < 8; i++) {
      const category = await makeCategory(`Cat${i}`);
      await makeSale({ categoryId: category.id, lineTotal: (8 - i) * 100_00, placedAt: daysAgo(1) });
    }

    const result = await service.categoryVelocity(14);
    const named = result.series.filter((s) => s.key !== 'other');

    expect(named.length).toBeLessThanOrEqual(5);
    expect(result.series.some((s) => s.key === 'other' && s.label === 'Other')).toBe(true);
  });

  it('an uncategorised sale is bucketed under "Other" when it is not itself a top category', async () => {
    for (let i = 0; i < 5; i++) {
      const category = await makeCategory(`Big${i}`);
      await makeSale({ categoryId: category.id, lineTotal: 1_000_00, placedAt: daysAgo(1) });
    }
    await makeSale({ categoryId: undefined, lineTotal: 50_00, placedAt: daysAgo(1) });

    const result = await service.categoryVelocity(14);
    const otherTotal = result.days.reduce((sum, day) => sum + (day.other ?? 0), 0);

    expect(otherTotal).toBeGreaterThanOrEqual(50_00);
  });

  it('a day with no sale for a category shows a real zero, never a gap that misaligns the day axis', async () => {
    const category = await makeCategory('Sparse');
    await makeSale({ categoryId: category.id, lineTotal: 200_00, placedAt: daysAgo(0) });

    const result = await service.categoryVelocity(14);

    expect(result.days).toHaveLength(14);
    expect(result.days.every((day) => Object.keys(day).length === result.series.length + 1)).toBe(true);
  });
});
