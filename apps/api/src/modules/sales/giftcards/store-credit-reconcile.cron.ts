import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StoreCreditService } from './store-credit.service';

/**
 * Nightly integrity check for the `User.storeCreditBalance` cache (WO-5.5's
 * own "if you cache it, add a reconciliation check" note) — StoreCreditTransaction
 * is the source of truth; this just proves the cache still agrees with it.
 */
@Injectable()
export class StoreCreditReconcileCron {
  private readonly logger = new Logger(StoreCreditReconcileCron.name);

  constructor(private readonly storeCredit: StoreCreditService) {}

  @Cron('0 3 * * *')
  async reconcile(): Promise<void> {
    const { checked, corrected } = await this.storeCredit.reconcile();
    if (corrected > 0) {
      this.logger.warn(`Store credit reconciliation: ${corrected} of ${checked} balance(s) corrected.`);
    } else {
      this.logger.log(`Store credit reconciliation: ${checked} balance(s) checked, all correct.`);
    }
  }
}
