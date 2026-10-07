import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../../../core/audit/audit.service';
import { DomainEvent } from '../../../core/events/domain-events';
import { EventBusService } from '../../../core/events/event-bus.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuctionPublicService } from './auction-public.service';
import { AuctionRealtimeService } from './auction-realtime.service';
import { lotOutcome } from './bidding';

/** The same lock `AuctionService` takes to serialise every writer of one lot (key: the lot id). */
const BID_LOT_LOCK_NAMESPACE = 8_241_171;

/**
 * How late a lot may be found before the delay is treated as an outage, in
 * milliseconds. The close job runs every 15 s, so a healthy lot is closed
 * within about that of its end; 60 s is four missed runs in a row. Past it the
 * likelier story is that the API was down, and bidders who could not bid
 * during the gap are owed a chance (doc 234 §16.10) rather than a lot that
 * closed the moment the system came back. Under 60 s the lot simply closes: a
 * slow tick is not an outage.
 */
export const OUTAGE_GRACE_MS = 60_000;

/**
 * How long a lot found past `OUTAGE_GRACE_MS` is given, counted from the
 * moment of recovery. Two minutes is the anti-snipe extension too: long
 * enough for a bidder to see the lot is open again and answer, short enough
 * that a lot does not hang on. It is not counted against the anti-snipe cap,
 * which bounds a bidding war, not an outage.
 */
export const OUTAGE_EXTENSION_MS = 120_000;

/**
 * Auctions or lots handled in one run. A run is every 15 s, so 100 is 400 a
 * minute, far above any realistic schedule; what is left waits for the next
 * run, so a backlog after an outage drains and never blocks one.
 */
const BATCH_SIZE = 100;

export type CloseOutcome = 'closed' | 'extended' | 'skipped';

interface CloseRow {
  id: string;
  auctionId: string;
  lotNo: number;
  auctionNumber: string;
  lotStatus: string;
  auctionStatus: string;
  currentBidMinor: bigint | null;
  reservePriceMinor: bigint | null;
  leaderBidderId: string | null;
  bidSeq: number;
  endsAt: Date;
  now: Date;
}

/**
 * Opens and closes auctions on the clock (launchpad-apps/234-auction-app.md
 * §5.5, §6, §16.7 and §16.10).
 *
 * Both jobs are idempotent by predicate and safe on every node at once, with
 * no leader: a status is only ever moved from the one it was read as, under a
 * lock, so a second runner finds the work done and does nothing. Time is the
 * database's, as everywhere in this module.
 *
 * Failure mode: one auction or lot that fails is logged and left; the rest of
 * the batch carries on, and the next run tries it again. A run that never
 * happens (the API is down) leaves lots open past their end, and the next run
 * extends them rather than closing them (`OUTAGE_GRACE_MS`).
 */
@Injectable()
export class AuctionLifecycleService {
  private readonly logger = new Logger(AuctionLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
    private readonly publicLots: AuctionPublicService,
    private readonly realtime: AuctionRealtimeService,
  ) {}

  /** Opens every scheduled auction whose start has passed. Returns how many it opened. */
  async openDue(): Promise<number> {
    const due = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Auction"
      WHERE "status" = 'SCHEDULED' AND "startsAt" <= clock_timestamp()
      ORDER BY "startsAt", "id"
      LIMIT ${BATCH_SIZE}
    `;
    let opened = 0;
    for (const { id } of due) {
      try {
        if (await this.openAuction(id)) opened += 1;
      } catch (error) {
        this.logger.error(`Opening auction ${id} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return opened;
  }

  /** Closes every open lot whose end has passed, extending those found long overdue. Returns what it did. */
  async closeDue(): Promise<{ closed: number; extended: number }> {
    const due = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT l."id"
      FROM "AuctionLot" l
      JOIN "Auction" a ON a."id" = l."auctionId"
      WHERE a."status" = 'OPEN' AND l."status" = 'OPEN'
        AND COALESCE(l."endsAt", a."endsAt") <= clock_timestamp()
      ORDER BY COALESCE(l."endsAt", a."endsAt"), l."id"
      LIMIT ${BATCH_SIZE}
    `;
    const done = { closed: 0, extended: 0 };
    for (const { id } of due) {
      try {
        const outcome = await this.closeLot(id);
        if (outcome === 'closed') done.closed += 1;
        if (outcome === 'extended') done.extended += 1;
      } catch (error) {
        this.logger.error(`Closing lot ${id} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return done;
  }

  /**
   * SCHEDULED → OPEN, with the auction's lots still on sale going PENDING →
   * OPEN with it. Under the auction's row lock, re-checking the status and the
   * start, so an auction edited or unscheduled a moment ago is not opened and
   * a repeat is a no-op.
   */
  private async openAuction(id: string): Promise<boolean> {
    const opened = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: string; number: string; due: boolean }>>`
        SELECT "status", "number", "startsAt" <= clock_timestamp() AS "due"
        FROM "Auction" WHERE "id" = ${id} FOR UPDATE
      `;
      const row = rows[0];
      if (!row || row.status !== 'SCHEDULED' || !row.due) return null;
      await tx.auction.update({ where: { id }, data: { status: 'OPEN' } });
      const lots = await tx.auctionLot.updateMany({ where: { auctionId: id, status: 'PENDING' }, data: { status: 'OPEN' } });
      return { number: row.number, lots: lots.count };
    });
    if (!opened) return false;
    await this.audit.record({ action: 'auction.opened', entity: 'Auction', entityId: id, data: { number: opened.number, lots: opened.lots } });
    this.logger.log(`Opened ${opened.number} with ${opened.lots} lot(s)`);
    return true;
  }

  /**
   * One lot's end, under the lot's own lock so no bid is mid-flight: not yet
   * due (a late bid moved the end after the scan) is skipped; found more than
   * `OUTAGE_GRACE_MS` late is extended once from now; otherwise `OPEN →
   * CLOSED` with its result written in the same transaction, and the auction
   * `OPEN → CLOSED` when that was its last lot.
   *
   * The auction's row lock is taken before the count of what is left, so two
   * lots of one auction closing at once cannot each see the other still open
   * and leave the auction open for ever.
   *
   * A lot that reached its reserve is `reserveMet`. One that did not is closed
   * with its highest bidder recorded and no winner action: an offer to them is
   * staff's decision, never automatic (§5.5).
   */
  async closeLot(lotId: string): Promise<CloseOutcome> {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BID_LOT_LOCK_NAMESPACE}::int, hashtext(${lotId}))`;
      const rows = await tx.$queryRaw<CloseRow[]>`
        SELECT l."id", l."auctionId", l."lotNo", a."number" AS "auctionNumber", l."status" AS "lotStatus", l."currentBidMinor", l."reservePriceMinor",
               l."leaderBidderId", l."bidSeq",
               a."status" AS "auctionStatus", COALESCE(l."endsAt", a."endsAt") AS "endsAt",
               clock_timestamp() AS "now"
        FROM "AuctionLot" l
        JOIN "Auction" a ON a."id" = l."auctionId"
        WHERE l."id" = ${lotId}
      `;
      const row = rows[0];
      if (!row || row.lotStatus !== 'OPEN' || row.auctionStatus !== 'OPEN') return { outcome: 'skipped' as const };
      if (row.now.getTime() < row.endsAt.getTime()) return { outcome: 'skipped' as const };

      const lateMs = row.now.getTime() - row.endsAt.getTime();
      if (lateMs > OUTAGE_GRACE_MS) {
        const newEnd = new Date(row.now.getTime() + OUTAGE_EXTENSION_MS);
        const moved = await tx.$executeRaw`
          UPDATE "AuctionLot" SET "endsAt" = ${newEnd}, "updatedAt" = ${row.now}
          WHERE "id" = ${lotId} AND "status" = 'OPEN' AND "bidSeq" = ${row.bidSeq}
        `;
        if (moved === 0) return { outcome: 'skipped' as const };
        return { outcome: 'extended' as const, row, newEnd, lateMs };
      }

      // Serialise the lots of one auction closing at once, then count.
      await tx.$queryRaw`SELECT "id" FROM "Auction" WHERE "id" = ${row.auctionId} FOR UPDATE`;
      const closed = await tx.auctionLot.updateMany({ where: { id: lotId, status: 'OPEN' }, data: { status: 'CLOSED' } });
      if (closed.count === 0) return { outcome: 'skipped' as const };

      const outcome = lotOutcome({
        currentBidMinor: row.currentBidMinor === null ? null : Number(row.currentBidMinor),
        leaderBidderId: row.leaderBidderId,
        reservePriceMinor: row.reservePriceMinor === null ? null : Number(row.reservePriceMinor),
      });
      await tx.auctionResult.create({
        data: {
          lotId,
          topBidderId: outcome.topBidderId,
          topBidMinor: outcome.topBidMinor,
          reserveMet: outcome.reserveMet,
          bidCount: row.bidSeq,
          closedAt: row.now,
        },
      });
      // In the same transaction as the result, so a lot that closed is always announced
      // (the outbox delivers it at least once): the settlement subscriber turns a win into a debt.
      await this.events.publish(
        DomainEvent.AuctionLotClosed,
        {
          lotId,
          auctionId: row.auctionId,
          auctionNumber: row.auctionNumber,
          lotNo: row.lotNo,
          topBidderId: outcome.topBidderId,
          topBidMinor: outcome.topBidMinor,
          reserveMet: outcome.reserveMet,
          closedAt: row.now.toISOString(),
        },
        tx,
      );

      const remaining = await tx.auctionLot.count({ where: { auctionId: row.auctionId, status: { in: ['OPEN', 'PENDING'] } } });
      const auctionClosed = remaining === 0 && (await tx.auction.updateMany({ where: { id: row.auctionId, status: 'OPEN' }, data: { status: 'CLOSED' } })).count > 0;
      return { outcome: 'closed' as const, row, result: outcome, auctionClosed };
    });

    if (result.outcome === 'extended') {
      await this.audit.record({
        action: 'auction.lot_extended_after_outage',
        entity: 'AuctionLot',
        entityId: lotId,
        data: { auctionId: result.row.auctionId, was: result.row.endsAt.toISOString(), now: result.newEnd.toISOString(), lateMs: result.lateMs },
      });
      this.logger.warn(`Lot ${lotId} was found ${Math.round(result.lateMs / 1_000)} s past its end; extended to ${result.newEnd.toISOString()}`);
      await this.announce(lotId);
    } else if (result.outcome === 'closed') {
      await this.audit.record({
        action: 'auction.lot_closed',
        entity: 'AuctionLot',
        entityId: lotId,
        data: { auctionId: result.row.auctionId, bidCount: result.row.bidSeq, topBidMinor: result.result.topBidMinor, reserveMet: result.result.reserveMet },
      });
      if (result.auctionClosed) {
        await this.audit.record({ action: 'auction.closed', entity: 'Auction', entityId: result.row.auctionId });
      }
      this.logger.log(`Closed lot ${lotId}: ${result.row.bidSeq} bid(s), reserve ${result.result.reserveMet ? 'met' : 'not met'}`);
      await this.announce(lotId);
    }
    return result.outcome;
  }

  /**
   * Tells the lot's watchers it changed (a new end, or a result), after the
   * commit. A page that is not told finds out on its next poll, so a failure
   * here is logged and costs freshness only.
   */
  private async announce(lotId: string): Promise<void> {
    try {
      this.realtime.publish(await this.publicLots.liveSnapshot(lotId, { fresh: true }));
    } catch (error) {
      this.logger.warn(`Could not announce lot ${lotId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
