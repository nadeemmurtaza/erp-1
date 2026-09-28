import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { AnalyticsService } from './analytics.service';
import { MetricRegistryService } from '../../core/metrics/metric-registry.service';

/**
 * WO-D.1 (10-admin-dashboard.md Track D) — covers only `ordersOverview()`
 * and `ordersFulfilment()`. Real PrismaService + SettingsService against the
 * seeded test database, same idiom as analytics.comparison.spec.ts.
 */
describe('AnalyticsService — WO-D.1 orders overview/fulfilment', () => {
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
    await prisma.orderStatusEvent.deleteMany({ where: { order: { number: { startsWith: 'd1-spec-' } } } });
    await prisma.payment.deleteMany({ where: { order: { number: { startsWith: 'd1-spec-' } } } });
    await prisma.order.deleteMany({ where: { number: { startsWith: 'd1-spec-' } } });
  });

  let seq = 0;
  function uid(): string {
    seq += 1;
    return `d1-spec-${Date.now()}-${seq}`;
  }

  function hoursAgo(n: number): Date {
    return new Date(Date.now() - n * 60 * 60 * 1000);
  }

  async function makeOrder(opts: {
    status: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'READY_TO_SHIP' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
    placedAt: Date;
    city?: string;
  }) {
    return prisma.order.create({
      data: {
        number: uid(),
        status: opts.status,
        shippingAddress: opts.city ? { city: opts.city } : {},
        itemsSubtotal: 1000,
        grandTotal: 1000,
        placedAt: opts.placedAt,
      },
    });
  }

  describe('ordersOverview', () => {
    it('buckets open orders by age and excludes DELIVERED/CANCELLED/RETURNED', async () => {
      await makeOrder({ status: 'PENDING', placedAt: hoursAgo(1), city: 'Lahore' });
      await makeOrder({ status: 'CONFIRMED', placedAt: hoursAgo(72), city: 'Lahore' });
      // Not open — must not appear in any bucket or in oldestOpen.
      const delivered = await makeOrder({ status: 'DELIVERED', placedAt: hoursAgo(500) });

      const result = await service.ordersOverview();

      const zeroToOne = result.ageing.find((bucket) => bucket.label === '0-1 days');
      const twoToThree = result.ageing.find((bucket) => bucket.label === '2-3 days');
      expect(zeroToOne?.count).toBeGreaterThanOrEqual(1);
      expect(twoToThree?.count).toBeGreaterThanOrEqual(1);
      expect(result.oldestOpen.some((row) => row.id === delivered.id)).toBe(false);
      expect(result.ageing.map((bucket) => bucket.label)).toEqual(['0-1 days', '2-3 days', '4-7 days', '8+ days']);
    });

    it('orders the worklist oldest-first and reports a non-negative age', async () => {
      const older = await makeOrder({ status: 'PENDING', placedAt: hoursAgo(48) });
      const newer = await makeOrder({ status: 'PENDING', placedAt: hoursAgo(1) });

      const result = await service.ordersOverview();

      const olderIndex = result.oldestOpen.findIndex((row) => row.id === older.id);
      const newerIndex = result.oldestOpen.findIndex((row) => row.id === newer.id);
      expect(olderIndex).toBeGreaterThanOrEqual(0);
      expect(newerIndex).toBeGreaterThanOrEqual(0);
      expect(olderIndex).toBeLessThan(newerIndex);
      expect(result.oldestOpen.every((row) => row.ageDays >= 0)).toBe(true);
    });

    it('breaks down open orders by city with a count and average age, not revenue', async () => {
      await makeOrder({ status: 'PENDING', placedAt: hoursAgo(24), city: 'd1-spec-Karachi' });
      await makeOrder({ status: 'CONFIRMED', placedAt: hoursAgo(48), city: 'd1-spec-Karachi' });

      const result = await service.ordersOverview();

      const karachi = result.byCity.find((row) => row.city === 'd1-spec-Karachi');
      expect(karachi?.count).toBe(2);
      expect(karachi?.avgAgeDays).toBeGreaterThan(1);
    });

    it('picks the first payment attempt per order (DISTINCT ON), so a retried payment is not double-counted', async () => {
      const withRetry = await makeOrder({ status: 'PENDING', placedAt: hoursAgo(10) });
      await prisma.payment.create({
        data: { orderId: withRetry.id, provider: 'jazzcash', status: 'FAILED', amount: 1000, createdAt: hoursAgo(10) },
      });
      await prisma.payment.create({
        data: { orderId: withRetry.id, provider: 'cod', status: 'PENDING', amount: 1000, createdAt: hoursAgo(9) },
      });
      const single = await makeOrder({ status: 'PENDING', placedAt: hoursAgo(5) });
      await prisma.payment.create({
        data: { orderId: single.id, provider: 'jazzcash', status: 'PENDING', amount: 1000, createdAt: hoursAgo(5) },
      });

      const before = await service.ordersOverview();
      const beforeJazzcash = before.byPayment.find((row) => row.provider === 'jazzcash')?.count ?? 0;

      // A THIRD payment attempt on the order that already has one (jazzcash,
      // its first) must not move the count — DISTINCT ON already fixed which
      // attempt counts, and adding a later attempt doesn't change that.
      await prisma.payment.create({
        data: { orderId: withRetry.id, provider: 'easypaisa', status: 'PENDING', amount: 1000, createdAt: hoursAgo(1) },
      });
      const after = await service.ordersOverview();
      const afterJazzcash = after.byPayment.find((row) => row.provider === 'jazzcash')?.count ?? 0;

      expect(afterJazzcash).toBe(beforeJazzcash);
      expect(beforeJazzcash).toBeGreaterThanOrEqual(2);
    });

    it('always renders all four ageing buckets, even with no fixtures of its own, never throws', async () => {
      await expect(service.ordersOverview()).resolves.toEqual(
        expect.objectContaining({
          ageing: [
            { label: '0-1 days', count: expect.any(Number) },
            { label: '2-3 days', count: expect.any(Number) },
            { label: '4-7 days', count: expect.any(Number) },
            { label: '8+ days', count: expect.any(Number) },
          ],
        }),
      );
    });
  });

  describe('ordersFulfilment', () => {
    async function makeTransition(orderId: string, from: string, to: string, at: Date) {
      return prisma.orderStatusEvent.create({
        data: { orderId, fromStatus: from as never, toStatus: to as never, createdAt: at },
      });
    }

    it('computes average and median hours for each status transition', async () => {
      const order = await makeOrder({ status: 'PROCESSING', placedAt: hoursAgo(10) });
      await makeTransition(order.id, 'PENDING', 'CONFIRMED', hoursAgo(8));
      await makeTransition(order.id, 'CONFIRMED', 'PROCESSING', hoursAgo(4));

      const result = await service.ordersFulfilment(365);

      const pendingToConfirmed = result.transitions.find((row) => row.from === 'PENDING' && row.to === 'CONFIRMED');
      // placedAt = -10h, event at -8h -> 2 hours in PENDING.
      expect(pendingToConfirmed?.avgHours).toBeCloseTo(2, 0);
      expect(pendingToConfirmed?.count).toBeGreaterThanOrEqual(1);

      const confirmedToProcessing = result.transitions.find(
        (row) => row.from === 'CONFIRMED' && row.to === 'PROCESSING',
      );
      // -8h -> -4h = 4 hours in CONFIRMED.
      expect(confirmedToProcessing?.avgHours).toBeCloseTo(4, 0);
    });

    it('orders transitions by pipeline position, not by row order', async () => {
      const order = await makeOrder({ status: 'SHIPPED', placedAt: hoursAgo(20) });
      await makeTransition(order.id, 'READY_TO_SHIP', 'SHIPPED', hoursAgo(2));
      await makeTransition(order.id, 'PENDING', 'CONFIRMED', hoursAgo(18));
      await makeTransition(order.id, 'CONFIRMED', 'PROCESSING', hoursAgo(14));
      await makeTransition(order.id, 'PROCESSING', 'READY_TO_SHIP', hoursAgo(6));

      const result = await service.ordersFulfilment(365);

      const relevant = result.transitions.filter((row) =>
        ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY_TO_SHIP'].includes(row.from),
      );
      const froms = relevant.map((row) => row.from);
      const pipelineIndex = (status: string) =>
        ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED'].indexOf(status);
      expect(froms).toEqual([...froms].sort((a, b) => pipelineIndex(a) - pipelineIndex(b)));
    });

    it('returns a well-shaped transitions array on a short window with no fixtures of its own, never throws', async () => {
      await expect(service.ordersFulfilment(1)).resolves.toEqual(
        expect.objectContaining({ transitions: expect.any(Array) }),
      );
    });
  });
});
