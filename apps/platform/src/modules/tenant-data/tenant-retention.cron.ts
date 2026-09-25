import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TenantRetentionService } from './tenant-retention.service';

/** WO-39.7 — once a day is enough: retention windows are measured in days
 *  (PLATFORM_RETENTION_DAYS_DEFAULT/TRIAL), never minutes. */
@Injectable()
export class TenantRetentionCron {
  private readonly logger = new Logger(TenantRetentionCron.name);

  constructor(private readonly retention: TenantRetentionService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<void> {
    const { deleted, skippedNoExport } = await this.retention.run();
    if (deleted > 0 || skippedNoExport > 0) {
      this.logger.log(`Retention sweep: tore down ${deleted}, skipped ${skippedNoExport} (no completed export yet)`);
    }
  }
}
