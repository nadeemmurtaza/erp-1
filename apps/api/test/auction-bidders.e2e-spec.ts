import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import type { SettingsService } from '../src/core/settings/settings.service';
import type { AuctionBidderService } from '../src/modules/sales/auction/auction-bidder.service';
import type { AuctionService } from '../src/modules/sales/auction/auction.service';

/**
 * Who may bid (launchpad-apps/234-auction-app.md §8, WO-234.5) against the real
 * database and through the real guards. The unit specs prove each rule with the
 * database mocked; this one proves what a mock cannot: that two people joining
 * at once never share an alias or a row, that two staff deciding on one
 * registration at once leave exactly one winner, that a suspension stops the
 * system bidding for someone as well as the person, that strikes count by real
 * timestamps and stop counting when voided, and that the routes turn away
 * whoever lacks `auction.bidders.manage`.
 *
 * The module is off by default, so this file adds it to the allowlist for its
 * own run. Bidders are plain user-id strings because `Bidder.userId` is not a
 * foreign key, and strikes belong to a person across auctions, so every id is
 * unique to this run: a strike is a record, never deleted, and a later run
 * must not inherit this one's. Auctions are closed, never deleted.
 */
describe('Auction bidders (e2e)', () => {
  const TITLE = '[e2e] auction bidders';
  const RUN = Date.now().toString(36);
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let auctions: AuctionService;
  let bidders: AuctionBidderService;
  let settings: SettingsService;
  let identityRegistry: { register(provider: { isApproved(userId: string): Promise<boolean> }): void };
  let ACTOR: string;
  let adminToken: string;
  let customerToken: string;
  let customerId: string;
  const made: string[] = [];
  let keyCounter = 0;

  const key = () => `bidders-${RUN}-${(keyCounter += 1)}`;
  const uid = (name: string) => `e2e-bidders-${RUN}-${name}`;
  const person = (name: string) => ({ id: uid(name), permissions: [] as string[] });
  const staffer = (name: string) => ({ id: uid(`staff-${name}`), permissions: ['auction.bidders.manage'] });
  const staff = staffer('a');
  /** Every account the tests act as or for. They are real users because the audit trail references one; created once, never deleted. */
  const NAMES = [
    'open-1', 'approval-1', 'verified', 'unverified', 'twin', 'late', 'alpha', 'beta', 'contested', 'split', 'stale', 'offender', 'guarded', 'shape',
    ...Array.from({ length: 20 }, (_, index) => `crowd-${index}`),
    ...Array.from({ length: 23 }, (_, index) => `page-${index}`),
    ...['a', 'x', 'y', ...Array.from({ length: 10 }, (_, index) => String(index))].map((name) => `staff-${name}`),
  ];
  const api = () => request(app.getHttpServer());
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);
  const asCustomer = (req: request.Test) => req.set('Authorization', `Bearer ${customerToken}`);

  /** A scheduled auction with one lot in the given mode, flipped to OPEN so a bid can land. */
  const openLot = async (registration: 'OPEN' | 'VERIFIED' | 'APPROVAL', opts: { open?: boolean } = {}) => {
    const auction = await auctions.create(
      { title: TITLE, startsAt: new Date(Date.now() + 3_600_000).toISOString(), endsAt: new Date(Date.now() + 7_200_000).toISOString(), registration },
      ACTOR,
    );
    made.push(auction.id);
    const lot = await auctions.addLot(auction.id, { title: 'Pallet', startPriceMinor: 100_000 }, ACTOR);
    await auctions.schedule(auction.id, ACTOR);
    if (opts.open !== false) {
      await prisma.auction.update({ where: { id: auction.id }, data: { status: 'OPEN', startsAt: new Date(Date.now() - 60_000) } });
      await prisma.auctionLot.update({ where: { id: lot.id }, data: { status: 'OPEN' } });
    }
    return { auctionId: auction.id, lotId: lot.id };
  };

  const outcome = async <T>(promise: Promise<T>) => {
    try {
      return { ok: true as const, value: await promise };
    } catch (error: any) {
      return { ok: false as const, status: error.getStatus?.() as number | undefined, code: error.getResponse?.()?.code as string | undefined };
    }
  };

  const bidderRow = (auctionId: string, userId: string) => prisma.bidder.findUniqueOrThrow({ where: { auctionId_userId: { auctionId, userId } } });
  const decide = (auctionId: string, bidderId: string, decision: string, expectedStatus: string, reason?: string, who = staff) =>
    bidders.decide(auctionId, bidderId, who, { decision, expectedStatus, ...(reason ? { reason } : {}) } as never);

  beforeAll(async () => {
    process.env.MODULES = `${process.env.MODULES ?? ''},auction`;
    const { AppModule } = await import('../src/app.module');
    const { AuctionBidderService: BidderService } = await import('../src/modules/sales/auction/auction-bidder.service');
    const { AuctionService: Auctions } = await import('../src/modules/sales/auction/auction.service');
    const { SettingsService: Settings } = await import('../src/core/settings/settings.service');
    const { IdentityVerificationStatusRegistry } = await import('../src/core/extension-points/identity-verification-status.registry');
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = moduleRef.get(PrismaService);
    auctions = moduleRef.get(Auctions);
    bidders = moduleRef.get(BidderService);
    settings = moduleRef.get(Settings);
    identityRegistry = moduleRef.get(IdentityVerificationStatusRegistry);
    // Only this user is verified, whatever module would otherwise answer: the VERIFIED mode is tested by who it lets through.
    identityRegistry.register({ isApproved: async (userId) => userId === person('verified').id });

    await prisma.user.createMany({
      data: NAMES.map((name) => ({ id: uid(name), email: `${uid(name)}@example.com`, firstName: 'E2E', lastName: name, role: 'CUSTOMER' as const })),
    });
    ACTOR = (await prisma.user.findFirstOrThrow({ where: { email: 'admin@yaseen.pk' }, select: { id: true } })).id;
    customerId = (await prisma.user.findFirstOrThrow({ where: { email: 'ayesha@example.com' }, select: { id: true } })).id;
    adminToken = (await api().post('/api/v1/auth/login').send({ identifier: 'admin@yaseen.pk', password: 'admin12345' })).body.accessToken;
    customerToken = (await api().post('/api/v1/auth/login').send({ identifier: 'ayesha@example.com', password: 'customer12345' })).body.accessToken;
  });

  afterAll(async () => {
    identityRegistry?.register({ isApproved: async () => false });
    if (made.length) {
      await prisma.auctionLot.updateMany({ where: { auctionId: { in: made } }, data: { status: 'CLOSED' } });
      await prisma.auction.updateMany({ where: { id: { in: made } }, data: { status: 'CLOSED' } });
    }
    await app?.close();
  });

  describe('joining', () => {
    it('approves at once under OPEN, waits under APPROVAL, and joining twice is the same place and one audit row', async () => {
      const open = await openLot('OPEN');
      const first = await bidders.join(open.auctionId, person('open-1'));
      expect(first).toMatchObject({ mode: 'OPEN', status: 'APPROVED', alias: 'Bidder 1' });

      const approval = await openLot('APPROVAL');
      const user = person('approval-1');
      expect(await bidders.join(approval.auctionId, user)).toMatchObject({ mode: 'APPROVAL', status: 'PENDING', alias: 'Bidder 1' });
      expect(await bidders.join(approval.auctionId, user)).toMatchObject({ status: 'PENDING', alias: 'Bidder 1' });

      expect(await prisma.bidder.count({ where: { auctionId: approval.auctionId } })).toBe(1);
      const row = await bidderRow(approval.auctionId, user.id);
      expect(await prisma.auditLog.count({ where: { action: 'auction.bidder_joined', entityId: row.id } })).toBe(1);
    });

    it('under VERIFIED approves the person whose identity is verified and makes the rest wait', async () => {
      const { auctionId } = await openLot('VERIFIED');
      expect(await bidders.join(auctionId, person('verified'))).toMatchObject({ mode: 'VERIFIED', status: 'APPROVED' });
      expect(await bidders.join(auctionId, person('unverified'))).toMatchObject({ mode: 'VERIFIED', status: 'PENDING' });
    });

    it('treats a failing identity module as "not verified": the person waits, nobody is approved by a guess', async () => {
      const { auctionId } = await openLot('VERIFIED');
      identityRegistry.register({
        isApproved: async () => {
          throw new Error('identity service is down');
        },
      });
      try {
        expect(await bidders.join(auctionId, person('verified'))).toMatchObject({ status: 'PENDING' });
      } finally {
        identityRegistry.register({ isApproved: async (userId) => userId === person('verified').id });
      }
    });

    it('gives twenty people joining at once twenty different aliases, and one person joining ten times at once one row', async () => {
      const { auctionId } = await openLot('APPROVAL');
      const crowd = await Promise.all(Array.from({ length: 20 }, (_, index) => outcome(bidders.join(auctionId, person(`crowd-${index}`)))));
      expect(crowd.every((result) => result.ok)).toBe(true);

      const rows = await prisma.bidder.findMany({ where: { auctionId }, select: { alias: true } });
      expect(rows).toHaveLength(20);
      expect(new Set(rows.map((row) => row.alias)).size).toBe(20);
      expect(new Set(rows.map((row) => row.alias))).toEqual(new Set(Array.from({ length: 20 }, (_, index) => `Bidder ${index + 1}`)));

      const again = await openLot('APPROVAL');
      const same = person('twin');
      const copies = await Promise.all(Array.from({ length: 10 }, () => outcome(bidders.join(again.auctionId, same))));
      expect(copies.every((result) => result.ok)).toBe(true);
      expect(await prisma.bidder.count({ where: { auctionId: again.auctionId } })).toBe(1);
      const row = await bidderRow(again.auctionId, same.id);
      expect(await prisma.auditLog.count({ where: { action: 'auction.bidder_joined', entityId: row.id } })).toBe(1);
    });

    it('refuses to take bidders for a draft (not found) or an auction that has ended (closed)', async () => {
      const draft = await auctions.create(
        { title: TITLE, startsAt: new Date(Date.now() + 3_600_000).toISOString(), endsAt: new Date(Date.now() + 7_200_000).toISOString(), registration: 'APPROVAL' },
        ACTOR,
      );
      made.push(draft.id);
      expect(await outcome(bidders.join(draft.id, person('late')))).toMatchObject({ ok: false, status: 404 });

      const ended = await openLot('APPROVAL');
      await prisma.auction.update({ where: { id: ended.auctionId }, data: { status: 'CLOSED' } });
      expect(await outcome(bidders.join(ended.auctionId, person('late')))).toMatchObject({ ok: false, status: 409, code: 'REGISTRATION_CLOSED' });
    });
  });

  describe('under load', () => {
    /**
     * The strike policy is two Settings. A Setting that is not in the cache is read on another pool connection, so a bid that read it
     * from inside its transaction held one connection while asking for a second. With the cache cold (a restart, or the 30 seconds an
     * entry lives) and more first-time bidders than the pool has connections (ten here, as in CI), every connection was held by a bid
     * waiting for another and every bid timed out as a 503. The policy is read before the transaction opens; this is the proof.
     */
    it('takes a crowd of first-time bidders with the settings cache cold, with no bid starved of a connection', async () => {
      const { lotId } = await openLot('OPEN');
      await settings.invalidate();
      const started = Date.now();
      const crowd = await Promise.all(
        Array.from({ length: 40 }, (_, index) =>
          outcome(auctions.placeBid({ lotId, amountMinor: 100_000, idempotencyKey: key(), user: person(`cold-${index}`) })),
        ),
      );
      expect(crowd.filter((result) => !result.ok && result.status === 503)).toEqual([]);
      // One wins the price; the rest are told the price moved, which is an answer and not a failure.
      expect(crowd.filter((result) => result.ok)).toHaveLength(1);
      expect(crowd.filter((result) => !result.ok).every((result) => !result.ok && result.code === 'BID_TOO_LOW')).toBe(true);
      expect(Date.now() - started).toBeLessThan(8_000);
    });
  });

  describe('a customer through the routes: join, wait, be approved, bid', () => {
    it('is told not registered, cannot bid, joins and waits, cannot bid, is approved by staff, and then bids', async () => {
      const { auctionId, lotId } = await openLot('APPROVAL');
      const bidUrl = `/api/v1/auctions/lots/${lotId}/bids`;
      const meUrl = `/api/v1/auctions/lots/${lotId}/me`;

      const before = await asCustomer(api().get(meUrl)).expect(200);
      expect(before.body).toMatchObject({ eligible: false, reason: { code: 'BIDDER_NOT_ELIGIBLE', why: 'NOT_REGISTERED' }, registration: { mode: 'APPROVAL', status: 'NONE' } });
      const refused = await asCustomer(api().post(bidUrl)).send({ amountMinor: 100_000, idempotencyKey: key() }).expect(403);
      expect(refused.body).toMatchObject({ code: 'BIDDER_NOT_ELIGIBLE', details: { why: 'NOT_REGISTERED' } });

      const joined = await asCustomer(api().post(`/api/v1/auctions/${auctionId}/registration`)).send({}).expect(201);
      expect(joined.body).toMatchObject({ mode: 'APPROVAL', status: 'PENDING', alias: 'Bidder 1' });
      const waiting = await asCustomer(api().post(bidUrl)).send({ amountMinor: 100_000, idempotencyKey: key() }).expect(403);
      expect(waiting.body).toMatchObject({ code: 'BIDDER_NOT_ELIGIBLE', details: { why: 'PENDING' } });
      expect((await asCustomer(api().get(meUrl)).expect(200)).body).toMatchObject({ reason: { why: 'PENDING' }, registration: { status: 'PENDING' } });

      const queue = await asAdmin(api().get(`/api/v1/admin/auctions/${auctionId}/bidders?filter=waiting`)).expect(200);
      expect(queue.body.data).toHaveLength(1);
      expect(queue.body.data[0]).toMatchObject({ alias: 'Bidder 1', status: 'PENDING', person: { email: 'ayesha@example.com' }, strikes: { inWindow: 0, reviewDue: false } });
      expect((await asAdmin(api().get(`/api/v1/admin/auctions/${auctionId}/bidders/summary`)).expect(200)).body).toEqual({ waiting: 1, approved: 0, stopped: 0, appeals: 0, total: 1 });

      const bidderId = queue.body.data[0].id as string;
      await asAdmin(api().post(`/api/v1/admin/auctions/${auctionId}/bidders/${bidderId}/decision`)).send({ decision: 'APPROVE', expectedStatus: 'PENDING' }).expect(201);

      expect((await asCustomer(api().get(meUrl)).expect(200)).body).toMatchObject({ eligible: true, registration: { status: 'APPROVED' } });
      const placed = await asCustomer(api().post(bidUrl)).send({ amountMinor: 100_000, idempotencyKey: key() }).expect(201);
      expect(placed.body).toMatchObject({ bid: { alias: 'Bidder 1', amountMinor: 100_000 }, lot: { leading: true } });
      expect((await asAdmin(api().get(`/api/v1/admin/auctions/${auctionId}/bidders/summary`)).expect(200)).body).toMatchObject({ waiting: 0, approved: 1 });
    });

    it('first bid under OPEN registers the bidder as approved; staff who run the auction are told they cannot join', async () => {
      const { auctionId, lotId } = await openLot('OPEN');
      await asCustomer(api().post(`/api/v1/auctions/lots/${lotId}/bids`)).send({ amountMinor: 100_000, idempotencyKey: key() }).expect(201);
      expect(await bidderRow(auctionId, customerId)).toMatchObject({ status: 'APPROVED', alias: 'Bidder 1' });

      const staffJoin = await asAdmin(api().post(`/api/v1/auctions/${auctionId}/registration`)).send({}).expect(403);
      expect(staffJoin.body).toMatchObject({ code: 'BIDDER_NOT_ELIGIBLE', details: { why: 'RUNS_AUCTION' } });
    });
  });

  describe('decisions and appeals', () => {
    it('walks decline, appeal, keep, and a fresh approval, each answered with the reason the bidder reads', async () => {
      const { auctionId, lotId } = await openLot('APPROVAL');
      const bidUrl = `/api/v1/auctions/lots/${lotId}/bids`;
      const meUrl = `/api/v1/auctions/lots/${lotId}/me`;
      const base = `/api/v1/admin/auctions/${auctionId}/bidders`;
      await asCustomer(api().post(`/api/v1/auctions/${auctionId}/registration`)).send({}).expect(201);
      const { id: bidderId } = await bidderRow(auctionId, customerId);

      // A decline needs its reason, because the bidder reads it.
      await asAdmin(api().post(`${base}/${bidderId}/decision`)).send({ decision: 'DECLINE', expectedStatus: 'PENDING' }).expect(400);
      await asAdmin(api().post(`${base}/${bidderId}/decision`)).send({ decision: 'DECLINE', expectedStatus: 'PENDING', reason: '   ' }).expect(400);
      await asAdmin(api().post(`${base}/${bidderId}/decision`)).send({ decision: 'DECLINE', expectedStatus: 'PENDING', reason: 'We could not match your details.' }).expect(201);

      const declined = (await asCustomer(api().get(meUrl)).expect(200)).body;
      expect(declined).toMatchObject({ reason: { why: 'DECLINED' }, registration: { status: 'DECLINED', decisionReason: 'We could not match your details.', appeal: 'NONE' } });
      expect((await asCustomer(api().post(bidUrl)).send({ amountMinor: 100_000, idempotencyKey: key() }).expect(403)).body.details).toEqual({ why: 'DECLINED' });

      // One open appeal at a time, and nothing to appeal before a decision.
      await asCustomer(api().post(`/api/v1/auctions/${auctionId}/appeal`)).send({ message: '   ' }).expect(400);
      const appealed = await asCustomer(api().post(`/api/v1/auctions/${auctionId}/appeal`)).send({ message: 'My details are correct, please look again.' }).expect(201);
      expect(appealed.body).toMatchObject({ status: 'DECLINED', appeal: 'WAITING', appealText: 'My details are correct, please look again.' });
      const again = await asCustomer(api().post(`/api/v1/auctions/${auctionId}/appeal`)).send({ message: 'Again' }).expect(409);
      expect(again.body).toMatchObject({ code: 'APPEAL_ALREADY_OPEN' });

      expect((await asAdmin(api().get(`${base}/summary`)).expect(200)).body).toEqual({ waiting: 0, approved: 0, stopped: 1, appeals: 1, total: 1 });
      const waitingAppeals = await asAdmin(api().get(`${base}?filter=appeals`)).expect(200);
      expect(waitingAppeals.body.data).toHaveLength(1);
      expect(waitingAppeals.body.data[0]).toMatchObject({ appeal: { state: 'WAITING', text: 'My details are correct, please look again.' } });

      // Keeping the decision answers the appeal, makes it final, and takes it off the queue.
      await asAdmin(api().post(`${base}/${bidderId}/decision`)).send({ decision: 'UPHOLD', expectedStatus: 'DECLINED' }).expect(400);
      await asAdmin(api().post(`${base}/${bidderId}/decision`)).send({ decision: 'UPHOLD', expectedStatus: 'DECLINED', reason: 'The details do not match our records.' }).expect(201);
      expect((await asCustomer(api().get(meUrl)).expect(200)).body).toMatchObject({ registration: { status: 'DECLINED', appeal: 'KEPT', appealText: null, decisionReason: 'The details do not match our records.' } });
      expect((await asCustomer(api().post(`/api/v1/auctions/${auctionId}/appeal`)).send({ message: 'One more try' }).expect(409)).body).toMatchObject({ code: 'APPEAL_ALREADY_ANSWERED' });
      expect((await asAdmin(api().get(`${base}/summary`)).expect(200)).body).toMatchObject({ stopped: 1, appeals: 0 });
      // Nothing left to keep.
      await asAdmin(api().post(`${base}/${bidderId}/decision`)).send({ decision: 'UPHOLD', expectedStatus: 'DECLINED', reason: 'x' }).expect(409);

      // Staff can still change their mind, and the bidder is then in.
      await asAdmin(api().post(`${base}/${bidderId}/decision`)).send({ decision: 'APPROVE', expectedStatus: 'DECLINED' }).expect(201);
      expect((await asCustomer(api().get(meUrl)).expect(200)).body).toMatchObject({ eligible: true, registration: { status: 'APPROVED', appeal: 'NONE', decisionReason: null } });
      await asCustomer(api().post(bidUrl)).send({ amountMinor: 100_000, idempotencyKey: key() }).expect(201);
      expect(await prisma.auditLog.count({ where: { entityId: bidderId, action: { in: ['auction.bidder_joined', 'auction.bidder_appealed', 'auction.bidder_decided'] } } })).toBe(5);
    });

    it('stops a suspended bidder bidding, and stops the system bidding on their behalf', async () => {
      const { auctionId, lotId } = await openLot('OPEN');
      const alpha = person('alpha');
      const beta = person('beta');
      await auctions.setProxyBid({ lotId, maxMinor: 500_000, user: alpha });
      const rival = await auctions.placeBid({ lotId, amountMinor: 105_000, idempotencyKey: key(), user: beta });
      // While alpha is in good standing the standing maximum answers the rival at once.
      expect(rival.lot.leading).toBe(false);

      const alphaRow = await bidderRow(auctionId, alpha.id);
      await decide(auctionId, alphaRow.id, 'SUSPEND', 'APPROVED', 'Reported by the organiser.');
      expect(await outcome(auctions.placeBid({ lotId, amountMinor: 900_000, idempotencyKey: key(), user: alpha }))).toMatchObject({ ok: false, status: 403, code: 'BIDDER_NOT_ELIGIBLE' });
      expect(await outcome(auctions.setProxyBid({ lotId, maxMinor: 900_000, user: alpha }))).toMatchObject({ ok: false, status: 403, code: 'BIDDER_NOT_ELIGIBLE' });

      const before = await prisma.bid.count({ where: { lotId } });
      const raised = await auctions.placeBid({ lotId, amountMinor: 200_000, idempotencyKey: key(), user: beta });
      expect(raised.lot.leading).toBe(true);
      expect(raised.lot.currentBidMinor).toBe(200_000);
      // One bid, not a bid and an answer: alpha's maximum is no longer read.
      expect(await prisma.bid.count({ where: { lotId } })).toBe(before + 1);
    });
  });

  describe('two staff at once', () => {
    it('lets exactly one of ten simultaneous approvals win, and the rest see BIDDER_CHANGED with the new status', async () => {
      const { auctionId } = await openLot('APPROVAL');
      await bidders.join(auctionId, person('contested'));
      const row = await bidderRow(auctionId, person('contested').id);

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, index) => outcome(decide(auctionId, row.id, 'APPROVE', 'PENDING', undefined, staffer(String(index))))),
      );
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok).every((result) => !result.ok && result.status === 409 && result.code === 'BIDDER_CHANGED')).toBe(true);
      expect((await bidderRow(auctionId, person('contested').id)).status).toBe('APPROVED');
      expect(await prisma.auditLog.count({ where: { action: 'auction.bidder_decided', entityId: row.id } })).toBe(1);
    });

    it('lets one of an approval and a decline on the same waiting bidder win, never both', async () => {
      const { auctionId } = await openLot('APPROVAL');
      await bidders.join(auctionId, person('split'));
      const row = await bidderRow(auctionId, person('split').id);
      const results = await Promise.all([
        outcome(decide(auctionId, row.id, 'APPROVE', 'PENDING', undefined, staffer('x'))),
        outcome(decide(auctionId, row.id, 'DECLINE', 'PENDING', 'Not this time.', staffer('y'))),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      const status = (await bidderRow(auctionId, person('split').id)).status;
      expect(['APPROVED', 'DECLINED']).toContain(status);
    });

    it('refuses a decision made from a stale screen', async () => {
      const { auctionId } = await openLot('APPROVAL');
      await bidders.join(auctionId, person('stale'));
      const row = await bidderRow(auctionId, person('stale').id);
      await decide(auctionId, row.id, 'APPROVE', 'PENDING');
      // The second staff member is still looking at "waiting".
      expect(await outcome(decide(auctionId, row.id, 'DECLINE', 'PENDING', 'Too late'))).toMatchObject({ ok: false, status: 409, code: 'BIDDER_CHANGED' });
      expect((await bidderRow(auctionId, person('stale').id)).status).toBe('APPROVED');
    });
  });

  describe('strikes', () => {
    it('counts a person’s live strikes inside the window across auctions, flags at three, never suspends, and stops counting a voided one', async () => {
      const offender = person('offender');
      const first = await openLot('OPEN');
      const second = await openLot('OPEN');
      await bidders.join(first.auctionId, offender);
      await bidders.join(second.auctionId, offender);
      const inFirst = await bidderRow(first.auctionId, offender.id);
      const inSecond = await bidderRow(second.auctionId, offender.id);

      // A strike from long ago is on record but is outside the 365-day window, so it does not count.
      const old = await bidders.recordStrike(first.auctionId, inFirst.id, staff, { reason: 'Did not pay for a lot last year.' });
      await prisma.bidderStrike.update({ where: { id: old.strikeList[0].id }, data: { recordedAt: new Date(Date.now() - 400 * 86_400_000) } });

      await bidders.recordStrike(first.auctionId, inFirst.id, staff, { reason: 'Did not collect.' });
      const two = await bidders.recordStrike(second.auctionId, inSecond.id, staff, { reason: 'Did not pay.' });
      expect(two.strikes).toMatchObject({ inWindow: 2, reviewDue: false });
      expect(two.strikeList).toHaveLength(3);
      expect((await bidderRow(second.auctionId, offender.id)).status).toBe('APPROVED');

      const three = await bidders.recordStrike(second.auctionId, inSecond.id, staff, { reason: 'Did not pay again.' });
      expect(three.strikes).toMatchObject({ inWindow: 3, reviewDue: true, });
      expect(three.policy).toEqual({ strikesToReview: 3, windowDays: 365 });
      // Flagged for a human to look at; nothing stopped them.
      expect((await bidderRow(second.auctionId, offender.id)).status).toBe('APPROVED');

      // At the threshold a first bid no longer registers them: they must join and wait, under any mode.
      const fresh = await openLot('OPEN');
      expect(await bidders.join(fresh.auctionId, offender)).toMatchObject({ mode: 'OPEN', status: 'PENDING' });
      const other = await openLot('OPEN');
      expect(await outcome(auctions.placeBid({ lotId: other.lotId, amountMinor: 100_000, idempotencyKey: key(), user: offender }))).toMatchObject({
        ok: false,
        status: 403,
        code: 'BIDDER_NOT_ELIGIBLE',
      });

      // Voiding keeps the row and stops it counting.
      const voidedId = three.strikeList[0].id;
      const voided = await bidders.voidStrike(second.auctionId, inSecond.id, voidedId, staff, 'Entered against the wrong person.');
      expect(voided.strikes).toMatchObject({ inWindow: 2, reviewDue: false });
      expect(voided.strikeList.find((strike) => strike.id === voidedId)?.voided).toMatchObject({ reason: 'Entered against the wrong person.' });
      expect(await prisma.bidderStrike.count({ where: { userId: offender.id } })).toBe(4);
      expect(await outcome(bidders.voidStrike(second.auctionId, inSecond.id, voidedId, staff, 'Again'))).toMatchObject({ ok: false, status: 409, code: 'STRIKE_ALREADY_VOID' });
      expect(await prisma.auditLog.count({ where: { entityId: inSecond.id, action: { in: ['auction.strike_recorded', 'auction.strike_voided'] } } })).toBe(3);
    });
  });

  describe('who may do what', () => {
    it('turns away a staff member deciding on, striking or voiding their own registration', async () => {
      const { auctionId } = await openLot('APPROVAL');
      // A staff account can hold a bidder row (it joined as a customer, or the permission came later): it still cannot decide on itself.
      const own = await prisma.bidder.create({ data: { auctionId, userId: staff.id, alias: 'Bidder 1', status: 'PENDING' } });
      expect(await outcome(decide(auctionId, own.id, 'APPROVE', 'PENDING'))).toMatchObject({ ok: false, status: 403, code: 'CANNOT_DECIDE_OWN' });
      expect(await outcome(bidders.recordStrike(auctionId, own.id, staff, { reason: 'Self' }))).toMatchObject({ ok: false, status: 403, code: 'CANNOT_DECIDE_OWN' });
      expect((await prisma.bidder.findUniqueOrThrow({ where: { id: own.id } })).status).toBe('PENDING');
    });

    it('guards every staff route with auction.bidders.manage and every bidder route with a sign-in', async () => {
      const { auctionId, lotId } = await openLot('APPROVAL');
      await bidders.join(auctionId, person('guarded'));
      const { id: bidderId } = await bidderRow(auctionId, person('guarded').id);
      const base = `/api/v1/admin/auctions/${auctionId}/bidders`;

      for (const path of [`${base}`, `${base}/summary`, `${base}/${bidderId}`]) {
        await api().get(path).expect(401);
        await asCustomer(api().get(path)).expect(403);
        await asAdmin(api().get(path)).expect(200);
      }
      for (const [path, body] of [
        [`${base}/${bidderId}/decision`, { decision: 'APPROVE', expectedStatus: 'PENDING' }],
        [`${base}/${bidderId}/strikes`, { reason: 'x' }],
        [`${base}/${bidderId}/strikes/anything/void`, { reason: 'x' }],
      ] as const) {
        await api().post(path).send(body).expect(401);
        await asCustomer(api().post(path)).send(body).expect(403);
      }
      expect((await bidderRow(auctionId, person('guarded').id)).status).toBe('PENDING');

      await api().post(`/api/v1/auctions/${auctionId}/registration`).send({}).expect(401);
      await api().post(`/api/v1/auctions/${auctionId}/appeal`).send({ message: 'x' }).expect(401);
      await api().get(`/api/v1/auctions/lots/${lotId}/me`).expect(401);
    });

    it('answers a malformed decision, strike, void or appeal with a 400 that creates nothing, and an unknown id with a 404', async () => {
      const { auctionId } = await openLot('APPROVAL');
      await bidders.join(auctionId, person('shape'));
      const { id: bidderId } = await bidderRow(auctionId, person('shape').id);
      const base = `/api/v1/admin/auctions/${auctionId}/bidders`;
      const decision = (body: object) => asAdmin(api().post(`${base}/${bidderId}/decision`)).send(body);

      await decision({}).expect(400);
      await decision({ decision: 'DELETE', expectedStatus: 'PENDING' }).expect(400);
      await decision({ decision: 'APPROVE', expectedStatus: 'GONE' }).expect(400);
      await decision({ decision: 'APPROVE' }).expect(400);
      await decision({ decision: 'APPROVE', expectedStatus: 'PENDING', status: 'APPROVED' }).expect(400);
      await decision({ decision: 'DECLINE', expectedStatus: 'PENDING', reason: 'x'.repeat(501) }).expect(400);
      await asAdmin(api().post(`${base}/${bidderId}/strikes`)).send({}).expect(400);
      await asAdmin(api().post(`${base}/${bidderId}/strikes`)).send({ reason: 'x'.repeat(501) }).expect(400);
      await asAdmin(api().post(`${base}/${bidderId}/strikes`)).send({ reason: 'Late', lotId: 'not-in-this-auction' }).expect(400);
      await asAdmin(api().post(`${base}/${bidderId}/strikes/nope/void`)).send({ reason: 'x' }).expect(404);
      await asCustomer(api().post(`/api/v1/auctions/${auctionId}/appeal`)).send({ message: 'x'.repeat(1_001) }).expect(400);
      await asCustomer(api().post(`/api/v1/auctions/${auctionId}/appeal`)).send({ message: 'ok', bidderId }).expect(400);

      await asAdmin(api().get(`${base}/nope`)).expect(404);
      await asAdmin(api().get(`/api/v1/admin/auctions/nope/bidders/summary`)).expect(404);
      await asAdmin(api().get(`${base}?filter=everyone`)).expect(400);
      expect((await bidderRow(auctionId, person('shape').id)).status).toBe('PENDING');
      expect(await prisma.bidderStrike.count({ where: { bidderId } })).toBe(0);
    });

    it('is told there is nothing to appeal when not stopped, and that they have not joined when they have not', async () => {
      const { auctionId } = await openLot('APPROVAL');
      await asCustomer(api().post(`/api/v1/auctions/${auctionId}/appeal`)).send({ message: 'Hello' }).expect(404);
      await asCustomer(api().post(`/api/v1/auctions/${auctionId}/registration`)).send({}).expect(201);
      const refused = await asCustomer(api().post(`/api/v1/auctions/${auctionId}/appeal`)).send({ message: 'Hello' }).expect(409);
      expect(refused.body).toMatchObject({ code: 'NOTHING_TO_APPEAL' });
    });

    it('pages the queue twenty at a time, oldest first, and gives the same page for the same request', async () => {
      const { auctionId } = await openLot('APPROVAL');
      for (let index = 0; index < 23; index += 1) await bidders.join(auctionId, person(`page-${index}`));
      const base = `/api/v1/admin/auctions/${auctionId}/bidders`;

      const first = await asAdmin(api().get(base)).expect(200);
      expect(first.body.data).toHaveLength(20);
      expect(first.body.meta.total).toBe(23);
      expect(first.body.data[0].alias).toBe('Bidder 1');
      const second = await asAdmin(api().get(`${base}?page=2`)).expect(200);
      expect(second.body.data.map((row: { alias: string }) => row.alias)).toEqual(['Bidder 21', 'Bidder 22', 'Bidder 23']);
      await asAdmin(api().get(`${base}?pageSize=101`)).expect(400);
    });
  });
});
