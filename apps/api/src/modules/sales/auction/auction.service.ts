import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BRAND } from '@newax/shared';
import { decryptSecret, encryptSecret } from '@newax/shared/secret-crypto';
import { AppConfigService } from '../../../core/config/app-config.service';
import { AuditService } from '../../../core/audit/audit.service';
import { ChainWalker, chainHash, type ChainVerdict } from '../../../core/common/hash-chain';
import { paginated } from '../../../core/common/dto/pagination.dto';
import { Prisma } from '../../../core/prisma/client';
import type { Auction, AuctionLot, AuctionStatus, BidKind } from '../../../core/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { documentNumber, documentNumberPrefix } from '../../../core/settings/document-number';
import { documentPrefix } from '../../../core/settings/document-prefix';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { SettingsService } from '../../../core/settings/settings.service';
import { AuctionBidderService } from './auction-bidder.service';
import { lockAuctionStatus } from './auction-lock';
import { AuctionRealtimeService } from './auction-realtime.service';
import { provisionBidder } from './bidder-provision';
import { eligibility, INELIGIBLE_MESSAGES, parseRegistrationMode, type BidderStatus, type RegistrationMode, type TrustPolicy } from './bidder-trust';
import {
  antiSnipeExtensionMs,
  bidCanonical,
  minimumNextBid,
  parseBidRules,
  resolveProxy,
  type BidRules,
  type ProxyOffer,
} from './bidding';
import type {
  AuctionListQueryDto,
  BidListQueryDto,
  CreateAuctionDto,
  CreateAuctionLotDto,
  UpdateAuctionDto,
  UpdateAuctionLotDto,
} from './dto/auction.dto';
import { eventForAcceptedBids } from './lot-live';

const AUCTION_NUMBER_LOCK_NAMESPACE = 8_241_170;
/** Serialises every writer of one lot's price: the lock key is the lot id. */
const BID_LOT_LOCK_NAMESPACE = 8_241_171;

/**
 * How long one bid may wait for a database connection and then run, in
 * milliseconds. Prisma's defaults (2 000 and 5 000) refuse a healthy hot lot
 * during a final-minute rush, when bids queue on the lot's lock; 10 000 is long
 * enough to drain the 50-bids-per-second target (doc 234 §6) through a pool of
 * ten and short enough that a stuck bid fails visibly instead of hanging a
 * bidder's screen. A bid that exceeds it is refused with a 503 and was never
 * accepted.
 */
const BID_TRANSACTION = { maxWait: 10_000, timeout: 10_000 } as const;

/**
 * Whole attempts at one bid when the predicate-on-write finds the lot changed
 * under it (doc 234 §6, House Rule 10). The lot lock makes a second attempt
 * rare, so three is a bound on a bug, not a tuned number: past it the bidder
 * is told to look at the new price rather than looping forever.
 */
const MAX_BID_ATTEMPTS = 3;

/**
 * Accepted bids one bidder may have on one lot in any rolling minute (doc 234
 * §12). A person raising by hand cannot reach ten a minute, and a script can;
 * past it the bid is a 429 and nothing is written. Counted from the ledger, so
 * every node enforces the same limit without a shared counter.
 */
const MAX_BIDS_PER_BIDDER_PER_LOT = 10;
const BID_RATE_WINDOW_MS = 60_000;

/**
 * A lot as the caller may see it: prices as plain numbers (the columns are
 * BIGINT, which JSON cannot carry) and the hidden reserve only for a holder of
 * `auction.manage`.
 */
export type AuctionLotView = Omit<
  AuctionLot,
  'reservePriceMinor' | 'startPriceMinor' | 'currentBidMinor'
> & {
  startPriceMinor: number;
  reservePriceMinor?: number | null;
  currentBidMinor: number | null;
  /** How the lot ended, once it has; absent on the lot you just wrote and while it is still open. */
  result?: AuctionResultView | null;
  /** Its photographs, cover first; present on the auction page's read, absent on the lot you just wrote. */
  images?: Array<{ id: string; url: string; order: number }>;
};
export type AuctionDetail = Auction & { lots: AuctionLotView[] };

/**
 * A lot's outcome as staff see it (doc 234 §5.5): the highest bidder by alias,
 * the price, and how many bids it took. `reserveMet` is shown with the reserve
 * itself, to a holder of `auction.manage` only.
 */
export interface AuctionResultView {
  topBidderAlias: string | null;
  topBidMinor: number | null;
  reserveMet?: boolean;
  bidCount: number;
  closedAt: Date;
}

export interface PlaceBidInput {
  lotId: string;
  amountMinor: number;
  idempotencyKey: string;
  /** The signed-in portal user. Permissions are read only to bar staff who run auctions. */
  user: { id: string; permissions: readonly string[] };
}

/** An accepted bid as its bidder and the admin ledger may see it: an alias, never a name. */
export interface BidView {
  id: string;
  lotId: string;
  seq: number;
  alias: string;
  amountMinor: number;
  kind: BidKind;
  acceptedAt: Date;
}

export interface LotPriceState {
  lotId: string;
  currentBidMinor: number | null;
  bidSeq: number;
  /** What the next bid must reach, so a client can pre-fill the box without a second request. */
  minimumNextBidMinor: number;
  endsAt: Date;
  /** Whether the caller holds the current highest bid. */
  leading: boolean;
}

export interface PlaceBidResult {
  bid: BidView;
  /** True when the idempotency key had already been accepted and nothing new was written. */
  replayed: boolean;
  /**
   * The bid the system placed straight after this one for someone whose
   * standing maximum outranks it (doc 234 §5.3), if any. When present the
   * caller no longer leads: `lot.leading` says so.
   */
  autoBid: BidView | null;
  lot: LotPriceState;
}

export interface SetProxyBidInput {
  lotId: string;
  /** The most the bidder will pay, in minor units. Never shown to anyone else. */
  maxMinor: number;
  user: { id: string; permissions: readonly string[] };
}

export interface ProxyBidResult {
  /** The caller's own standing maximum, or null when they have none. */
  maxMinor: number | null;
  /** The bid the system placed because of this change, if it changed who leads or the price. */
  autoBid: BidView | null;
  lot: LotPriceState;
}

export interface BidIntegrity extends ChainVerdict {
  bidCount: number;
  /** The `seq` of the bid where the walk stopped, when it did. */
  brokenAtSeq?: number;
}

/** Thrown inside the transaction to roll it back and try the whole bid again. */
class LotChangedUnderBid extends Error {}

interface LotRow {
  id: string;
  auctionId: string;
  lotStatus: string;
  startPriceMinor: bigint;
  currentBidMinor: bigint | null;
  leaderBidderId: string | null;
  bidSeq: number;
  auctionStatus: string;
  /** When bidding on this lot ends: its own end once moved, else the auction's. */
  endsAt: Date;
  /** The lot's own end, null while it still ends with the auction. */
  lotEndsAt: Date | null;
  /** Milliseconds of anti-snipe extension this lot has used. */
  extendedMs: number;
  bidRules: unknown;
  /** How the auction vets who may bid; read with the lot so the gate sees the rule as it is under the lot's lock. */
  registration: string;
  createdById: string;
  /** The database clock when the row was read, under the lot's lock. */
  now: Date;
}

/** A bid decided on, not yet written: who, how much, and of what kind. */
interface PendingBid {
  bidder: { id: string; alias: string };
  amountMinor: number;
  kind: BidKind;
  idempotencyKey: string;
}

async function nextAuctionNumber(
  tx: Prisma.TransactionClient,
  settings: SettingsService,
  config: AppConfigService,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = await documentPrefix(settings, 'auction');
  const like = documentNumberPrefix(config, prefix, year);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUCTION_NUMBER_LOCK_NAMESPACE}::int, ${year}::int)`;
  const [{ max }] = await tx.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(CAST(split_part("number", '-', -1) AS INTEGER)) AS max
    FROM "Auction"
    WHERE "number" LIKE ${`${like}%`}
  `;
  return documentNumber(config, prefix, year, (max ?? 0) + 1);
}

/**
 * The Auction app (launchpad-apps/234-auction-app.md): WO-234.1's drafting of
 * an auction and its lots, scheduling and calling it off, and WO-234.2's
 * `placeBid()`, the one writer of a lot's current price.
 *
 * One writer per invariant: every change to an auction or its lots runs in a
 * transaction that first takes the auction's row lock (`lockAuction`) and
 * checks the status it read under that lock. That is what stops a lot being
 * withdrawn while the auction is being scheduled, and what will stop the open
 * job of WO-234.3 and an edit from both winning. A repeat of the same
 * transition is a no-op, never an error and never a second audit row.
 */
@Injectable()
export class AuctionService {
  private readonly logger = new Logger(AuctionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly realtime: AuctionRealtimeService,
    private readonly bidders: AuctionBidderService,
  ) {}

  async list(query: AuctionListQueryDto) {
    const search = query.q?.trim();
    const where: Prisma.AuctionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      // Contains-match on title or number: an auction table is hundreds of
      // rows per organisation, not millions, so a scan here is cheaper than an
      // index nobody would hit with a leading-wildcard pattern.
      ...(search
        ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { number: { contains: search, mode: 'insensitive' } }] }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auction.findMany({
        where,
        include: { _count: { select: { lots: { where: { status: { not: 'WITHDRAWN' } } } } } },
        orderBy: [{ startsAt: query.order }, { id: query.order }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.auction.count({ where }),
    ]);
    return paginated(
      rows.map(({ _count, ...auction }) => ({ ...auction, lotCount: _count.lots })),
      total,
      query,
    );
  }

  async get(id: string, canSeeReserve: boolean): Promise<AuctionDetail> {
    const auction = await this.prisma.auction.findUnique({
      where: { id },
      include: {
        lots: {
          orderBy: { lotNo: 'asc' },
          include: { result: true, images: { orderBy: { order: 'asc' }, select: { id: true, url: true, order: true } } },
        },
      },
    });
    if (!auction) throw new NotFoundException('Auction not found.');

    // One query for every winner's alias, not one per lot.
    const topIds = auction.lots.flatMap((lot) => (lot.result?.topBidderId ? [lot.result.topBidderId] : []));
    const bidders = topIds.length === 0 ? [] : await this.prisma.bidder.findMany({ where: { id: { in: topIds } }, select: { id: true, alias: true } });
    const aliasById = new Map(bidders.map((bidder) => [bidder.id, bidder.alias]));

    return {
      ...auction,
      lots: auction.lots.map(({ result, ...lot }) => ({
        ...this.viewLot(lot, canSeeReserve),
        result: result
          ? {
              topBidderAlias: result.topBidderId ? (aliasById.get(result.topBidderId) ?? null) : null,
              topBidMinor: this.optionalNumber(result.topBidMinor),
              ...(canSeeReserve ? { reserveMet: result.reserveMet } : {}),
              bidCount: result.bidCount,
              closedAt: result.closedAt,
            }
          : null,
      })),
    };
  }

  async create(dto: CreateAuctionDto, actorId: string): Promise<Auction> {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.assertWindow(startsAt, endsAt);
    if (dto.outletLocationId) await this.assertLocation(dto.outletLocationId);
    // The auction holds its own value from here on; the Setting is only the default for a new one.
    const registration = dto.registration ?? parseRegistrationMode(await this.settings.get<unknown>(SettingKey.AuctionRegistrationDefault));

    const auction = await this.prisma.$transaction(async (tx) => {
      const number = await nextAuctionNumber(tx, this.settings, this.config);
      return tx.auction.create({
        data: {
          number,
          type: dto.type ?? 'ENGLISH',
          title: dto.title.trim(),
          startsAt,
          endsAt,
          currency: BRAND.locale.currency,
          terms: dto.terms?.trim() || null,
          outletLocationId: dto.outletLocationId ?? null,
          registration,
          createdById: actorId,
        },
      });
    });

    await this.audit.record({
      actorId,
      action: 'auction.created',
      entity: 'Auction',
      entityId: auction.id,
      data: { number: auction.number, title: auction.title, registration: auction.registration },
    });
    this.logger.log(`Auction ${auction.number} drafted by ${actorId}`);
    return auction;
  }

  async update(id: string, dto: UpdateAuctionDto, actorId: string): Promise<Auction> {
    if (dto.outletLocationId) await this.assertLocation(dto.outletLocationId);

    const { before, after } = await this.prisma.$transaction(async (tx) => {
      const status = await this.lockAuction(tx, id);
      if (status !== 'DRAFT') {
        throw new ConflictException('Only a draft auction can be edited. Unschedule it first.');
      }
      const current = await tx.auction.findUniqueOrThrow({ where: { id } });
      const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt;
      const endsAt = dto.endsAt ? new Date(dto.endsAt) : current.endsAt;
      this.assertWindow(startsAt, endsAt);

      const updated = await tx.auction.update({
        where: { id },
        data: {
          title: dto.title?.trim(),
          startsAt,
          endsAt,
          terms: dto.terms === undefined ? undefined : dto.terms.trim() || null,
          outletLocationId: dto.outletLocationId,
          registration: dto.registration,
        },
      });
      return { before: current, after: updated };
    });

    await this.audit.record({
      actorId,
      action: 'auction.updated',
      entity: 'Auction',
      entityId: id,
      data: {
        before: { title: before.title, startsAt: before.startsAt, endsAt: before.endsAt, outletLocationId: before.outletLocationId, registration: before.registration },
        after: { title: after.title, startsAt: after.startsAt, endsAt: after.endsAt, outletLocationId: after.outletLocationId, registration: after.registration },
      },
    });
    return after;
  }

  async addLot(auctionId: string, dto: CreateAuctionLotDto, actorId: string): Promise<AuctionLotView> {
    this.assertReserve(dto.startPriceMinor, dto.reservePriceMinor);

    const lot = await this.prisma.$transaction(async (tx) => {
      await this.lockDraft(tx, auctionId, 'Lots can only be added to a draft auction. Unschedule it first.');
      const { _max } = await tx.auctionLot.aggregate({ where: { auctionId }, _max: { lotNo: true } });
      return tx.auctionLot.create({
        data: {
          auctionId,
          lotNo: (_max.lotNo ?? 0) + 1,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          quantity: dto.quantity ?? 1,
          startPriceMinor: dto.startPriceMinor,
          reservePriceMinor: dto.reservePriceMinor ?? null,
        },
      });
    });

    await this.audit.record({
      actorId,
      action: 'auction.lot_added',
      entity: 'AuctionLot',
      entityId: lot.id,
      data: { auctionId, lotNo: lot.lotNo, startPriceMinor: Number(lot.startPriceMinor) },
    });
    return this.viewLot(lot, true);
  }

  async updateLot(auctionId: string, lotId: string, dto: UpdateAuctionLotDto, actorId: string): Promise<AuctionLotView> {
    const { before, after } = await this.prisma.$transaction(async (tx) => {
      await this.lockDraft(tx, auctionId, 'Lots can only be edited on a draft auction. Unschedule it first.');
      const current = await tx.auctionLot.findFirst({ where: { id: lotId, auctionId } });
      if (!current) throw new NotFoundException('Lot not found.');
      if (current.status === 'WITHDRAWN') throw new ConflictException('A withdrawn lot cannot be edited.');

      const startPriceMinor = dto.startPriceMinor ?? Number(current.startPriceMinor);
      const reservePriceMinor =
        dto.reservePriceMinor === undefined
          ? current.reservePriceMinor === null
            ? null
            : Number(current.reservePriceMinor)
          : dto.reservePriceMinor;
      this.assertReserve(startPriceMinor, reservePriceMinor ?? undefined);

      const updated = await tx.auctionLot.update({
        where: { id: lotId },
        data: {
          title: dto.title?.trim(),
          description: dto.description === undefined ? undefined : dto.description.trim() || null,
          quantity: dto.quantity,
          startPriceMinor,
          reservePriceMinor,
        },
      });
      return { before: current, after: updated };
    });

    await this.audit.record({
      actorId,
      action: 'auction.lot_updated',
      entity: 'AuctionLot',
      entityId: lotId,
      data: {
        before: { startPriceMinor: Number(before.startPriceMinor), reservePriceMinor: this.optionalNumber(before.reservePriceMinor), quantity: before.quantity },
        after: { startPriceMinor: Number(after.startPriceMinor), reservePriceMinor: this.optionalNumber(after.reservePriceMinor), quantity: after.quantity },
      },
    });
    return this.viewLot(after, true);
  }

  /** A lot is withdrawn, never deleted: its number stays taken and the audit row keeps pointing at it. */
  async withdrawLot(auctionId: string, lotId: string, actorId: string): Promise<AuctionLotView> {
    const { lot, changed } = await this.prisma.$transaction(async (tx) => {
      await this.lockDraft(tx, auctionId, 'Lots can only be withdrawn from a draft auction. Unschedule it first.');
      const current = await tx.auctionLot.findFirst({ where: { id: lotId, auctionId } });
      if (!current) throw new NotFoundException('Lot not found.');
      if (current.status === 'WITHDRAWN') return { lot: current, changed: false };
      const updated = await tx.auctionLot.update({ where: { id: lotId }, data: { status: 'WITHDRAWN' } });
      return { lot: updated, changed: true };
    });

    if (changed) {
      await this.audit.record({
        actorId,
        action: 'auction.lot_withdrawn',
        entity: 'AuctionLot',
        entityId: lotId,
        data: { auctionId, lotNo: lot.lotNo },
      });
    }
    return this.viewLot(lot, true);
  }

  /**
   * Draft → scheduled. Refused unless the start is in the future and at least
   * one lot is still on sale; every lot was validated when it was saved, so the
   * lock above is what makes "at least one" true at the moment of the flip.
   * The bidding rules are copied from Settings onto the auction here and never
   * read from Settings again, so a later change cannot alter a live auction.
   */
  async schedule(id: string, actorId: string): Promise<Auction> {
    const bidRules = await this.currentBidRules();
    const { auction, changed } = await this.prisma.$transaction(async (tx) => {
      const status = await this.lockAuction(tx, id);
      const current = await tx.auction.findUniqueOrThrow({ where: { id } });
      if (status === 'SCHEDULED') return { auction: current, changed: false };
      if (status !== 'DRAFT') throw new ConflictException(`A ${status.toLowerCase()} auction cannot be scheduled.`);
      if (current.startsAt.getTime() <= Date.now()) {
        throw new BadRequestException('The start time is in the past. Move it to a future time before scheduling.');
      }
      const onSale = await tx.auctionLot.count({ where: { auctionId: id, status: { not: 'WITHDRAWN' } } });
      if (onSale === 0) throw new BadRequestException('Add at least one lot before scheduling.');
      const updated = await tx.auction.update({ where: { id }, data: { status: 'SCHEDULED', bidRules } });
      return { auction: updated, changed: true };
    });

    if (changed) await this.recordTransition(actorId, 'auction.scheduled', auction);
    return auction;
  }

  /** Scheduled → draft, the undo of `schedule`. Refused once the auction has opened, because by then bids may exist. */
  async unschedule(id: string, actorId: string): Promise<Auction> {
    const { auction, changed } = await this.prisma.$transaction(async (tx) => {
      const status = await this.lockAuction(tx, id);
      const current = await tx.auction.findUniqueOrThrow({ where: { id } });
      if (status === 'DRAFT') return { auction: current, changed: false };
      if (status !== 'SCHEDULED') {
        throw new ConflictException(`A ${status.toLowerCase()} auction cannot be returned to draft.`);
      }
      const updated = await tx.auction.update({ where: { id }, data: { status: 'DRAFT', bidRules: Prisma.DbNull } });
      return { auction: updated, changed: true };
    });

    if (changed) await this.recordTransition(actorId, 'auction.unscheduled', auction);
    return auction;
  }

  /** Draft or scheduled → cancelled, with a reason in the audit trail. Lots still on sale are withdrawn with it. */
  async cancel(id: string, reason: string, actorId: string): Promise<Auction> {
    const { auction, changed } = await this.prisma.$transaction(async (tx) => {
      const status = await this.lockAuction(tx, id);
      const current = await tx.auction.findUniqueOrThrow({ where: { id } });
      if (status === 'CANCELLED') return { auction: current, changed: false };
      if (status !== 'DRAFT' && status !== 'SCHEDULED') {
        throw new ConflictException(`A ${status.toLowerCase()} auction can no longer be cancelled here.`);
      }
      await tx.auctionLot.updateMany({ where: { auctionId: id, status: { not: 'WITHDRAWN' } }, data: { status: 'WITHDRAWN' } });
      const updated = await tx.auction.update({ where: { id }, data: { status: 'CANCELLED' } });
      return { auction: updated, changed: true };
    });

    if (changed) await this.recordTransition(actorId, 'auction.cancelled', auction, { reason });
    return auction;
  }

  /**
   * Accepts a bid, or says exactly why not (doc 234 §5, §6). The one writer of
   * a lot's current price, leader and version.
   *
   * Order of the checks matters. A retry of a bid already accepted is answered
   * first, from the record, even if the lot has closed since: the bidder asked
   * once and must not be told it failed. Then the lot, the clock, who may bid,
   * and the price. Nothing is written until every check has passed.
   *
   * One writer per invariant, twice over: the lot's advisory lock serialises
   * writers so the loser re-reads and re-checks against the new price, and the
   * `UPDATE` carries its own predicate (`bidSeq` still what was read, lot and
   * auction still open, the end not passed) so a writer that skipped the lock
   * still cannot overwrite a newer bid. Zero rows updated rolls everything back
   * and tries again from a fresh read. Time is the database's: the end is
   * compared with, and `acceptedAt` is, the clock read under the lock.
   *
   * Failure modes: a refusal is a 4xx and writes nothing (a first-time
   * bidder's alias is rolled back with it); a pool or lock wait beyond
   * `BID_TRANSACTION` is a 503 and writes nothing; a crash mid-transaction
   * leaves nothing, so a retry with the same key is safe.
   */
  async placeBid(input: PlaceBidInput): Promise<PlaceBidResult> {
    // Read before the transaction opens, never inside it: a Setting that is not cached is read on another pool connection, and a
    // crowd of first-time bidders each holding one while waiting for a second would starve the pool until every one of them timed out.
    const policy = await this.bidders.policy();
    const result = await this.inBidTransaction(input.lotId, (tx) => this.placeBidOnce(tx, input, policy));
    // Only after the commit, and never waited on: the price is a fact in
    // Postgres whether or not anyone is told (AuctionRealtimeService).
    if (!result.replayed) this.announce(result.lot, [result.bid, ...(result.autoBid ? [result.autoBid] : [])]);
    return result;
  }

  private announce(lot: LotPriceState, bids: BidView[]): void {
    this.realtime.publish(eventForAcceptedBids(lot, bids));
  }

  /**
   * Runs one writer of a lot's price as up to `MAX_BID_ATTEMPTS` whole
   * transactions: a lost predicate or a lost race on a unique key starts over
   * from a fresh read; a pool or lock wait past `BID_TRANSACTION` is a 503 that
   * wrote nothing.
   */
  private async inBidTransaction<T>(lotId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_BID_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, BID_TRANSACTION);
      } catch (error) {
        if (error instanceof LotChangedUnderBid || this.isUniqueViolation(error)) {
          this.logger.warn(`Writer on lot ${lotId} found the lot changed under it (attempt ${attempt} of ${MAX_BID_ATTEMPTS})`);
          continue;
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028') {
          this.logger.warn(`Writer on lot ${lotId} timed out waiting for the lot: ${error.message}`);
          throw new ServiceUnavailableException('The auction is very busy right now. Your bid was not placed — try again.');
        }
        throw error;
      }
    }
    throw new ConflictException({
      statusCode: 409,
      code: 'LOT_CHANGED',
      message: 'Other bids arrived while yours was being placed. Check the current price and bid again.',
    });
  }

  /** Takes the lot's lock, then reads the lot and its auction under it. The first thing every writer of a lot's price does. */
  private async lockLotRow(tx: Prisma.TransactionClient, lotId: string): Promise<LotRow> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BID_LOT_LOCK_NAMESPACE}::int, hashtext(${lotId}))`;
    const rows = await tx.$queryRaw<LotRow[]>`
      SELECT l."id", l."auctionId", l."status" AS "lotStatus", l."startPriceMinor", l."currentBidMinor",
             l."leaderBidderId", l."bidSeq", l."endsAt" AS "lotEndsAt", l."extendedMs",
             a."status" AS "auctionStatus", COALESCE(l."endsAt", a."endsAt") AS "endsAt", a."bidRules", a."registration", a."createdById",
             clock_timestamp() AS "now"
      FROM "AuctionLot" l
      JOIN "Auction" a ON a."id" = l."auctionId"
      WHERE l."id" = ${lotId}
    `;
    const row = rows[0];
    if (!row) throw new NotFoundException('Lot not found.');
    return row;
  }

  private async placeBidOnce(tx: Prisma.TransactionClient, input: PlaceBidInput, policy: TrustPolicy): Promise<PlaceBidResult> {
    const { lotId, amountMinor, idempotencyKey, user } = input;
    const row = await this.lockLotRow(tx, lotId);

    const rules = parseBidRules(row.bidRules);
    const existingBidder = await tx.bidder.findUnique({ where: { auctionId_userId: { auctionId: row.auctionId, userId: user.id } } });

    // 1. A retry of a bid already accepted is answered from the record.
    if (existingBidder) {
      const earlier = await tx.bid.findUnique({
        where: { lotId_bidderId_idempotencyKey: { lotId, bidderId: existingBidder.id, idempotencyKey } },
      });
      if (earlier) {
        if (Number(earlier.amountMinor) !== amountMinor) {
          throw new ConflictException({
            statusCode: 409,
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'That request key was already used for a different amount. Use a new key for a new bid.',
          });
        }
        return {
          bid: this.bidView(earlier, existingBidder.alias),
          replayed: true,
          autoBid: null,
          lot: this.priceState(row, rules, existingBidder.id),
        };
      }
    }

    // 2. The lot and the clock; 3. who may bid.
    this.assertBiddable(row);
    await this.assertMayBid(tx, user, row, existingBidder, policy);
    if (existingBidder) await this.assertWithinBidRate(tx, lotId, existingBidder.id, row.now);

    // 4. Nobody outbids themselves: it would only raise the price.
    if (existingBidder && row.leaderBidderId === existingBidder.id) {
      throw new ConflictException({
        statusCode: 409,
        code: 'ALREADY_LEADING',
        message: 'You already hold the highest bid on this lot.',
        details: { minimumNextBidMinor: this.minimumNext(row, rules) },
      });
    }

    // 5. The price.
    const minimum = this.minimumNext(row, rules);
    if (amountMinor < minimum) {
      throw new ConflictException({
        statusCode: 409,
        code: 'BID_TOO_LOW',
        message: 'Your bid is below the minimum. Raise it to at least the minimum next bid.',
        details: { minimumNextBidMinor: minimum },
      });
    }

    // Everything holds: provision the bidder on a first bid, then write the
    // bid and, when a standing maximum outranks it, the one answer to it.
    const bidder = existingBidder ?? (await this.provisionBidder(tx, row.auctionId, user.id));
    const pending: PendingBid[] = [{ bidder, amountMinor, kind: 'MANUAL', idempotencyKey }];
    const answer = await this.proxyAnswer(tx, row, rules, { bidderId: bidder.id, amountMinor, seq: row.bidSeq + 1 });
    if (answer) pending.push(answer);

    const placed = await this.commitBids(tx, row, rules, pending);
    this.logger.debug(`Bid ${placed.bids[0]!.id} accepted on lot ${lotId}: seq ${placed.bids[0]!.seq}, ${amountMinor} minor units${answer ? ', answered by a standing maximum' : ''}`);
    return {
      bid: placed.views[0]!,
      replayed: false,
      autoBid: placed.views[1] ?? null,
      lot: this.priceState(placed.row, rules, bidder.id),
    };
  }

  /**
   * Sets or raises the caller's standing maximum on a lot (doc 234 §5.3): the
   * system then bids the least that keeps them ahead, up to it. The maximum is
   * encrypted at rest and returned to nobody but its owner. It can only go up
   * — a maximum that could be pulled would let a bidder frighten others off
   * with a number they never meant to pay — and it must at least reach the
   * next bid the caller could place by hand, or it could never be used.
   *
   * Setting one can place one bid: for the caller, when it beats the standing
   * bid; for someone whose own maximum is higher, when the caller's new one
   * puts them under it. Never more than one, however far apart the maxima.
   */
  async setProxyBid(input: SetProxyBidInput): Promise<ProxyBidResult> {
    const policy = await this.bidders.policy(); // before the transaction, for the reason given in placeBid()
    const result = await this.inBidTransaction(input.lotId, (tx) => this.setProxyBidOnce(tx, input, policy));
    if (result.autoBid) this.announce(result.lot, [result.autoBid]);
    return result;
  }

  private async setProxyBidOnce(tx: Prisma.TransactionClient, input: SetProxyBidInput, policy: TrustPolicy): Promise<ProxyBidResult> {
    const { lotId, maxMinor, user } = input;
    const row = await this.lockLotRow(tx, lotId);
    const rules = parseBidRules(row.bidRules);

    this.assertBiddable(row);
    const existingBidder = await tx.bidder.findUnique({ where: { auctionId_userId: { auctionId: row.auctionId, userId: user.id } } });
    await this.assertMayBid(tx, user, row, existingBidder, policy);

    // A leader's maximum need only reach what they already stand at; anyone
    // else's must reach the next bid they could place.
    const leading = existingBidder !== null && row.leaderBidderId === existingBidder.id;
    const floor = leading && row.currentBidMinor !== null ? Number(row.currentBidMinor) : this.minimumNext(row, rules);
    if (maxMinor < floor) {
      throw new ConflictException({
        statusCode: 409,
        code: 'PROXY_TOO_LOW',
        message: leading
          ? 'Your maximum is below the bid you already hold.'
          : 'Your maximum is below the minimum next bid, so it could never be used. Raise it to at least the minimum.',
        details: { minimumMaxMinor: floor },
      });
    }

    const bidder = existingBidder ?? (await this.provisionBidder(tx, row.auctionId, user.id));
    const existing = await tx.proxyBid.findUnique({ where: { lotId_bidderId: { lotId, bidderId: bidder.id } } });
    if (existing) {
      const standing = this.decryptMax(existing.maxCipher);
      if (maxMinor < standing) {
        throw new ConflictException({
          statusCode: 409,
          code: 'PROXY_CANNOT_LOWER',
          message: 'A maximum can be raised but not lowered or withdrawn.',
        });
      }
      // The same maximum again is a repeat of the same request: nothing changes.
      if (maxMinor === standing) {
        return { maxMinor: standing, autoBid: null, lot: this.priceState(row, rules, bidder.id) };
      }
      // A raised maximum is a new offer, placed now: it does not keep the
      // earlier one's place in a tie.
      await tx.proxyBid.update({
        where: { id: existing.id },
        data: { maxCipher: this.encryptMax(maxMinor), placedAfterSeq: row.bidSeq },
      });
    } else {
      await tx.proxyBid.create({
        data: { lotId, bidderId: bidder.id, maxCipher: this.encryptMax(maxMinor), placedAfterSeq: row.bidSeq },
      });
    }

    const standing = row.leaderBidderId !== null && row.currentBidMinor !== null
      ? { bidderId: row.leaderBidderId, amountMinor: Number(row.currentBidMinor), seq: row.bidSeq }
      : null;
    const answer = await this.proxyAnswer(tx, row, rules, standing);
    if (!answer) return { maxMinor, autoBid: null, lot: this.priceState(row, rules, bidder.id) };

    const placed = await this.commitBids(tx, row, rules, [answer]);
    return { maxMinor, autoBid: placed.views[0]!, lot: this.priceState(placed.row, rules, bidder.id) };
  }

  /** The caller's own standing maximum on a lot, or null. Nobody else's is readable through any route. */
  async getProxyBid(lotId: string, userId: string): Promise<{ maxMinor: number | null }> {
    const lot = await this.prisma.auctionLot.findUnique({ where: { id: lotId }, select: { auctionId: true } });
    if (!lot) throw new NotFoundException('Lot not found.');
    const bidder = await this.prisma.bidder.findUnique({ where: { auctionId_userId: { auctionId: lot.auctionId, userId } } });
    if (!bidder) return { maxMinor: null };
    const proxy = await this.prisma.proxyBid.findUnique({ where: { lotId_bidderId: { lotId, bidderId: bidder.id } } });
    return { maxMinor: proxy ? this.decryptMax(proxy.maxCipher) : null };
  }

  /**
   * What the system bids for someone now, given the bid that has just stood
   * (or the standing one) and every approved bidder's maximum on the lot, as a
   * pending bid; null when nothing needs placing. Reads every proxy once, here,
   * under the lot's lock, so the answer is to the lot as it is.
   */
  private async proxyAnswer(
    tx: Prisma.TransactionClient,
    row: LotRow,
    rules: BidRules,
    standing: { bidderId: string; amountMinor: number; seq: number } | null,
  ): Promise<PendingBid | null> {
    const stored = await tx.proxyBid.findMany({
      where: { lotId: row.id, bidder: { status: 'APPROVED' } },
      include: { bidder: { select: { id: true, alias: true } } },
    });
    if (stored.length === 0) return null;
    const offers: ProxyOffer[] = stored.map((proxy) => ({
      bidderId: proxy.bidderId,
      maxMinor: this.decryptMax(proxy.maxCipher),
      placedAfterSeq: proxy.placedAfterSeq,
    }));
    const answer = resolveProxy({ standing, startPriceMinor: Number(row.startPriceMinor), proxies: offers, rules });
    if (!answer) return null;
    const owner = stored.find((proxy) => proxy.bidderId === answer.bidderId)?.bidder;
    // A bidder with no proxy can hold the standing bid but never be answered for.
    if (!owner) return null;
    return { bidder: owner, amountMinor: answer.amountMinor, kind: 'PROXY_AUTO', idempotencyKey: `auto:${randomUUID()}` };
  }

  /**
   * Writes one or more bids for a lot as one step of its chain and moves its
   * price, leader, version and, when a bid lands in the closing window, its
   * end, in a single guarded `UPDATE` (doc 234 §5.4, §6). All the bids share
   * the one `acceptedAt` the database clock gave under the lot's lock; their
   * `seq` orders them. The predicate: still the version that was read, lot and
   * auction still open, the end not passed. Zero rows is a lost race, and the
   * caller's transaction rolls back and starts again.
   */
  private async commitBids(
    tx: Prisma.TransactionClient,
    row: LotRow,
    rules: BidRules,
    pending: readonly PendingBid[],
  ): Promise<{ bids: Array<{ id: string; seq: number }>; views: BidView[]; row: LotRow }> {
    const acceptedAt = row.now;
    const last = await tx.bid.findFirst({ where: { lotId: row.id }, orderBy: { seq: 'desc' }, select: { hash: true } });
    let prevHash = last?.hash ?? null;
    let seq = row.bidSeq;

    const records = pending.map((bid) => {
      seq += 1;
      const fields = {
        id: randomUUID(),
        lotId: row.id,
        seq,
        bidderId: bid.bidder.id,
        amountMinor: bid.amountMinor,
        kind: bid.kind,
        acceptedAt,
        idempotencyKey: bid.idempotencyKey,
      };
      const hash = chainHash(prevHash, bidCanonical(fields));
      const record = { ...fields, prevHash, hash };
      prevHash = hash;
      return record;
    });
    const final = records[records.length - 1]!;

    // The extension is worked out once for the commit: the same instant, the
    // same lot, so a manual bid and its answer cannot extend it twice.
    const extension = antiSnipeExtensionMs(row.endsAt, acceptedAt, row.extendedMs, rules);
    const newEnd = extension > 0 ? new Date(row.endsAt.getTime() + extension) : row.lotEndsAt;

    const updated = await tx.$executeRaw`
      UPDATE "AuctionLot" SET "currentBidMinor" = ${final.amountMinor}, "leaderBidderId" = ${final.bidderId},
                              "bidSeq" = ${final.seq}, "endsAt" = ${newEnd}, "extendedMs" = "extendedMs" + ${extension}::int,
                              "updatedAt" = ${acceptedAt}
      WHERE "id" = ${row.id} AND "status" = 'OPEN' AND "bidSeq" = ${row.bidSeq}
        AND EXISTS (
          SELECT 1 FROM "Auction" a
          WHERE a."id" = "AuctionLot"."auctionId" AND a."status" = 'OPEN'
            AND COALESCE("AuctionLot"."endsAt", a."endsAt") > ${acceptedAt}
        )
    `;
    if (updated === 0) throw new LotChangedUnderBid();

    await tx.bid.createMany({ data: records });
    if (extension > 0) {
      this.logger.log(`Lot ${row.id} extended by ${extension} ms to ${newEnd!.toISOString()} by a bid inside the closing window`);
    }
    return {
      bids: records.map((record) => ({ id: record.id, seq: record.seq })),
      views: records.map((record, index) => this.bidView(record, pending[index]!.bidder.alias)),
      row: {
        ...row,
        currentBidMinor: BigInt(final.amountMinor),
        bidSeq: final.seq,
        leaderBidderId: final.bidderId,
        endsAt: extension > 0 ? newEnd! : row.endsAt,
        lotEndsAt: newEnd,
        extendedMs: row.extendedMs + extension,
      },
    };
  }

  /**
   * Whether this caller may bid on this lot: the one pure rule in
   * `bidder-trust.ts`, so the page's "you can bid" and this refusal cannot
   * drift. Staff who run auctions never bid on them, and the author of an
   * auction is named by data, not by role (doc 234 §5.7). Under `OPEN` a person
   * with no `Bidder` row yet is eligible, because their first bid registers
   * them, unless they are at the strike threshold; only then is the strike count
   * read, so the hot path of an existing bidder adds no query.
   */
  private async assertMayBid(
    tx: Prisma.TransactionClient,
    user: { id: string; permissions: readonly string[] },
    row: LotRow,
    bidder: { status: string } | null,
    policy: TrustPolicy,
  ): Promise<void> {
    const runsAuction = user.permissions.includes('auction.manage') || row.createdById === user.id;
    const mode: RegistrationMode = parseRegistrationMode(row.registration, 'OPEN');
    const reviewDue =
      !runsAuction && bidder === null && mode === 'OPEN' ? (await this.bidders.strikeState(tx, user.id, row.now, policy)).reviewDue : false;
    const verdict = eligibility({
      runsAuction,
      mode,
      bidderStatus: bidder ? (bidder.status as BidderStatus) : null,
      reviewDue,
    });
    if (verdict.eligible) return;
    throw new ForbiddenException({
      statusCode: 403,
      code: 'BIDDER_NOT_ELIGIBLE',
      message: INELIGIBLE_MESSAGES[verdict.reason],
      details: { why: verdict.reason },
    });
  }

  private encryptMax(maxMinor: number): string {
    return encryptSecret(String(maxMinor), this.config.get('APP_ENCRYPTION_KEY'));
  }

  private decryptMax(cipher: string): number {
    return Number(decryptSecret(cipher, this.config.get('APP_ENCRYPTION_KEY')));
  }

  /** Newest first. Bidders appear by alias only: identities are for the bidder-management permission (WO-234.5). */
  async listBids(auctionId: string, lotId: string, query: BidListQueryDto) {
    await this.assertLotInAuction(auctionId, lotId);
    const where = { lotId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.bid.findMany({
        where,
        include: { bidder: { select: { alias: true } } },
        orderBy: { seq: query.order },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.bid.count({ where }),
    ]);
    return paginated(
      rows.map(({ bidder, ...bid }) => ({ ...this.bidView(bid, bidder.alias), prevHash: bid.prevHash, hash: bid.hash })),
      total,
      query,
    );
  }

  /**
   * Re-walks a lot's whole chain from the first bid: every hash, every link,
   * every `seq` in an unbroken run from 1, and that the lot's stored price
   * and version are what the last bid says they are. Read in pages of 1,000 so
   * a lot with a hundred thousand bids never sits in memory at once. Writes
   * nothing, so it is safe to run on a live lot.
   */
  async verifyBids(auctionId: string, lotId: string): Promise<BidIntegrity> {
    const lot = await this.assertLotInAuction(auctionId, lotId);
    const walker = new ChainWalker();
    let afterSeq = 0;
    let count = 0;
    let lastAmount: bigint | null = null;

    for (;;) {
      const page = await this.prisma.bid.findMany({
        where: { lotId, seq: { gt: afterSeq } },
        orderBy: { seq: 'asc' },
        take: 1_000,
      });
      if (page.length === 0) break;
      for (const bid of page) {
        if (bid.seq !== count + 1) return { valid: false, reason: 'prev-mismatch', brokenAt: count, brokenAtSeq: bid.seq, bidCount: count };
        const broken = walker.next({ prevHash: bid.prevHash, hash: bid.hash, canonical: bidCanonical(bid) });
        if (broken) return { ...broken, brokenAtSeq: bid.seq, bidCount: count };
        count += 1;
        afterSeq = bid.seq;
        lastAmount = bid.amountMinor;
      }
    }

    const lotAgrees = lot.bidSeq === count && (lot.currentBidMinor ?? null) === lastAmount;
    if (!lotAgrees) return { valid: false, reason: 'hash-mismatch', brokenAt: count, bidCount: count };
    return { valid: true, bidCount: count };
  }

  /** Counts from the ledger: the tenth-most-recent bid still inside the window says when the next one is allowed. */
  private async assertWithinBidRate(tx: Prisma.TransactionClient, lotId: string, bidderId: string, now: Date): Promise<void> {
    const recent = await tx.bid.findMany({
      // Manual bids only: the system's answers on a bidder's behalf are not the
      // bidder's doing, and a bidding war must not lock a proxy holder out.
      where: { lotId, bidderId, kind: 'MANUAL', acceptedAt: { gt: new Date(now.getTime() - BID_RATE_WINDOW_MS) } },
      orderBy: { acceptedAt: 'desc' },
      take: MAX_BIDS_PER_BIDDER_PER_LOT,
      select: { acceptedAt: true },
    });
    if (recent.length < MAX_BIDS_PER_BIDDER_PER_LOT) return;
    const retryAfterSeconds = Math.max(1, Math.ceil((recent[recent.length - 1]!.acceptedAt.getTime() + BID_RATE_WINDOW_MS - now.getTime()) / 1_000));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'BID_RATE_LIMITED',
        message: `You have placed ${MAX_BIDS_PER_BIDDER_PER_LOT} bids on this lot in the last minute. Wait ${retryAfterSeconds} ${retryAfterSeconds === 1 ? 'second' : 'seconds'} and bid again.`,
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async assertLotInAuction(auctionId: string, lotId: string): Promise<AuctionLot> {
    const lot = await this.prisma.auctionLot.findFirst({ where: { id: lotId, auctionId } });
    if (!lot) throw new NotFoundException('Lot not found.');
    return lot;
  }

  private async currentBidRules(): Promise<BidRules> {
    const [incrementBps, minStepMinor, windowSeconds, extendSeconds, maxExtensionSeconds, buyerPremiumBps, paymentWindowHours] = await Promise.all([
      this.settings.get<number>(SettingKey.AuctionBidIncrementBps),
      this.settings.get<number>(SettingKey.AuctionBidMinStepMinor),
      this.settings.get<number>(SettingKey.AuctionAntiSnipeWindowSeconds),
      this.settings.get<number>(SettingKey.AuctionAntiSnipeExtendSeconds),
      this.settings.get<number>(SettingKey.AuctionMaxExtensionSeconds),
      this.settings.get<number>(SettingKey.AuctionBuyerPremiumBps),
      this.settings.get<number>(SettingKey.AuctionPaymentWindowHours),
    ]);
    // Settings are in seconds, the rules in milliseconds; a value that is not a
    // whole number of seconds is dropped by `parseBidRules` and gets the default.
    const toMs = (seconds: unknown): number | undefined =>
      typeof seconds === 'number' && Number.isFinite(seconds) ? Math.round(seconds * 1_000) : undefined;
    return parseBidRules({
      incrementBps,
      minStepMinor,
      antiSnipeWindowMs: toMs(windowSeconds),
      antiSnipeExtendMs: toMs(extendSeconds),
      maxExtensionMs: toMs(maxExtensionSeconds),
      buyerPremiumBps,
      paymentWindowMs: typeof paymentWindowHours === 'number' && Number.isFinite(paymentWindowHours) ? Math.round(paymentWindowHours * 3_600_000) : undefined,
    });
  }

  private assertBiddable(row: LotRow): void {
    if (row.auctionStatus === 'SCHEDULED' || row.auctionStatus === 'DRAFT') {
      throw new ConflictException({ statusCode: 409, code: 'LOT_NOT_OPEN', message: 'Bidding has not opened yet.' });
    }
    if (row.auctionStatus !== 'OPEN' || row.lotStatus !== 'OPEN') {
      throw new ConflictException({ statusCode: 409, code: 'LOT_NOT_OPEN', message: 'Bidding on this lot is closed.' });
    }
    if (row.now.getTime() >= row.endsAt.getTime()) {
      throw new ConflictException({ statusCode: 409, code: 'AUCTION_ENDED', message: 'Bidding on this lot has ended.' });
    }
  }

  private minimumNext(row: LotRow, rules: BidRules): number {
    return minimumNextBid(row.currentBidMinor === null ? null : Number(row.currentBidMinor), Number(row.startPriceMinor), rules);
  }

  private priceState(row: LotRow, rules: BidRules, bidderId: string): LotPriceState {
    return {
      lotId: row.id,
      currentBidMinor: row.currentBidMinor === null ? null : Number(row.currentBidMinor),
      bidSeq: row.bidSeq,
      minimumNextBidMinor: this.minimumNext(row, rules),
      endsAt: row.endsAt,
      leading: row.leaderBidderId === bidderId,
    };
  }

  private bidView(bid: { id: string; lotId: string; seq: number; amountMinor: bigint | number; kind: BidKind; acceptedAt: Date }, alias: string): BidView {
    return {
      id: bid.id,
      lotId: bid.lotId,
      seq: bid.seq,
      alias,
      amountMinor: Number(bid.amountMinor),
      kind: bid.kind,
      acceptedAt: bid.acceptedAt,
    };
  }

  /** The first bid under an `OPEN` auction registers the bidder, approved: see `provisionBidder`. */
  private async provisionBidder(tx: Prisma.TransactionClient, auctionId: string, userId: string) {
    return (await provisionBidder(tx, auctionId, userId, 'APPROVED')).bidder;
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private viewLot(lot: AuctionLot, canSeeReserve: boolean): AuctionLotView {
    const { reservePriceMinor, startPriceMinor, currentBidMinor, ...rest } = lot;
    const view = {
      ...rest,
      startPriceMinor: Number(startPriceMinor),
      currentBidMinor: this.optionalNumber(currentBidMinor),
    };
    return canSeeReserve ? { ...view, reservePriceMinor: this.optionalNumber(reservePriceMinor) } : view;
  }

  private optionalNumber(value: bigint | number | null): number | null {
    return value === null ? null : Number(value);
  }

  /** The row lock every mutation takes first; returns the status read under it. */
  private lockAuction(tx: Prisma.TransactionClient, id: string): Promise<AuctionStatus> {
    return lockAuctionStatus(tx, id);
  }

  private async lockDraft(tx: Prisma.TransactionClient, id: string, message: string): Promise<void> {
    const status = await this.lockAuction(tx, id);
    if (status !== 'DRAFT') throw new ConflictException(message);
  }

  private assertWindow(startsAt: Date, endsAt: Date): void {
    if (endsAt.getTime() <= startsAt.getTime()) throw new BadRequestException('endsAt must be after startsAt.');
  }

  private assertReserve(startPriceMinor: number, reservePriceMinor: number | undefined): void {
    if (reservePriceMinor !== undefined && reservePriceMinor < startPriceMinor) {
      throw new BadRequestException('The reserve cannot be below the opening price.');
    }
  }

  private async assertLocation(locationId: string): Promise<void> {
    const location = await this.prisma.location.findUnique({ where: { id: locationId }, select: { isActive: true } });
    if (!location || !location.isActive) throw new BadRequestException('The selling location was not found or is inactive.');
  }

  private async recordTransition(actorId: string, action: string, auction: Auction, extra: Record<string, unknown> = {}): Promise<void> {
    await this.audit.record({
      actorId,
      action,
      entity: 'Auction',
      entityId: auction.id,
      data: { number: auction.number, status: auction.status, ...extra },
    });
    this.logger.log(`${action} ${auction.number} by ${actorId}`);
  }
}
