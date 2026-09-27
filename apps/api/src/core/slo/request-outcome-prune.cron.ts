import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TRAILING_WINDOW_DAYS } from './slo-paths';

/** A few days past the 30-day window every SLO computation reads, so a slow report or a clock skew never reads a row this cron already deleted mid-query. */
const RETENTION_DAYS = TRAILING_WINDOW_DAYS + 5;

/**
 * `RequestOutcome` is an operational log, not a business record — it has no
 * retention requirement beyond "long enough to compute the trailing-30-day
 * budget," so it is pruned nightly rather than kept forever (doc 38's own
 * "hundred-thousandth row" lens: this table grows with request volume,
 * unlike a `JournalLine` or an `Order`, which never get a cron like this).
 */
@Injectable()
export class RequestOutcomePruneCron {
  private readonly logger = new Logger(RequestOutcomePruneCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('30 3 * * *')
  async prune(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.requestOutcome.deleteMany({ where: { occurredAt: { lt: cutoff } } });
    if (count > 0) this.logger.log(`pruned ${count} RequestOutcome row(s) older than ${RETENTION_DAYS} days`);
  }
}
