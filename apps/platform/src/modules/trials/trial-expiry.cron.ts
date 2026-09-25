import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { PlatformNotificationsService } from '../../core/notifications/notifications.service';
import { TrialsService } from './trials.service';

/**
 * WO-51.3 — TRIAL -> SUSPENDED on `trialExpiresAt`, plus an advance
 * warning. Runs daily, which is what makes a same-day, no-re-window
 * membership check ("trialExpiresAt lands within [today+N, today+N+1)")
 * enough to send each trial's warning exactly once, with no extra
 * "warned" column: a trial only ever occupies that day-wide bucket for
 * one day of cron runs.
 */
@Injectable()
export class TrialExpiryCron {
  private readonly logger = new Logger(TrialExpiryCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly notifications: PlatformNotificationsService,
    private readonly trials: TrialsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async run(): Promise<void> {
    await this.warnExpiringSoon();
    await this.expireLapsed();
  }

  private async warnExpiringSoon(): Promise<void> {
    const warningDays = this.config.get('PLATFORM_TRIAL_EXPIRY_WARNING_DAYS');
    const dayMs = 24 * 60 * 60 * 1000;
    const windowStart = new Date(Date.now() + warningDays * dayMs);
    const windowEnd = new Date(Date.now() + (warningDays + 1) * dayMs);

    const expiringSoon = await this.prisma.platformTenant.findMany({
      where: { status: 'TRIAL', trialExpiresAt: { gte: windowStart, lt: windowEnd } },
      take: 500,
    });
    if (expiringSoon.length === 0) return;

    await this.notifyBatch(
      expiringSoon,
      (tenant) => `Your trial for "${tenant.legalName}" expires in ${warningDays} days.`,
      `${expiringSoon.length} trial(s) expiring in ${warningDays} days`,
    );
  }

  private async expireLapsed(): Promise<void> {
    const lapsed = await this.prisma.platformTenant.findMany({
      where: { status: 'TRIAL', trialExpiresAt: { lte: new Date() } },
      take: 500, // doc 39's own "hundred-thousandth row" — bounded batches, never an unbounded sweep
    });
    if (lapsed.length === 0) return;

    for (const tenant of lapsed) {
      await this.trials.expireToSuspended(tenant.id);
    }
    this.logger.log(`Expired ${lapsed.length} lapsed trial(s) to SUSPENDED`);

    await this.notifyBatch(
      lapsed,
      (tenant) => `Your trial for "${tenant.legalName}" has ended. Your data is retained — convert any time to pick up where you left off.`,
      `${lapsed.length} trial(s) expired unconverted`,
    );
  }

  /**
   * Doc 39/51's own "audience is a capability, not an address": one
   * notice per affected tenant (its own signup email, a 1:1 audience),
   * and — past `PLATFORM_TRIAL_DIGEST_THRESHOLD` — ONE digest to the
   * sales-pipeline audience instead of one ping per trial.
   */
  private async notifyBatch(
    tenants: { id: string; legalName: string; billingContactEmail: string | null }[],
    perTenantMessage: (tenant: { legalName: string }) => string,
    digestSubject: string,
  ): Promise<void> {
    for (const tenant of tenants) {
      await this.notifications.send(tenant.billingContactEmail, digestSubject, perTenantMessage(tenant));
    }

    const threshold = this.config.get('PLATFORM_TRIAL_DIGEST_THRESHOLD');
    if (tenants.length >= threshold) {
      const lines = tenants.map((t) => `${t.legalName} (${t.id})`);
      await this.notifications.send(this.config.get('PLATFORM_OPS_ALERT_EMAIL'), digestSubject, lines.join('\n'));
    }
  }
}
