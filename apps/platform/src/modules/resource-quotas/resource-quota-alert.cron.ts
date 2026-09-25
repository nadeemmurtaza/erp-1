import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ResourceQuotasService } from './resource-quotas.service';

/** WO-39.6 — runs frequently enough to alert meaningfully "before a hard
 *  cap" without hammering the usage-record table; every 15 minutes matches
 *  the metering granularity `PlatformUsageRecord.windowStart` already
 *  assumes elsewhere in this app. */
@Injectable()
export class ResourceQuotaAlertCron {
  private readonly logger = new Logger(ResourceQuotaAlertCron.name);

  constructor(private readonly quotas: ResourceQuotasService) {}

  @Cron('0 */15 * * * *')
  async run(): Promise<void> {
    const { checked, alerted } = await this.quotas.checkAndAlert();
    if (alerted > 0) this.logger.log(`Resource quota sweep: checked ${checked}, alerted ${alerted}`);
  }
}
