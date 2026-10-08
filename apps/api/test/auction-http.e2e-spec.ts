import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';

/**
 * Auction routes (launchpad-apps/234-auction-app.md, WO-234.1 and WO-234.2)
 * through the real guards, pipes and filters: who is turned away, what a
 * malformed body does, the draft → scheduled → cancelled path end to end, and
 * a customer's bid with its refusals and its retry. The module
 * is off by default, so this file adds it to the allowlist for its own run
 * (before AppModule is imported, which is when the allowlist is read) instead
 * of depending on what the CI environment enables.
 */
describe('Auction admin routes (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let customerToken: string;
  let prisma: PrismaService;
  const opened: string[] = [];
  const made: string[] = [];

  const when = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
  const api = () => request(app.getHttpServer());
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);

  beforeAll(async () => {
    process.env.MODULES = `${process.env.MODULES ?? ''},auction`;
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    adminToken = (await api().post('/api/v1/auth/login').send({ identifier: 'admin@yaseen.pk', password: 'admin12345' })).body.accessToken;
    customerToken = (await api().post('/api/v1/auth/login').send({ identifier: 'ayesha@example.com', password: 'customer12345' })).body.accessToken;
  });

  afterAll(async () => {
    for (const id of made) {
      await asAdmin(api().post(`/api/v1/admin/auctions/${id}/cancel`)).send({ reason: 'e2e cleanup' });
    }
    // An auction a test opened cannot be cancelled; it is closed, never deleted, because its bids are records.
    await prisma?.auctionLot.updateMany({ where: { auctionId: { in: opened } }, data: { status: 'CLOSED' } });
    await prisma?.auction.updateMany({ where: { id: { in: opened } }, data: { status: 'CLOSED' } });
    await app?.close();
  });

  it('turns away a caller with no token and a customer without the permission', async () => {
    await api().get('/api/v1/admin/auctions').expect(401);
    await api().get('/api/v1/admin/auctions').set('Authorization', `Bearer ${customerToken}`).expect(403);
    await api()
      .post('/api/v1/admin/auctions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ title: 'x', startsAt: when(24), endsAt: when(48) })
      .expect(403);
  });

  it('rejects a malformed draft with a 400 and creates nothing', async () => {
    await asAdmin(api().post('/api/v1/admin/auctions')).send({ title: 'x', startsAt: when(48), endsAt: when(24) }).expect(400);
    await asAdmin(api().post('/api/v1/admin/auctions')).send({ title: 'x', startsAt: when(24), endsAt: when(48), type: 'SEALED_BID' }).expect(400);
    await asAdmin(api().post('/api/v1/admin/auctions')).send({ title: 'x', startsAt: when(24), endsAt: when(48), status: 'OPEN' }).expect(400);
  });

  it('runs a draft through lots, scheduling and a refused edit, then cancels it', async () => {
    const created = await asAdmin(api().post('/api/v1/admin/auctions'))
      .send({ title: '[e2e] http auction', startsAt: when(24), endsAt: when(48), terms: 'Pay within 72 hours.' })
      .expect(201);
    const id: string = created.body.id;
    made.push(id);
    expect(created.body).toMatchObject({ status: 'DRAFT', type: 'ENGLISH', currency: 'PKR' });
    expect(created.body.number).toMatch(/^AUC-\d{4}-\d{4,}$/);

    await asAdmin(api().post(`/api/v1/admin/auctions/${id}/schedule`)).expect(400); // no lot yet
    await asAdmin(api().post(`/api/v1/admin/auctions/${id}/lots`)).send({ title: 'Pallet', startPriceMinor: 5000, reservePriceMinor: 4000 }).expect(400);
    const lot = await asAdmin(api().post(`/api/v1/admin/auctions/${id}/lots`))
      .send({ title: 'Pallet', startPriceMinor: 5000, reservePriceMinor: 8000 })
      .expect(201);
    expect(lot.body.lotNo).toBe(1);

    const detail = await asAdmin(api().get(`/api/v1/admin/auctions/${id}`)).expect(200);
    expect(detail.body.lots[0]).toMatchObject({ lotNo: 1, startPriceMinor: 5000, reservePriceMinor: 8000 });

    const listed = await asAdmin(api().get('/api/v1/admin/auctions?status=DRAFT&pageSize=100')).expect(200);
    expect(listed.body.data.find((row: { id: string }) => row.id === id)).toMatchObject({ lotCount: 1 });

    await asAdmin(api().post(`/api/v1/admin/auctions/${id}/schedule`)).expect(201);
    await asAdmin(api().patch(`/api/v1/admin/auctions/${id}`)).send({ title: 'Changed' }).expect(409);
    await asAdmin(api().post(`/api/v1/admin/auctions/${id}/lots`)).send({ title: 'Late', startPriceMinor: 100 }).expect(409);

    await asAdmin(api().post(`/api/v1/admin/auctions/${id}/cancel`)).send({}).expect(400); // a reason is required
    const cancelled = await asAdmin(api().post(`/api/v1/admin/auctions/${id}/cancel`)).send({ reason: 'e2e' }).expect(201);
    expect(cancelled.body.status).toBe('CANCELLED');
  });

  it('returns 404 for an auction that does not exist', async () => {
    await asAdmin(api().get('/api/v1/admin/auctions/does-not-exist')).expect(404);
    await asAdmin(api().post('/api/v1/admin/auctions/does-not-exist/schedule')).expect(404);
  });

  describe('bidding', () => {
    const asCustomer = (req: request.Test) => req.set('Authorization', `Bearer ${customerToken}`);
    let keyCounter = 0;
    const key = () => `http-${Date.now()}-${(keyCounter += 1)}`;

    /** The test schedules an auction through the API and flips it to OPEN itself; the open job has its own spec (`auction-lifecycle.e2e-spec.ts`). */
    const openLot = async () => {
      const auction = await asAdmin(api().post('/api/v1/admin/auctions')).send({ title: '[e2e] http bidding', startsAt: when(24), endsAt: when(48), registration: 'OPEN' }).expect(201);
      const lot = await asAdmin(api().post(`/api/v1/admin/auctions/${auction.body.id}/lots`))
        .send({ title: 'Pallet', startPriceMinor: 100_000, reservePriceMinor: 900_000 })
        .expect(201);
      await asAdmin(api().post(`/api/v1/admin/auctions/${auction.body.id}/schedule`)).expect(201);
      return { auctionId: auction.body.id as string, lotId: lot.body.id as string };
    };
    const open = async (auctionId: string, lotId: string) => {
      await prisma.auction.update({ where: { id: auctionId }, data: { status: 'OPEN', startsAt: new Date(Date.now() - 60_000) } });
      await prisma.auctionLot.update({ where: { id: lotId }, data: { status: 'OPEN' } });
      opened.push(auctionId);
    };

    it('turns away a caller with no token, and a malformed bid with a 400 that names the field', async () => {
      await api().post('/api/v1/auctions/lots/anything/bids').send({ amountMinor: 1, idempotencyKey: 'abcdefgh' }).expect(401);

      await asCustomer(api().post('/api/v1/auctions/lots/anything/bids')).send({ idempotencyKey: 'abcdefgh' }).expect(400);
      await asCustomer(api().post('/api/v1/auctions/lots/anything/bids')).send({ amountMinor: 0, idempotencyKey: 'abcdefgh' }).expect(400);
      await asCustomer(api().post('/api/v1/auctions/lots/anything/bids')).send({ amountMinor: 1.5, idempotencyKey: 'abcdefgh' }).expect(400);
      await asCustomer(api().post('/api/v1/auctions/lots/anything/bids')).send({ amountMinor: 100 }).expect(400);
      await asCustomer(api().post('/api/v1/auctions/lots/anything/bids')).send({ amountMinor: 100, idempotencyKey: 'short' }).expect(400);
      await asCustomer(api().post('/api/v1/auctions/lots/anything/bids')).send({ amountMinor: 100, idempotencyKey: 'has spaces in it' }).expect(400);
      await asCustomer(api().post('/api/v1/auctions/lots/anything/bids')).send({ amountMinor: 100, idempotencyKey: 'abcdefgh', bidderId: 'x' }).expect(400);
      await asCustomer(api().post('/api/v1/auctions/lots/anything/bids')).send({ amountMinor: 1_000_000_000_000_001, idempotencyKey: 'abcdefgh' }).expect(400);
    });

    it('says a lot that does not exist is not found, and a lot not yet open is not open', async () => {
      await asCustomer(api().post('/api/v1/auctions/lots/does-not-exist/bids')).send({ amountMinor: 100, idempotencyKey: key() }).expect(404);

      const { lotId } = await openLot();
      const refused = await asCustomer(api().post(`/api/v1/auctions/lots/${lotId}/bids`)).send({ amountMinor: 100_000, idempotencyKey: key() }).expect(409);
      expect(refused.body).toMatchObject({ code: 'LOT_NOT_OPEN', message: 'Bidding has not opened yet.' });
    });

    it('lets a customer bid, answers a retry with the same bid, names the minimum when a bid is too low, and never leaks the reserve or the account', async () => {
      const { auctionId, lotId } = await openLot();
      await open(auctionId, lotId);
      const idempotencyKey = key();

      const placed = await asCustomer(api().post(`/api/v1/auctions/lots/${lotId}/bids`)).send({ amountMinor: 100_000, idempotencyKey }).expect(201);
      expect(placed.body).toMatchObject({
        replayed: false,
        bid: { seq: 1, alias: 'Bidder 1', amountMinor: 100_000, kind: 'MANUAL' },
        lot: { currentBidMinor: 100_000, bidSeq: 1, minimumNextBidMinor: 105_000, leading: true },
      });
      expect(JSON.stringify(placed.body)).not.toMatch(/reserve|900000|ayesha|userId/i);

      const retried = await asCustomer(api().post(`/api/v1/auctions/lots/${lotId}/bids`)).send({ amountMinor: 100_000, idempotencyKey }).expect(201);
      expect(retried.body).toMatchObject({ replayed: true, bid: { id: placed.body.bid.id } });

      const own = await asCustomer(api().post(`/api/v1/auctions/lots/${lotId}/bids`)).send({ amountMinor: 500_000, idempotencyKey: key() }).expect(409);
      expect(own.body).toMatchObject({ code: 'ALREADY_LEADING', details: { minimumNextBidMinor: 105_000 } });

      expect(await prisma.bid.count({ where: { lotId } })).toBe(1);
    });

    it('bars a staff account that holds auction.manage from bidding on its own auction', async () => {
      const { auctionId, lotId } = await openLot();
      await open(auctionId, lotId);
      const refused = await asAdmin(api().post(`/api/v1/auctions/lots/${lotId}/bids`)).send({ amountMinor: 100_000, idempotencyKey: key() }).expect(403);
      expect(refused.body).toMatchObject({ code: 'BIDDER_NOT_ELIGIBLE' });
      expect(await prisma.bid.count({ where: { lotId } })).toBe(0);
    });

    it('shows staff the ledger by alias and its integrity, and turns a customer away from both', async () => {
      const { auctionId, lotId } = await openLot();
      await open(auctionId, lotId);
      await asCustomer(api().post(`/api/v1/auctions/lots/${lotId}/bids`)).send({ amountMinor: 100_000, idempotencyKey: key() }).expect(201);

      const ledger = await asAdmin(api().get(`/api/v1/admin/auctions/${auctionId}/lots/${lotId}/bids`)).expect(200);
      expect(ledger.body.data).toHaveLength(1);
      expect(ledger.body.data[0]).toMatchObject({ seq: 1, alias: 'Bidder 1', amountMinor: 100_000, prevHash: null });
      expect(ledger.body.data[0].hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(ledger.body)).not.toMatch(/ayesha|userId/i);

      const verdict = await asAdmin(api().get(`/api/v1/admin/auctions/${auctionId}/lots/${lotId}/bids/verify`)).expect(200);
      expect(verdict.body).toEqual({ valid: true, bidCount: 1 });

      await asCustomer(api().get(`/api/v1/admin/auctions/${auctionId}/lots/${lotId}/bids`)).expect(403);
      await asCustomer(api().get(`/api/v1/admin/auctions/${auctionId}/lots/${lotId}/bids/verify`)).expect(403);
      await asAdmin(api().get(`/api/v1/admin/auctions/${auctionId}/lots/nope/bids`)).expect(404);
    });

    it('sets a standing maximum for the signed-in customer only, answers with their own number, and never lowers it', async () => {
      await api().put('/api/v1/auctions/lots/anything/proxy').send({ maxMinor: 500_000 }).expect(401);
      await asCustomer(api().put('/api/v1/auctions/lots/anything/proxy')).send({}).expect(400);
      await asCustomer(api().put('/api/v1/auctions/lots/anything/proxy')).send({ maxMinor: 0 }).expect(400);
      await asCustomer(api().put('/api/v1/auctions/lots/anything/proxy')).send({ maxMinor: 500_000, bidderId: 'x' }).expect(400);
      await asCustomer(api().put('/api/v1/auctions/lots/does-not-exist/proxy')).send({ maxMinor: 500_000 }).expect(404);

      const { auctionId, lotId } = await openLot();
      await open(auctionId, lotId);

      const set = await asCustomer(api().put(`/api/v1/auctions/lots/${lotId}/proxy`)).send({ maxMinor: 500_000 }).expect(200);
      // A lone maximum opens the lot at its opening price, as the caller's own bid.
      expect(set.body).toMatchObject({
        maxMinor: 500_000,
        autoBid: { seq: 1, amountMinor: 100_000, kind: 'PROXY_AUTO' },
        lot: { currentBidMinor: 100_000, leading: true },
      });
      expect(JSON.stringify(set.body)).not.toMatch(/reserve|900000|ayesha|userId/i);

      const own = await asCustomer(api().get(`/api/v1/auctions/lots/${lotId}/proxy`)).expect(200);
      expect(own.body).toEqual({ maxMinor: 500_000 });
      await api().get(`/api/v1/auctions/lots/${lotId}/proxy`).expect(401);

      const lower = await asCustomer(api().put(`/api/v1/auctions/lots/${lotId}/proxy`)).send({ maxMinor: 400_000 }).expect(409);
      expect(lower.body).toMatchObject({ code: 'PROXY_CANNOT_LOWER' });
      await asCustomer(api().put(`/api/v1/auctions/lots/${lotId}/proxy`)).send({ maxMinor: 600_000 }).expect(200);

      // Staff who run the auction cannot set one, and the ledger shows the maximum nowhere.
      const barred = await asAdmin(api().put(`/api/v1/auctions/lots/${lotId}/proxy`)).send({ maxMinor: 500_000 }).expect(403);
      expect(barred.body).toMatchObject({ code: 'BIDDER_NOT_ELIGIBLE' });
      const ledger = await asAdmin(api().get(`/api/v1/admin/auctions/${auctionId}/lots/${lotId}/bids`)).expect(200);
      expect(JSON.stringify(ledger.body)).not.toMatch(/500000|600000/);
    });
  });
});
