import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { CoreModule } from '../src/core/core.module';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { AuctionModule } from '../src/modules/auction/auction.module';
import { AuctionService } from '../src/modules/auction/auction.service';

/**
 * Auction app foundation (launchpad-apps/234-auction-app.md, WO-234.1),
 * against the real database. The unit spec proves each rule with the database
 * mocked; this one proves the three things a mock cannot: that the number
 * allocator and the lot numbering stay unique under concurrent requests, and
 * that "schedule" and "withdraw the last lot" cannot both win.
 *
 * Composes only CoreModule and AuctionModule, so it does not depend on the
 * MODULES allowlist or on seeded users. Fixtures are not deleted: each test
 * cancels what it made, and every row is titled with TITLE so a development
 * database shows plainly what they are.
 */
describe('Auction foundation (e2e)', () => {
  const TITLE = '[e2e] auction foundation';
  /** A real user: audit rows reference one. The seeded admin, as the other e2e suites use. */
  let ACTOR: string;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let auctions: AuctionService;
  const made: string[] = [];

  const draftInput = () => ({
    title: TITLE,
    startsAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    endsAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
  });
  const newAuction = async () => {
    const auction = await auctions.create(draftInput(), ACTOR);
    made.push(auction.id);
    return auction;
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [CoreModule, AuctionModule] }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    auctions = moduleRef.get(AuctionService);
    ACTOR = (await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' }, select: { id: true } })).id;
  });

  afterAll(async () => {
    for (const id of made) {
      await auctions?.cancel(id, 'e2e cleanup', ACTOR).catch(() => undefined);
    }
    await moduleRef?.close();
  });

  it('gives eight concurrent drafts eight different, gapless numbers', async () => {
    const created = await Promise.all(Array.from({ length: 8 }, () => auctions.create(draftInput(), ACTOR)));
    made.push(...created.map((auction) => auction.id));

    const sequences = created.map((auction) => Number(auction.number.split('-').pop())).sort((a, b) => a - b);
    expect(new Set(created.map((auction) => auction.number)).size).toBe(8);
    expect(sequences[7]! - sequences[0]!).toBe(7);
    expect(created.every((auction) => /^AUC-\d{4}-\d{4,}$/.test(auction.number))).toBe(true);
  });

  it('numbers eight concurrently added lots 1 to 8, each once', async () => {
    const auction = await newAuction();
    await Promise.all(
      Array.from({ length: 8 }, (_, index) => auctions.addLot(auction.id, { title: `Lot ${index}`, startPriceMinor: 1_000 }, ACTOR)),
    );

    const lots = await prisma.auctionLot.findMany({ where: { auctionId: auction.id }, orderBy: { lotNo: 'asc' } });
    expect(lots.map((lot) => lot.lotNo)).toEqual(Array.from({ length: 8 }, (_, index) => index + 1));
  });

  it('never leaves an auction scheduled with nothing on sale when schedule races the withdrawal of its only lot', async () => {
    for (let round = 0; round < 8; round += 1) {
      const auction = await newAuction();
      const lot = await auctions.addLot(auction.id, { title: 'Only lot', startPriceMinor: 1_000 }, ACTOR);

      await Promise.allSettled([auctions.schedule(auction.id, ACTOR), auctions.withdrawLot(auction.id, lot.id, ACTOR)]);

      const after = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
      const onSale = await prisma.auctionLot.count({ where: { auctionId: auction.id, status: { not: 'WITHDRAWN' } } });
      if (after.status === 'SCHEDULED') expect(onSale).toBeGreaterThanOrEqual(1);
      else expect(after.status).toBe('DRAFT');
    }
  });

  it('records one scheduling audit row when the same schedule request arrives twice at once', async () => {
    const auction = await newAuction();
    await auctions.addLot(auction.id, { title: 'Lot', startPriceMinor: 1_000 }, ACTOR);

    const results = await Promise.all([auctions.schedule(auction.id, ACTOR), auctions.schedule(auction.id, ACTOR)]);

    expect(results.map((result) => result.status)).toEqual(['SCHEDULED', 'SCHEDULED']);
    const rows = await prisma.auditLog.count({ where: { entity: 'Auction', entityId: auction.id, action: 'auction.scheduled' } });
    expect(rows).toBe(1);
  });

  it('refuses edits once scheduled, accepts them again after unscheduling, and cancelling withdraws the lots', async () => {
    const auction = await newAuction();
    await auctions.addLot(auction.id, { title: 'Lot', startPriceMinor: 1_000, reservePriceMinor: 2_000 }, ACTOR);
    await auctions.schedule(auction.id, ACTOR);

    await expect(auctions.update(auction.id, { title: 'Changed' }, ACTOR)).rejects.toThrow('draft');
    await auctions.unschedule(auction.id, ACTOR);
    await expect(auctions.update(auction.id, { title: 'Changed' }, ACTOR)).resolves.toMatchObject({ title: 'Changed' });

    await auctions.cancel(auction.id, 'e2e', ACTOR);
    const lots = await prisma.auctionLot.findMany({ where: { auctionId: auction.id } });
    expect(lots.every((lot) => lot.status === 'WITHDRAWN')).toBe(true);
  });
});
