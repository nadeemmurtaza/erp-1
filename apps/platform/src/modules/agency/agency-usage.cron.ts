import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AgencyUsageService } from './agency-usage.service';

/**
 * WO-14.2's own sweep — same shape as `inventory.cron.ts` and
 * `UsageMeteringCron`'s daily snapshot: iterate every covered tenant,
 * capture one tenant's failure without aborting the run for the rest
 * ("four hours down" — a tenant whose database is briefly unreachable is
 * skipped for tonight and picked up the following night, never failing
 * every other tenant's snapshot in the same sweep).
 */
@Injectable()
export class AgencyUsageCron {
  private readonly logger = new Logger(AgencyUsageCron.name);

  constructor(private readonly usage: AgencyUsageService) {}

  @Cron('0 0 2 * * *')
  async run(): Promise<void> {
    const tenantIds = await this.usage.listRegisteredTenantIds();
    let captured = 0;

    for (const tenantId of tenantIds) {
      try {
        await this.usage.captureSnapshotForTenant(tenantId);
        captured++;
      } catch (error) {
        this.logger.error(`Usage snapshot failed for tenant ${tenantId} — ${error instanceof Error ? error.message : error}`);
      }
    }

    if (tenantIds.length > 0) {
      this.logger.log(`Agency usage snapshot sweep: ${captured}/${tenantIds.length} tenant(s) captured`);
    }
  }
}
