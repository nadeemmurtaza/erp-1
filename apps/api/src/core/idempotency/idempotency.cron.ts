import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const COMPLETED_KEY_TTL_DAYS = 7;
/** An IN_PROGRESS row past this age means its own request handler crashed without reaching the catch block that would have deleted it — never a row still being legitimately worked on. */
const STUCK_IN_PROGRESS_MINUTES = 60;

/**
 * architecture-patterns/157-client-request-idempotency-keys.md (WO-157.4).
 * A completed key's own `responseBody` duplicates data that already lives
 * in the row it created (the `Order`, the `Sale`), so it needs to live only
 * as long as a client might realistically retry — comfortably longer than
 * any offline-sync window (doc 48) or client retry backoff, never
 * indefinitely.
 */
@Injectable()
export class IdempotencyCron {
  private readonly logger = new Logger(IdempotencyCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 3 * * *')
  async purgeExpiredIdempotencyKeys(): Promise<void> {
    const cutoff = new Date(Date.now() - COMPLETED_KEY_TTL_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.idempotencyKey.deleteMany({
      where: { createdAt: { lt: cutoff }, status: 'COMPLETED' },
    });
    if (count > 0) this.logger.log(`Purged ${count} expired idempotency key(s)`);
  }

  /**
   * A narrower sweep than the nightly purge above — reaps only rows stuck
   * `IN_PROGRESS` well past any real request's own duration, so a crashed
   * handler does not permanently block retries under the same key. A
   * `COMPLETED` row is never touched here; it still has a real cached
   * response worth serving for the full 7 days.
   */
  @Cron('*/5 * * * *')
  async reapStuckInProgressKeys(): Promise<void> {
    const cutoff = new Date(Date.now() - STUCK_IN_PROGRESS_MINUTES * 60 * 1000);
    const { count } = await this.prisma.idempotencyKey.deleteMany({
      where: { createdAt: { lt: cutoff }, status: 'IN_PROGRESS' },
    });
    if (count > 0) this.logger.warn(`Reaped ${count} idempotency key(s) stuck IN_PROGRESS past ${STUCK_IN_PROGRESS_MINUTES} minutes`);
  }
}
