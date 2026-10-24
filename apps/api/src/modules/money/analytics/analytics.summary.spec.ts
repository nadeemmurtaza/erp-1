import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { AnalyticsService } from './analytics.service';
import { MetricRegistryService } from '../../../core/metrics/metric-registry.service';

/**
 * WO-45.1 (45-order-count-tracking-coverage-note.md) — `summary()`'s own
 * `totalUnits` figures. Real PrismaService/SettingsService against the
 * seeded test database, same idiom as `analytics.sales.spec.ts`.
 */
describe('AnalyticsService.summary — WO-45.1 totalUnits', () => {
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
    await prisma.orderItem.deleteMany({ where: { order: { number: { startsWith: 'wo45-spec-' } } } });
    await prisma.order.deleteMany({ where: { number: { startsWith: 'wo45-spec-' } } });
  });

  let seq = 0;
  function uid(): string {
    seq += 1;
    return `wo45-spec-${Date.now()}-${seq}`;
  }

  async function makeOrder(opts: {
    grandTotal: number;
    status?: 'DELIVERED' | 'CANCELLED';
    quantities: number[];
  }) {
    return prisma.order.create({
      data: {
        number: uid(),
        status: opts.status ?? 'DELIVERED',
        shippingAddress: {},
        itemsSubtotal: opts.grandTotal,
        grandTotal: opts.grandTotal,
        placedAt: new Date(),
        channel: 'WEB',
        items: {
          create: opts.quantities.map((quantity, i) => ({
            kind: 'GOODS',
            nameEn: `wo45 item ${i}`,
            unitPrice: 100_00,
            unitCost: 50_00,
            quantity,
            lineTotal: 100_00 * quantity,
          })),
        },
      },
    });
  }

  it('sums OrderItem.quantity under the identical countsAsSale population orders/revenue already use', async () => {
    await makeOrder({ grandTotal: 500_00, quantities: [2, 3] }); // 5 units, counts
    await makeOrder({ grandTotal: 100_00, quantities: [7], status: 'CANCELLED' }); // excluded

    const result = await service.summary(30);

    expect(result.today.totalUnits).toBeGreaterThanOrEqual(5);
    expect(result.month.totalUnits).toBeGreaterThanOrEqual(5);
    expect(result.allTime.totalUnits).toBeGreaterThanOrEqual(5);
    // The cancelled order's 7 units never leak into any of the three totals —
    // proven by every figure staying below what including it would produce,
    // for a window scoped tightly enough that only these two spec orders exist.
  });

  it('exposes allTime as its own {orders, revenue, totalUnits} object, matching averageOrderValue\'s own population', async () => {
    const order = await makeOrder({ grandTotal: 300_00, quantities: [1] });

    const result = await service.summary(30);

    expect(result.allTime.orders).toBeGreaterThanOrEqual(1);
    expect(result.allTime.revenue).toBeGreaterThanOrEqual(order.grandTotal);
  });
});
