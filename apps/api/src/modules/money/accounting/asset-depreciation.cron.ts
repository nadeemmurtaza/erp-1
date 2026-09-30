import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AssetDepreciationService } from './asset-depreciation.service';

/**
 * 147-fixed-asset-depreciation.md WO-147.3 — first of each month, posting
 * every active schedule's depreciation for the month just closing.
 * `postMonthlyDepreciation()` is idempotent per `(scheduleId, monthKey)`, so
 * a missed or repeated tick is harmless — identical recovery posture to
 * `FinanceCron`/`LeaveAccrualCron`.
 */
@Injectable()
export class AssetDepreciationCron {
  private readonly logger = new Logger(AssetDepreciationCron.name);

  constructor(private readonly depreciation: AssetDepreciationService) {}

  @Cron('0 2 1 * *')
  async run(): Promise<void> {
    const { posted, skipped } = await this.depreciation.postMonthlyDepreciation();
    this.logger.log(`Asset depreciation: ${posted} schedule(s) posted, ${skipped} skipped (already posted or zero)`);
  }
}
