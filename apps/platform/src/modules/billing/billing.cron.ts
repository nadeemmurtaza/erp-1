import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillingService } from './billing.service';

/** WO-50.3's own scheduled run — calendar-month billing periods. Running
 *  daily (rather than only on the 1st) is deliberate: `issueInvoiceForPeriod`
 *  is idempotent per (tenant, period), so a tenant deferred by a seat-count
 *  failure on the 1st gets picked up automatically on a later day instead
 *  of waiting a full month for the next scheduled attempt. */
@Injectable()
export class BillingCron {
  private readonly logger = new Logger(BillingCron.name);

  constructor(private readonly billing: BillingService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async run(): Promise<void> {
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const { issued, skipped } = await this.billing.runBillingForPeriod(periodStart, periodEnd);
    if (issued > 0 || skipped > 0) this.logger.log(`Billing sweep for ${periodStart.toISOString().slice(0, 7)}: issued ${issued}, skipped/deferred ${skipped}`);
  }
}
