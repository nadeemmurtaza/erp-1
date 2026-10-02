import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CoreModule } from '../src/core/core.module';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { AuctionLifecycleService, OUTAGE_EXTENSION_MS } from '../src/modules/auction/auction-lifecycle.service';
import { AuctionModule } from '../src/modules/auction/auction.module';
import { AuctionService } from '../src/modules/auction/auction.service';

/**
 * Proxy bidding, anti-snipe and the open and close jobs (launchpad-apps/
 * 234-auction-app.md, WO-234.3) against the real database: acceptance criteria
 * 3 (anti-snipe at its boundary and cap), 4 (proxy maxima), 7 (reserve not met
 * closes with no winner and no automatic offer) and 10 (an outage extends and
 * never closes), plus the idempotence of the close job under a race.
 *
 * Money in these tests is spelled out in minor units against explicit rules
 * (5%, a step of 100, two minutes, two minutes, thirty minutes) written onto
 * each auction, so the arithmetic holds whatever the brand currency and
 * whatever Settings say. Rows are titled TITLE so a development database shows
 * plainly what they are, and are closed, never deleted, afterwards.
 */
describe('Auction proxy, anti-snipe and close job (e2e)', () => {
  const TITLE = '[e2e] auction lifecycle';
  const RULES = { incrementBps: 500, minStepMinor: 100, antiSnipeWindowMs: 120_000, antiSnipeExtendMs: 120_000, maxExtensionMs: 1_800_000 };
  let ACTOR: string;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let auctions: AuctionService;
  let lifecycle: AuctionLifecycleService;
  const made: string[] = [];
  let keyCounter = 0;

  const key = () => `e2e-${Date.now()}-${(keyCounter += 1)}`;
  const person = (name: string) => ({ id: `e2e-life-${name}`, permissions: [] as string[] });

  /**
   * An OPEN auction (flipped directly, so the open job is tested on its own)
   * with one lot per entry in `lots`, ending `endsInMs` from now.
   */
  const openAuction = async (opts: { lots?: Array<{ startPriceMinor: number; reservePriceMinor?: number }>; endsInMs?: number; rules?: object } = {}) => {
    const auction = await auctions.create(
      { title: TITLE, startsAt: new Date(Date.now() + 3_600_000).toISOString(), endsAt: new Date(Date.now() + 7_200_000).toISOString() },
      ACTOR,
    );
    made.push(auction.id);
    const lotIds: string[] = [];
    for (const [index, lot] of (opts.lots ?? [{ startPriceMinor: 10_000 }]).entries()) {
      const created = await auctions.addLot(auction.id, { title: `Lot ${index + 1}`, ...lot }, ACTOR);
      lotIds.push(created.id);
    }
    await auctions.schedule(auction.id, ACTOR);
    await prisma.auction.update({
      where: { id: auction.id },
      data: {
        status: 'OPEN',
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + (opts.endsInMs ?? 1_800_000)),
        bidRules: { ...RULES, ...(opts.rules ?? {}) },
      },
    });
    await prisma.auctionLot.updateMany({ where: { id: { in: lotIds } }, data: { status: 'OPEN' } });
    return { auctionId: auction.id, lotIds, lotId: lotIds[0]! };
  };

  const bid = (lotId: string, name: string, amountMinor: number) =>
    auctions.placeBid({ lotId, amountMinor, idempotencyKey: key(), user: person(name) });

  /** Pretends time passed: moves one lot's own end to `inMs` from now. */
  const endLotIn = (lotId: string, inMs: number) => prisma.auctionLot.update({ where: { id: lotId }, data: { endsAt: new Date(Date.now() + inMs) } });

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [CoreModule, AuctionModule] }).compile();
    await moduleRef.init();
    // The tests drive the jobs by hand and assert exactly what each call did, so
    // the real 15-second cron must not run them from under the test.
    for (const job of moduleRef.get(SchedulerRegistry).getCronJobs().values()) job.stop();
    prisma = moduleRef.get(PrismaService);
    auctions = moduleRef.get(AuctionService);
    lifecycle = moduleRef.get(AuctionLifecycleService);
    ACTOR = (await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' }, select: { id: true } })).id;
  });

  afterAll(async () => {
    if (made.length) {
      await prisma.auctionLot.updateMany({ where: { auctionId: { in: made } }, data: { status: 'CLOSED' } });
      await prisma.auction.updateMany({ where: { id: { in: made } }, data: { status: 'CLOSED' } });
    }
    await moduleRef?.close();
  });

  describe('the open job', () => {
    it('opens a scheduled auction whose start has passed, with its lots, and does it once', async () => {
      const auction = await auctions.create(
        { title: TITLE, startsAt: new Date(Date.now() + 3_600_000).toISOString(), endsAt: new Date(Date.now() + 7_200_000).toISOString() },
        ACTOR,
      );
      made.push(auction.id);
      const kept = await auctions.addLot(auction.id, { title: 'Kept', startPriceMinor: 10_000 }, ACTOR);
      const dropped = await auctions.addLot(auction.id, { title: 'Dropped', startPriceMinor: 10_000 }, ACTOR);
      await auctions.withdrawLot(auction.id, dropped.id, ACTOR);
      await auctions.schedule(auction.id, ACTOR);

      // Not yet due: left alone.
      await lifecycle.openDue();
      expect((await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } })).status).toBe('SCHEDULED');

      await prisma.auction.update({ where: { id: auction.id }, data: { startsAt: new Date(Date.now() - 1_000) } });
      expect(await lifecycle.openDue()).toBeGreaterThanOrEqual(1);

      expect((await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } })).status).toBe('OPEN');
      expect((await prisma.auctionLot.findUniqueOrThrow({ where: { id: kept.id } })).status).toBe('OPEN');
      expect((await prisma.auctionLot.findUniqueOrThrow({ where: { id: dropped.id } })).status).toBe('WITHDRAWN');
      expect(await prisma.auditLog.count({ where: { action: 'auction.opened', entityId: auction.id } })).toBe(1);

      // A repeat finds nothing to do and writes no second audit row.
      await lifecycle.openDue();
      expect(await prisma.auditLog.count({ where: { action: 'auction.opened', entityId: auction.id } })).toBe(1);

      // Once open, a bidder can bid.
      await expect(bid(kept.id, 'opener', 10_000)).resolves.toMatchObject({ replayed: false });
    });
  });

  describe('anti-snipe', () => {
    it('leaves a bid before the closing window alone, and moves the end for one inside it', async () => {
      const { lotId, auctionId } = await openAuction({ endsInMs: 1_800_000 });
      await bid(lotId, 'early', 10_000);
      let lot = await prisma.auctionLot.findUniqueOrThrow({ where: { id: lotId } });
      expect(lot.endsAt).toBeNull();
      expect(lot.extendedMs).toBe(0);

      const auctionEnd = (await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } })).endsAt;
      await endLotIn(lotId, 60_000);
      const lotEnd = (await prisma.auctionLot.findUniqueOrThrow({ where: { id: lotId } })).endsAt!;
      const result = await bid(lotId, 'sniper', 10_500);

      lot = await prisma.auctionLot.findUniqueOrThrow({ where: { id: lotId } });
      expect(lot.endsAt!.getTime()).toBe(lotEnd.getTime() + 120_000);
      expect(lot.extendedMs).toBe(120_000);
      expect(result.lot.endsAt.getTime()).toBe(lot.endsAt!.getTime());
      // The auction's own end is untouched: only this lot moved.
      expect((await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } })).endsAt.getTime()).toBe(auctionEnd.getTime());
    });

    it('stops at the thirty-minute cap, cutting the last extension to what is left of it', async () => {
      const { lotId } = await openAuction({ rules: { maxExtensionMs: 300_000 } });
      let price = 10_000;
      const amounts: number[] = [];
      for (const [index, expected] of [120_000, 120_000, 60_000, 0].entries()) {
        await endLotIn(lotId, 30_000);
        const before = (await prisma.auctionLot.findUniqueOrThrow({ where: { id: lotId } })).endsAt!;
        const result = await bid(lotId, `war-${index}`, price);
        amounts.push(price);
        price = result.lot.minimumNextBidMinor;
        const after = await prisma.auctionLot.findUniqueOrThrow({ where: { id: lotId } });
        expect((after.endsAt?.getTime() ?? 0) - before.getTime()).toBe(expected);
      }
      const lot = await prisma.auctionLot.findUniqueOrThrow({ where: { id: lotId } });
      expect(lot.extendedMs).toBe(300_000);
    });

    it('does not move the end when the extension is switched off', async () => {
      const { lotId } = await openAuction({ rules: { antiSnipeExtendMs: 0 } });
      await endLotIn(lotId, 10_000);
      const before = (await prisma.auctionLot.findUniqueOrThrow({ where: { id: lotId } })).endsAt!;
      await bid(lotId, 'quiet', 10_000);
      expect((await prisma.auctionLot.findUniqueOrThrow({ where: { id: lotId } })).endsAt!.getTime()).toBe(before.getTime());
    });

    it('refuses a bid once the lot’s own, moved end has passed', async () => {
      const { lotId } = await openAuction();
      await bid(lotId, 'first', 10_000);
      await endLotIn(lotId, -1_000);
      await expect(bid(lotId, 'late', 10_500)).rejects.toMatchObject({ response: { code: 'AUCTION_ENDED' } });
    });
  });

  describe('proxy bidding', () => {
    it('puts the 100 000 maximum at 84 000 above an 80 000 one, and lets the earlier of equal maxima win', async () => {
      const { lotId, auctionId } = await openAuction();

      await bid(lotId, 'a', 10_000); // a leads at 10 000
      const b = await auctions.setProxyBid({ lotId, maxMinor: 100_000, user: person('b') });
      // b outranks a: the system bids for b at a's price plus 5%.
      expect(b.autoBid).toMatchObject({ amountMinor: 10_500, kind: 'PROXY_AUTO', alias: 'Bidder 2' });
      expect(b.lot).toMatchObject({ currentBidMinor: 10_500, leading: true });

      const c = await auctions.setProxyBid({ lotId, maxMinor: 80_000, user: person('c') });
      // c's 80 000 is beaten by b's 100 000: b stands at 80 000 + 5% = 84 000, and c is told so.
      expect(c.autoBid).toMatchObject({ amountMinor: 84_000, kind: 'PROXY_AUTO', alias: 'Bidder 2' });
      expect(c.lot).toMatchObject({ currentBidMinor: 84_000, leading: false });

      const d = await auctions.setProxyBid({ lotId, maxMinor: 100_000, user: person('d') });
      // d offers the same 100 000 later: b, who offered it first, keeps the lead at that maximum.
      expect(d.autoBid).toMatchObject({ amountMinor: 100_000, alias: 'Bidder 2' });
      expect(d.lot).toMatchObject({ currentBidMinor: 100_000, leading: false });

      const lot = await prisma.auctionLot.findUniqueOrThrow({ where: { id: lotId } });
      expect(lot.bidSeq).toBe(4);
      await expect(auctions.verifyBids(auctionId, lotId)).resolves.toEqual({ valid: true, bidCount: 4 });
      const kinds = (await prisma.bid.findMany({ where: { lotId }, orderBy: { seq: 'asc' } })).map((row) => row.kind);
      expect(kinds).toEqual(['MANUAL', 'PROXY_AUTO', 'PROXY_AUTO', 'PROXY_AUTO']);

      // A manual bid above every maximum simply wins; there is nothing to answer it.
      const e = await bid(lotId, 'e', 105_000);
      expect(e.autoBid).toBeNull();
      expect(e.lot).toMatchObject({ currentBidMinor: 105_000, leading: true });
    });

    it('answers a manual bid below a standing maximum with one bid, however far apart they are', async () => {
      const { lotId } = await openAuction();
      await auctions.setProxyBid({ lotId, maxMinor: 90_000_000, user: person('rich') });
      const result = await bid(lotId, 'poor', 10_500);
      expect(result.bid.amountMinor).toBe(10_500);
      // The lone proxy had opened the lot at 10 000; the manual bid is answered at 10 500 + 5%.
      expect(result.autoBid).toMatchObject({ amountMinor: 11_025 });
      expect(await prisma.bid.count({ where: { lotId } })).toBe(3);
    });

    it('keeps a maximum from everyone but its owner, and stores it encrypted', async () => {
      const { lotId } = await openAuction();
      await auctions.setProxyBid({ lotId, maxMinor: 123_456, user: person('keeper') });

      await expect(auctions.getProxyBid(lotId, person('keeper').id)).resolves.toEqual({ maxMinor: 123_456 });
      await expect(auctions.getProxyBid(lotId, person('stranger').id)).resolves.toEqual({ maxMinor: null });

      const stored = await prisma.proxyBid.findFirstOrThrow({ where: { lotId } });
      expect(stored.maxCipher).not.toContain('123456');
      expect(stored.maxCipher.split(':')).toHaveLength(3);
    });

    it('raises a maximum but never lowers it, and a repeat of the same one changes nothing', async () => {
      const { lotId } = await openAuction();
      await auctions.setProxyBid({ lotId, maxMinor: 50_000, user: person('raiser') });

      await expect(auctions.setProxyBid({ lotId, maxMinor: 40_000, user: person('raiser') })).rejects.toMatchObject({
        response: { code: 'PROXY_CANNOT_LOWER' },
      });
      const again = await auctions.setProxyBid({ lotId, maxMinor: 50_000, user: person('raiser') });
      expect(again).toMatchObject({ maxMinor: 50_000, autoBid: null });
      const raised = await auctions.setProxyBid({ lotId, maxMinor: 70_000, user: person('raiser') });
      expect(raised.maxMinor).toBe(70_000);
      expect(await prisma.proxyBid.count({ where: { lotId } })).toBe(1);
    });

    it('refuses a maximum that could never be used, naming the least it may be', async () => {
      const { lotId } = await openAuction();
      await bid(lotId, 'holder', 20_000);
      await expect(auctions.setProxyBid({ lotId, maxMinor: 20_999, user: person('low') })).rejects.toMatchObject({
        response: { code: 'PROXY_TOO_LOW', details: { minimumMaxMinor: 21_000 } },
      });
    });

    it('keeps staff who run the auction from setting a maximum on it', async () => {
      const { lotId } = await openAuction();
      await expect(
        auctions.setProxyBid({ lotId, maxMinor: 50_000, user: { id: 'e2e-life-staff', permissions: ['auction.manage'] } }),
      ).rejects.toMatchObject({ response: { code: 'BIDDER_NOT_ELIGIBLE' } });
    });

    it('does not count the system’s answers against a bidder’s ten bids a minute', async () => {
      const { lotId } = await openAuction();
      await auctions.setProxyBid({ lotId, maxMinor: 90_000_000, user: person('defender') });
      // Twelve other bidders each bid once: the defender is answered twelve times, and is never rate limited.
      for (let index = 0; index < 12; index += 1) {
        const lot = await prisma.auctionLot.findUniqueOrThrow({ where: { id: lotId } });
        const minimum = Math.ceil(Number(lot.currentBidMinor ?? 10_000) * 1.05) + 100;
        await bid(lotId, `attacker-${index}`, minimum);
      }
      const defender = await prisma.bidder.findFirstOrThrow({ where: { userId: person('defender').id, auction: { lots: { some: { id: lotId } } } } });
      expect(await prisma.bid.count({ where: { lotId, bidderId: defender.id, kind: 'PROXY_AUTO' } })).toBeGreaterThanOrEqual(12);
    });

    it('keeps one valid chain through manual bids and proxies arriving at the same instant', async () => {
      const { lotId, auctionId } = await openAuction();
      const attempts = Array.from({ length: 40 }, (_, index) =>
        index % 2 === 0
          ? bid(lotId, `mix-${index}`, 10_000 + index * 700).catch((error) => error)
          : auctions.setProxyBid({ lotId, maxMinor: 20_000 + index * 5_000, user: person(`mix-${index}`) }).catch((error) => error),
      );
      const results = await Promise.all(attempts);
      // Each ends accepted or refused for a stated reason, never a crash.
      expect(results.every((result) => !(result instanceof Error) || typeof (result as any).getStatus === 'function')).toBe(true);

      const stored = await prisma.bid.findMany({ where: { lotId }, orderBy: { seq: 'asc' } });
      expect(stored.map((row) => row.seq)).toEqual(Array.from({ length: stored.length }, (_, index) => index + 1));
      await expect(auctions.verifyBids(auctionId, lotId)).resolves.toEqual({ valid: true, bidCount: stored.length });
    }, 60_000);
  });

  describe('the close job', () => {
    it('closes a lot that reached its reserve with its winner, and the auction with its last lot', async () => {
      const { auctionId, lotId } = await openAuction({ lots: [{ startPriceMinor: 10_000, reservePriceMinor: 12_000 }] });
      await bid(lotId, 'low', 10_000);
      await bid(lotId, 'high', 12_000);
      await prisma.auction.update({ where: { id: auctionId }, data: { endsAt: new Date(Date.now() - 5_000) } });

      await expect(lifecycle.closeLot(lotId)).resolves.toBe('closed');

      const result = await prisma.auctionResult.findUniqueOrThrow({ where: { lotId } });
      const top = await prisma.bidder.findUniqueOrThrow({ where: { id: result.topBidderId! } });
      expect(top.userId).toBe(person('high').id);
      expect(result).toMatchObject({ topBidMinor: 12_000n, reserveMet: true, bidCount: 2 });
      expect((await prisma.auctionLot.findUniqueOrThrow({ where: { id: lotId } })).status).toBe('CLOSED');
      expect((await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } })).status).toBe('CLOSED');

      // Staff see the winner by alias and whether the reserve was met; a viewer without `auction.manage` is not told the second.
      const staff = await auctions.get(auctionId, true);
      expect(staff.lots[0]!.result).toMatchObject({ topBidderAlias: top.alias, topBidMinor: 12_000, reserveMet: true, bidCount: 2 });
      const viewer = await auctions.get(auctionId, false);
      expect(viewer.lots[0]!.result).toMatchObject({ topBidderAlias: top.alias, topBidMinor: 12_000 });
      expect(viewer.lots[0]!.result).not.toHaveProperty('reserveMet');
    });

    it('closes a lot whose reserve was not met with no winner action, keeping its highest bidder for staff', async () => {
      const { auctionId, lotId } = await openAuction({ lots: [{ startPriceMinor: 10_000, reservePriceMinor: 50_000 }] });
      await bid(lotId, 'short', 20_000);
      await prisma.auction.update({ where: { id: auctionId }, data: { endsAt: new Date(Date.now() - 5_000) } });

      await expect(lifecycle.closeLot(lotId)).resolves.toBe('closed');

      const result = await prisma.auctionResult.findUniqueOrThrow({ where: { lotId } });
      expect(result).toMatchObject({ topBidMinor: 20_000n, reserveMet: false, bidCount: 1 });
      // Nothing was offered to anyone: the order and the audit trail carry no offer.
      expect(await prisma.auditLog.count({ where: { entityId: lotId, action: { contains: 'offer' } } })).toBe(0);
      expect((await prisma.auctionLot.findUniqueOrThrow({ where: { id: lotId } })).status).toBe('CLOSED');
    });

    it('closes a lot nobody bid on with no winner', async () => {
      const { auctionId, lotId } = await openAuction({ lots: [{ startPriceMinor: 10_000 }] });
      await prisma.auction.update({ where: { id: auctionId }, data: { endsAt: new Date(Date.now() - 5_000) } });
      await expect(lifecycle.closeLot(lotId)).resolves.toBe('closed');
      expect(await prisma.auctionResult.findUniqueOrThrow({ where: { lotId } })).toMatchObject({
        topBidderId: null,
        topBidMinor: null,
        reserveMet: false,
        bidCount: 0,
      });
    });

    it('leaves the auction open while another lot is still open, and closes it with the last', async () => {
      const { auctionId, lotIds } = await openAuction({ lots: [{ startPriceMinor: 10_000 }, { startPriceMinor: 10_000 }] });
      // Lot 1 ends now; lot 2 was extended to run on.
      await prisma.auction.update({ where: { id: auctionId }, data: { endsAt: new Date(Date.now() - 5_000) } });
      await prisma.auctionLot.update({ where: { id: lotIds[1]! }, data: { endsAt: new Date(Date.now() + 600_000) } });

      await expect(lifecycle.closeLot(lotIds[0]!)).resolves.toBe('closed');
      expect((await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } })).status).toBe('OPEN');

      await prisma.auctionLot.update({ where: { id: lotIds[1]! }, data: { endsAt: new Date(Date.now() - 5_000) } });
      await expect(lifecycle.closeLot(lotIds[1]!)).resolves.toBe('closed');
      expect((await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } })).status).toBe('CLOSED');
    });

    it('closes two lots of one auction that end together, leaving the auction closed and not open for ever', async () => {
      const { auctionId, lotIds } = await openAuction({ lots: [{ startPriceMinor: 10_000 }, { startPriceMinor: 10_000 }] });
      await prisma.auction.update({ where: { id: auctionId }, data: { endsAt: new Date(Date.now() - 5_000) } });
      const outcomes = await Promise.all(lotIds.map((id) => lifecycle.closeLot(id)));
      expect(outcomes).toEqual(['closed', 'closed']);
      expect((await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } })).status).toBe('CLOSED');
    });

    it('is idempotent: ten runners at once close the lot once, with one result and one audit row', async () => {
      const { auctionId, lotId } = await openAuction();
      await bid(lotId, 'only', 10_000);
      await prisma.auction.update({ where: { id: auctionId }, data: { endsAt: new Date(Date.now() - 5_000) } });

      const outcomes = await Promise.all(Array.from({ length: 10 }, () => lifecycle.closeLot(lotId)));
      expect(outcomes.filter((outcome) => outcome === 'closed')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome === 'skipped')).toHaveLength(9);
      expect(await prisma.auctionResult.count({ where: { lotId } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { entityId: lotId, action: 'auction.lot_closed' } })).toBe(1);
      await expect(lifecycle.closeLot(lotId)).resolves.toBe('skipped');
    });

    it('does not close a lot whose end a late bid moved after the job found it due', async () => {
      const { lotId } = await openAuction();
      await bid(lotId, 'first', 10_000);
      await endLotIn(lotId, 30_000);
      // Not yet due: the job leaves it, and the bid below it is still accepted.
      await expect(lifecycle.closeLot(lotId)).resolves.toBe('skipped');
      await expect(bid(lotId, 'second', 10_500)).resolves.toMatchObject({ replayed: false });
    });

    it('closes through closeDue, the way the cron does', async () => {
      const { auctionId, lotId } = await openAuction();
      await prisma.auction.update({ where: { id: auctionId }, data: { endsAt: new Date(Date.now() - 5_000) } });
      const done = await lifecycle.closeDue();
      expect(done.closed).toBeGreaterThanOrEqual(1);
      expect((await prisma.auctionLot.findUniqueOrThrow({ where: { id: lotId } })).status).toBe('CLOSED');
    });
  });

  describe('an outage', () => {
    it('extends a lot found far past its end, once, and does not close it', async () => {
      const { auctionId, lotId } = await openAuction();
      await bid(lotId, 'before', 10_000);
      await prisma.auction.update({ where: { id: auctionId }, data: { endsAt: new Date(Date.now() - 600_000) } });

      await expect(lifecycle.closeLot(lotId)).resolves.toBe('extended');

      const lot = await prisma.auctionLot.findUniqueOrThrow({ where: { id: lotId } });
      expect(lot.status).toBe('OPEN');
      expect(lot.extendedMs).toBe(0); // an outage never spends the cap that bounds a bidding war
      const remaining = lot.endsAt!.getTime() - Date.now();
      expect(remaining).toBeGreaterThan(OUTAGE_EXTENSION_MS - 5_000);
      expect(remaining).toBeLessThanOrEqual(OUTAGE_EXTENSION_MS);
      expect(await prisma.auditLog.count({ where: { entityId: lotId, action: 'auction.lot_extended_after_outage' } })).toBe(1);

      // The rerun straight after is not due, and the lot takes bids again.
      await expect(lifecycle.closeLot(lotId)).resolves.toBe('skipped');
      await expect(bid(lotId, 'after', 10_500)).resolves.toMatchObject({ replayed: false });
      expect(await prisma.auctionResult.count({ where: { lotId } })).toBe(0);
    });

    it('closes a lot that is only a little late, as a slow run and not an outage', async () => {
      const { auctionId, lotId } = await openAuction();
      await prisma.auction.update({ where: { id: auctionId }, data: { endsAt: new Date(Date.now() - 30_000) } });
      await expect(lifecycle.closeLot(lotId)).resolves.toBe('closed');
    });
  });
});
