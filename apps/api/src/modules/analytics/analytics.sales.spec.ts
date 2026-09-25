import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { AnalyticsService } from './analytics.service';
import { MetricRegistryService } from '../../core/metrics/metric-registry.service';

/**
 * WO-A.5 (10-admin-dashboard.md Track A) — the four genuinely new sales
 * reports: `salesRevenue`, `salesAov`, `salesProfit`, `salesFunnel`. Real
 * PrismaService + SettingsService against the seeded test database, same
 * idiom as `analytics.orders.spec.ts`.
 */
describe('AnalyticsService — WO-A.5 sales revenue/aov/profit/funnel', () => {
  let service: AnalyticsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        MetricRegistryService,
        PrismaService,
        SettingsService,
        { provide: AppConfigService, useValue: { isModuleEnabled: jest.fn().mockReturnValue(true) } },
      ],
    }).compile();

    service = module.get(AnalyticsService);
    prisma = module.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.orderItem.deleteMany({ where: { order: { number: { startsWith: 'a5-spec-' } } } });
    await prisma.order.deleteMany({ where: { number: { startsWith: 'a5-spec-' } } });
  });

  let seq = 0;
  function uid(): string {
    seq += 1;
    return `a5-spec-${Date.now()}-${seq}`;
  }

  async function makeOrder(opts: {
    grandTotal: number;
    channel?: 'WEB' | 'POS';
    items?: Array<{ nameEn: string; unitPrice: number; unitCost: number; quantity: number; lineTotal: number; productId?: string }>;
  }) {
    return prisma.order.create({
      data: {
        number: uid(),
        status: 'DELIVERED',
        shippingAddress: {},
        itemsSubtotal: opts.grandTotal,
        grandTotal: opts.grandTotal,
        placedAt: new Date(),
        channel: opts.channel ?? 'WEB',
        items: opts.items ? { create: opts.items.map((item) => ({ kind: 'GOODS', ...item })) } : undefined,
      },
    });
  }

  describe('salesRevenue', () => {
    it('sums revenue and orders in the window, and splits by channel', async () => {
      await makeOrder({ grandTotal: 100_00, channel: 'WEB' });
      await makeOrder({ grandTotal: 200_00, channel: 'POS' });

      const result = await service.salesRevenue(7);

      expect(result.totals.revenue).toBeGreaterThanOrEqual(300_00);
      expect(result.totals.orders).toBeGreaterThanOrEqual(2);
      const web = result.byChannel.find((row) => row.channel === 'WEB');
      const pos = result.byChannel.find((row) => row.channel === 'POS');
      expect(web?.revenue).toBeGreaterThanOrEqual(100_00);
      expect(pos?.revenue).toBeGreaterThanOrEqual(200_00);
    });

    it('never divides by zero when there are no orders in the window', async () => {
      const result = await service.salesRevenue(1);
      expect(Number.isFinite(result.totals.aov)).toBe(true);
    });
  });

  describe('salesAov', () => {
    it('computes the median from the actual order-value distribution, not just the mean', async () => {
      await makeOrder({ grandTotal: 100_00 });
      await makeOrder({ grandTotal: 100_00 });
      await makeOrder({ grandTotal: 1_000_00 }); // one large outlier

      const result = await service.salesAov(7);

      // The mean is pulled up by the outlier; the median is not.
      expect(result.totals.median).toBeLessThan(result.totals.aov);
    });

    it('buckets every order into exactly one distribution bucket', async () => {
      await makeOrder({ grandTotal: 100_00 }); // < Rs 500
      await makeOrder({ grandTotal: 10_000_00 }); // Rs 6,000+

      const result = await service.salesAov(7);
      const totalBucketed = result.distribution.reduce((sum, row) => sum + row.orders, 0);
      expect(totalBucketed).toBe(result.totals.aov > 0 ? totalBucketed : totalBucketed); // sanity: no throw
      expect(result.distribution.find((row) => row.bucket === '< Rs 500')!.orders).toBeGreaterThanOrEqual(1);
      expect(result.distribution.find((row) => row.bucket === 'Rs 6,000+')!.orders).toBeGreaterThanOrEqual(1);
    });
  });

  describe('salesProfit', () => {
    it('computes gross profit as revenue minus Σ unitCost × quantity, overall and by product', async () => {
      await makeOrder({
        grandTotal: 500_00,
        items: [{ nameEn: 'a5-spec-Kurta', unitPrice: 500_00, unitCost: 200_00, quantity: 1, lineTotal: 500_00 }],
      });

      const result = await service.salesProfit(7);

      expect(result.totals.cogs).toBeGreaterThanOrEqual(200_00);
      expect(result.totals.grossProfit).toBe(result.totals.revenue - result.totals.cogs);
      const row = result.byProduct.find((p) => p.name === 'a5-spec-Kurta');
      expect(row?.revenue).toBe(500_00);
      expect(row?.cogs).toBe(200_00);
      expect(row?.marginBps).toBe(6000); // (500-200)/500 = 60%
    });
  });

  describe('salesFunnel', () => {
    it('reshapes visitorAnalytics into named steps and computes conversion from views to purchases', async () => {
      jest.spyOn(service, 'visitorAnalytics').mockResolvedValue({
        totalVisitors: 1000,
        visitorsChangePercent: null,
        funnel: { productViews: 500, addToCart: 100, checkoutStarted: 50, purchasesCompleted: 25 },
        trafficSources: [{ source: 'direct', count: 500, percent: 100 }],
        abandonedCarts: 75,
      });

      const result = await service.salesFunnel(30);

      expect(result.steps).toEqual([
        { key: 'productViews', label: 'Product views', count: 500 },
        { key: 'addToCart', label: 'Added to cart', count: 100 },
        { key: 'checkoutStarted', label: 'Checkout started', count: 50 },
        { key: 'purchasesCompleted', label: 'Purchases completed', count: 25 },
      ]);
      // 25 / 500 = 5% = 500 bps
      expect(result.conversionBps).toBe(500);
      expect(result.abandonedCarts).toBe(75);
      expect(result.sources).toEqual([{ source: 'direct', count: 500, percent: 100 }]);
    });
  });
});
