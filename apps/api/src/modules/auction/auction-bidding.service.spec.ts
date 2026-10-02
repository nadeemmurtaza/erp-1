import { ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { chainHash } from '../../core/common/hash-chain';
import { AppConfigService } from '../../core/config/app-config.service';
import { AuditService } from '../../core/audit/audit.service';
import { Prisma } from '../../core/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AuctionService } from './auction.service';
import { bidCanonical } from './bidding';
import { BidListQueryDto } from './dto/auction.dto';

/**
 * launchpad-apps/234-auction-app.md WO-234.2. The database is mocked, so these
 * prove the decisions `placeBid()` makes and the order it makes them in; that
 * the lot lock and the predicate hold under real concurrency is proved against
 * the real database in `test/auction-bidding.e2e-spec.ts`.
 */
describe('AuctionService bidding', () => {
  let service: AuctionService;
  let prisma: any;
  let lotRow: any;
  /** What the guarded UPDATE reports: rows changed. 0 means the lot moved under the bid. */
  let updateResult: number;
  let writes: string[];

  const NOW = new Date('2026-10-02T12:00:00.000Z');
  const user = { id: 'u-bidder', permissions: [] as string[] };
  const input = (over: Record<string, unknown> = {}) => ({
    lotId: 'l1',
    amountMinor: 100_000,
    idempotencyKey: 'key-0000-0001',
    user,
    ...over,
  });
  const bidder = (over: Record<string, unknown> = {}) => ({ id: 'p1', auctionId: 'a1', userId: 'u-bidder', alias: 'Bidder 1', status: 'APPROVED', ...over });

  beforeEach(async () => {
    writes = [];
    updateResult = 1;
    lotRow = {
      id: 'l1',
      auctionId: 'a1',
      lotStatus: 'OPEN',
      startPriceMinor: 100_000n,
      currentBidMinor: null,
      leaderBidderId: null,
      bidSeq: 0,
      auctionStatus: 'OPEN',
      endsAt: new Date(NOW.getTime() + 600_000),
      bidRules: { incrementBps: 500, minStepMinor: 100 },
      createdById: 'u-owner',
      now: NOW,
    };
    prisma = {
      $queryRaw: jest.fn(async () => [lotRow]),
      $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?');
        if (sql.includes('pg_advisory_xact_lock')) {
          writes.push(values[0] === 8_241_172 ? 'lock:bidders' : 'lock');
          return 1;
        }
        writes.push('update-lot');
        return updateResult;
      }),
      bidder: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(async ({ data }: any) => {
          writes.push('create-bidder');
          return { id: 'p-new', status: 'APPROVED', ...data };
        }),
      },
      bid: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(async ({ data }: any) => {
          writes.push('create-bid');
          return data;
        }),
      },
      auctionLot: { findFirst: jest.fn().mockResolvedValue({ id: 'l1', auctionId: 'a1', bidSeq: 0, currentBidMinor: null }) },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuctionService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: { get: jest.fn() } },
        { provide: AppConfigService, useValue: { nodeRole: 'STANDALONE', nodeId: 'N1' } },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = module.get(AuctionService);
  });

  const refusal = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error: any) {
      return error;
    }
    throw new Error('expected the bid to be refused');
  };

  describe('accepting a bid', () => {
    it('takes the lot lock first, provisions the bidder, moves the lot with its predicate, then records the bid', async () => {
      const result = await service.placeBid(input());

      expect(writes).toEqual(['lock', 'lock:bidders', 'create-bidder', 'update-lot', 'create-bid']);
      expect(result.replayed).toBe(false);
      expect(result.bid).toMatchObject({ lotId: 'l1', seq: 1, alias: 'Bidder 1', amountMinor: 100_000, kind: 'MANUAL', acceptedAt: NOW });
      expect(result.lot).toMatchObject({ currentBidMinor: 100_000, bidSeq: 1, minimumNextBidMinor: 105_000, leading: true });
    });

    it('guards the UPDATE with the version it read, the open status and the end time', async () => {
      await service.placeBid(input());
      const update = prisma.$executeRaw.mock.calls.find(([s]: [TemplateStringsArray]) => s.join('?').includes('UPDATE "AuctionLot"'));
      const sql = update[0].join('?');
      expect(sql).toContain(`"status" = 'OPEN'`);
      expect(sql).toContain('"bidSeq" =');
      expect(sql).toContain('a."endsAt" >');
      // values: new price, leader, new seq, accepted-at, lot id, the seq that was read, accepted-at again
      expect(update.slice(1)).toEqual([100_000, 'p-new', 1, NOW, 'l1', 0, NOW]);
    });

    it('accepts a first bid at exactly the opening price, and refuses one a unit below it', async () => {
      await expect(service.placeBid(input({ amountMinor: 100_000 }))).resolves.toMatchObject({ replayed: false });
      const low = await refusal(service.placeBid(input({ amountMinor: 99_999, idempotencyKey: 'key-0000-0002' })));
      expect(low.getResponse()).toMatchObject({ code: 'BID_TOO_LOW', details: { minimumNextBidMinor: 100_000 } });
    });

    it('chains the bid to the previous one and numbers it one after the lot', async () => {
      lotRow = { ...lotRow, currentBidMinor: 100_000n, bidSeq: 4, leaderBidderId: 'p-other' };
      prisma.bidder.findUnique.mockResolvedValue(bidder());
      prisma.bid.findFirst.mockResolvedValue({ hash: 'previous-hash' });

      const result = await service.placeBid(input({ amountMinor: 105_000 }));

      const created = prisma.bid.create.mock.calls[0][0].data;
      expect(created).toMatchObject({ seq: 5, prevHash: 'previous-hash', amountMinor: 105_000, bidderId: 'p1' });
      expect(created.hash).toBe(chainHash('previous-hash', bidCanonical(created)));
      expect(result.lot.minimumNextBidMinor).toBe(110_250);
    });

    it('starts the chain with no predecessor', async () => {
      await service.placeBid(input());
      const created = prisma.bid.create.mock.calls[0][0].data;
      expect(created.prevHash).toBeNull();
      expect(created.hash).toBe(chainHash(null, bidCanonical(created)));
    });

    it('accepts exactly the minimum next bid and refuses a unit below it, naming the minimum', async () => {
      lotRow = { ...lotRow, currentBidMinor: 200_000n, bidSeq: 2, leaderBidderId: 'p-other' };
      prisma.bidder.findUnique.mockResolvedValue(bidder());

      const low = await refusal(service.placeBid(input({ amountMinor: 209_999 })));
      expect(low).toBeInstanceOf(ConflictException);
      expect(low.getResponse()).toMatchObject({ code: 'BID_TOO_LOW', details: { minimumNextBidMinor: 210_000 } });
      expect(writes).toEqual(['lock']);

      await expect(service.placeBid(input({ amountMinor: 210_000, idempotencyKey: 'key-0000-0002' }))).resolves.toMatchObject({ replayed: false });
    });

    it('uses the rules frozen on the auction, not the defaults', async () => {
      lotRow = { ...lotRow, currentBidMinor: 100_000n, bidSeq: 1, leaderBidderId: 'p-other', bidRules: { incrementBps: 1_000, minStepMinor: 100 } };
      prisma.bidder.findUnique.mockResolvedValue(bidder());
      const low = await refusal(service.placeBid(input({ amountMinor: 109_999 })));
      expect(low.getResponse().details.minimumNextBidMinor).toBe(110_000);
    });

    it('numbers a new bidder after the auction’s existing ones', async () => {
      prisma.bidder.count.mockResolvedValue(6);
      await service.placeBid(input());
      expect(prisma.bidder.create).toHaveBeenCalledWith({ data: { auctionId: 'a1', userId: 'u-bidder', alias: 'Bidder 7' } });
    });

    it('reuses the bidder a returning bidder already is', async () => {
      prisma.bidder.findUnique.mockResolvedValue(bidder({ alias: 'Bidder 4', id: 'p4' }));
      const result = await service.placeBid(input());
      expect(prisma.bidder.create).not.toHaveBeenCalled();
      expect(result.bid.alias).toBe('Bidder 4');
    });

    it('never puts the reserve, the bidder’s user id or the idempotency key in the answer', async () => {
      const result = await service.placeBid(input());
      const text = JSON.stringify(result);
      expect(text).not.toContain('u-bidder');
      expect(text).not.toContain('reserve');
      expect(text).not.toContain('key-0000-0001');
    });
  });

  describe('a retry', () => {
    it('returns the bid already accepted and writes nothing', async () => {
      lotRow = { ...lotRow, currentBidMinor: 100_000n, bidSeq: 1, leaderBidderId: 'p1' };
      prisma.bidder.findUnique.mockResolvedValue(bidder());
      prisma.bid.findUnique.mockResolvedValue({ id: 'b1', lotId: 'l1', seq: 1, amountMinor: 100_000n, kind: 'MANUAL', acceptedAt: NOW });

      const result = await service.placeBid(input());

      expect(result.replayed).toBe(true);
      expect(result.bid).toMatchObject({ id: 'b1', seq: 1, amountMinor: 100_000 });
      expect(result.lot.leading).toBe(true);
      expect(writes).toEqual(['lock']);
    });

    it('is still answered after the lot has closed: the bidder asked once and must not hear that it failed', async () => {
      lotRow = { ...lotRow, auctionStatus: 'CLOSED', lotStatus: 'CLOSED' };
      prisma.bidder.findUnique.mockResolvedValue(bidder());
      prisma.bid.findUnique.mockResolvedValue({ id: 'b1', lotId: 'l1', seq: 1, amountMinor: 100_000n, kind: 'MANUAL', acceptedAt: NOW });

      await expect(service.placeBid(input())).resolves.toMatchObject({ replayed: true });
    });

    it('refuses the same key with a different amount instead of replaying the wrong bid', async () => {
      prisma.bidder.findUnique.mockResolvedValue(bidder());
      prisma.bid.findUnique.mockResolvedValue({ id: 'b1', lotId: 'l1', seq: 1, amountMinor: 100_000n, kind: 'MANUAL', acceptedAt: NOW });

      const error = await refusal(service.placeBid(input({ amountMinor: 120_000 })));
      expect(error.getResponse()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
      expect(writes).toEqual(['lock']);
    });
  });

  describe('refusals write nothing', () => {
    const wroteNothing = () => expect(writes.filter((w) => w !== 'lock')).toEqual([]);

    it('says a lot that does not exist is not found', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(service.placeBid(input())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses before the auction opens, and says so', async () => {
      lotRow = { ...lotRow, auctionStatus: 'SCHEDULED', lotStatus: 'PENDING' };
      const error = await refusal(service.placeBid(input()));
      expect(error.getResponse()).toMatchObject({ code: 'LOT_NOT_OPEN', message: 'Bidding has not opened yet.' });
      wroteNothing();
    });

    it.each([
      ['a closed auction', { auctionStatus: 'CLOSED' }],
      ['a closing auction', { auctionStatus: 'CLOSING' }],
      ['a cancelled auction', { auctionStatus: 'CANCELLED' }],
      ['a closed lot', { lotStatus: 'CLOSED' }],
      ['a withdrawn lot', { lotStatus: 'WITHDRAWN' }],
    ])('refuses %s', async (_label, over) => {
      lotRow = { ...lotRow, ...over };
      const error = await refusal(service.placeBid(input()));
      expect(error.getResponse()).toMatchObject({ code: 'LOT_NOT_OPEN' });
      wroteNothing();
    });

    it('refuses at the very instant bidding ends, and accepts the millisecond before', async () => {
      lotRow = { ...lotRow, endsAt: NOW };
      const ended = await refusal(service.placeBid(input()));
      expect(ended.getResponse()).toMatchObject({ code: 'AUCTION_ENDED' });
      wroteNothing();

      lotRow = { ...lotRow, endsAt: new Date(NOW.getTime() + 1) };
      await expect(service.placeBid(input({ idempotencyKey: 'key-0000-0002' }))).resolves.toMatchObject({ replayed: false });
    });

    it('bars a holder of auction.manage, by data and not by role name', async () => {
      const error = await refusal(service.placeBid(input({ user: { id: 'u-staff', permissions: ['auction.manage'] } })));
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.getResponse()).toMatchObject({ code: 'BIDDER_NOT_ELIGIBLE' });
      wroteNothing();
    });

    it('bars the person who created the auction even without the permission now', async () => {
      const error = await refusal(service.placeBid(input({ user: { id: 'u-owner', permissions: [] } })));
      expect(error).toBeInstanceOf(ForbiddenException);
      wroteNothing();
    });

    it('refuses a bidder who is suspended', async () => {
      prisma.bidder.findUnique.mockResolvedValue(bidder({ status: 'SUSPENDED' }));
      const error = await refusal(service.placeBid(input()));
      expect(error.getResponse()).toMatchObject({ code: 'BIDDER_NOT_ELIGIBLE' });
      wroteNothing();
    });

    it('refuses the leader bidding against themselves, and names the minimum', async () => {
      lotRow = { ...lotRow, currentBidMinor: 100_000n, bidSeq: 1, leaderBidderId: 'p1' };
      prisma.bidder.findUnique.mockResolvedValue(bidder());
      const error = await refusal(service.placeBid(input({ amountMinor: 500_000, idempotencyKey: 'key-0000-0002' })));
      expect(error.getResponse()).toMatchObject({ code: 'ALREADY_LEADING', details: { minimumNextBidMinor: 105_000 } });
      wroteNothing();
    });

    it('refuses an eleventh bid in a minute from one bidder on one lot, saying how long to wait, and writes nothing', async () => {
      lotRow = { ...lotRow, currentBidMinor: 100_000n, bidSeq: 11, leaderBidderId: 'p-other' };
      prisma.bidder.findUnique.mockResolvedValue(bidder());
      // Ten bids, the oldest 45 s ago: the next is allowed in 15 s.
      prisma.bid.findMany.mockResolvedValue(
        Array.from({ length: 10 }, (_, index) => ({ acceptedAt: new Date(NOW.getTime() - (45 - index * 4) * 1_000) })).reverse(),
      );

      const error = await refusal(service.placeBid(input({ amountMinor: 500_000 })));

      expect(error.getStatus()).toBe(429);
      expect(error.getResponse()).toMatchObject({ code: 'BID_RATE_LIMITED', retryAfterSeconds: 15 });
      expect(error.getResponse().message).toContain('Wait 15 seconds');
      wroteNothing();
    });

    it('allows a tenth bid in the minute, and counts only the window, not the lot’s whole history', async () => {
      lotRow = { ...lotRow, currentBidMinor: 100_000n, bidSeq: 9, leaderBidderId: 'p-other' };
      prisma.bidder.findUnique.mockResolvedValue(bidder());
      prisma.bid.findMany.mockResolvedValue(Array.from({ length: 9 }, () => ({ acceptedAt: new Date(NOW.getTime() - 5_000) })));

      await expect(service.placeBid(input({ amountMinor: 500_000 }))).resolves.toMatchObject({ replayed: false });
      expect(prisma.bid.findMany.mock.calls[0][0]).toMatchObject({
        where: { lotId: 'l1', bidderId: 'p1', acceptedAt: { gt: new Date(NOW.getTime() - 60_000) } },
        take: 10,
      });
    });

    it('does not burn an alias on a refused first bid: the bidder is created only once every check has passed', async () => {
      const error = await refusal(service.placeBid(input({ amountMinor: 1 })));
      expect(error.getResponse()).toMatchObject({ code: 'BID_TOO_LOW' });
      expect(prisma.bidder.create).not.toHaveBeenCalled();
    });
  });

  describe('when the lot moves under the bid', () => {
    it('re-reads and bids again when the guarded UPDATE changes no row', async () => {
      prisma.$executeRaw.mockImplementationOnce(async () => 1); // lot lock
      let updates = 0;
      prisma.$executeRaw.mockImplementation(async (strings: TemplateStringsArray) => {
        const sql = strings.join('?');
        if (sql.includes('pg_advisory_xact_lock')) return 1;
        updates += 1;
        return updates === 1 ? 0 : 1;
      });

      const result = await service.placeBid(input());

      expect(result.replayed).toBe(false);
      expect(updates).toBe(2);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('gives up after three attempts with a 409 that tells the bidder to look at the new price', async () => {
      updateResult = 0;
      const error = await refusal(service.placeBid(input()));
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({ code: 'LOT_CHANGED' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
      expect(prisma.bid.create).not.toHaveBeenCalled();
    });

    it('retries when a unique index catches a duplicate seq or key, so the second pass sees the winner', async () => {
      prisma.bid.create
        .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }))
        .mockImplementation(async ({ data }: any) => data);
      await expect(service.placeBid(input())).resolves.toMatchObject({ replayed: false });
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('turns a transaction timeout into a 503 that says the bid was not placed', async () => {
      prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('timeout', { code: 'P2028', clientVersion: 'test' }));
      const error = await refusal(service.placeBid(input()));
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.message).toContain('was not placed');
    });

    it('lets the transaction wait up to ten seconds for a connection and run, not Prisma’s 2 and 5', async () => {
      await service.placeBid(input());
      expect(prisma.$transaction.mock.calls[0][1]).toEqual({ maxWait: 10_000, timeout: 10_000 });
    });
  });

  describe('listBids', () => {
    const page = (over: Partial<BidListQueryDto> = {}) => Object.assign(new BidListQueryDto(), over);

    it('lists newest first by alias and exposes no user id', async () => {
      prisma.bid.findMany.mockResolvedValue([
        { id: 'b2', lotId: 'l1', seq: 2, amountMinor: 105_000n, kind: 'MANUAL', acceptedAt: NOW, prevHash: 'h1', hash: 'h2', bidder: { alias: 'Bidder 2' } },
        { id: 'b1', lotId: 'l1', seq: 1, amountMinor: 100_000n, kind: 'MANUAL', acceptedAt: NOW, prevHash: null, hash: 'h1', bidder: { alias: 'Bidder 1' } },
      ]);
      prisma.bid.count.mockResolvedValue(2);

      const result = await service.listBids('a1', 'l1', page());

      expect(prisma.bid.findMany.mock.calls[0][0]).toMatchObject({ orderBy: { seq: 'desc' }, skip: 0, take: 20, where: { lotId: 'l1' } });
      expect(result.data.map((bid) => [bid.seq, bid.alias, bid.amountMinor])).toEqual([[2, 'Bidder 2', 105_000], [1, 'Bidder 1', 100_000]]);
      expect(result.meta.total).toBe(2);
      expect(JSON.stringify(result)).not.toContain('userId');
    });

    it('treats a lot of another auction as not found', async () => {
      prisma.auctionLot.findFirst.mockResolvedValue(null);
      await expect(service.listBids('a-other', 'l1', page())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('verifyBids', () => {
    /** Builds a correctly chained ledger of the given amounts. */
    const ledger = (amounts: number[]) => {
      let prev: string | null = null;
      return amounts.map((amount, index) => {
        const bid = {
          id: `b${index + 1}`,
          lotId: 'l1',
          seq: index + 1,
          bidderId: 'p1',
          amountMinor: BigInt(amount),
          kind: 'MANUAL' as const,
          acceptedAt: new Date(NOW.getTime() + index * 1_000),
          idempotencyKey: `key-${index}`,
        };
        const hash = chainHash(prev, bidCanonical(bid));
        const row = { ...bid, prevHash: prev, hash };
        prev = hash;
        return row;
      });
    };
    const serve = (rows: any[], lot: Record<string, unknown>) => {
      prisma.auctionLot.findFirst.mockResolvedValue({ id: 'l1', auctionId: 'a1', ...lot });
      prisma.bid.findMany.mockImplementation(async ({ where }: any) => rows.filter((row) => row.seq > where.seq.gt).slice(0, 1_000));
    };

    it('passes an intact chain whose lot agrees with its last bid', async () => {
      serve(ledger([100_000, 105_000, 110_250]), { bidSeq: 3, currentBidMinor: 110_250n });
      await expect(service.verifyBids('a1', 'l1')).resolves.toEqual({ valid: true, bidCount: 3 });
    });

    it('passes a lot with no bids', async () => {
      serve([], { bidSeq: 0, currentBidMinor: null });
      await expect(service.verifyBids('a1', 'l1')).resolves.toEqual({ valid: true, bidCount: 0 });
    });

    it('names the bid whose amount was edited after the fact', async () => {
      const rows = ledger([100_000, 105_000, 110_250]);
      rows[1] = { ...rows[1], amountMinor: 999n };
      serve(rows, { bidSeq: 3, currentBidMinor: 110_250n });
      await expect(service.verifyBids('a1', 'l1')).resolves.toMatchObject({ valid: false, reason: 'hash-mismatch', brokenAtSeq: 2 });
    });

    it('names the bid after one that was removed', async () => {
      const rows = ledger([100_000, 105_000, 110_250]);
      rows.splice(1, 1);
      serve(rows, { bidSeq: 3, currentBidMinor: 110_250n });
      await expect(service.verifyBids('a1', 'l1')).resolves.toMatchObject({ valid: false, brokenAtSeq: 3 });
    });

    it('fails when the lot’s stored price is not what the last bid says', async () => {
      serve(ledger([100_000, 105_000]), { bidSeq: 2, currentBidMinor: 500_000n });
      await expect(service.verifyBids('a1', 'l1')).resolves.toMatchObject({ valid: false, bidCount: 2 });
    });

    it('fails when the lot counts more bids than the ledger holds', async () => {
      serve(ledger([100_000]), { bidSeq: 2, currentBidMinor: 100_000n });
      await expect(service.verifyBids('a1', 'l1')).resolves.toMatchObject({ valid: false, bidCount: 1 });
    });

    it('reads the ledger in pages of a thousand, never all at once', async () => {
      const rows = ledger(Array.from({ length: 2_500 }, (_, index) => 100_000 + index * 1_000));
      serve(rows, { bidSeq: 2_500, currentBidMinor: rows[2_499]!.amountMinor });
      await expect(service.verifyBids('a1', 'l1')).resolves.toEqual({ valid: true, bidCount: 2_500 });
      expect(prisma.bid.findMany).toHaveBeenCalledTimes(4); // 1000, 1000, 500, then the empty page
      expect(prisma.bid.findMany.mock.calls[0][0].take).toBe(1_000);
    });
  });
});
