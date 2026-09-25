import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UsageMeteringService } from './usage-metering.service';

/**
 * doc 153 §2/WO-153.2's own sweep. Two cadences, matching the two write
 * modes `UsageMeteringService` documents:
 *  - every 5 minutes: transaction-fee/messages-sent metering off each
 *    USAGE_BASED tenant's own outbox — near-real-time without hammering a
 *    tenant's database (a tighter cadence than `ResourceQuotaAlertCron`'s
 *    15 minutes, since a metering outage directly affects money, not just
 *    an early warning).
 *  - daily: the banded-allowance snapshot (products/seats) — count-at-rest
 *    dimensions that do not need near-real-time freshness.
 * "Four hours down" (doc 153's own scope lens): a tenant whose database is
 * briefly unreachable is skipped for that run and picked up on the next
 * one, never failing the whole sweep for every other tenant.
 */
@Injectable()
export class UsageMeteringCron {
  private readonly logger = new Logger(UsageMeteringCron.name);

  constructor(private readonly metering: UsageMeteringService) {}

  @Cron('0 */5 * * * *')
  async meterOutboxEvents(): Promise<void> {
    const tenantIds = await this.metering.listUsageBasedTenantIds();
    let scanned = 0;
    let metered = 0;
    let reversed = 0;

    for (const tenantId of tenantIds) {
      try {
        const result = await this.metering.pollTenant(tenantId);
        scanned += result.scanned;
        metered += result.metered;
        reversed += result.reversed;
      } catch (error) {
        this.logger.error(`Usage metering deferred for tenant ${tenantId} — ${error instanceof Error ? error.message : error}`);
      }
    }

    if (scanned > 0) {
      this.logger.log(`Usage metering sweep: ${tenantIds.length} tenant(s), ${scanned} event(s) scanned, ${metered} fee(s) metered, ${reversed} reversed`);
    }
  }

  @Cron('0 0 3 * * *')
  async snapshotAllowances(): Promise<void> {
    const tenantIds = await this.metering.listUsageBasedTenantIds();
    for (const tenantId of tenantIds) {
      try {
        await this.metering.snapshotAllowances(tenantId);
      } catch (error) {
        this.logger.error(`Allowance snapshot deferred for tenant ${tenantId} — ${error instanceof Error ? error.message : error}`);
      }
    }
  }
}
