import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuctionSettlementService } from './auction-settlement.service';

/**
 * Every 60 seconds (doc 234 §9, §12), lapses the wins that were not paid in time
 * and picks up the invoices that stalled. A minute is far finer than the
 * hours-long payment window it enforces, and far coarser than the 15 s lot
 * lifecycle: nothing here is a race against a person's next click.
 *
 * No leader lock: both operations are predicates on the status they read, so
 * two nodes running at once cost a wasted query, never a double strike. A run
 * still going when the next is due is skipped, not stacked.
 */
@Injectable()
export class AuctionSettlementCron {
  private readonly logger = new Logger(AuctionSettlementCron.name);
  private running = false;

  constructor(private readonly settlement: AuctionSettlementService) {}

  @Cron('0 * * * * *')
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const lapsed = await this.settlement.expireDue();
      const retried = await this.settlement.retryStalled();
      if (lapsed > 0 || retried > 0) {
        this.logger.log(`Auction settlement: ${lapsed} win(s) lapsed unpaid, ${retried} stalled invoice(s) retried`);
      }
    } catch (error) {
      this.logger.error(`Auction settlement run failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
