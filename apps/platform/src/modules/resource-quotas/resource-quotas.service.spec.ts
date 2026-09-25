import { Test, TestingModule } from '@nestjs/testing';
import { ResourceQuotasService } from './resource-quotas.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { PlatformNotificationsService } from '../../core/notifications/notifications.service';

describe('ResourceQuotasService', () => {
  let prisma: any;
  let notifications: any;
  let service: ResourceQuotasService;

  beforeEach(async () => {
    prisma = {
      resourceTierQuota: { findMany: jest.fn(), upsert: jest.fn() },
      platformTenant: { findMany: jest.fn() },
      platformUsageRecord: { findMany: jest.fn() },
      resourceQuotaAlert: { createMany: jest.fn(), findMany: jest.fn() },
    };
    notifications = { send: jest.fn() };
    const config = { get: (key: string) => (key === 'PLATFORM_OPS_ALERT_EMAIL' ? 'ops@newax.test' : undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceQuotasService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: config },
        { provide: PlatformNotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(ResourceQuotasService);
  });

  it('does nothing when no quotas are configured', async () => {
    prisma.resourceTierQuota.findMany.mockResolvedValue([]);

    const result = await service.checkAndAlert();

    expect(result).toEqual({ checked: 0, alerted: 0 });
    expect(prisma.platformTenant.findMany).not.toHaveBeenCalled();
  });

  it('alerts a tenant whose usage crosses the warn threshold, and skips one below it', async () => {
    prisma.resourceTierQuota.findMany.mockResolvedValue([
      { resourceTier: 'STANDARD', metric: 'orders.count', limitValue: 1000, warnThresholdPct: 80 },
    ]);
    prisma.platformTenant.findMany.mockResolvedValue([
      { id: 't-over', resourceTier: 'STANDARD', billingContactEmail: 'over@tenant.test', slug: 'over' },
      { id: 't-under', resourceTier: 'STANDARD', billingContactEmail: 'under@tenant.test', slug: 'under' },
    ]);
    const windowStart = new Date('2026-09-01T00:00:00Z');
    prisma.platformUsageRecord.findMany.mockResolvedValue([
      { tenantId: 't-over', metric: 'orders.count', windowStart, value: 900 },
      { tenantId: 't-under', metric: 'orders.count', windowStart, value: 500 },
    ]);
    prisma.resourceQuotaAlert.createMany.mockResolvedValue({ count: 1 });
    prisma.resourceQuotaAlert.findMany.mockResolvedValue([
      { tenantId: 't-over', metric: 'orders.count', windowStart, observedValue: 900, limitValue: 1000, thresholdPct: 80 },
    ]);

    const result = await service.checkAndAlert();

    expect(result.alerted).toBe(1);
    expect(prisma.resourceQuotaAlert.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ tenantId: 't-over', metric: 'orders.count', observedValue: 900, limitValue: 1000, thresholdPct: 80 }),
      ],
      skipDuplicates: true,
    });
    // per-tenant notice
    expect(notifications.send).toHaveBeenCalledWith('over@tenant.test', expect.any(String), expect.any(String));
    expect(notifications.send).not.toHaveBeenCalledWith('under@tenant.test', expect.any(String), expect.any(String));
    // one ops digest, not one per alert
    expect(notifications.send).toHaveBeenCalledWith('ops@newax.test', expect.stringContaining('1 tenant(s)'), expect.any(String));
    expect(notifications.send).toHaveBeenCalledTimes(2);
  });

  it('is idempotent: a re-run over an already-alerted window sends no new notification', async () => {
    prisma.resourceTierQuota.findMany.mockResolvedValue([
      { resourceTier: 'STANDARD', metric: 'orders.count', limitValue: 1000, warnThresholdPct: 80 },
    ]);
    prisma.platformTenant.findMany.mockResolvedValue([{ id: 't-over', resourceTier: 'STANDARD', billingContactEmail: 'a@b.test', slug: 'over' }]);
    prisma.platformUsageRecord.findMany.mockResolvedValue([
      { tenantId: 't-over', metric: 'orders.count', windowStart: new Date(), value: 900 },
    ]);
    prisma.resourceQuotaAlert.createMany.mockResolvedValue({ count: 0 });
    prisma.resourceQuotaAlert.findMany.mockResolvedValue([]); // skipDuplicates meant nothing new was created

    const result = await service.checkAndAlert();

    expect(result.alerted).toBe(0);
    expect(notifications.send).not.toHaveBeenCalled();
  });

  describe('upsertQuota', () => {
    it('upserts on the (resourceTier, metric) unique key', async () => {
      prisma.resourceTierQuota.upsert.mockResolvedValue({ id: 'q1' });

      await service.upsertQuota({ resourceTier: 'STANDARD', metric: 'orders.count', limitValue: 1000 });

      expect(prisma.resourceTierQuota.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { resourceTier_metric: { resourceTier: 'STANDARD', metric: 'orders.count' } },
        }),
      );
    });
  });
});
