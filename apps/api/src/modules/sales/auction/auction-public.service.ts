import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { paginated } from '../../../core/common/dto/pagination.dto';
import { Prisma } from '../../../core/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuctionBidderService } from './auction-bidder.service';
import { AuctionRealtimeService } from './auction-realtime.service';
import { AuctionSettlementService, type WinnerSettlementView } from './auction-settlement.service';
import { eligibility, INELIGIBLE_MESSAGES, parseRegistrationMode, registrationView, type IneligibleReason, type RegistrationView } from './bidder-trust';
import { minimumNextBid, parseBidRules } from './bidding';
import type { PublicLotListQueryDto } from './dto/auction.dto';
import { MAX_EVENT_BIDS, type LiveBid, type LotLiveEvent, type LotPublicOutcome } from './lot-live';

/**
 * How long a lot's public page may be served from this node's memory, in
 * milliseconds. Every watcher on a page reads it, and a hot lot's watchers
 * number in the thousands; one second keeps the cost at one database read per
 * lot per node per second however many are watching, and a second is also all a
 * price can be behind: the live stream carries every change as it happens, and
 * a change this node learns of, from its own bids or from another node over
 * Redis, drops the entry at once. Freshness requirement: a page never shows a
 * price older than the stream's own delay plus this second.
 */
export const LOT_PAGE_CACHE_MS = 1_000;

/**
 * Lots held in that cache at once. Entries live a second, so this only bites
 * when more than 2 000 different lots are read within one; then the oldest go
 * first. Bounds memory at a few megabytes whatever the traffic.
 */
const MAX_CACHED_LOTS = 2_000;

/** Bids a lot page lists, newest first. The ledger beyond it is for staff. */
export const PAGE_BIDS = MAX_EVENT_BIDS;

export type PublicLotPhase = 'UPCOMING' | 'OPEN' | 'CLOSED';

/** A lot as anyone may see it. Never the reserve, never a name, never an account. */
export interface PublicLotView {
  lotId: string;
  lotNo: number;
  title: string;
  description: string | null;
  quantity: number;
  auction: {
    id: string;
    number: string;
    title: string;
    status: string;
    startsAt: string;
    terms: string | null;
    /** The buyer's premium the winner pays on top of the winning bid, in basis points (1 000 is 10%), frozen when the sale was scheduled. 0 means none. Told before anyone bids. */
    buyerPremiumBps: number;
    /** How many hours a winner has to pay, frozen when the sale was scheduled. */
    paymentWindowHours: number;
  };
  /** The lot's photographs, cover first. Addresses only: nothing about how or by whom they were stored. */
  images: Array<{ url: string }>;
  phase: PublicLotPhase;
  startPriceMinor: number;
  currentBidMinor: number | null;
  /** How many bids the lot has taken; also the version a live page compares. */
  bidSeq: number;
  /** What the next bid must reach; null unless the lot is open. */
  minimumNextBidMinor: number | null;
  /** When bidding on the lot ends, once it has been moved by anti-snipe or an outage; else the auction's end. */
  endsAt: string;
  /** True when the lot's end has been moved from the auction's. */
  extended: boolean;
  /** The database clock, for correcting a page's countdown. */
  serverTime: string;
  /** Newest first. */
  bids: LiveBid[];
  outcome?: LotPublicOutcome;
}

export interface PublicLotSummary {
  lotId: string;
  lotNo: number;
  title: string;
  auction: { id: string; title: string };
  /** The lot's first photograph, or null when it has none. */
  coverUrl: string | null;
  phase: PublicLotPhase;
  /** When the auction opens: what an upcoming lot counts down to. */
  startsAt: string;
  endsAt: string;
  startPriceMinor: number;
  currentBidMinor: number | null;
  bidCount: number;
  /** Set on an ended lot: sold at a price, or not sold. */
  outcome?: { kind: 'SOLD'; finalMinor: number } | { kind: 'NOT_SOLD' };
}

/** What the signed-in caller is to this lot: whether they lead it and whether they may bid. */
export interface ViewerLotState {
  /** The caller's alias in this auction, once they have bid or set a maximum on any of its lots. */
  alias: string | null;
  /** Whether the caller has a bid or a standing maximum on THIS lot: an alias is per auction, so it alone does not say they are in this lot's contest. */
  participating: boolean;
  leading: boolean;
  eligible: boolean;
  /** Why not, from the one rule `placeBid()` also uses (`eligibility()`): the page tells it in the shopper's language from `why`. */
  reason?: { code: 'BIDDER_NOT_ELIGIBLE'; why: IneligibleReason; message: string };
  /** The caller's own place in this auction: joined or not, waiting, declined, suspended, and any appeal. Never anyone else's. */
  registration: RegistrationView;
  /** What the caller owes for winning this lot, once it has closed in their favour; their own, never another bidder's. Null before then. */
  settlement: WinnerSettlementView | null;
}

interface LotPageRow {
  lot: Prisma.AuctionLotGetPayload<{ include: { result: true; images: { select: { url: true } } } }>;
  auction: { id: string; number: string; title: string; status: string; startsAt: Date; endsAt: Date; terms: string | null; bidRules: unknown };
  bids: Array<{ seq: number; amountMinor: bigint; kind: LiveBid['kind']; acceptedAt: Date; alias: string }>;
  topAlias: string | null;
  dbNow: Date;
}

interface CacheEntry {
  /** This node's clock when the page was loaded, to age `serverTime` by what has passed since. */
  loadedAt: number;
  view: Promise<PublicLotView>;
}

/**
 * The read side of the Auction app for people who are not signed in
 * (launchpad-apps/234-auction-app.md §11, WO-234.4): the lot page, the list
 * of lots, and the snapshot a live stream starts from.
 *
 * Everything here is public by design, so what it leaves out is the whole of
 * its security: no reserve (only whether a closed lot sold), no account or name
 * (aliases only), no maximum of anyone's, no idempotency key. A lot that is
 * withdrawn, or in an auction that is a draft or cancelled, does not exist to
 * a visitor: a 404, the same as a lot that was never there.
 */
@Injectable()
export class AuctionPublicService implements OnModuleInit {
  private readonly logger = new Logger(AuctionPublicService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: AuctionRealtimeService,
    private readonly bidders: AuctionBidderService,
    private readonly settlement: AuctionSettlementService,
  ) {}

  onModuleInit(): void {
    // A change to a lot, from this node or another, makes its cached page stale.
    this.realtime.onEvent((event) => this.cache.delete(event.lotId));
  }

  /** The lot page, from this node's memory when it is under a second old. */
  async lotPage(lotId: string): Promise<PublicLotView> {
    const now = Date.now();
    const cached = this.cache.get(lotId);
    if (cached && now - cached.loadedAt < LOT_PAGE_CACHE_MS) {
      const view = await cached.view;
      // Aged by what has passed on this node's clock since the page was read, so a countdown is never put back by the cache.
      return { ...view, serverTime: new Date(Date.parse(view.serverTime) + (Date.now() - cached.loadedAt)).toISOString() };
    }

    const loadedAt = now;
    const view = this.loadLotPage(lotId);
    this.remember(lotId, { loadedAt, view });
    try {
      return await view;
    } catch (error) {
      // A miss or a failure is never kept, so the next read asks again.
      if (this.cache.get(lotId)?.view === view) this.cache.delete(lotId);
      throw error;
    }
  }

  /** The lot's current state as a live event, for a stream to start from and for the lifecycle to announce. Skips the cache. */
  async liveSnapshot(lotId: string, options: { fresh?: boolean } = {}): Promise<LotLiveEvent> {
    const view = options.fresh ? await this.loadLotPage(lotId) : await this.lotPage(lotId);
    return {
      lotId,
      state: view.phase,
      bidSeq: view.bidSeq,
      currentBidMinor: view.currentBidMinor,
      minimumNextBidMinor: view.minimumNextBidMinor,
      endsAt: view.endsAt,
      serverTime: view.serverTime,
      // Oldest first, as an event's bids are; the page already has them in `bids`, so this is only what a stream has to say that a read has not.
      newBids: [...view.bids].reverse(),
      ...(view.outcome ? { outcome: view.outcome } : {}),
    };
  }

  /** Lots to browse: live (ending soonest), upcoming (starting soonest), or ended (most recent). */
  async listLots(query: PublicLotListQueryDto) {
    const search = query.q?.trim();
    const titleFilter = search ? Prisma.sql`AND l."title" ILIKE ${`%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`}` : Prisma.empty;

    const [where, order, join] =
      query.state === 'upcoming'
        ? [
            Prisma.sql`a."status" = 'SCHEDULED' AND l."status" = 'PENDING'`,
            Prisma.sql`a."startsAt" ASC, a."id", l."lotNo"`,
            Prisma.empty,
          ]
        : query.state === 'ended'
          ? [
              Prisma.sql`l."status" = 'CLOSED' AND a."status" IN ('OPEN', 'CLOSING', 'CLOSED', 'SETTLED')`,
              Prisma.sql`r."closedAt" DESC, l."id"`,
              Prisma.sql`JOIN "AuctionResult" r ON r."lotId" = l."id"`,
            ]
          : [
              Prisma.sql`a."status" = 'OPEN' AND l."status" = 'OPEN'`,
              Prisma.sql`COALESCE(l."endsAt", a."endsAt") ASC, l."id"`,
              Prisma.empty,
            ];
    const result = query.state === 'ended' ? Prisma.sql`, r."topBidMinor", r."reserveMet"` : Prisma.empty;

    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          id: string;
          lotNo: number;
          title: string;
          startPriceMinor: bigint;
          currentBidMinor: bigint | null;
          bidSeq: number;
          coverUrl: string | null;
          auctionId: string;
          auctionTitle: string;
          startsAt: Date;
          endsAt: Date;
          dbNow: Date;
          topBidMinor?: bigint | null;
          reserveMet?: boolean;
        }>
      >`
        SELECT l."id", l."lotNo", l."title", l."startPriceMinor", l."currentBidMinor", l."bidSeq",
               (SELECT i."url" FROM "AuctionLotImage" i WHERE i."lotId" = l."id" ORDER BY i."order" LIMIT 1) AS "coverUrl",
               a."id" AS "auctionId", a."title" AS "auctionTitle", a."startsAt",
               COALESCE(l."endsAt", a."endsAt") AS "endsAt", clock_timestamp() AS "dbNow" ${result}
        FROM "AuctionLot" l
        JOIN "Auction" a ON a."id" = l."auctionId"
        ${join}
        WHERE ${where} ${titleFilter}
        ORDER BY ${order}
        LIMIT ${query.take} OFFSET ${query.skip}
      `,
      this.prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*) AS "total"
        FROM "AuctionLot" l
        JOIN "Auction" a ON a."id" = l."auctionId"
        ${join}
        WHERE ${where} ${titleFilter}
      `,
    ]);

    const phase: PublicLotPhase = query.state === 'upcoming' ? 'UPCOMING' : query.state === 'ended' ? 'CLOSED' : 'OPEN';
    const summaries: PublicLotSummary[] = rows.map((row) => ({
      lotId: row.id,
      lotNo: row.lotNo,
      title: row.title,
      auction: { id: row.auctionId, title: row.auctionTitle },
      coverUrl: row.coverUrl,
      phase,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      startPriceMinor: Number(row.startPriceMinor),
      currentBidMinor: row.currentBidMinor === null ? null : Number(row.currentBidMinor),
      bidCount: row.bidSeq,
      ...(phase === 'CLOSED'
        ? { outcome: row.reserveMet && row.topBidMinor != null ? { kind: 'SOLD' as const, finalMinor: Number(row.topBidMinor) } : { kind: 'NOT_SOLD' as const } }
        : {}),
    }));
    // The database clock, read with the rows, so a list of countdowns can be corrected for a wrong device clock like a lot page is. An empty page has no countdowns and needs none.
    const serverTime = (rows[0]?.dbNow ?? new Date()).toISOString();
    return { ...paginated(summaries, Number(counts[0]?.total ?? 0), query), serverTime };
  }

  private async loadLotPage(lotId: string): Promise<PublicLotView> {
    const row = await this.readLot(lotId);
    const { lot, auction } = row;

    const phase: PublicLotPhase =
      lot.status === 'CLOSED' || (auction.status !== 'SCHEDULED' && auction.status !== 'OPEN')
        ? 'CLOSED'
        : auction.status === 'SCHEDULED' || lot.status === 'PENDING'
          ? 'UPCOMING'
          : 'OPEN';

    const rules = parseBidRules(auction.bidRules);
    const currentBidMinor = lot.currentBidMinor === null ? null : Number(lot.currentBidMinor);
    const effectiveEnd = lot.endsAt ?? auction.endsAt;

    return {
      lotId: lot.id,
      lotNo: lot.lotNo,
      title: lot.title,
      description: lot.description,
      quantity: lot.quantity,
      images: lot.images.map((image) => ({ url: image.url })),
      auction: {
        id: auction.id,
        number: auction.number,
        title: auction.title,
        status: auction.status,
        startsAt: auction.startsAt.toISOString(),
        terms: auction.terms,
        buyerPremiumBps: rules.buyerPremiumBps,
        paymentWindowHours: Math.round(rules.paymentWindowMs / 3_600_000),
      },
      phase,
      startPriceMinor: Number(lot.startPriceMinor),
      currentBidMinor,
      bidSeq: lot.bidSeq,
      minimumNextBidMinor: phase === 'OPEN' ? minimumNextBid(currentBidMinor, Number(lot.startPriceMinor), rules) : null,
      endsAt: effectiveEnd.toISOString(),
      extended: lot.endsAt !== null && lot.endsAt.getTime() !== auction.endsAt.getTime(),
      serverTime: row.dbNow.toISOString(),
      bids: row.bids.map((bid) => ({
        seq: bid.seq,
        alias: bid.alias,
        amountMinor: Number(bid.amountMinor),
        kind: bid.kind,
        acceptedAt: bid.acceptedAt.toISOString(),
      })),
      ...(phase === 'CLOSED' && lot.status === 'CLOSED' ? { outcome: this.outcomeOf(lot, row.topAlias) } : {}),
    };
  }

  /** The lot, its auction and its newest bids, or a 404 for anything a visitor may not know exists. */
  private async readLot(lotId: string): Promise<LotPageRow> {
    const [lot, dbNowRows] = await Promise.all([
      this.prisma.auctionLot.findUnique({
        where: { id: lotId },
        include: {
          result: true,
          images: { orderBy: { order: 'asc' }, select: { url: true } },
          auction: { select: { id: true, number: true, title: true, status: true, startsAt: true, endsAt: true, terms: true, bidRules: true } },
        },
      }),
      this.prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`,
    ]);
    if (!lot || lot.status === 'WITHDRAWN' || lot.auction.status === 'DRAFT' || lot.auction.status === 'CANCELLED') {
      throw new NotFoundException('Lot not found.');
    }
    const { auction, ...lotOnly } = lot;

    const [bids, top] = await Promise.all([
      this.prisma.bid.findMany({
        where: { lotId },
        orderBy: { seq: 'desc' },
        take: PAGE_BIDS,
        select: { seq: true, amountMinor: true, kind: true, acceptedAt: true, bidder: { select: { alias: true } } },
      }),
      lotOnly.result?.topBidderId
        ? this.prisma.bidder.findUnique({ where: { id: lotOnly.result.topBidderId }, select: { alias: true } })
        : Promise.resolve(null),
    ]);
    return {
      lot: lotOnly,
      auction,
      bids: bids.map(({ bidder, ...bid }) => ({ ...bid, alias: bidder.alias })),
      topAlias: top?.alias ?? null,
      dbNow: dbNowRows[0]!.now,
    };
  }

  /** Sold only if the reserve was met; the public never learns the reserve itself, only the verdict. */
  private outcomeOf(lot: LotPageRow['lot'], topAlias: string | null): LotPublicOutcome {
    const result = lot.result;
    if (!result || result.topBidMinor === null || !result.topBidderId) return { kind: 'NOT_SOLD', reason: 'NO_BIDS' };
    if (!result.reserveMet || topAlias === null) return { kind: 'NOT_SOLD', reason: 'RESERVE_NOT_MET' };
    return { kind: 'SOLD', topBidderAlias: topAlias, finalMinor: Number(result.topBidMinor) };
  }

  /**
   * Whether the signed-in caller leads this lot and may bid on it. Read from
   * the live rows, not the cache: it is the caller's own state, and the page
   * asks once on load and again when the live stream says the price moved.
   */
  async viewerState(lotId: string, user: { id: string; permissions: readonly string[] }): Promise<ViewerLotState> {
    const lot = await this.prisma.auctionLot.findUnique({
      where: { id: lotId },
      select: {
        status: true,
        leaderBidderId: true,
        auction: { select: { id: true, status: true, createdById: true, registration: true } },
      },
    });
    if (!lot || lot.status === 'WITHDRAWN' || lot.auction.status === 'DRAFT' || lot.auction.status === 'CANCELLED') {
      throw new NotFoundException('Lot not found.');
    }
    const bidder = await this.prisma.bidder.findUnique({ where: { auctionId_userId: { auctionId: lot.auction.id, userId: user.id } } });
    const alias = bidder?.alias ?? null;
    const leading = bidder !== null && lot.leaderBidderId === bidder.id;
    const participating = bidder === null ? false : (await this.hasStakeInLot(lotId, bidder.id));

    const mode = parseRegistrationMode(lot.auction.registration, 'OPEN');
    const runsAuction = user.permissions.includes('auction.manage') || lot.auction.createdById === user.id;
    // Only someone with no row under an open auction needs the strike count: it decides whether their first bid would register them.
    const reviewDue =
      !runsAuction && bidder === null && mode === 'OPEN' ? (await this.bidders.strikeState(this.prisma, user.id, new Date(), await this.bidders.policy())).reviewDue : false;
    const verdict = eligibility({ runsAuction, mode, bidderStatus: bidder?.status ?? null, reviewDue });
    const registration = registrationView(mode, bidder);
    // Only a bidder with a row can have won; a lot nobody has closed has no debt to look for.
    const settlement = bidder === null ? null : await this.settlement.forWinner(lotId, user.id);

    if (verdict.eligible) return { alias, participating, leading, eligible: true, registration, settlement };
    return {
      alias,
      participating,
      leading,
      eligible: false,
      reason: { code: 'BIDDER_NOT_ELIGIBLE', why: verdict.reason, message: INELIGIBLE_MESSAGES[verdict.reason] },
      registration,
      settlement,
    };
  }

  /** A bid or a standing maximum, either one: the two ways a bidder can be in a lot's contest. */
  private async hasStakeInLot(lotId: string, bidderId: string): Promise<boolean> {
    const [bid, proxy] = await Promise.all([
      this.prisma.bid.findFirst({ where: { lotId, bidderId }, select: { id: true } }),
      this.prisma.proxyBid.findUnique({ where: { lotId_bidderId: { lotId, bidderId } }, select: { id: true } }),
    ]);
    return bid !== null || proxy !== null;
  }

  private remember(lotId: string, entry: CacheEntry): void {
    if (this.cache.size >= MAX_CACHED_LOTS) {
      const now = Date.now();
      for (const [key, held] of this.cache) if (now - held.loadedAt >= LOT_PAGE_CACHE_MS) this.cache.delete(key);
      // Still full: the oldest go, which is the front of a Map in insertion order.
      while (this.cache.size >= MAX_CACHED_LOTS) {
        const oldest = this.cache.keys().next().value;
        if (oldest === undefined) break;
        this.cache.delete(oldest);
      }
    }
    this.cache.delete(lotId);
    this.cache.set(lotId, entry);
  }
}
