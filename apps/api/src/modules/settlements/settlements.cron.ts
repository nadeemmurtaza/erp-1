import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SettlementsService } from './settlements.service';

/**
 * 49-financial-institution-settlement-partnerships.md WO-49.3 — the polling
 * fallback for an institution with no webhook. Hourly, not tied to any
 * institution's own settlement cadence (typically daily) — a missed or
 * repeated tick is harmless, since `reconcile()` only ever moves an
 * EXPECTED batch forward once.
 */
@Injectable()
export class SettlementsCron {
  private readonly logger = new Logger(SettlementsCron.name);

  constructor(private readonly settlements: SettlementsService) {}

  @Cron('0 * * * *')
  async run(): Promise<void> {
    const { reconciled, skipped } = await this.settlements.pollExpectedBatches();
    if (reconciled > 0 || skipped > 0) {
      this.logger.log(`Settlement polling: ${reconciled} batch(es) reconciled, ${skipped} skipped (no connector or not yet due)`);
    }
  }
}
