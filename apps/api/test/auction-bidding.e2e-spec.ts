import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { CoreModule } from '../src/core/core.module';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { AuctionModule } from '../src/modules/auction/auction.module';
import { AuctionService } from '../src/modules/auction/auction.service';

/**
 * Bidding (launchpad-apps/234-auction-app.md, WO-234.2) against the real
 * database. The unit spec proves each decision with the database mocked; this
 * one proves what a mock cannot: that a thousand bids arriving at once on one
 * lot leave a strictly increasing sequence, no lost update and a chain that
 * still verifies (acceptance criterion 1); that a retried key creates exactly
 * one bid (2); that the database clock, not the caller's, ends bidding; and
 * that the unique indexes stand behind the lock when it is bypassed.
 *
 * Nothing opens an auction yet (the open job is WO-234.3), so each test
 * schedules one through the service, which freezes its rules, then flips it to
 * OPEN directly. Bids are records and are never deleted, so a finished fixture
 * is closed rather than removed; every row is titled TITLE so a development
 * database shows plainly what they are. Bidders are plain user-id strings
 * because `Bidder.userId` is not a foreign key.
 */
describe('Auction bidding (e2e)', () => {
  const TITLE = '[e2e] auction bidding';
  let ACTOR: string;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let auctions: AuctionService;
  const made: string[] = [];
  let keyCounter = 0;

  const key = () => `e2e-${Date.now()}-${(keyCounter += 1)}`;
  const bidderUser = (name: string) => ({ id: `e2e-bidder-${name}`, permissions: [] as string[] });

  /** An OPEN auction with one lot, ending in `minutes`. Returns the lot id. */
  const openLot = async (opts: { startPriceMinor?: number; minutes?: number; endsAt?: Date; antiSnipe?: boolean } = {}) => {
    const auction = await auctions.create(
      {
        title: TITLE,
        startsAt: new Date(Date.now() + 3_600_000).toISOString(),
        endsAt: new Date(Date.now() + 7_200_000).toISOString(),
      },
      ACTOR,
    );
    made.push(auction.id);
    const lot = await auctions.addLot(auction.id, { title: 'Pallet', startPriceMinor: opts.startPriceMinor ?? 100_000 }, ACTOR);
    await auctions.schedule(auction.id, ACTOR);
    await prisma.auction.update({
      where: { id: auction.id },
      data: { status: 'OPEN', startsAt: new Date(Date.now() - 60_000), endsAt: opts.endsAt ?? new Date(Date.now() + (opts.minutes ?? 30) * 60_000) },
    });
    await prisma.auctionLot.update({ where: { id: lot.id }, data: { status: 'OPEN' } });
    if (opts.antiSnipe === false) {
      // A lot this close to its end would be extended by its first bid (WO-234.3); a test of the clock itself must not be.
      const { bidRules } = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id }, select: { bidRules: true } });
      await prisma.auction.update({ where: { id: auction.id }, data: { bidRules: { ...(bidRules as object), antiSnipeExtendMs: 0 } } });
    }
    return { auctionId: auction.id, lotId: lot.id };
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [CoreModule, AuctionModule] }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    auctions = moduleRef.get(AuctionService);
    ACTOR = (await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' }, select: { id: true } })).id;
  });

  afterAll(async () => {
    if (made.length) {
      await prisma.auctionLot.updateMany({ where: { auctionId: { in: made } }, data: { status: 'CLOSED' } });
      await prisma.auction.updateMany({ where: { id: { in: made } }, data: { status: 'CLOSED' } });
    }
    await moduleRef?.close();
  });

  const outcome = async (promise: Promise<unknown>) => {
    try {
      return { ok: true as const, value: (await promise) as Awaited<ReturnType<AuctionService['placeBid']>> };
    } catch (error: any) {
      return { ok: false as const, status: error.getStatus?.() as number | undefined, code: error.getResponse?.()?.code as string | undefined };
    }
  };

  it('keeps one strictly increasing sequence, no lost update and a valid chain through 1,000 concurrent bids', async () => {
    const { auctionId, lotId } = await openLot();
    // Each amount is 2.3% above the one before it, so about half would clear the 5% increment if they arrived
    // in order (topping out near 6.5 × 10^14, inside the 10^15 ceiling). Arrival is shuffled within windows of
    // six, and the connection pool reorders further, so how many are accepted varies run to run; the invariants
    // asserted below do not.
    const attempts = Array.from({ length: 1_000 }, (_, index) => ({
      index,
      user: bidderUser(`storm-${index}`),
      amountMinor: Math.round(100_000 * 1.0515 ** (index * 0.45)),
    }));
    for (let start = 0; start < attempts.length; start += 6) {
      const window = attempts.slice(start, start + 6).sort(() => Math.random() - 0.5);
      attempts.splice(start, window.length, ...window);
    }

    const results = await Promise.all(
      attempts.map((attempt) => outcome(auctions.placeBid({ lotId, amountMinor: attempt.amountMinor, idempotencyKey: key(), user: attempt.user }))),
    );

    const accepted = results.filter((result) => result.ok);
    const refused = results.filter((result) => !result.ok);
    // Every request ends one of two ways, and nothing else: accepted, or refused for a stated reason.
    expect(refused.every((result) => !result.ok && (result.code === 'BID_TOO_LOW' || result.status === 503))).toBe(true);
    expect(accepted.length + refused.length).toBe(1_000);
    // Enough of both that the test exercises acceptance and refusal under contention, not just one of them.
    expect(accepted.length).toBeGreaterThan(50);
    expect(refused.length).toBeGreaterThan(50);

    const stored = await prisma.bid.findMany({ where: { lotId }, orderBy: { seq: 'asc' } });
    expect(stored).toHaveLength(accepted.length);
    expect(stored.map((bid) => bid.seq)).toEqual(Array.from({ length: stored.length }, (_, index) => index + 1));
    for (let index = 1; index < stored.length; index += 1) {
      expect(stored[index]!.amountMinor > stored[index - 1]!.amountMinor).toBe(true);
    }

    const lot = await prisma.auctionLot.findUniqueOrThrow({ where: { id: lotId } });
    expect(lot.bidSeq).toBe(stored.length);
    expect(lot.currentBidMinor).toBe(stored[stored.length - 1]!.amountMinor);

    await expect(auctions.verifyBids(auctionId, lotId)).resolves.toEqual({ valid: true, bidCount: stored.length });

    // Aliases were handed out one by one under their own lock: no gap, no repeat.
    const bidders = await prisma.bidder.findMany({ where: { auctionId }, select: { alias: true } });
    expect(bidders.map((bidder) => Number(bidder.alias.split(' ')[1])).sort((a, b) => a - b)).toEqual(
      Array.from({ length: bidders.length }, (_, index) => index + 1),
    );
  }, 120_000);

  it('lets exactly one of twenty bidders who all offer the opening price in the same instant win it', async () => {
    const { lotId } = await openLot();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) => outcome(auctions.placeBid({ lotId, amountMinor: 100_000, idempotencyKey: key(), user: bidderUser(`tie-${index}`) }))),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok).every((result) => !result.ok && result.code === 'BID_TOO_LOW')).toBe(true);
    expect(await prisma.bid.count({ where: { lotId } })).toBe(1);
  });

  it('creates exactly one bid when the same request is sent ten times at once, and answers every copy with it', async () => {
    const { lotId } = await openLot();
    const idempotencyKey = key();
    const user = bidderUser('retry');
    const results = await Promise.all(
      Array.from({ length: 10 }, () => outcome(auctions.placeBid({ lotId, amountMinor: 100_000, idempotencyKey, user }))),
    );

    expect(results.every((result) => result.ok)).toBe(true);
    const values = results.map((result) => (result.ok ? result.value : null)!);
    expect(new Set(values.map((value) => value.bid.id)).size).toBe(1);
    expect(values.filter((value) => !value.replayed)).toHaveLength(1);
    expect(await prisma.bid.count({ where: { lotId } })).toBe(1);
  });

  it('refuses a reused key for a different amount, and still answers the original', async () => {
    const { lotId } = await openLot();
    const idempotencyKey = key();
    const user = bidderUser('reuse');
    await auctions.placeBid({ lotId, amountMinor: 100_000, idempotencyKey, user });

    const reused = await outcome(auctions.placeBid({ lotId, amountMinor: 250_000, idempotencyKey, user }));
    expect(reused).toMatchObject({ ok: false, code: 'IDEMPOTENCY_KEY_REUSED' });
    const again = await auctions.placeBid({ lotId, amountMinor: 100_000, idempotencyKey, user });
    expect(again.replayed).toBe(true);
  });

  it('ends bidding by the database clock: a bid is accepted before the end and refused after it', async () => {
    const { lotId } = await openLot({ endsAt: new Date(Date.now() + 1_500), antiSnipe: false });
    await expect(auctions.placeBid({ lotId, amountMinor: 100_000, idempotencyKey: key(), user: bidderUser('early') })).resolves.toMatchObject({ replayed: false });

    await new Promise((resolve) => setTimeout(resolve, 1_800));

    const late = await outcome(auctions.placeBid({ lotId, amountMinor: 200_000, idempotencyKey: key(), user: bidderUser('late') }));
    expect(late).toMatchObject({ ok: false, code: 'AUCTION_ENDED' });
    expect(await prisma.bid.count({ where: { lotId } })).toBe(1);
  });

  it('refuses an eleventh bid from one bidder on one lot inside a minute, with a 429 and a wait', async () => {
    const { lotId } = await openLot();
    const a = bidderUser('rate-a');
    const b = bidderUser('rate-b');
    let minimum = 100_000;
    for (let round = 0; round < 10; round += 1) {
      const fromA = await auctions.placeBid({ lotId, amountMinor: minimum, idempotencyKey: key(), user: a });
      const fromB = await auctions.placeBid({ lotId, amountMinor: fromA.lot.minimumNextBidMinor, idempotencyKey: key(), user: b });
      minimum = fromB.lot.minimumNextBidMinor;
    }
    const eleventh = await outcome(auctions.placeBid({ lotId, amountMinor: minimum, idempotencyKey: key(), user: a }));
    expect(eleventh).toMatchObject({ ok: false, status: 429, code: 'BID_RATE_LIMITED' });
    expect(await prisma.bid.count({ where: { lotId } })).toBe(20);
  });

  it('holds prices above the old 32-bit ceiling, as numbers, end to end', async () => {
    const { auctionId, lotId } = await openLot({ startPriceMinor: 5_000_000_000 });
    const result = await auctions.placeBid({ lotId, amountMinor: 5_000_000_000, idempotencyKey: key(), user: bidderUser('big') });
    expect(result.lot).toMatchObject({ currentBidMinor: 5_000_000_000, minimumNextBidMinor: 5_250_000_000 });

    const detail = await auctions.get(auctionId, true);
    expect(detail.lots[0]).toMatchObject({ startPriceMinor: 5_000_000_000, currentBidMinor: 5_000_000_000, bidSeq: 1 });
    expect(() => JSON.stringify(detail)).not.toThrow();
  });

  it('uses the rules frozen at scheduling, not whatever Settings say now', async () => {
    const { auctionId, lotId } = await openLot();
    const stored = await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } });
    expect(stored.bidRules).toEqual({
      incrementBps: 500,
      minStepMinor: 100,
      antiSnipeWindowMs: 120_000,
      antiSnipeExtendMs: 120_000,
      maxExtensionMs: 1_800_000,
    });

    await prisma.auction.update({ where: { id: auctionId }, data: { bidRules: { incrementBps: 2_000, minStepMinor: 100 } } });
    await auctions.placeBid({ lotId, amountMinor: 100_000, idempotencyKey: key(), user: bidderUser('rules-a') });
    const low = await outcome(auctions.placeBid({ lotId, amountMinor: 110_000, idempotencyKey: key(), user: bidderUser('rules-b') }));
    expect(low).toMatchObject({ ok: false, code: 'BID_TOO_LOW' });
    await expect(auctions.placeBid({ lotId, amountMinor: 120_000, idempotencyKey: key(), user: bidderUser('rules-b') })).resolves.toMatchObject({ replayed: false });
  });

  it('is backed by the database itself: a second bid with a taken seq, or a repeated key, is refused by an index', async () => {
    const { lotId } = await openLot();
    await auctions.placeBid({ lotId, amountMinor: 100_000, idempotencyKey: 'e2e-index-key', user: bidderUser('index') });
    const first = await prisma.bid.findFirstOrThrow({ where: { lotId } });

    const sameSeq = { lotId, bidderId: first.bidderId, amountMinor: 999_999, kind: 'MANUAL' as const, seq: 1, acceptedAt: new Date(), idempotencyKey: 'other-key', prevHash: null, hash: 'x' };
    await expect(prisma.bid.create({ data: sameSeq })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.bid.create({ data: { ...sameSeq, seq: 2, idempotencyKey: 'e2e-index-key' } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('shows a quiet edit to a stored bid: the integrity check names the bid that was changed', async () => {
    const { auctionId, lotId } = await openLot();
    for (let index = 0; index < 5; index += 1) {
      await auctions.placeBid({ lotId, amountMinor: 100_000 + index * 20_000, idempotencyKey: key(), user: bidderUser(`chain-${index}`) });
    }
    await expect(auctions.verifyBids(auctionId, lotId)).resolves.toEqual({ valid: true, bidCount: 5 });

    // Tamper with this test's own row, the way a database administrator could.
    await prisma.$executeRaw`UPDATE "Bid" SET "amountMinor" = 1 WHERE "lotId" = ${lotId} AND "seq" = 3`;

    await expect(auctions.verifyBids(auctionId, lotId)).resolves.toMatchObject({ valid: false, reason: 'hash-mismatch', brokenAtSeq: 3 });
  });

  it('lists the ledger newest first by alias, and a lot of another auction is not found', async () => {
    const { auctionId, lotId } = await openLot();
    await auctions.placeBid({ lotId, amountMinor: 100_000, idempotencyKey: key(), user: bidderUser('list-a') });
    await auctions.placeBid({ lotId, amountMinor: 105_000, idempotencyKey: key(), user: bidderUser('list-b') });

    const page = await auctions.listBids(auctionId, lotId, Object.assign(new (await import('../src/modules/auction/dto/auction.dto')).BidListQueryDto(), {}));
    expect(page.data.map((bid) => [bid.seq, bid.alias, bid.amountMinor])).toEqual([[2, 'Bidder 2', 105_000], [1, 'Bidder 1', 100_000]]);
    expect(JSON.stringify(page)).not.toContain('e2e-bidder');
    await expect(auctions.verifyBids('no-such-auction', lotId)).rejects.toMatchObject({ status: 404 });
  });
});
