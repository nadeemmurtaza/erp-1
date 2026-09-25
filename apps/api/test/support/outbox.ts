import type { OutboxDispatcher } from '../../src/core/events/outbox.dispatcher';
import type { PrismaService } from '../../src/core/prisma/prisma.service';

/**
 * Delivers the outbox until no event created since `since` is still pending
 * or mid-delivery. Take `since` at the top of the suite's `beforeAll`, before
 * anything publishes.
 *
 * One `processBatch()` is not enough in an e2e suite, for two reasons:
 *
 * - the app's own `@Interval` drain runs during the suite and claims with
 *   SKIP LOCKED, so the test's `processBatch()` can come back empty while its
 *   events are still being delivered by the timer;
 * - `OutboxDispatcher` never reclaims a stale claim, so an app closed with a
 *   batch in flight leaves those rows in PROCESSING for good. Counting only
 *   rows created since `since` keeps another suite's strays from blocking
 *   this one, and calling this before `app.close()` keeps a suite from
 *   leaving any of its own.
 */
export async function drainOutboxSince(
  prisma: PrismaService,
  outbox: OutboxDispatcher,
  since: Date,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await outbox.processBatch();
    const inFlight = await prisma.outboxEvent.count({
      where: {
        createdAt: { gte: since },
        OR: [{ status: 'PROCESSING' }, { status: 'PENDING', availableAt: { lte: new Date() } }],
      },
    });
    if (inFlight === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`The outbox did not drain the events created since ${since.toISOString()}.`);
}
