import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuctionLifecycleService } from './auction-lifecycle.service';

/**
 * Opens and closes auctions every 15 seconds (doc 234 §6, §12). The tick
 * never decides whether a bid is accepted: `placeBid()` compares the lot's end
 * itself, so a lot past its end refuses bids before this job has closed it.
 * What fifteen seconds sets is how soon a result appears and how late a lot is
 * found when the API was down (`OUTAGE_GRACE_MS` is four ticks).
 *
 * No leader lock: every run is idempotent by predicate, so two nodes running
 * at once cost a wasted query, never a double close. A run still going when
 * the next is due is skipped, not stacked, so a slow database sheds load
 * instead of piling it on.
 */
@Injectable()
export class AuctionLifecycleCron {
  private readonly logger = new Logger(AuctionLifecycleCron.name);
  private running = false;

  constructor(private readonly lifecycle: AuctionLifecycleService) {}

  @Cron('*/15 * * * * *')
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const opened = await this.lifecycle.openDue();
      const { closed, extended } = await this.lifecycle.closeDue();
      if (opened > 0 || closed > 0 || extended > 0) {
        this.logger.log(`Auction lifecycle: ${opened} opened, ${closed} lot(s) closed, ${extended} lot(s) extended after an outage`);
      }
    } catch (error) {
      this.logger.error(`Auction lifecycle run failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
