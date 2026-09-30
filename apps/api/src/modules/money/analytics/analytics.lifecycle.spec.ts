import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { AnalyticsService } from './analytics.service';
import { MetricRegistryService } from '../../../core/metrics/metric-registry.service';

/**
 * WO-69.1 (69-order-lifecycle-status-dashboard.md) — `orderLifecycleBreakdown()`.
 * Real PrismaService/SettingsService against the seeded test database, same
 * idiom as `analytics.orders.spec.ts`.
 */
describe('AnalyticsService.orderLifecycleBreakdown — WO-69.1', () => {
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
    await prisma.order.deleteMany({ where: { number: { startsWith: 'wo69-spec-' } } });
  });

  afterAll(async () => {
    await prisma.location.deleteMany({ where: { code: { startsWith: 'wo69-loc-' } } });
  });

  let seq = 0;
  function uid(): string {
    seq += 1;
    return `wo69-spec-${Date.now()}-${seq}`;
  }

  async function makeOrder(status: 'PENDING' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED', locationId?: string) {
    return prisma.order.create({
      data: {
        number: uid(),
        status,
        shippingAddress: {},
        itemsSubtotal: 100_00,
        grandTotal: 100_00,
        placedAt: new Date(),
        channel: 'WEB',
        locationId,
      },
    });
  }

  it('pending + completed + voided accounts for every order in scope', async () => {
    await makeOrder('PENDING');
    await makeOrder('CONFIRMED');
    await makeOrder('DELIVERED');
    await makeOrder('CANCELLED');
    await makeOrder('RETURNED');

    const result = await service.orderLifecycleBreakdown();
    const total = Object.values(result.counts).reduce((sum, n) => sum + n, 0);

    expect(result.pending + result.completed + result.voided).toBe(total);
    expect(result.pending).toBeGreaterThanOrEqual(2);
    expect(result.completed).toBeGreaterThanOrEqual(1);
    expect(result.voided).toBeGreaterThanOrEqual(2);
  });

  it('maps DELIVERED to completed and CANCELLED+RETURNED to voided, never mixed', async () => {
    await makeOrder('DELIVERED');
    await makeOrder('CANCELLED');
    await makeOrder('RETURNED');

    const result = await service.orderLifecycleBreakdown();

    expect(result.counts.DELIVERED).toBe(result.completed);
    expect(result.counts.CANCELLED + result.counts.RETURNED).toBe(result.voided);
  });

  it('exposes ready-made table rows, each carrying the exact status filter its own count represents', async () => {
    const result = await service.orderLifecycleBreakdown();

    const pendingRow = result.rows.find((r) => r.label === 'Pending')!;
    const completedRow = result.rows.find((r) => r.label === 'Completed')!;
    const voidedRow = result.rows.find((r) => r.label === 'Voided')!;

    expect(pendingRow.statusFilter).toBe('PENDING,CONFIRMED,PROCESSING,READY_TO_SHIP,SHIPPED');
    expect(completedRow.statusFilter).toBe('DELIVERED');
    expect(voidedRow.statusFilter).toBe('CANCELLED,RETURNED');
    expect(pendingRow.count).toBe(result.pending);
    expect(completedRow.count).toBe(result.completed);
    expect(voidedRow.count).toBe(result.voided);
  });

  it('scopes to locationId when given — never an implicit all-locations read for a scoped caller', async () => {
    const locationA = await prisma.location.create({ data: { name: 'wo69 A', code: `wo69-loc-a-${Date.now()}` } });
    const locationB = await prisma.location.create({ data: { name: 'wo69 B', code: `wo69-loc-b-${Date.now()}` } });

    await makeOrder('PENDING', locationA.id);
    await makeOrder('PENDING', locationB.id);

    const resultA = await service.orderLifecycleBreakdown(locationA.id);

    expect(resultA.pending).toBe(1);
  });
});
