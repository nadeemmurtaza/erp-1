import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../core/prisma/prisma.service';

/**
 * WO-8.4 — nightly RFM (recency/frequency/monetary) scoring, quintile-ranked
 * (1-5) among contacts with at least one order. A single NTILE(5) query
 * over Contact's own already-rolled-up columns (orderCount/lifetimeValue/
 * lastOrderAt — order.subscriber.ts's own rollup, not a fresh aggregation),
 * so this scales the same way that rollup already does at 100k+ contacts.
 *
 * "Lapsing good customers" (the doc's own flagship segment) is exactly
 * `rfmRecencyScore <= 2 AND rfmMonetaryScore >= 4` — no AI, the highest-
 * earning list most stores never build.
 */
@Injectable()
export class RfmScoringCron {
  private readonly logger = new Logger(RfmScoringCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<void> {
    const result = await this.prisma.$executeRaw`
      UPDATE "Contact" c
      SET
        "rfmRecencyScore" = r.recency_score,
        "rfmFrequencyScore" = r.frequency_score,
        "rfmMonetaryScore" = r.monetary_score,
        "rfmComputedAt" = now()
      FROM (
        SELECT
          id,
          NTILE(5) OVER (ORDER BY "lastOrderAt" ASC NULLS FIRST) AS recency_score,
          NTILE(5) OVER (ORDER BY "orderCount" ASC) AS frequency_score,
          NTILE(5) OVER (ORDER BY "lifetimeValue" ASC) AS monetary_score
        FROM "Contact"
        WHERE "orderCount" > 0
      ) r
      WHERE c.id = r.id;
    `;
    if (result > 0) {
      this.logger.log(`RFM scoring: recomputed ${result} contact(s)`);
    }
  }
}
