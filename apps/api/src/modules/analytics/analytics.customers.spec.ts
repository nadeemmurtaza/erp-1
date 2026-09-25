import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { AnalyticsService } from './analytics.service';
import { MetricRegistryService } from '../../core/metrics/metric-registry.service';

/**
 * WO-D.5 (10-admin-dashboard.md Track D) — covers only `customersOverview()`,
 * `customersRetention()` and `customersTop()`. Real PrismaService +
 * SettingsService against the seeded test database, same idiom as the rest
 * of Track D's spec files.
 */
describe('AnalyticsService — WO-D.5 customers overview/retention/top', () => {
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
    await prisma.contact.deleteMany({ where: { name: { startsWith: 'd5-spec ' } } });
  });

  let seq = 0;
  function uid(): string {
    seq += 1;
    return `d5-spec-${Date.now()}-${seq}`;
  }

  async function makeContact(opts: {
    city?: string;
    source?: string;
    status?: 'LEAD' | 'ACTIVE' | 'REPEAT' | 'DORMANT' | 'BLOCKED';
    orderCount?: number;
    lifetimeValue?: number;
    avgOrderValue?: number;
    lastOrderAt?: Date;
    createdAt?: Date;
  }) {
    return prisma.contact.create({
      data: {
        name: `d5-spec ${uid()}`,
        phoneE164: `+9230${Math.floor(Math.random() * 100000000)}`,
        city: opts.city,
        source: opts.source ?? 'storefront',
        status: opts.status ?? 'LEAD',
        orderCount: opts.orderCount ?? 0,
        lifetimeValue: opts.lifetimeValue ?? 0,
        avgOrderValue: opts.avgOrderValue ?? 0,
        lastOrderAt: opts.lastOrderAt,
        createdAt: opts.createdAt ?? new Date(),
      },
    });
  }

  describe('customersOverview', () => {
    it('counts total/repeat/newThisMonth the same way summary() does', async () => {
      const before = await service.customersOverview();

      await makeContact({ orderCount: 0 });
      await makeContact({ orderCount: 2 }); // repeat
      await makeContact({ orderCount: 5 }); // repeat

      const after = await service.customersOverview();
      expect(after.totals.total - before.totals.total).toBe(3);
      expect(after.totals.repeat - before.totals.repeat).toBe(2);
      expect(after.totals.newThisMonth - before.totals.newThisMonth).toBe(3);
    });

    it('groups by city (Unknown when null), source and status', async () => {
      await makeContact({ city: 'd5-spec-Lahore', source: 'd5-spec-whatsapp', status: 'ACTIVE' });
      await makeContact({ city: 'd5-spec-Lahore', source: 'd5-spec-whatsapp', status: 'ACTIVE' });
      await makeContact({ city: undefined, source: 'd5-spec-walk_in', status: 'DORMANT' });

      const result = await service.customersOverview();

      const lahore = result.byCity.find((row) => row.city === 'd5-spec-Lahore');
      expect(lahore?.count).toBe(2);

      const whatsapp = result.bySource.find((row) => row.source === 'd5-spec-whatsapp');
      expect(whatsapp?.count).toBe(2);

      const dormant = result.byStatus.find((row) => row.status === 'DORMANT');
      expect(dormant?.count).toBeGreaterThanOrEqual(1);

      const unknown = result.byCity.find((row) => row.city === 'Unknown');
      expect(unknown).toBeDefined();
    });
  });

  describe('customersRetention', () => {
    function monthsAgo(n: number): Date {
      const date = new Date();
      date.setDate(1); // avoid month-length overflow when subtracting months
      date.setMonth(date.getMonth() - n);
      date.setHours(12, 0, 0, 0);
      return date;
    }

    it('buckets contacts into signup-month cohorts, counting orderCount >= 2 as retained', async () => {
      const cohortMonth = monthsAgo(1);
      await makeContact({ createdAt: cohortMonth, orderCount: 1 });
      await makeContact({ createdAt: cohortMonth, orderCount: 3 }); // retained

      const result = await service.customersRetention();
      const cohortKey = `${cohortMonth.getFullYear()}-${String(cohortMonth.getMonth() + 1).padStart(2, '0')}`;
      const cohort = result.cohorts.find((row) => row.cohort === cohortKey);

      expect(cohort).toBeDefined();
      expect(cohort!.size).toBeGreaterThanOrEqual(2);
      expect(cohort!.retained).toBeGreaterThanOrEqual(1);
    });

    it('excludes a cohort older than the 24-month window', async () => {
      const ancient = monthsAgo(30);
      await makeContact({ createdAt: ancient, orderCount: 1 });

      const result = await service.customersRetention();
      const cohortKey = `${ancient.getFullYear()}-${String(ancient.getMonth() + 1).padStart(2, '0')}`;
      expect(result.cohorts.find((row) => row.cohort === cohortKey)).toBeUndefined();
    });

    it('computes repeatRateBps as an unwindowed ratio, matching the overview totals', async () => {
      await makeContact({ orderCount: 0 });
      await makeContact({ orderCount: 2 });

      const retention = await service.customersRetention();
      const overview = await service.customersOverview();

      const expectedBps = Math.round((overview.totals.repeat / overview.totals.total) * 10_000);
      expect(retention.repeatRateBps).toBe(expectedBps);
    });
  });

  describe('customersTop', () => {
    it('ranks by lifetimeValue descending, excluding contacts with none', async () => {
      const big = await makeContact({ lifetimeValue: 50_000, avgOrderValue: 25_000, orderCount: 2 });
      const small = await makeContact({ lifetimeValue: 5_000, avgOrderValue: 5_000, orderCount: 1 });
      const lead = await makeContact({ lifetimeValue: 0, orderCount: 0 });

      const result = await service.customersTop();
      const bigIndex = result.rows.findIndex((row) => row.contactId === big.id);
      const smallIndex = result.rows.findIndex((row) => row.contactId === small.id);

      expect(bigIndex).toBeGreaterThanOrEqual(0);
      expect(smallIndex).toBeGreaterThan(bigIndex);
      expect(result.rows.find((row) => row.contactId === lead.id)).toBeUndefined();
    });

    it('renders a well-shaped, non-throwing response with no fixtures of its own', async () => {
      await expect(service.customersTop()).resolves.toEqual(expect.objectContaining({ rows: expect.any(Array) }));
    });
  });
});
