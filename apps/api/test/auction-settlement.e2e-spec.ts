import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { SettingKey } from '../src/core/settings/settings.defaults';
import type { OutboxDispatcher } from '../src/core/events/outbox.dispatcher';
import type { SettingsService } from '../src/core/settings/settings.service';
import type { PaymentsService } from '../src/modules/sales/payments/payments.service';
import type { AuctionLifecycleService } from '../src/modules/sales/auction/auction-lifecycle.service';
import type { AuctionService } from '../src/modules/sales/auction/auction.service';
import { SettlementListQueryDto } from '../src/modules/sales/auction/dto/auction.dto';
import type { AuctionSettlementService } from '../src/modules/sales/auction/auction-settlement.service';

/**
 * What a won lot owes (launchpad-apps/234-auction-app.md §9, WO-234.6) against
 * the real database, the real order sink and the real payment flow. The unit
 * specs prove each rule with the pieces mocked; this proves what a mock cannot:
 * that a win is invoiced once however often the close is announced, that a
 * payment staff approve through the ordinary payments flow reaches the debt
 * through the outbox, that a lapse strikes and cancels exactly once, that a
 * refused invoice waits for staff and is replayed, that cancelling and offering
 * the next bidder move the debt on, and that the routes turn away whoever lacks
 * `auction.settle`.
 *
 * Events are delivered by hand (`outbox.processBatch()`) and the timers are
 * stopped, so each assertion is about exactly one delivery. `expireDue()` lapses
 * every overdue win in the database, not only this file's, so run it against a
 * development or CI database, never one holding real auctions. Winners are real
 * accounts because an invoice needs one; auctions are closed and their live debts
 * cancelled afterwards, never deleted.
 */
describe('Auction settlement (e2e)', () => {
  const TITLE = '[e2e] auction settlement';
  const RUN = Date.now().toString(36);
  const HOUR = 3_600_000;
  const RULES = {
    incrementBps: 500,
    minStepMinor: 100,
    antiSnipeWindowMs: 120_000,
    antiSnipeExtendMs: 0,
    maxExtensionMs: 0,
    buyerPremiumBps: 1_000,
    paymentWindowMs: 72 * HOUR,
  };
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let auctions: AuctionService;
  let lifecycle: AuctionLifecycleService;
  let settlement: AuctionSettlementService;
  let payments: PaymentsService;
  let outbox: OutboxDispatcher;
  let settings: SettingsService;
  let ACTOR: string;
  let adminToken: string;
  let customerToken: string;
  let expiryGraceMs: number;
  const made: string[] = [];
  let keyCounter = 0;

  const key = () => `settle-${RUN}-${(keyCounter += 1)}`;
  const uid = (name: string) => `e2e-settle-${RUN}-${name}`;
  const person = (name: string) => ({ id: uid(name), permissions: [] as string[] });
  const staff = { id: uid('staff'), permissions: ['auction.settle'] };
  const NAMES = ['staff', 'win', 'pay', 'late', 'expire', 'cancel', 'cancelled', 'self', 'first', 'second', 'third', 'fail', 'huge', 'low', 'two', 'grace', 'order'];
  const api = () => request(app.getHttpServer());

  /** An OPEN auction with the premium rules written onto it, one lot per entry. */
  const openAuction = async (lots: Array<{ startPriceMinor: number; reservePriceMinor?: number }> = [{ startPriceMinor: 100_000 }]) => {
    const auction = await auctions.create(
      { title: TITLE, startsAt: new Date(Date.now() + HOUR).toISOString(), endsAt: new Date(Date.now() + 2 * HOUR).toISOString(), registration: 'OPEN' },
      ACTOR,
    );
    made.push(auction.id);
    const lotIds: string[] = [];
    for (const [index, lot] of lots.entries()) lotIds.push((await auctions.addLot(auction.id, { title: `Lot ${index + 1}`, ...lot }, ACTOR)).id);
    await auctions.schedule(auction.id, ACTOR);
    await prisma.auction.update({
      where: { id: auction.id },
      data: { status: 'OPEN', startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + HOUR), bidRules: RULES },
    });
    await prisma.auctionLot.updateMany({ where: { id: { in: lotIds } }, data: { status: 'OPEN' } });
    return { auctionId: auction.id, lotIds, lotId: lotIds[0]! };
  };

  const bid = (lotId: string, name: string, amountMinor: number) => auctions.placeBid({ lotId, amountMinor, idempotencyKey: key(), user: person(name) });

  /** Delivers every pending event, as the outbox timer would, until none is left. */
  const drain = async () => {
    for (let round = 0; round < 20; round += 1) if ((await outbox.processBatch()) === 0) return;
  };

  /** Ends the auction's bidding, closes the lot, and delivers the announcement. */
  const close = async (auctionId: string, lotId: string) => {
    await prisma.auction.update({ where: { id: auctionId }, data: { endsAt: new Date(Date.now() - 5_000) } });
    await lifecycle.closeLot(lotId);
    await drain();
  };

  const settlementOf = (lotId: string) => prisma.auctionSettlement.findFirstOrThrow({ where: { lotId }, orderBy: { attempt: 'desc' } });
  /** Pretends the payment window passed by `pastMs` ago. */
  const dueAgo = (id: string, pastMs: number) => prisma.auctionSettlement.update({ where: { id }, data: { dueAt: new Date(Date.now() - pastMs) } });
  const payOrder = async (orderId: string) => {
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId } });
    await payments.approve(ACTOR, payment.id);
    await drain();
    return payment;
  };
  const failure = async (promise: Promise<unknown>) => {
    try {
      await promise;
      return null;
    } catch (error: any) {
      return { status: error.getStatus?.() as number | undefined, response: error.getResponse?.() as any };
    }
  };

  beforeAll(async () => {
    process.env.MODULES = `${process.env.MODULES ?? ''},auction`;
    const { AppModule } = await import('../src/app.module');
    const { AuctionService: Auctions } = await import('../src/modules/sales/auction/auction.service');
    const { AuctionLifecycleService: Lifecycle } = await import('../src/modules/sales/auction/auction-lifecycle.service');
    const { AuctionSettlementService: Settlement, EXPIRY_GRACE_MS } = await import('../src/modules/sales/auction/auction-settlement.service');
    const { PaymentsService: Payments } = await import('../src/modules/sales/payments/payments.service');
    const { OutboxDispatcher: Outbox } = await import('../src/core/events/outbox.dispatcher');
    const { SettingsService: Settings } = await import('../src/core/settings/settings.service');
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    // Each assertion is about one delivery or one sweep, so nothing runs from under the test.
    const registry = moduleRef.get(SchedulerRegistry);
    for (const job of registry.getCronJobs().values()) job.stop();
    for (const name of registry.getIntervals()) registry.deleteInterval(name);

    prisma = moduleRef.get(PrismaService);
    auctions = moduleRef.get(Auctions);
    lifecycle = moduleRef.get(Lifecycle);
    settlement = moduleRef.get(Settlement);
    payments = moduleRef.get(Payments, { strict: false });
    outbox = moduleRef.get(Outbox);
    settings = moduleRef.get(Settings);
    expiryGraceMs = EXPIRY_GRACE_MS;

    await prisma.user.createMany({
      data: NAMES.map((name) => ({ id: uid(name), email: `${uid(name)}@example.com`, firstName: 'E2E', lastName: name, role: 'CUSTOMER' as const })),
    });
    ACTOR = (await prisma.user.findFirstOrThrow({ where: { email: 'admin@yaseen.pk' }, select: { id: true } })).id;
    adminToken = (await api().post('/api/v1/auth/login').send({ identifier: 'admin@yaseen.pk', password: 'admin12345' })).body.accessToken;
    customerToken = (await api().post('/api/v1/auth/login').send({ identifier: 'ayesha@example.com', password: 'customer12345' })).body.accessToken;
  });

  afterAll(async () => {
    await settings?.set(SettingKey.AuctionSettlementPaymentMethod, 'bank_transfer');
    if (made.length) {
      await prisma.auctionSettlement.updateMany({
        where: { auctionId: { in: made }, status: { in: ['INVOICING', 'INVOICE_FAILED', 'AWAITING_PAYMENT'] } },
        data: { status: 'CANCELLED', resolvedAt: new Date(), resolutionNote: 'Test finished.' },
      });
      await prisma.auctionLot.updateMany({ where: { auctionId: { in: made } }, data: { status: 'CLOSED' } });
      await prisma.auction.updateMany({ where: { id: { in: made } }, data: { status: 'CLOSED' } });
      // The orders this file made are test data, not sales: leave them cancelled so the analytics specs that read every order in the window (a median, a top ten) are not skewed by the 25 invoices left behind. Cancelled, not deleted.
      const invoiced = await prisma.auctionSettlement.findMany({ where: { auctionId: { in: made }, orderId: { not: null } }, select: { orderId: true } });
      await prisma.order.updateMany({
        where: { id: { in: invoiced.map((row) => row.orderId as string) }, status: { notIn: ['CANCELLED', 'RETURNED'] } },
        data: { status: 'CANCELLED' },
      });
    }
    await app?.close();
  });

  describe('invoicing a win', () => {
    it('invoices the winner once, with the premium on its own line, however often the close is announced', async () => {
      const { auctionId, lotId } = await openAuction();
      await bid(lotId, 'win', 100_000);
      await bid(lotId, 'low', 105_000); // the least that clears 100 000 by 5%
      await bid(lotId, 'win', 120_000);
      await close(auctionId, lotId);

      const row = await settlementOf(lotId);
      expect(row).toMatchObject({ status: 'AWAITING_PAYMENT', attempt: 1, userId: uid('win'), premiumBps: 1_000 });
      expect([row.hammerMinor, row.premiumMinor, row.totalMinor]).toEqual([120_000n, 12_000n, 132_000n]);
      expect(row.orderId).toBeTruthy();
      expect(row.dueAt.getTime()).toBeGreaterThan(Date.now() + 71 * HOUR);

      const order = await prisma.order.findUniqueOrThrow({ where: { id: row.orderId! }, include: { items: true, payments: true } });
      expect(order).toMatchObject({ status: 'PENDING', userId: uid('win'), sourceType: 'AUCTION_SETTLEMENT', sourceRef: row.id, grandTotal: 132_000 });
      expect(order.items.map((item) => item.lineTotal).sort((a, b) => a - b)).toEqual([12_000, 120_000]);
      expect(order.payments).toHaveLength(1);

      // The close announced again, and the invoice asked for again: still one debt, one order.
      const announce = { lotId, auctionId, auctionNumber: 'X', lotNo: 1, topBidderId: row.bidderId, topBidMinor: 120_000, reserveMet: true, closedAt: new Date().toISOString() };
      await settlement.onLotClosed(announce);
      await settlement.onLotClosed(announce);
      await settlement.invoice(row.id);
      expect(await prisma.auctionSettlement.count({ where: { lotId } })).toBe(1);
      expect(await prisma.order.count({ where: { sourceType: 'AUCTION_SETTLEMENT', sourceRef: row.id } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: 'auction.settlement_invoiced', entityId: row.id } })).toBe(1);
    });

    it('opens nothing when the reserve was not met, or nobody bid', async () => {
      const { auctionId, lotIds } = await openAuction([{ startPriceMinor: 100_000, reservePriceMinor: 500_000 }, { startPriceMinor: 100_000 }]);
      await bid(lotIds[0]!, 'low', 150_000);
      await prisma.auction.update({ where: { id: auctionId }, data: { endsAt: new Date(Date.now() - 5_000) } });
      await Promise.all(lotIds.map((id) => lifecycle.closeLot(id)));
      await drain();
      expect(await prisma.auctionSettlement.count({ where: { lotId: { in: lotIds } } })).toBe(0);
      // Nothing is owed, so the auction is done.
      expect((await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } })).status).toBe('SETTLED');
    });

    it('shows a winner only their own debt on the lot', async () => {
      const { auctionId, lotId } = await openAuction();
      await bid(lotId, 'win', 100_000);
      await close(auctionId, lotId);
      expect(await settlement.forWinner(lotId, uid('win'))).toMatchObject({ status: 'AWAITING_PAYMENT', hammerMinor: 100_000, premiumMinor: 10_000, totalMinor: 110_000, paidMinor: 0 });
      expect(await settlement.forWinner(lotId, uid('low'))).toBeNull();
    });
  });

  describe('payment', () => {
    it('marks the win paid when staff approve the order’s payment, counts it once, and settles the auction', async () => {
      const { auctionId, lotId } = await openAuction();
      await bid(lotId, 'pay', 100_000);
      await close(auctionId, lotId);
      const row = await settlementOf(lotId);

      const payment = await payOrder(row.orderId!);
      const paid = await settlementOf(lotId);
      expect(paid).toMatchObject({ status: 'PAID', paidMinor: 110_000n });
      expect(paid.resolvedAt).not.toBeNull();
      expect((await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } })).status).toBe('SETTLED');

      // The same payment delivered again adds nothing.
      const payload = { paymentId: payment.id, orderId: row.orderId!, provider: 'bank_transfer', amount: 110_000, status: 'PAID' };
      await settlement.onPaymentSucceeded(payload);
      await settlement.onPaymentSucceeded(payload);
      expect((await settlementOf(lotId)).paidMinor).toBe(110_000n);
      expect(await prisma.auctionSettlementPayment.count({ where: { settlementId: row.id } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: 'auction.settlement_paid', entityId: row.id } })).toBe(1);
    });

    it('leaves an ordinary order alone', async () => {
      await expect(settlement.onPaymentSucceeded({ paymentId: 'not-ours', orderId: 'no-such-order', provider: 'cod', amount: 5, status: 'PAID' })).resolves.toBeUndefined();
      await expect(settlement.onOrderCancelled('no-such-order')).resolves.toBeUndefined();
    });
  });

  describe('a win nobody pays for', () => {
    it('lapses once the deadline and the grace have passed: a strike, a cancelled order, no second strike', async () => {
      const { auctionId, lotId } = await openAuction();
      await bid(lotId, 'expire', 100_000);
      await close(auctionId, lotId);
      const row = await settlementOf(lotId);

      // Past the deadline but inside the grace: a payment still in flight may arrive.
      await dueAgo(row.id, 60_000);
      await settlement.expireDue();
      expect((await settlementOf(lotId)).status).toBe('AWAITING_PAYMENT');

      await dueAgo(row.id, expiryGraceMs + 60_000);
      await settlement.expireDue();
      await settlement.expireDue();
      const lapsed = await settlementOf(lotId);
      expect(lapsed).toMatchObject({ status: 'EXPIRED', resolutionNote: 'Not paid within the payment window.' });

      const strikes = await prisma.bidderStrike.findMany({ where: { settlementId: row.id } });
      expect(strikes).toHaveLength(1);
      expect(strikes[0]).toMatchObject({ userId: uid('expire'), recordedById: null });
      expect((await prisma.order.findUniqueOrThrow({ where: { id: row.orderId! } })).status).toBe('CANCELLED');
      expect((await prisma.payment.findFirstOrThrow({ where: { orderId: row.orderId! } })).status).toBe('CANCELLED');
      expect(await prisma.auditLog.count({ where: { action: 'auction.settlement_expired', entityId: row.id } })).toBe(1);
    });

    it('lapses two overdue wins at once without striking either twice', async () => {
      const { auctionId, lotIds } = await openAuction([{ startPriceMinor: 100_000 }, { startPriceMinor: 100_000 }]);
      await bid(lotIds[0]!, 'two', 100_000);
      await bid(lotIds[1]!, 'two', 100_000);
      await prisma.auction.update({ where: { id: auctionId }, data: { endsAt: new Date(Date.now() - 5_000) } });
      await Promise.all(lotIds.map((id) => lifecycle.closeLot(id)));
      await drain();
      const rows = await prisma.auctionSettlement.findMany({ where: { lotId: { in: lotIds } } });
      expect(rows).toHaveLength(2);
      for (const row of rows) await dueAgo(row.id, expiryGraceMs + 60_000);

      await Promise.all([settlement.expireDue(), settlement.expireDue()]);
      expect((await prisma.auctionSettlement.findMany({ where: { lotId: { in: lotIds } } })).map((row) => row.status)).toEqual(['EXPIRED', 'EXPIRED']);
      expect(await prisma.bidderStrike.count({ where: { settlementId: { in: rows.map((row) => row.id) } } })).toBe(2);
    });

    it('keeps a payment that arrives after the lapse on record for staff, and does not revive the win', async () => {
      const { auctionId, lotId } = await openAuction();
      await bid(lotId, 'late', 100_000);
      await close(auctionId, lotId);
      const row = await settlementOf(lotId);
      await dueAgo(row.id, expiryGraceMs + 60_000);
      await settlement.expireDue();
      expect((await settlementOf(lotId)).status).toBe('EXPIRED');

      await payOrder(row.orderId!);
      const after = await settlementOf(lotId);
      expect(after).toMatchObject({ status: 'EXPIRED', paidMinor: 110_000n });
      expect(await prisma.auditLog.count({ where: { action: 'auction.payment_after_end', entityId: row.id } })).toBe(1);
    });

    it('ends without a strike when the order is cancelled somewhere else', async () => {
      const { auctionId, lotId } = await openAuction();
      await bid(lotId, 'order', 100_000);
      await close(auctionId, lotId);
      const row = await settlementOf(lotId);
      await settlement.onOrderCancelled(row.orderId!);
      await settlement.onOrderCancelled(row.orderId!);
      expect(await settlementOf(lotId)).toMatchObject({ status: 'CANCELLED', resolutionNote: 'The order was cancelled.' });
      expect(await prisma.bidderStrike.count({ where: { settlementId: row.id } })).toBe(0);
    });
  });

  describe('an invoice that cannot be made', () => {
    it('waits for staff with the reason when the payment method is off, and replays once it is fixed', async () => {
      await settings.set(SettingKey.AuctionSettlementPaymentMethod, 'no_such_method');
      const { auctionId, lotId } = await openAuction();
      await bid(lotId, 'fail', 100_000);
      await close(auctionId, lotId);
      const failed = await settlementOf(lotId);
      expect(failed.status).toBe('INVOICE_FAILED');
      expect(failed.failureReason).toMatch(/no_such_method/);
      expect(failed.orderId).toBeNull();
      expect(await prisma.order.count({ where: { sourceRef: failed.id } })).toBe(0);

      await settings.set(SettingKey.AuctionSettlementPaymentMethod, 'bank_transfer');
      const view = await settlement.replay(auctionId, failed.id, staff);
      expect(view).toMatchObject({ status: 'AWAITING_PAYMENT', failureReason: null });
      expect(view.orderNumber).toBeTruthy();

      // Replaying a win that is no longer failing is refused, not repeated.
      expect(await failure(settlement.replay(auctionId, failed.id, staff))).toMatchObject({ status: 409, response: { code: 'SETTLEMENT_CHANGED' } });
    });

    it('refuses a win above what an order can hold, and says so', async () => {
      const { auctionId, lotId } = await openAuction([{ startPriceMinor: 2_147_483_648 }]);
      await bid(lotId, 'huge', 2_147_483_648);
      await close(auctionId, lotId);
      const row = await settlementOf(lotId);
      expect(row.status).toBe('INVOICE_FAILED');
      expect(row.failureReason).toMatch(/above the 2147483647/);
    });
  });

  describe('what staff may do', () => {
    it('cancels an unpaid win with a reason and no strike, and refuses to cancel one that is theirs, or paid', async () => {
      const { auctionId, lotId } = await openAuction();
      await bid(lotId, 'cancel', 100_000);
      await close(auctionId, lotId);
      const row = await settlementOf(lotId);

      expect(await failure(settlement.cancel(auctionId, row.id, { id: uid('cancel'), permissions: ['auction.settle'] }, { reason: 'mine' }))).toMatchObject({
        status: 403,
        response: { code: 'CANNOT_DECIDE_OWN' },
      });
      expect(await failure(settlement.cancel(auctionId, row.id, staff, { reason: '   ' }))).toMatchObject({ status: 409, response: { code: 'REASON_REQUIRED' } });

      const view = await settlement.cancel(auctionId, row.id, staff, { reason: 'Buyer asked to withdraw before paying' });
      expect(view).toMatchObject({ status: 'CANCELLED', struck: false });
      expect(await settlementOf(lotId)).toMatchObject({ status: 'CANCELLED', resolvedById: staff.id, resolutionNote: 'Buyer asked to withdraw before paying' });
      expect((await prisma.order.findUniqueOrThrow({ where: { id: row.orderId! } })).status).toBe('CANCELLED');
      expect(await prisma.bidderStrike.count({ where: { settlementId: row.id } })).toBe(0);
      expect(await failure(settlement.cancel(auctionId, row.id, staff, { reason: 'again' }))).toMatchObject({ status: 409, response: { code: 'SETTLEMENT_CHANGED' } });

      const second = await openAuction();
      await bid(second.lotId, 'cancelled', 100_000);
      await close(second.auctionId, second.lotId);
      const paidRow = await settlementOf(second.lotId);
      await payOrder(paidRow.orderId!);
      expect(await failure(settlement.cancel(second.auctionId, paidRow.id, staff, { reason: 'too late' }))).toMatchObject({ status: 409, response: { code: 'SETTLEMENT_CHANGED' } });
    });

    it('offers a lapsed lot to the next highest bidder at their own highest bid, once each, never while the first is still owing', async () => {
      const { auctionId, lotId } = await openAuction();
      await bid(lotId, 'first', 100_000); // 100 000
      await bid(lotId, 'second', 110_000); // 110 000, the second-highest bid in the end
      await bid(lotId, 'first', 130_000); // wins at 130 000
      await close(auctionId, lotId);
      const first = await settlementOf(lotId);
      expect(first).toMatchObject({ userId: uid('first'), attempt: 1 });

      // Still owing: nothing to offer on.
      expect(await failure(settlement.offerNext(auctionId, first.id, staff))).toMatchObject({ status: 409, response: { code: 'SETTLEMENT_CHANGED' } });

      await dueAgo(first.id, expiryGraceMs + 60_000);
      await settlement.expireDue();
      expect((await settlementOf(lotId)).status).toBe('EXPIRED');

      // The staff list shows who it would go to.
      const listed = await settlement.list(auctionId, Object.assign(new SettlementListQueryDto(), { filter: 'all' as const }));
      expect(listed.data[0]).toMatchObject({ id: first.id, actions: { offerNext: true }, next: { alias: expect.stringMatching(/^Bidder /), bidMinor: 110_000 } });

      const offered = await settlement.offerNext(auctionId, first.id, staff);
      expect(offered).toMatchObject({ attempt: 2, status: 'AWAITING_PAYMENT', hammerMinor: 110_000, premiumMinor: 11_000, totalMinor: 121_000 });
      const second = await settlementOf(lotId);
      expect(second).toMatchObject({ attempt: 2, userId: uid('second') });
      expect(second.orderId).not.toBe(first.orderId);

      // Two staff pressing at once make one offer, not two.
      expect(await failure(settlement.offerNext(auctionId, first.id, staff))).toMatchObject({ status: 409 });
      expect(await prisma.auctionSettlement.count({ where: { lotId } })).toBe(2);

      // The second winner lapses too: nobody is left who has not had a turn.
      await dueAgo(second.id, expiryGraceMs + 60_000);
      await settlement.expireDue();
      expect(await failure(settlement.offerNext(auctionId, second.id, staff))).toMatchObject({ status: 409, response: { code: 'NO_NEXT_BIDDER' } });
    });

    it('reopens a settled auction when a lot is offered on', async () => {
      const { auctionId, lotId } = await openAuction();
      await bid(lotId, 'first', 100_000);
      await bid(lotId, 'second', 110_000);
      await close(auctionId, lotId);
      const first = await settlementOf(lotId);
      await settlement.cancel(auctionId, first.id, staff, { reason: 'Winner could not be reached' });
      expect((await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } })).status).toBe('SETTLED');
      await settlement.offerNext(auctionId, first.id, staff);
      expect((await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } })).status).toBe('CLOSED');
    });
  });

  describe('the routes', () => {
    it('lists an auction’s wins for staff with the settle key, and turns a customer away', async () => {
      const { auctionId, lotId } = await openAuction();
      await bid(lotId, 'grace', 100_000);
      await close(auctionId, lotId);

      const ok = await api().get(`/api/v1/admin/auctions/${auctionId}/settlements`).set('Authorization', `Bearer ${adminToken}`);
      expect(ok.status).toBe(200);
      expect(ok.body.summary).toMatchObject({ awaiting: 1, needsAttention: 0, paid: 0, ended: 0 });
      expect(ok.body.data[0]).toMatchObject({ status: 'AWAITING_PAYMENT', hammerMinor: 100_000, premiumMinor: 10_000, totalMinor: 110_000, actions: { cancel: true } });
      // The alias, never the account.
      expect(JSON.stringify(ok.body)).not.toContain(uid('grace'));

      const summary = await api().get(`/api/v1/admin/auctions/${auctionId}/settlements/summary`).set('Authorization', `Bearer ${adminToken}`);
      expect(summary.status).toBe(200);

      const denied = await api().get(`/api/v1/admin/auctions/${auctionId}/settlements`).set('Authorization', `Bearer ${customerToken}`);
      expect(denied.status).toBe(403);
      const cancel = await api().post(`/api/v1/admin/auctions/${auctionId}/settlements/x/cancel`).set('Authorization', `Bearer ${customerToken}`).send({ reason: 'no' });
      expect(cancel.status).toBe(403);
      const anonymous = await api().get(`/api/v1/admin/auctions/${auctionId}/settlements`);
      expect(anonymous.status).toBe(401);

      const missing = await api().get('/api/v1/admin/auctions/no-such-auction/settlements').set('Authorization', `Bearer ${adminToken}`);
      expect(missing.status).toBe(404);
    });
  });
});
