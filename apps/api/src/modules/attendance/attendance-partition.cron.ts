import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';

const MONTHS_AHEAD = 6;

/**
 * attendance-workforce/22-attendance-shifts-leave.md — keeps `AttendanceEvent`
 * (PARTITION BY RANGE `occurredAt`, migration 20260926100000) supplied with a
 * real monthly partition several months ahead of time, the same "one cron
 * per module" idiom every other nightly sweep in this codebase uses
 * (`purchasing.cron.ts`, `cod-risk.cron.ts`, `dunning.cron.ts`).
 *
 * This is housekeeping, not correctness: the migration's own
 * `AttendanceEvent_default` partition is the actual safety net that keeps
 * "a punch is never refused" true even if this cron never ran again — every
 * row this job ever needs to route into a real partition is still routed
 * somewhere, just less efficiently, until the real one exists.
 *
 * Table and range bounds below are built entirely from `Date` arithmetic,
 * never from request input, so `$executeRawUnsafe` here carries no
 * injection risk — `CREATE TABLE IF NOT EXISTS ... PARTITION OF` has no
 * parameterised form in Prisma's query API.
 */
@Injectable()
export class AttendancePartitionCron {
  private readonly logger = new Logger(AttendancePartitionCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 5 1 * *')
  async ensureFuturePartitions(): Promise<void> {
    const now = new Date();
    const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    for (let i = 0; i < MONTHS_AHEAD; i++) {
      const monthStart = new Date(Date.UTC(thisMonthStart.getUTCFullYear(), thisMonthStart.getUTCMonth() + i, 1));
      await this.ensurePartitionFor(monthStart);
    }
  }

  private async ensurePartitionFor(monthStart: Date): Promise<void> {
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
    const partitionName = `AttendanceEvent_${monthStart.getUTCFullYear()}_${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`;
    const fromLiteral = monthStart.toISOString().slice(0, 10);
    const toLiteral = monthEnd.toISOString().slice(0, 10);

    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "${partitionName}" PARTITION OF "AttendanceEvent" FOR VALUES FROM ('${fromLiteral}') TO ('${toLiteral}')`,
      );
    } catch (error) {
      this.logger.error(`Could not ensure partition ${partitionName}: ${error instanceof Error ? error.message : error}`);
    }
  }
}
