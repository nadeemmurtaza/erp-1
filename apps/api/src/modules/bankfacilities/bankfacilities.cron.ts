import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BankFacilitiesService } from './bankfacilities.service';

/**
 * 167-bank-facility-management.md WO-167.4 — first of each month, accruing
 * markup for every active facility's outstanding balance for the month
 * just closing. `postMonthlyMarkupAccruals()` is idempotent per
 * `(facilityId, periodStart)`, so a missed or repeated tick is harmless —
 * identical recovery posture to `AssetDepreciationCron`.
 */
@Injectable()
export class BankFacilitiesCron {
  private readonly logger = new Logger(BankFacilitiesCron.name);

  constructor(private readonly facilities: BankFacilitiesService) {}

  @Cron('0 2 1 * *')
  async run(): Promise<void> {
    const { posted, skipped } = await this.facilities.postMonthlyMarkupAccruals();
    this.logger.log(`Bank facility markup accrual: ${posted} facility(ies) posted, ${skipped} skipped (already posted or zero)`);
  }
}
