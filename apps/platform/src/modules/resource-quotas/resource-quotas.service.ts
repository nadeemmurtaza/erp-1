import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { PlatformNotificationsService } from '../../core/notifications/notifications.service';
import type { ResourceTierQuota } from '../../core/prisma/client';
import type { UpsertQuotaDto } from './dto/upsert-quota.dto';

/**
 * WO-39.6 — resource quotas + alerting, application layer only. Doc 39's
 * own "Out of scope" excludes "which orchestrator enforces the resource
 * quotas" — this service never touches compute; it reads the SAME
 * `PlatformUsageRecord` rows doc 39 WO-39.1 already collects for billing,
 * compares the latest one per (tenant, metric) against that tenant's tier
 * quota, and writes a `ResourceQuotaAlert` BEFORE the hard cap
 * (`warnThresholdPct`, doc 39 §4's own "alerted before a hard limit").
 */
@Injectable()
export class ResourceQuotasService {
  private readonly logger = new Logger(ResourceQuotasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly notifications: PlatformNotificationsService,
  ) {}

  async upsertQuota(dto: UpsertQuotaDto): Promise<ResourceTierQuota> {
    return this.prisma.resourceTierQuota.upsert({
      where: { resourceTier_metric: { resourceTier: dto.resourceTier, metric: dto.metric } },
      create: { ...dto, warnThresholdPct: dto.warnThresholdPct ?? 80 },
      update: { limitValue: dto.limitValue, ...(dto.warnThresholdPct !== undefined ? { warnThresholdPct: dto.warnThresholdPct } : {}) },
    });
  }

  async listQuotas(): Promise<ResourceTierQuota[]> {
    return this.prisma.resourceTierQuota.findMany({ orderBy: [{ resourceTier: 'asc' }, { metric: 'asc' }] });
  }

  async listAlertsForTenant(tenantId: string) {
    return this.prisma.resourceQuotaAlert.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * One pass, no N+1: the "latest usage record per (tenant, metric)" read
   * is a single query (`distinct` on tenantId+metric, ordered by
   * windowStart desc) rather than one query per tenant — this table can
   * carry doc 39's own "hundred-thousandth row" volume, so a per-tenant
   * round trip here would be the wrong shape at scale even though today's
   * realistic tenant count (doc 39: "hundreds to low thousands") wouldn't
   * yet make it painful.
   */
  async checkAndAlert(): Promise<{ checked: number; alerted: number }> {
    const quotas = await this.prisma.resourceTierQuota.findMany();
    if (quotas.length === 0) return { checked: 0, alerted: 0 };

    const metrics = [...new Set(quotas.map((q) => q.metric))];
    const tenants = await this.prisma.platformTenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL', 'PROVISIONING'] } },
      select: { id: true, resourceTier: true, billingContactEmail: true, slug: true },
    });
    const tenantById = new Map(tenants.map((t) => [t.id, t]));

    const latestUsage = await this.prisma.platformUsageRecord.findMany({
      where: { metric: { in: metrics }, tenantId: { in: tenants.map((t) => t.id) } },
      orderBy: { windowStart: 'desc' },
      distinct: ['tenantId', 'metric'],
    });

    const quotaByTierMetric = new Map(quotas.map((q) => [`${q.resourceTier}:${q.metric}`, q]));

    const candidates: { tenantId: string; metric: string; windowStart: Date; observedValue: number; limitValue: number; thresholdPct: number }[] = [];
    for (const usage of latestUsage) {
      const tenant = tenantById.get(usage.tenantId);
      if (!tenant) continue;
      const quota = quotaByTierMetric.get(`${tenant.resourceTier}:${usage.metric}`);
      if (!quota) continue;
      const thresholdValue = quota.limitValue * (quota.warnThresholdPct / 100);
      if (usage.value < thresholdValue) continue;
      candidates.push({
        tenantId: usage.tenantId,
        metric: usage.metric,
        windowStart: usage.windowStart,
        observedValue: usage.value,
        limitValue: quota.limitValue,
        thresholdPct: quota.warnThresholdPct,
      });
    }

    if (candidates.length === 0) return { checked: latestUsage.length, alerted: 0 };

    const runStartedAt = new Date();
    // skipDuplicates makes a re-run for an already-alerted window a no-op —
    // this table's own "second copy of the write" answer (its
    // @@unique([tenantId, metric, windowStart])).
    await this.prisma.resourceQuotaAlert.createMany({ data: candidates, skipDuplicates: true });

    const newAlerts = await this.prisma.resourceQuotaAlert.findMany({
      where: {
        createdAt: { gte: runStartedAt },
        OR: candidates.map((c) => ({ tenantId: c.tenantId, metric: c.metric, windowStart: c.windowStart })),
      },
    });

    if (newAlerts.length > 0) {
      await this.notifyNewAlerts(newAlerts, tenantById);
    }

    this.logger.log(`Resource quota check: ${latestUsage.length} (tenant, metric) pairs checked, ${newAlerts.length} new alert(s)`);
    return { checked: latestUsage.length, alerted: newAlerts.length };
  }

  private async notifyNewAlerts(
    newAlerts: { tenantId: string; metric: string; observedValue: number; limitValue: number; thresholdPct: number }[],
    tenantById: Map<string, { billingContactEmail: string | null; slug: string }>,
  ): Promise<void> {
    // One notification per affected tenant (a 1:1 audience — the tenant
    // whose own resource usage crossed its own threshold), never a
    // hardcoded address: doc 39 §4's "notifies the tenant's own billing
    // contact, resolved from PlatformTenant."
    for (const alert of newAlerts) {
      const tenant = tenantById.get(alert.tenantId);
      await this.notifications.send(
        tenant?.billingContactEmail,
        `Resource usage approaching your plan's limit`,
        `Your "${alert.metric}" usage (${alert.observedValue}) has crossed ${alert.thresholdPct}% of your plan's limit (${alert.limitValue}).`,
      );
    }

    // ONE digest to hosting-ops for the whole run — doc 39's own "audience
    // is a capability... a two-hundred-holder [read] does a digest, never
    // two hundred pings" applied to noisy-neighbor alerting.
    const lines = newAlerts.map((a) => {
      const tenant = tenantById.get(a.tenantId);
      return `${tenant?.slug ?? a.tenantId}: ${a.metric} at ${a.observedValue}/${a.limitValue} (>=${a.thresholdPct}%)`;
    });
    await this.notifications.send(
      this.config.get('PLATFORM_OPS_ALERT_EMAIL'),
      `${newAlerts.length} tenant(s) crossed a resource quota threshold`,
      lines.join('\n'),
    );
  }
}
