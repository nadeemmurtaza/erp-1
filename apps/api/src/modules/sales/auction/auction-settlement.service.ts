import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { formatDateTime, formatMoneyIn, type Locale } from '@newax/shared';
import { AuditService } from '../../../core/audit/audit.service';
import { paginated } from '../../../core/common/dto/pagination.dto';
import type { AuctionLotClosedPayload, PaymentPayload } from '../../../core/events/domain-events';
import {
  AuctionInvoiceRejectedError,
  AuctionOrderSinkRegistry,
  AuctionOrderSinkUnavailableError,
} from '../../../core/extension-points/auction-order-sink.registry';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { Prisma, type AuctionSettlement } from '../../../core/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { SettingsService } from '../../../core/settings/settings.service';
import { AuctionBidderService, type BidderUser } from './auction-bidder.service';
import { parseBidRules } from './bidding';
import type { CancelSettlementDto, SettlementListQueryDto } from './dto/auction.dto';
import {
  invoiceLines,
  isCovered,
  LIVE_SETTLEMENT_STATUSES,
  paymentDueAt,
  pickNextBidder,
  premiumFor,
  SETTLEMENT_ORDER_SOURCE,
  settlementActions,
  settlementAmounts,
  STALLED_INVOICING_MS,
  type SettlementActions,
  type SettlementStatus,
} from './settlement';
import { lapsedNotice, wonNotice, type NoticeLocale } from './settlement-messages';

/** Serialises every writer of one settlement: a payment arriving, the sweep expiring it, staff acting on it. Distinct from the bid (…171) and bidder (…172) locks. */
const SETTLEMENT_LOCK_NAMESPACE = 8_241_173;

/**
 * How long past its deadline a debt waits before the sweep lapses it, in
 * milliseconds. A payment staff approved just before the deadline reaches this
 * module through the outbox, which retries a failing delivery for about four
 * minutes; ten minutes lets the slowest honest delivery land first, so a buyer
 * who paid on time is never struck for the delay between two systems. The
 * deadline a buyer is shown stays the stated one.
 */
export const EXPIRY_GRACE_MS = 600_000;

/** Debts lapsed or re-invoiced in one run. A run is every 60 s, so 50 is 3 000 an hour, far above any realistic close; the rest wait for the next run. */
const BATCH_SIZE = 50;

/** The most characters of a failure kept on a settlement for staff to read. */
const MAX_FAILURE_LENGTH = 500;

type DbClient = Prisma.TransactionClient;

const minorOf = (value: bigint): number => Number(value);

export interface SettlementView {
  id: string;
  attempt: number;
  status: SettlementStatus;
  lot: { id: string; lotNo: number; title: string };
  bidder: { alias: string };
  currency: string;
  hammerMinor: number;
  premiumBps: number;
  premiumMinor: number;
  totalMinor: number;
  paidMinor: number;
  dueAt: Date;
  orderId: string | null;
  orderNumber: string | null;
  failureReason: string | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  createdAt: Date;
  /** A strike was recorded for this debt when it lapsed. */
  struck: boolean;
  actions: SettlementActions;
  /** Who "offer to the next bidder" would offer to, and at what; null when it is not on offer or nobody is left. */
  next: { alias: string; bidMinor: number } | null;
}

export interface SettlementSummary {
  awaiting: number;
  needsAttention: number;
  paid: number;
  ended: number;
}

/** What the winner sees of their own debt on the lot page: never another bidder's, never the order's lines. */
export interface WinnerSettlementView {
  status: SettlementStatus;
  attempt: number;
  currency: string;
  hammerMinor: number;
  premiumMinor: number;
  totalMinor: number;
  paidMinor: number;
  dueAt: Date;
  orderNumber: string | null;
}

/**
 * What a won lot owes, and what happens when it is paid or is not (doc 234 §9,
 * WO-234.6).
 *
 * A lot that closes with its reserve met publishes `auction.lot_closed`; this
 * service opens one debt for it, asks `AuctionOrderSinkRegistry` for an order
 * (never importing `orders`), counts the payments that arrive, and lapses a debt
 * that is not paid in time, recording a strike. Every step is a predicate on the
 * status it was read as, taken under one advisory lock per settlement, so a
 * payment, the sweep and a member of staff acting at once cannot overwrite one
 * another.
 *
 * Failure modes, each with its recovery:
 *  - the order sink is absent or refuses (no orders module, a payment method
 *    switched off, an amount above 32 bits): the debt waits in `INVOICE_FAILED`
 *    with the reason, and staff Replay it once it is fixed;
 *  - the sink or the database fails in passing: the outbox retries the event,
 *    and the sweep picks up any debt left `INVOICING` for `STALLED_INVOICING_MS`;
 *  - the process dies between "the order was made" and "its id was written
 *    down": asking the sink again returns the same order (it is keyed on the
 *    settlement), so the retry repairs it;
 *  - a payment arrives after the debt ended: it is counted, audited as
 *    `auction.payment_after_end`, and shown to staff as money received on a
 *    lapsed win, to refund or honour;
 *  - the order cannot be cancelled when a debt lapses: the debt stays lapsed and
 *    the reason is written on it for staff.
 */
@Injectable()
export class AuctionSettlementService {
  private readonly logger = new Logger(AuctionSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly sink: AuctionOrderSinkRegistry,
    private readonly notifications: NotificationsService,
    private readonly bidders: AuctionBidderService,
  ) {}

  // ── Events ──────────────────────────────────────────────────────────────

  /** `auction.lot_closed`: opens and invoices the winner's debt, if the lot has a winner. Safe to deliver twice. */
  async onLotClosed(payload: AuctionLotClosedPayload): Promise<void> {
    if (payload.reserveMet && payload.topBidderId && payload.topBidMinor !== null) {
      const id = await this.claim(payload.lotId, payload.topBidderId, payload.topBidMinor, 1);
      if (id) await this.invoice(id);
    }
    // A lot nobody won may be the last thing an auction was waiting for.
    await this.settleAuctionIfDone(payload.auctionId);
  }

  /** `payment.succeeded`: counts the payment once against the debt its order belongs to, and marks the debt paid when it is covered. */
  async onPaymentSucceeded(payload: PaymentPayload): Promise<void> {
    const found = await this.prisma.auctionSettlement.findFirst({ where: { orderId: payload.orderId }, orderBy: { attempt: 'desc' }, select: { id: true } });
    if (!found) return; // an ordinary order, not an auction win

    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, found.id);
      const row = await tx.auctionSettlement.findUnique({ where: { id: found.id } });
      if (!row) return null;
      if (await tx.auctionSettlementPayment.findUnique({ where: { paymentId: payload.paymentId }, select: { paymentId: true } })) return null;

      await tx.auctionSettlementPayment.create({ data: { paymentId: payload.paymentId, settlementId: row.id, amountMinor: BigInt(payload.amount) } });
      const paid = minorOf(row.paidMinor) + payload.amount;
      await tx.auctionSettlement.update({ where: { id: row.id }, data: { paidMinor: BigInt(paid) } });

      if (row.status === 'AWAITING_PAYMENT' && isCovered(paid, minorOf(row.totalMinor))) {
        const moved = await tx.auctionSettlement.updateMany({ where: { id: row.id, status: 'AWAITING_PAYMENT' }, data: { status: 'PAID', resolvedAt: new Date() } });
        if (moved.count === 1) {
          await this.audit.recordEvidence(tx, {
            actorId: null,
            action: 'auction.settlement_paid',
            entity: 'AuctionSettlement',
            entityId: row.id,
            data: { auctionId: row.auctionId, lotId: row.lotId, orderId: row.orderId, paidMinor: paid, totalMinor: minorOf(row.totalMinor) },
          });
          return { auctionId: row.auctionId, paid: true };
        }
      }
      if (row.status === 'EXPIRED' || row.status === 'CANCELLED') {
        // Money arrived for a win that had ended. Nothing is undone here: staff must see it.
        await this.audit.recordEvidence(tx, {
          actorId: null,
          action: 'auction.payment_after_end',
          entity: 'AuctionSettlement',
          entityId: row.id,
          data: { auctionId: row.auctionId, lotId: row.lotId, orderId: row.orderId, paymentId: payload.paymentId, amountMinor: payload.amount, status: row.status },
        });
      }
      return { auctionId: row.auctionId, paid: false };
    });

    if (outcome?.paid) await this.settleAuctionIfDone(outcome.auctionId);
  }

  /** `order.cancelled`: a debt whose order was cancelled elsewhere ends without a strike. A cancellation this service made itself finds the debt already ended and does nothing. */
  async onOrderCancelled(orderId: string): Promise<void> {
    const found = await this.prisma.auctionSettlement.findFirst({ where: { orderId, status: 'AWAITING_PAYMENT' }, orderBy: { attempt: 'desc' }, select: { id: true } });
    if (!found) return;
    const auctionId = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, found.id);
      const moved = await tx.auctionSettlement.updateMany({
        where: { id: found.id, status: 'AWAITING_PAYMENT' },
        data: { status: 'CANCELLED', resolvedAt: new Date(), resolutionNote: 'The order was cancelled.' },
      });
      if (moved.count === 0) return null;
      const row = await tx.auctionSettlement.findUniqueOrThrow({ where: { id: found.id }, select: { auctionId: true, lotId: true } });
      await this.audit.recordEvidence(tx, {
        actorId: null,
        action: 'auction.settlement_cancelled',
        entity: 'AuctionSettlement',
        entityId: found.id,
        data: { auctionId: row.auctionId, lotId: row.lotId, orderId, reason: 'The order was cancelled.' },
      });
      return row.auctionId;
    });
    if (auctionId) await this.settleAuctionIfDone(auctionId);
  }

  // ── Opening and invoicing a debt ────────────────────────────────────────

  /**
   * Writes the debt for one offer on a lot, or finds the one already there:
   * `(lotId, attempt)` is unique, so a lot's close delivered twice, or two staff
   * offering the lot at once, produce one row. Returns null when the bidder or
   * lot has gone, which leaves nothing to invoice.
   */
  private async claim(lotId: string, bidderId: string, hammerMinor: number, attempt: number): Promise<string | null> {
    const [bidder, lot] = await Promise.all([
      this.prisma.bidder.findUnique({ where: { id: bidderId }, select: { userId: true } }),
      this.prisma.auctionLot.findUnique({ where: { id: lotId }, select: { auctionId: true, auction: { select: { currency: true, bidRules: true } } } }),
    ]);
    if (!bidder || !lot) {
      this.logger.warn(`Settlement for lot ${lotId} skipped: the bidder or the lot no longer exists`);
      return null;
    }
    const rules = parseBidRules(lot.auction.bidRules);
    const amounts = settlementAmounts(hammerMinor, rules.buyerPremiumBps);
    try {
      const created = await this.prisma.auctionSettlement.create({
        data: {
          lotId,
          auctionId: lot.auctionId,
          bidderId,
          userId: bidder.userId,
          attempt,
          currency: lot.auction.currency,
          hammerMinor: BigInt(amounts.hammerMinor),
          premiumBps: rules.buyerPremiumBps,
          premiumMinor: BigInt(amounts.premiumMinor),
          totalMinor: BigInt(amounts.totalMinor),
          // Provisional: restarted from the moment the invoice exists, so a winner never loses window to an invoice that was late.
          dueAt: paymentDueAt(new Date(), rules.paymentWindowMs),
        },
        select: { id: true },
      });
      return created.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.auctionSettlement.findUnique({ where: { lotId_attempt: { lotId, attempt } }, select: { id: true } });
        return existing?.id ?? null;
      }
      throw error;
    }
  }

  /**
   * Asks the order sink for this debt's order and moves it to `AWAITING_PAYMENT`.
   * Anything but `INVOICING` or `INVOICE_FAILED` is left alone, so calling it
   * twice, or from the sweep while an event retry is running, costs nothing.
   * A refusal the sink understood is recorded for staff; any other failure is
   * thrown, so the outbox retries it and the sweep is the net under that.
   */
  async invoice(id: string): Promise<void> {
    const row = await this.prisma.auctionSettlement.findUnique({
      where: { id },
      include: { lot: { select: { lotNo: true, title: true, auction: { select: { number: true, bidRules: true } } } } },
    });
    if (!row || (row.status !== 'INVOICING' && row.status !== 'INVOICE_FAILED')) return;

    const rules = parseBidRules(row.lot.auction.bidRules);
    const paymentMethod = await this.paymentMethod(); // a Setting: read here, never inside a transaction
    const amounts = { hammerMinor: minorOf(row.hammerMinor), premiumMinor: minorOf(row.premiumMinor), totalMinor: minorOf(row.totalMinor) };

    let invoice;
    try {
      invoice = await this.sink.invoice({
        sourceType: SETTLEMENT_ORDER_SOURCE,
        sourceRef: row.id,
        userId: row.userId,
        currency: row.currency,
        lines: invoiceLines({ auctionNumber: row.lot.auction.number, lotNo: row.lot.lotNo, lotTitle: row.lot.title, amounts, premiumBps: row.premiumBps }),
        paymentMethod,
        note: `Auction ${row.lot.auction.number}, lot ${row.lot.lotNo}${row.attempt > 1 ? `, offer ${row.attempt}` : ''}`,
      });
    } catch (error) {
      if (error instanceof AuctionInvoiceRejectedError || error instanceof AuctionOrderSinkUnavailableError) {
        await this.failInvoice(row, error.message);
        return;
      }
      throw error;
    }

    const dueAt = paymentDueAt(new Date(), rules.paymentWindowMs);
    const moved = await this.prisma.auctionSettlement.updateMany({
      where: { id, status: { in: ['INVOICING', 'INVOICE_FAILED'] } },
      data: { status: 'AWAITING_PAYMENT', orderId: invoice.orderId, orderNumber: invoice.orderNumber, totalMinor: BigInt(invoice.totalMinor), failureReason: null, dueAt },
    });
    if (moved.count === 0) return;
    if (invoice.totalMinor !== amounts.totalMinor) {
      this.logger.warn(`Order ${invoice.orderNumber} came to ${invoice.totalMinor} but settlement ${id} expected ${amounts.totalMinor}; the order's total is now what is owed`);
    }
    await this.audit.record({
      actorId: null,
      action: 'auction.settlement_invoiced',
      entity: 'AuctionSettlement',
      entityId: id,
      data: { auctionId: row.auctionId, lotId: row.lotId, attempt: row.attempt, orderId: invoice.orderId, orderNumber: invoice.orderNumber, totalMinor: invoice.totalMinor, dueAt: dueAt.toISOString() },
    });
    this.logger.log(`Settlement ${id} (lot ${row.lotId}, offer ${row.attempt}) invoiced as order ${invoice.orderNumber}, due ${dueAt.toISOString()}`);

    await this.tell(row.userId, 'auction.won', (locale) =>
      wonNotice(locale, {
        lotTitle: row.lot.title,
        lotNo: row.lot.lotNo,
        auctionNumber: row.lot.auction.number,
        hammer: formatMoneyIn(amounts.hammerMinor, row.currency, locale),
        premium: amounts.premiumMinor > 0 ? formatMoneyIn(amounts.premiumMinor, row.currency, locale) : null,
        total: formatMoneyIn(invoice.totalMinor, row.currency, locale),
        orderNumber: invoice.orderNumber,
        due: formatDateTime(dueAt, locale),
      }),
    );
  }

  private async failInvoice(row: Pick<AuctionSettlement, 'id' | 'auctionId' | 'lotId' | 'attempt'>, message: string): Promise<void> {
    const failureReason = message.slice(0, MAX_FAILURE_LENGTH);
    const moved = await this.prisma.auctionSettlement.updateMany({
      where: { id: row.id, status: { in: ['INVOICING', 'INVOICE_FAILED'] } },
      data: { status: 'INVOICE_FAILED', failureReason },
    });
    if (moved.count === 0) return;
    await this.audit.record({
      actorId: null,
      action: 'auction.settlement_invoice_failed',
      entity: 'AuctionSettlement',
      entityId: row.id,
      data: { auctionId: row.auctionId, lotId: row.lotId, attempt: row.attempt, reason: failureReason },
    });
    this.logger.warn(`Settlement ${row.id} (lot ${row.lotId}) could not be invoiced: ${failureReason}`);
  }

  // ── The sweep ───────────────────────────────────────────────────────────

  /** Lapses every debt more than `EXPIRY_GRACE_MS` past its deadline. Returns how many it lapsed. */
  async expireDue(): Promise<number> {
    const due = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "AuctionSettlement"
      WHERE "status" = 'AWAITING_PAYMENT'
        AND "dueAt" + make_interval(secs => ${EXPIRY_GRACE_MS / 1_000}::double precision) <= clock_timestamp()
      ORDER BY "dueAt", "id"
      LIMIT ${BATCH_SIZE}
    `;
    let lapsed = 0;
    for (const { id } of due) {
      try {
        if (await this.expireOne(id)) lapsed += 1;
      } catch (error) {
        this.logger.error(`Could not lapse settlement ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return lapsed;
  }

  /** Takes up every debt left `INVOICING` past `STALLED_INVOICING_MS`: a crash, or an event retry that ran out. Returns how many it tried. */
  async retryStalled(): Promise<number> {
    const stalled = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "AuctionSettlement"
      WHERE "status" = 'INVOICING'
        AND "updatedAt" + make_interval(secs => ${STALLED_INVOICING_MS / 1_000}::double precision) <= clock_timestamp()
      ORDER BY "updatedAt", "id"
      LIMIT ${BATCH_SIZE}
    `;
    for (const { id } of stalled) {
      try {
        await this.invoice(id);
      } catch (error) {
        this.logger.error(`Could not invoice settlement ${id} again: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return stalled.length;
  }

  private async expireOne(id: string): Promise<boolean> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
      const row = await tx.auctionSettlement.findUnique({
        where: { id },
        include: { bidder: { select: { alias: true } }, lot: { select: { lotNo: true, title: true, auction: { select: { number: true } } } } },
      });
      if (!row || row.status !== 'AWAITING_PAYMENT') return null;
      if (row.dueAt.getTime() + EXPIRY_GRACE_MS > now.getTime()) return null;
      if (isCovered(minorOf(row.paidMinor), minorOf(row.totalMinor))) return null;

      const moved = await tx.auctionSettlement.updateMany({
        where: { id, status: 'AWAITING_PAYMENT' },
        data: { status: 'EXPIRED', resolvedAt: now, resolutionNote: 'Not paid within the payment window.' },
      });
      if (moved.count === 0) return null;

      const reason = `Did not pay for lot ${row.lot.lotNo} of ${row.lot.auction.number} by the deadline${row.orderNumber ? ` (order ${row.orderNumber})` : ''}.`;
      const struck = await this.bidders.recordUnpaidWinStrike(tx, {
        settlementId: id,
        bidderId: row.bidderId,
        userId: row.userId,
        lotId: row.lotId,
        alias: row.bidder.alias,
        auctionId: row.auctionId,
        auctionNumber: row.lot.auction.number,
        reason,
      });
      await this.audit.recordEvidence(tx, {
        actorId: null,
        action: 'auction.settlement_expired',
        entity: 'AuctionSettlement',
        entityId: id,
        data: { auctionId: row.auctionId, lotId: row.lotId, attempt: row.attempt, orderId: row.orderId, dueAt: row.dueAt.toISOString(), struck },
      });
      return { row };
    });
    if (!outcome) return false;

    const { row } = outcome;
    this.logger.log(`Settlement ${id} (lot ${row.lotId}) lapsed unpaid; a strike was recorded against ${row.bidder.alias}`);
    if (row.orderId) await this.cancelOrder(id, row.orderId, 'The auction payment window passed without payment.');
    await this.tell(row.userId, 'auction.win_lapsed', (locale) =>
      lapsedNotice(locale, { lotTitle: row.lot.title, lotNo: row.lot.lotNo, auctionNumber: row.lot.auction.number, orderNumber: row.orderNumber, due: formatDateTime(row.dueAt, locale) }),
    );
    await this.settleAuctionIfDone(row.auctionId);
    return true;
  }

  // ── Staff ───────────────────────────────────────────────────────────────

  async list(auctionId: string, query: SettlementListQueryDto) {
    await this.assertAuction(auctionId);
    const filter = query.filter ?? 'open';
    const where: Prisma.AuctionSettlementWhereInput = {
      auctionId,
      ...(filter === 'open' ? { status: { in: [...LIVE_SETTLEMENT_STATUSES] } } : filter === 'ended' ? { status: { in: ['PAID', 'EXPIRED', 'CANCELLED'] } } : {}),
    };
    const [rows, total, summary] = await Promise.all([
      this.prisma.auctionSettlement.findMany({
        where,
        orderBy: [{ createdAt: query.order }, { id: 'asc' }],
        skip: query.skip,
        take: query.take,
        include: { lot: { select: { id: true, lotNo: true, title: true } }, bidder: { select: { alias: true } } },
      }),
      this.prisma.auctionSettlement.count({ where }),
      this.summary(auctionId),
    ]);
    return { ...paginated(await this.views(rows), total, query), summary };
  }

  async summary(auctionId: string): Promise<SettlementSummary> {
    const [grouped, stalled] = await Promise.all([
      this.prisma.auctionSettlement.groupBy({ by: ['status'], where: { auctionId }, _count: { _all: true } }),
      this.prisma.$queryRaw<Array<{ n: number }>>`
        SELECT COUNT(*)::int AS "n" FROM "AuctionSettlement"
        WHERE "auctionId" = ${auctionId} AND "status" = 'INVOICING'
          AND "updatedAt" + make_interval(secs => ${STALLED_INVOICING_MS / 1_000}::double precision) <= clock_timestamp()
      `,
    ]);
    const count = (status: SettlementStatus) => grouped.find((g) => g.status === status)?._count._all ?? 0;
    return {
      awaiting: count('AWAITING_PAYMENT'),
      needsAttention: count('INVOICE_FAILED') + (stalled[0]?.n ?? 0),
      paid: count('PAID'),
      ended: count('EXPIRED') + count('CANCELLED'),
    };
  }

  /** Tries the invoice again for a debt whose invoice failed or stalled. */
  async replay(auctionId: string, id: string, actor: BidderUser): Promise<SettlementView> {
    const row = await this.find(auctionId, id);
    const actions = settlementActions(row.status, { isLatestForLot: true, stalledMs: Date.now() - row.updatedAt.getTime() });
    if (!actions.replay) throw this.changed(row.status);
    this.assertNotSelf(row.userId, actor);
    await this.audit.record({ actorId: actor.id, action: 'auction.settlement_replayed', entity: 'AuctionSettlement', entityId: id, data: { auctionId, lotId: row.lotId, attempt: row.attempt } });
    await this.invoice(id);
    return this.view(id);
  }

  /** Ends a debt that is waiting, or whose invoice failed, with no strike, for a reason staff write down. The order is cancelled with it. */
  async cancel(auctionId: string, id: string, actor: BidderUser, dto: CancelSettlementDto): Promise<SettlementView> {
    const reason = dto.reason.trim();
    if (!reason) throw new ConflictException({ statusCode: 409, code: 'REASON_REQUIRED', message: 'Write why the win is being cancelled.' });
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const row = await tx.auctionSettlement.findFirst({ where: { id, auctionId } });
      if (!row) throw new NotFoundException('Settlement not found.');
      this.assertNotSelf(row.userId, actor);
      if (!settlementActions(row.status, { isLatestForLot: true }).cancel) throw this.changed(row.status);
      const moved = await tx.auctionSettlement.updateMany({
        where: { id, status: { in: ['AWAITING_PAYMENT', 'INVOICE_FAILED'] } },
        data: { status: 'CANCELLED', resolvedAt: new Date(), resolvedById: actor.id, resolutionNote: reason },
      });
      if (moved.count === 0) throw this.changed(row.status);
      await this.audit.recordEvidence(tx, {
        actorId: actor.id,
        action: 'auction.settlement_cancelled',
        entity: 'AuctionSettlement',
        entityId: id,
        data: { auctionId, lotId: row.lotId, attempt: row.attempt, orderId: row.orderId, reason },
      });
      return row;
    });
    if (result.orderId) await this.cancelOrder(id, result.orderId, `Auction win cancelled by staff: ${reason}`);
    await this.settleAuctionIfDone(auctionId);
    return this.view(id);
  }

  /** Offers the lot to the next highest bidder at that bidder's own highest bid, as a new debt with its own order and window. */
  async offerNext(auctionId: string, id: string, actor: BidderUser): Promise<SettlementView> {
    const created = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const row = await tx.auctionSettlement.findFirst({ where: { id, auctionId } });
      if (!row) throw new NotFoundException('Settlement not found.');
      const latest = await tx.auctionSettlement.aggregate({ where: { lotId: row.lotId }, _max: { attempt: true } });
      const actions = settlementActions(row.status, { isLatestForLot: (latest._max.attempt ?? row.attempt) === row.attempt });
      if (!actions.offerNext) throw this.changed(row.status);

      const next = (await this.nextBidders(tx, [row.lotId])).get(row.lotId);
      if (!next) {
        throw new ConflictException({ statusCode: 409, code: 'NO_NEXT_BIDDER', message: 'Nobody else who may bid has bid on this lot, so there is no one to offer it to.' });
      }
      this.assertNotSelf(next.userId, actor);

      const lot = await tx.auctionLot.findUniqueOrThrow({ where: { id: row.lotId }, select: { auction: { select: { currency: true, bidRules: true, status: true } } } });
      const rules = parseBidRules(lot.auction.bidRules);
      const amounts = settlementAmounts(next.bidMinor, rules.buyerPremiumBps);
      const offer = await tx.auctionSettlement.create({
        data: {
          lotId: row.lotId,
          auctionId,
          bidderId: next.bidderId,
          userId: next.userId,
          attempt: row.attempt + 1,
          currency: lot.auction.currency,
          hammerMinor: BigInt(amounts.hammerMinor),
          premiumBps: rules.buyerPremiumBps,
          premiumMinor: BigInt(amounts.premiumMinor),
          totalMinor: BigInt(amounts.totalMinor),
          dueAt: paymentDueAt(new Date(), rules.paymentWindowMs),
        },
        select: { id: true },
      });
      // A settled auction has something owing again.
      await tx.auction.updateMany({ where: { id: auctionId, status: 'SETTLED' }, data: { status: 'CLOSED' } });
      await this.audit.recordEvidence(tx, {
        actorId: actor.id,
        action: 'auction.settlement_offered_next',
        entity: 'AuctionSettlement',
        entityId: offer.id,
        data: { auctionId, lotId: row.lotId, from: row.id, attempt: row.attempt + 1, alias: next.alias, hammerMinor: amounts.hammerMinor },
      });
      return offer.id;
    });
    await this.invoice(created);
    return this.view(created);
  }

  // ── What the winner sees ────────────────────────────────────────────────

  /** The latest debt this person has on a lot, or null. Their own only: the lookup is by the account that owes it. */
  async forWinner(lotId: string, userId: string): Promise<WinnerSettlementView | null> {
    const row = await this.prisma.auctionSettlement.findFirst({ where: { lotId, userId }, orderBy: { attempt: 'desc' } });
    if (!row) return null;
    return {
      status: row.status,
      attempt: row.attempt,
      currency: row.currency,
      hammerMinor: minorOf(row.hammerMinor),
      premiumMinor: minorOf(row.premiumMinor),
      totalMinor: minorOf(row.totalMinor),
      paidMinor: minorOf(row.paidMinor),
      dueAt: row.dueAt,
      orderNumber: row.orderNumber,
    };
  }

  // ── Internals ───────────────────────────────────────────────────────────

  /** Moves an auction to `SETTLED` once nothing is owed on it and every winning lot has had its debt opened. */
  private async settleAuctionIfDone(auctionId: string): Promise<void> {
    try {
      const live = await this.prisma.auctionSettlement.count({ where: { auctionId, status: { in: [...LIVE_SETTLEMENT_STATUSES] } } });
      if (live > 0) return;
      const [{ n }] = await this.prisma.$queryRaw<Array<{ n: number }>>`
        SELECT COUNT(*)::int AS "n" FROM "AuctionResult" r
        JOIN "AuctionLot" l ON l."id" = r."lotId"
        WHERE l."auctionId" = ${auctionId} AND r."reserveMet" AND r."topBidderId" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "AuctionSettlement" s WHERE s."lotId" = r."lotId")
      `;
      if (n > 0) return;
      const moved = await this.prisma.auction.updateMany({ where: { id: auctionId, status: 'CLOSED' }, data: { status: 'SETTLED' } });
      if (moved.count > 0) await this.audit.record({ actorId: null, action: 'auction.settled', entity: 'Auction', entityId: auctionId });
    } catch (error) {
      this.logger.warn(`Could not check whether auction ${auctionId} is settled: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Cancels a debt's order; on failure, says so on the debt for staff and carries on, because the debt itself has already ended. */
  private async cancelOrder(settlementId: string, orderId: string, reason: string): Promise<void> {
    try {
      await this.sink.cancel(orderId, reason);
    } catch (error) {
      const message = `The order could not be cancelled: ${error instanceof Error ? error.message : String(error)}`.slice(0, MAX_FAILURE_LENGTH);
      this.logger.warn(`Settlement ${settlementId}: ${message}`);
      await this.prisma.auctionSettlement.update({ where: { id: settlementId }, data: { failureReason: message } }).catch(() => undefined);
    }
  }

  /** Sends a notice to a winner. A message that cannot be sent is logged: it must never undo a debt that was correctly opened or lapsed. */
  private async tell(userId: string, template: string, compose: (locale: NoticeLocale) => { subject: string; body: string }): Promise<void> {
    try {
      const [user, device] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, phone: true, firstName: true, lastName: true } }),
        this.prisma.deviceToken.findFirst({ where: { userId, locale: { not: null } }, orderBy: { lastSeenAt: 'desc' }, select: { locale: true } }),
      ]);
      if (!user) return;
      const tag = device?.locale?.split('-')[0];
      const locale: Locale = tag === 'ur' ? 'ur' : 'en';
      const notice = compose(locale);
      await this.notifications.send({
        template,
        recipient: { name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null, email: user.email, phone: user.phone, userId, locale },
        subject: notice.subject,
        body: notice.body,
      });
    } catch (error) {
      this.logger.warn(`Could not send ${template} to ${userId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async paymentMethod(): Promise<string> {
    const configured = await this.settings.get<unknown>(SettingKey.AuctionSettlementPaymentMethod);
    return typeof configured === 'string' && configured.trim() ? configured.trim() : 'bank_transfer';
  }

  private async lock(tx: DbClient, id: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SETTLEMENT_LOCK_NAMESPACE}::int, hashtext(${id}))`;
  }

  private async assertAuction(auctionId: string): Promise<void> {
    const found = await this.prisma.auction.findUnique({ where: { id: auctionId }, select: { id: true } });
    if (!found) throw new NotFoundException('Auction not found.');
  }

  private async find(auctionId: string, id: string) {
    const row = await this.prisma.auctionSettlement.findFirst({ where: { id, auctionId } });
    if (!row) throw new NotFoundException('Settlement not found.');
    return row;
  }

  private assertNotSelf(userId: string, actor: BidderUser): void {
    if (userId === actor.id) {
      throw new ForbiddenException({ statusCode: 403, code: 'CANNOT_DECIDE_OWN', message: 'You cannot act on a win that is yours. Ask someone else to.' });
    }
  }

  private changed(status: SettlementStatus): ConflictException {
    return new ConflictException({ statusCode: 409, code: 'SETTLEMENT_CHANGED', message: 'This win has changed since you opened it. Reload it to see where it stands.', details: { status } });
  }

  private async view(id: string): Promise<SettlementView> {
    const row = await this.prisma.auctionSettlement.findUniqueOrThrow({
      where: { id },
      include: { lot: { select: { id: true, lotNo: true, title: true } }, bidder: { select: { alias: true } } },
    });
    return (await this.views([row]))[0]!;
  }

  /**
   * Builds the rows staff see with a fixed number of reads for the whole page:
   * which settlement is the latest for its lot, whether a strike was recorded,
   * and who the next bidder would be, each in one query.
   */
  private async views(
    rows: Array<AuctionSettlement & { lot: { id: string; lotNo: number; title: string }; bidder: { alias: string } }>,
  ): Promise<SettlementView[]> {
    if (rows.length === 0) return [];
    const lotIds = [...new Set(rows.map((r) => r.lotId))];
    const [latest, strikes] = await Promise.all([
      this.prisma.auctionSettlement.groupBy({ by: ['lotId'], where: { lotId: { in: lotIds } }, _max: { attempt: true } }),
      this.prisma.bidderStrike.findMany({ where: { settlementId: { in: rows.map((r) => r.id) } }, select: { settlementId: true } }),
    ]);
    const latestOf = new Map(latest.map((g) => [g.lotId, g._max.attempt ?? 1]));
    const struck = new Set(strikes.map((s) => s.settlementId));

    const offerable = rows.filter((r) => settlementActions(r.status, { isLatestForLot: latestOf.get(r.lotId) === r.attempt }).offerNext);
    const nextOf = offerable.length > 0 ? await this.nextBidders(this.prisma, [...new Set(offerable.map((r) => r.lotId))]) : new Map();

    return rows.map((row) => {
      const isLatestForLot = latestOf.get(row.lotId) === row.attempt;
      const actions = settlementActions(row.status, { isLatestForLot, stalledMs: Date.now() - row.updatedAt.getTime() });
      const next = actions.offerNext ? nextOf.get(row.lotId) : undefined;
      return {
        id: row.id,
        attempt: row.attempt,
        status: row.status,
        lot: row.lot,
        bidder: { alias: row.bidder.alias },
        currency: row.currency,
        hammerMinor: minorOf(row.hammerMinor),
        premiumBps: row.premiumBps,
        premiumMinor: minorOf(row.premiumMinor),
        totalMinor: minorOf(row.totalMinor),
        paidMinor: minorOf(row.paidMinor),
        dueAt: row.dueAt,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        failureReason: row.failureReason,
        resolvedAt: row.resolvedAt,
        resolutionNote: row.resolutionNote,
        createdAt: row.createdAt,
        struck: struck.has(row.id),
        actions,
        next: next ? { alias: next.alias, bidMinor: next.bidMinor } : null,
      };
    });
  }

  /**
   * For each lot, the bidder it would be offered to next: approved, not yet
   * given a turn on it, with the highest accepted bid among those left. Two reads
   * for any number of lots (the best bid of every bidder, then who they are and
   * who has had a turn).
   */
  private async nextBidders(db: DbClient | PrismaService, lotIds: string[]) {
    const [best, turns] = await Promise.all([
      db.bid.groupBy({ by: ['lotId', 'bidderId'], where: { lotId: { in: lotIds } }, _max: { amountMinor: true } }),
      db.auctionSettlement.findMany({ where: { lotId: { in: lotIds } }, select: { lotId: true, bidderId: true } }),
    ]);
    const bidderIds = [...new Set(best.map((b) => b.bidderId))];
    const people = bidderIds.length === 0 ? [] : await db.bidder.findMany({ where: { id: { in: bidderIds } }, select: { id: true, userId: true, alias: true, status: true } });
    const personOf = new Map(people.map((p) => [p.id, p]));

    const result = new Map<string, { bidderId: string; userId: string; alias: string; bidMinor: number }>();
    for (const lotId of lotIds) {
      const candidates = best
        .filter((b) => b.lotId === lotId && b._max.amountMinor !== null)
        .map((b) => ({ bidderId: b.bidderId, status: personOf.get(b.bidderId)?.status ?? 'UNKNOWN', highestBidMinor: minorOf(b._max.amountMinor!) }));
      const picked = pickNextBidder(candidates, turns.filter((t) => t.lotId === lotId).map((t) => t.bidderId));
      const person = picked ? personOf.get(picked.bidderId) : undefined;
      if (picked && person) result.set(lotId, { bidderId: picked.bidderId, userId: person.userId, alias: person.alias, bidMinor: picked.highestBidMinor });
    }
    return result;
  }
}

// Kept so the premium arithmetic the service relies on is exported from one place for the specs.
export { premiumFor };
