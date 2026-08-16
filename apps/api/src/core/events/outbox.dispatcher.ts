import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from './event-bus.service';

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 2_000;

/**
 * Drains the outbox: claims pending events, hands them to subscribers, and
 * retries failures with exponential backoff up to MAX_ATTEMPTS.
 *
 * Claiming uses `SELECT … FOR UPDATE SKIP LOCKED`, so running several API
 * instances is safe — each one takes a different batch instead of double
 * dispatching.
 */
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  @Interval(POLL_INTERVAL_MS)
  async drain(): Promise<void> {
    // A slow batch must not stack up behind the timer.
    if (this.running) return;
    this.running = true;
    try {
      await this.processBatch();
    } catch (error) {
      this.logger.error(`outbox drain failed: ${describe(error)}`);
    } finally {
      this.running = false;
    }
  }

  async processBatch(): Promise<number> {
    const claimed = await this.claim();
    if (claimed.length === 0) return 0;

    for (const event of claimed) {
      await this.deliver(event.id, event.name, event.payload, event.attempts);
    }
    return claimed.length;
  }

  private async claim(): Promise<
    Array<{ id: string; name: string; payload: unknown; attempts: number }>
  > {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "OutboxEvent"
        WHERE "status" = 'PENDING' AND "availableAt" <= NOW()
        ORDER BY "createdAt" ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;

      if (rows.length === 0) return [];

      const ids = rows.map((row) => row.id);
      await tx.outboxEvent.updateMany({
        where: { id: { in: ids } },
        data: { status: 'PROCESSING' },
      });

      return tx.outboxEvent.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, payload: true, attempts: true },
      });
    });
  }

  private async deliver(
    id: string,
    name: string,
    payload: unknown,
    attempts: number,
  ): Promise<void> {
    try {
      await this.eventBus.dispatch(name, payload);
      await this.prisma.outboxEvent.update({
        where: { id },
        data: { status: 'DONE', processedAt: new Date(), lastError: null },
      });
    } catch (error) {
      const nextAttempt = attempts + 1;
      const giveUp = nextAttempt >= MAX_ATTEMPTS;
      // 2s, 4s, 8s, … capped at 5 minutes.
      const backoffMs = Math.min(2 ** nextAttempt * 1_000, 300_000);

      await this.prisma.outboxEvent.update({
        where: { id },
        data: {
          status: giveUp ? 'FAILED' : 'PENDING',
          attempts: nextAttempt,
          lastError: describe(error).slice(0, 1000),
          availableAt: new Date(Date.now() + backoffMs),
        },
      });

      const message = `event ${name} (${id}) failed on attempt ${nextAttempt}: ${describe(error)}`;
      if (giveUp) {
        this.logger.error(`${message} — giving up, marked FAILED`);
      } else {
        this.logger.warn(message);
      }
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
