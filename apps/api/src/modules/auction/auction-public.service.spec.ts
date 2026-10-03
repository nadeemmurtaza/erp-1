import { NotFoundException } from '@nestjs/common';
import { PublicLotListQueryDto } from './dto/auction.dto';
import { AuctionPublicService, LOT_PAGE_CACHE_MS } from './auction-public.service';
import type { AuctionRealtimeService } from './auction-realtime.service';
import type { LotLiveEvent } from './lot-live';

/**
 * launchpad-apps/234-auction-app.md WO-234.4: what a visitor may and may not
 * learn of a lot, how the page is cached, and what a signed-in caller is told
 * about themselves. The database is mocked; the real queries (the list and its
 * ordering, the count) are exercised by `test/auction-realtime.e2e-spec.ts`.
 */
describe('AuctionPublicService', () => {
  let service: AuctionPublicService;
  let prisma: any;
  let listener: ((event: LotLiveEvent) => void) | undefined;
  let lotRow: any;
  let bidRows: any[];
  const DB_NOW = new Date('2026-10-10T12:00:00.000Z');
  const AUCTION_END = new Date('2026-10-10T12:30:00.000Z');

  const lot = (over: Record<string, unknown> = {}) => ({
    id: 'l1',
    auctionId: 'a1',
    lotNo: 3,
    title: 'Pallet of denim',
    description: 'Forty rolls',
    quantity: 1,
    startPriceMinor: 100_000n,
    reservePriceMinor: 900_000n,
    currentBidMinor: 150_000n,
    leaderBidderId: 'p1',
    bidSeq: 4,
    endsAt: null,
    extendedMs: 0,
    status: 'OPEN',
    result: null,
    auction: {
      id: 'a1',
      number: 'AUC-2026-0001',
      title: 'Autumn clearance',
      status: 'OPEN',
      startsAt: new Date('2026-10-10T08:00:00.000Z'),
      endsAt: AUCTION_END,
      terms: 'Collect within 7 days.',
      bidRules: { incrementBps: 500, minStepMinor: 100 },
      createdById: 'u-owner',
    },
    ...over,
  });

  beforeEach(() => {
    jest.useFakeTimers({ now: DB_NOW });
    lotRow = lot();
    bidRows = [
      { seq: 4, amountMinor: 150_000n, kind: 'MANUAL', acceptedAt: DB_NOW, bidder: { alias: 'Bidder 2' } },
      { seq: 3, amountMinor: 130_000n, kind: 'PROXY_AUTO', acceptedAt: DB_NOW, bidder: { alias: 'Bidder 1' } },
    ];
    prisma = {
      auctionLot: { findUnique: jest.fn(async () => lotRow) },
      bid: { findMany: jest.fn(async () => bidRows), findFirst: jest.fn().mockResolvedValue(null) },
      bidder: { findUnique: jest.fn().mockResolvedValue(null) },
      proxyBid: { findUnique: jest.fn().mockResolvedValue(null) },
      $queryRaw: jest.fn(async () => [{ now: DB_NOW }]),
    };
    const realtime = {
      onEvent: (fn: (event: LotLiveEvent) => void) => {
        listener = fn;
        return () => undefined;
      },
    } as unknown as AuctionRealtimeService;
    service = new AuctionPublicService(prisma, realtime);
    service.onModuleInit();
  });

  afterEach(() => jest.useRealTimers());

  describe('the lot page', () => {
    it('shows an open lot’s price, the next minimum, the end, the newest bids by alias, and the auction’s terms', async () => {
      const view = await service.lotPage('l1');
      expect(view).toMatchObject({
        lotId: 'l1',
        lotNo: 3,
        title: 'Pallet of denim',
        phase: 'OPEN',
        currentBidMinor: 150_000,
        bidSeq: 4,
        minimumNextBidMinor: 157_500,
        endsAt: AUCTION_END.toISOString(),
        extended: false,
        serverTime: DB_NOW.toISOString(),
        auction: { id: 'a1', title: 'Autumn clearance', terms: 'Collect within 7 days.' },
      });
      expect(view.bids.map((bid) => [bid.seq, bid.alias, bid.amountMinor, bid.kind])).toEqual([
        [4, 'Bidder 2', 150_000, 'MANUAL'],
        [3, 'Bidder 1', 130_000, 'PROXY_AUTO'],
      ]);
      expect(view.outcome).toBeUndefined();
    });

    it('never carries the reserve, an account, a user id or a key, however it is looked for', async () => {
      const json = JSON.stringify(await service.lotPage('l1'));
      expect(json).not.toMatch(/reserve|900000|userId|u-owner|createdById|idempotency|hash|bidRules/i);
    });

    it('asks the database for only the newest twenty bids, never the whole ledger', async () => {
      await service.lotPage('l1');
      expect(prisma.bid.findMany.mock.calls[0][0]).toMatchObject({ where: { lotId: 'l1' }, orderBy: { seq: 'desc' }, take: 20 });
    });

    it('says the lot’s own end, and that it was moved, once anti-snipe or an outage has moved it', async () => {
      const moved = new Date(AUCTION_END.getTime() + 120_000);
      lotRow = lot({ endsAt: moved, extendedMs: 120_000 });
      expect(await service.lotPage('l1')).toMatchObject({ endsAt: moved.toISOString(), extended: true });
    });

    it('counts down to the start for a lot in a scheduled auction, and offers no bid minimum yet', async () => {
      lotRow = lot({ status: 'PENDING', currentBidMinor: null, bidSeq: 0, auction: { ...lot().auction, status: 'SCHEDULED' } });
      bidRows = [];
      expect(await service.lotPage('l1')).toMatchObject({ phase: 'UPCOMING', minimumNextBidMinor: null, currentBidMinor: null, bids: [] });
    });

    it('treats the first bid as the opening price', async () => {
      lotRow = lot({ currentBidMinor: null, bidSeq: 0 });
      bidRows = [];
      expect((await service.lotPage('l1')).minimumNextBidMinor).toBe(100_000);
    });

    it('tells a visitor a lot that is withdrawn, or in a draft or cancelled auction, does not exist', async () => {
      for (const missing of [null, lot({ status: 'WITHDRAWN' }), lot({ auction: { ...lot().auction, status: 'DRAFT' } }), lot({ auction: { ...lot().auction, status: 'CANCELLED' } })]) {
        lotRow = missing;
        await expect(service.lotPage(`x-${Math.random()}`)).rejects.toBeInstanceOf(NotFoundException);
      }
    });

    describe('how a lot ended', () => {
      const closed = (result: Record<string, unknown> | null, over: Record<string, unknown> = {}) =>
        lot({ status: 'CLOSED', auction: { ...lot().auction, status: 'CLOSED' }, result, ...over });

      it('names the winner and the price when the reserve was met', async () => {
        lotRow = closed({ topBidderId: 'p2', topBidMinor: 950_000n, reserveMet: true, bidCount: 9, closedAt: DB_NOW }, { currentBidMinor: 950_000n });
        prisma.bidder.findUnique.mockResolvedValue({ alias: 'Bidder 4' });
        const view = await service.lotPage('l1');
        expect(view).toMatchObject({ phase: 'CLOSED', minimumNextBidMinor: null, outcome: { kind: 'SOLD', topBidderAlias: 'Bidder 4', finalMinor: 950_000 } });
      });

      it('says only that the reserve was not met, never the reserve, and names no winner', async () => {
        lotRow = closed({ topBidderId: 'p2', topBidMinor: 400_000n, reserveMet: false, bidCount: 3, closedAt: DB_NOW }, { currentBidMinor: 400_000n });
        const view = await service.lotPage('l1');
        expect(view.outcome).toEqual({ kind: 'NOT_SOLD', reason: 'RESERVE_NOT_MET' });
        expect(JSON.stringify(view)).not.toMatch(/900000|Bidder 4/);
      });

      it('says there were no bids when there were none', async () => {
        lotRow = closed({ topBidderId: null, topBidMinor: null, reserveMet: false, bidCount: 0, closedAt: DB_NOW }, { currentBidMinor: null, bidSeq: 0 });
        bidRows = [];
        expect((await service.lotPage('l1')).outcome).toEqual({ kind: 'NOT_SOLD', reason: 'NO_BIDS' });
      });
    });
  });

  describe('the cache', () => {
    it('reads the database once for a burst of watchers inside a second', async () => {
      await Promise.all(Array.from({ length: 50 }, () => service.lotPage('l1')));
      await service.lotPage('l1');
      expect(prisma.auctionLot.findUnique).toHaveBeenCalledTimes(1);
    });

    it('reads again once the second is up', async () => {
      await service.lotPage('l1');
      jest.advanceTimersByTime(LOT_PAGE_CACHE_MS);
      await service.lotPage('l1');
      expect(prisma.auctionLot.findUnique).toHaveBeenCalledTimes(2);
    });

    it('drops a lot’s page the moment this node hears the lot changed, from its own bid or another node’s', async () => {
      await service.lotPage('l1');
      listener!({ lotId: 'l1' } as LotLiveEvent);
      lotRow = lot({ currentBidMinor: 160_000n, bidSeq: 5 });
      expect((await service.lotPage('l1')).currentBidMinor).toBe(160_000);
      // Another lot's change leaves this one alone.
      listener!({ lotId: 'other' } as LotLiveEvent);
      await service.lotPage('l1');
      expect(prisma.auctionLot.findUnique).toHaveBeenCalledTimes(2);
    });

    it('ages the server time by what has passed, so a cached page never sets a countdown back', async () => {
      await service.lotPage('l1');
      jest.advanceTimersByTime(700);
      const view = await service.lotPage('l1');
      expect(view.serverTime).toBe(new Date(DB_NOW.getTime() + 700).toISOString());
    });

    it('never keeps a miss or a failure: the next read asks again', async () => {
      lotRow = null;
      await expect(service.lotPage('l1')).rejects.toBeInstanceOf(NotFoundException);
      lotRow = lot();
      await expect(service.lotPage('l1')).resolves.toMatchObject({ lotId: 'l1' });
      expect(prisma.auctionLot.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('a live snapshot', () => {
    it('is the lot’s state as an event, bids oldest first, open or closed by the lot’s phase', async () => {
      const snapshot = await service.liveSnapshot('l1');
      expect(snapshot).toMatchObject({ lotId: 'l1', state: 'OPEN', bidSeq: 4, currentBidMinor: 150_000, minimumNextBidMinor: 157_500 });
      expect(snapshot.newBids.map((bid) => bid.seq)).toEqual([3, 4]);
    });

    it('says upcoming for a lot whose auction has not opened, and never closed', async () => {
      lotRow = lot({ status: 'PENDING', currentBidMinor: null, bidSeq: 0, auction: { ...lot().auction, status: 'SCHEDULED' } });
      bidRows = [];
      expect(await service.liveSnapshot('l1')).toMatchObject({ lotId: 'l1', state: 'UPCOMING', bidSeq: 0, minimumNextBidMinor: null });
    });

    it('skips the cache when asked, so an announcement is never older than the commit it follows', async () => {
      await service.lotPage('l1');
      lotRow = lot({ currentBidMinor: 160_000n, bidSeq: 5 });
      expect((await service.liveSnapshot('l1', { fresh: true })).bidSeq).toBe(5);
    });
  });

  describe('viewerState', () => {
    const customer = { id: 'u-bidder', permissions: [] as string[] };
    const withLot = (over: Record<string, unknown> = {}) => {
      prisma.auctionLot.findUnique.mockResolvedValue({
        status: 'OPEN',
        leaderBidderId: 'p1',
        auction: { id: 'a1', status: 'OPEN', createdById: 'u-owner' },
        ...over,
      });
    };

    it('says a first-time visitor may bid, with no alias yet and not leading', async () => {
      withLot();
      expect(await service.viewerState('l1', customer)).toEqual({ alias: null, participating: false, leading: false, eligible: true });
    });

    it('says a bidder leads when the lot’s leader is them, with their alias', async () => {
      withLot();
      prisma.bidder.findUnique.mockResolvedValue({ id: 'p1', alias: 'Bidder 5', status: 'APPROVED' });
      prisma.bid.findFirst.mockResolvedValue({ id: 'b1' });
      expect(await service.viewerState('l1', customer)).toEqual({ alias: 'Bidder 5', participating: true, leading: true, eligible: true });
    });

    it('says an outbid bidder is not leading, and is in the contest', async () => {
      withLot({ leaderBidderId: 'someone-else' });
      prisma.bidder.findUnique.mockResolvedValue({ id: 'p1', alias: 'Bidder 5', status: 'APPROVED' });
      prisma.bid.findFirst.mockResolvedValue({ id: 'b1' });
      expect(await service.viewerState('l1', customer)).toMatchObject({ leading: false, participating: true, eligible: true });
    });

    it('says a bidder with an alias from another lot of the auction is not in this lot’s contest', async () => {
      withLot({ leaderBidderId: 'someone-else' });
      prisma.bidder.findUnique.mockResolvedValue({ id: 'p1', alias: 'Bidder 5', status: 'APPROVED' });
      expect(await service.viewerState('l1', customer)).toEqual({ alias: 'Bidder 5', participating: false, leading: false, eligible: true });
    });

    it('counts a standing maximum as being in the contest even with no bid placed yet', async () => {
      withLot({ leaderBidderId: 'someone-else' });
      prisma.bidder.findUnique.mockResolvedValue({ id: 'p1', alias: 'Bidder 5', status: 'APPROVED' });
      prisma.proxyBid.findUnique.mockResolvedValue({ id: 'x1' });
      expect(await service.viewerState('l1', customer)).toMatchObject({ participating: true, leading: false });
    });

    it('explains why staff who run the auction, and its author, cannot bid, before they try', async () => {
      withLot();
      const staff = await service.viewerState('l1', { id: 'u-staff', permissions: ['auction.manage'] });
      expect(staff).toMatchObject({ eligible: false, reason: { code: 'BIDDER_NOT_ELIGIBLE' } });
      expect(staff.reason!.message).toContain('Staff who run this auction');
      expect(await service.viewerState('l1', { id: 'u-owner', permissions: [] })).toMatchObject({ eligible: false });
    });

    it('explains a bidder who is not approved', async () => {
      withLot();
      prisma.bidder.findUnique.mockResolvedValue({ id: 'p1', alias: 'Bidder 5', status: 'SUSPENDED' });
      const state = await service.viewerState('l1', customer);
      expect(state).toMatchObject({ eligible: false, alias: 'Bidder 5' });
      expect(state.reason!.message).toContain('not approved');
    });

    it('is a 404 for a lot a visitor may not know exists', async () => {
      prisma.auctionLot.findUnique.mockResolvedValue(null);
      await expect(service.viewerState('l1', customer)).rejects.toBeInstanceOf(NotFoundException);
      withLot({ status: 'WITHDRAWN' });
      await expect(service.viewerState('l1', customer)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('the list', () => {
    const query = (over: Partial<PublicLotListQueryDto> = {}) => Object.assign(new PublicLotListQueryDto(), over);
    const row = (over: Record<string, unknown> = {}) => ({
      id: 'l1',
      lotNo: 1,
      title: 'Pallet',
      startPriceMinor: 100_000n,
      currentBidMinor: 150_000n,
      bidSeq: 4,
      auctionId: 'a1',
      auctionTitle: 'Autumn clearance',
      startsAt: new Date('2026-10-10T08:00:00.000Z'),
      endsAt: AUCTION_END,
      dbNow: new Date('2026-10-10T09:30:00.000Z'),
      ...over,
    });

    it('lists live lots as open, with the price in numbers and the count of bids', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([row()]).mockResolvedValueOnce([{ total: 1n }]);
      const result = await service.listLots(query());
      expect(result.data[0]).toEqual({
        lotId: 'l1',
        lotNo: 1,
        title: 'Pallet',
        auction: { id: 'a1', title: 'Autumn clearance' },
        phase: 'OPEN',
        startsAt: '2026-10-10T08:00:00.000Z',
        endsAt: AUCTION_END.toISOString(),
        startPriceMinor: 100_000,
        currentBidMinor: 150_000,
        bidCount: 4,
      });
      expect(result.meta).toMatchObject({ page: 1, pageSize: 20, total: 1 });
      expect(result.serverTime).toBe('2026-10-10T09:30:00.000Z');
      expect(() => JSON.stringify(result)).not.toThrow();
    });

    it('lists ended lots as sold at a price only when the reserve was met, and as not sold otherwise', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([row({ topBidMinor: 950_000n, reserveMet: true }), row({ id: 'l2', topBidMinor: 400_000n, reserveMet: false }), row({ id: 'l3', topBidMinor: null, reserveMet: false })])
        .mockResolvedValueOnce([{ total: 3n }]);
      const result = await service.listLots(query({ state: 'ended' }));
      expect(result.data.map((lot) => [lot.phase, lot.outcome])).toEqual([
        ['CLOSED', { kind: 'SOLD', finalMinor: 950_000 }],
        ['CLOSED', { kind: 'NOT_SOLD' }],
        ['CLOSED', { kind: 'NOT_SOLD' }],
      ]);
    });

    it('lists upcoming lots as upcoming', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([row({ currentBidMinor: null, bidSeq: 0 })]).mockResolvedValueOnce([{ total: 1n }]);
      expect((await service.listLots(query({ state: 'upcoming' }))).data[0]).toMatchObject({ phase: 'UPCOMING', currentBidMinor: null, bidCount: 0 });
    });

    it('is an empty page, not an error, when there is nothing to show', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0n }]);
      expect(await service.listLots(query())).toMatchObject({ data: [], meta: { total: 0, totalPages: 0 } });
    });

    it('asks for the page the caller named, not the whole table', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0n }]);
      await service.listLots(query({ page: 3, pageSize: 10 }));
      const values = prisma.$queryRaw.mock.calls[0].slice(1).flatMap((value: unknown) => (value && typeof value === 'object' && 'values' in (value as any) ? (value as any).values : [value]));
      expect(values).toEqual(expect.arrayContaining([10, 20]));
    });
  });
});
