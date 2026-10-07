import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { RedisService } from '../src/core/redis/redis.service';
import { AuctionLifecycleService } from '../src/modules/sales/auction/auction-lifecycle.service';
import { AuctionRealtimeService } from '../src/modules/sales/auction/auction-realtime.service';
import type { LotLiveEvent } from '../src/modules/sales/auction/lot-live';

/**
 * The public side of the Auction app (launchpad-apps/234-auction-app.md,
 * WO-234.4) against the real stack: the lot page and list with no sign-in, a
 * real server-sent-events stream carrying a bid the moment it commits, a close
 * and an anti-snipe extension, what a visitor must never see, and a message
 * crossing from one node to another through the real Redis.
 *
 * The app listens on a real port because a stream cannot be read through
 * supertest. The module is off by default, so this file adds it to the
 * allowlist for its own run, before AppModule is imported.
 */
describe('Auction public pages and live stream (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let lifecycle: AuctionLifecycleService;
  let port: number;
  let adminToken: string;
  let customerToken: string;
  const made: string[] = [];
  const watchers: Array<{ close: () => void }> = [];

  const api = () => request(app.getHttpServer());
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);
  const asCustomer = (req: request.Test) => req.set('Authorization', `Bearer ${customerToken}`);
  const hours = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString();
  let keyCounter = 0;
  const key = () => `rt-${Date.now()}-${(keyCounter += 1)}`;

  /** An OPEN auction (flipped directly) with one lot, ending in `endsInMs`. */
  const openLot = async (opts: { reservePriceMinor?: number; endsInMs?: number; title?: string } = {}) => {
    const auction = await asAdmin(api().post('/api/v1/admin/auctions'))
      .send({ title: opts.title ?? '[e2e] public auction', startsAt: hours(24), endsAt: hours(48), terms: 'Collect within 7 days.', registration: 'OPEN' })
      .expect(201);
    const lot = await asAdmin(api().post(`/api/v1/admin/auctions/${auction.body.id}/lots`))
      .send({ title: 'Pallet of denim', startPriceMinor: 100_000, ...(opts.reservePriceMinor ? { reservePriceMinor: opts.reservePriceMinor } : {}) })
      .expect(201);
    await asAdmin(api().post(`/api/v1/admin/auctions/${auction.body.id}/schedule`)).expect(201);
    made.push(auction.body.id);
    return { auctionId: auction.body.id as string, lotId: lot.body.id as string, open: () => open(auction.body.id, lot.body.id, opts.endsInMs) };
  };
  const open = async (auctionId: string, lotId: string, endsInMs = 1_800_000) => {
    await prisma.auction.update({
      where: { id: auctionId },
      data: { status: 'OPEN', startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + endsInMs) },
    });
    await prisma.auctionLot.update({ where: { id: lotId }, data: { status: 'OPEN' } });
  };

  /** A real SSE client: collects every `lot` event the server sends. */
  const watch = (lotId: string) =>
    new Promise<{ events: LotLiveEvent[]; headers: http.IncomingHttpHeaders; status: number; waitFor: (test: (e: LotLiveEvent) => boolean, ms?: number) => Promise<LotLiveEvent>; close: () => void; raw: () => string }>(
      (resolve, reject) => {
        const events: LotLiveEvent[] = [];
        let buffer = '';
        let everything = '';
        const waiting: Array<() => void> = [];
        const req = http.get({ host: '127.0.0.1', port, path: `/api/v1/auctions/public/lots/${lotId}/stream`, headers: { Accept: 'text/event-stream' } }, (res) => {
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            buffer += chunk;
            everything += chunk;
            let end: number;
            while ((end = buffer.indexOf('\n\n')) !== -1) {
              const frame = buffer.slice(0, end);
              buffer = buffer.slice(end + 2);
              const data = frame.split('\n').find((line) => line.startsWith('data: '));
              if (frame.includes('event: lot') && data) events.push(JSON.parse(data.slice(6)) as LotLiveEvent);
            }
            for (const wake of [...waiting]) wake();
          });
          const client = {
            events,
            headers: res.headers,
            status: res.statusCode ?? 0,
            raw: () => everything,
            close: () => req.destroy(),
            waitFor: (test: (e: LotLiveEvent) => boolean, ms = 3_000) =>
              new Promise<LotLiveEvent>((done, fail) => {
                const check = () => {
                  const found = events.find(test);
                  if (found) {
                    clearTimeout(timer);
                    waiting.splice(waiting.indexOf(check), 1);
                    done(found);
                  }
                };
                const timer = setTimeout(() => {
                  waiting.splice(waiting.indexOf(check), 1);
                  fail(new Error(`no matching event within ${ms} ms; saw ${JSON.stringify(events.map((e) => [e.state, e.bidSeq]))}`));
                }, ms);
                waiting.push(check);
                check();
              }),
          };
          watchers.push(client);
          resolve(client);
        });
        req.on('error', (error) => {
          if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(error);
        });
      },
    );

  beforeAll(async () => {
    process.env.MODULES = `${process.env.MODULES ?? ''},auction`;
    const { AppModule } = await import('../src/app.module');
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    // The tests close lots and read results by hand; the 15-second cron must not do it from under them.
    for (const job of moduleRef.get(SchedulerRegistry).getCronJobs().values()) job.stop();
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;

    prisma = moduleRef.get(PrismaService);
    lifecycle = moduleRef.get(AuctionLifecycleService);
    adminToken = (await api().post('/api/v1/auth/login').send({ identifier: 'admin@yaseen.pk', password: 'admin12345' })).body.accessToken;
    customerToken = (await api().post('/api/v1/auth/login').send({ identifier: 'ayesha@example.com', password: 'customer12345' })).body.accessToken;
  });

  afterAll(async () => {
    for (const watcher of watchers) watcher.close();
    if (made.length) {
      await prisma.auctionLot.updateMany({ where: { auctionId: { in: made }, status: { not: 'WITHDRAWN' } }, data: { status: 'CLOSED' } });
      await prisma.auction.updateMany({ where: { id: { in: made }, status: { not: 'CANCELLED' } }, data: { status: 'CLOSED' } });
    }
    await app?.close();
  });

  describe('with no sign-in', () => {
    it('shows an open lot’s page, and its price, time, newest bids and terms, and nothing a visitor must not see', async () => {
      const { lotId, open: openIt } = await openLot({ reservePriceMinor: 900_000 });
      await openIt();
      await asCustomer(api().post(`/api/v1/auctions/lots/${lotId}/bids`)).send({ amountMinor: 100_000, idempotencyKey: key() }).expect(201);

      const page = await api().get(`/api/v1/auctions/public/lots/${lotId}`).expect(200);
      expect(page.body).toMatchObject({
        lotId,
        lotNo: 1,
        title: 'Pallet of denim',
        phase: 'OPEN',
        currentBidMinor: 100_000,
        bidSeq: 1,
        minimumNextBidMinor: 105_000,
        extended: false,
        auction: { terms: 'Collect within 7 days.' },
      });
      expect(page.body.bids).toMatchObject([{ seq: 1, alias: 'Bidder 1', amountMinor: 100_000, kind: 'MANUAL' }]);
      expect(Date.parse(page.body.serverTime)).toBeGreaterThan(Date.now() - 5_000);
      expect(JSON.stringify(page.body)).not.toMatch(/reserve|900000|ayesha|userId|createdById|idempotency|hash|bidRules/i);
    });

    it('lists live lots, ending soonest first, and finds one by part of its title', async () => {
      const soon = await openLot({ title: '[e2e] list soon', endsInMs: 600_000 });
      const later = await openLot({ title: '[e2e] list later', endsInMs: 3_600_000 });
      await soon.open();
      await later.open();

      const live = await api().get('/api/v1/auctions/public/lots?state=live&pageSize=100').expect(200);
      const ids: string[] = live.body.data.map((row: { lotId: string }) => row.lotId);
      expect(ids).toEqual(expect.arrayContaining([soon.lotId, later.lotId]));
      expect(ids.indexOf(soon.lotId)).toBeLessThan(ids.indexOf(later.lotId));
      expect(live.body.data.find((row: { lotId: string }) => row.lotId === soon.lotId)).toMatchObject({
        phase: 'OPEN',
        title: 'Pallet of denim',
        auction: { id: soon.auctionId, title: '[e2e] list soon' },
        startPriceMinor: 100_000,
        currentBidMinor: null,
        bidCount: 0,
      });
      expect(live.body.meta.total).toBeGreaterThanOrEqual(2);

      const found = await api().get('/api/v1/auctions/public/lots?state=live&q=denim&pageSize=100').expect(200);
      expect(found.body.data.length).toBeGreaterThanOrEqual(2);
      const none = await api().get('/api/v1/auctions/public/lots?state=live&q=zzzz-no-such-lot').expect(200);
      expect(none.body.data).toEqual([]);
    });

    it('lists a scheduled auction’s lots as upcoming, and does not list them as live', async () => {
      const upcoming = await openLot({ title: '[e2e] list upcoming' }); // scheduled, not opened
      const lots = await api().get('/api/v1/auctions/public/lots?state=upcoming&pageSize=100').expect(200);
      expect(lots.body.data.find((row: { lotId: string }) => row.lotId === upcoming.lotId)).toMatchObject({ phase: 'UPCOMING' });
      const live = await api().get('/api/v1/auctions/public/lots?state=live&pageSize=100').expect(200);
      expect(live.body.data.find((row: { lotId: string }) => row.lotId === upcoming.lotId)).toBeUndefined();
      expect((await api().get(`/api/v1/auctions/public/lots/${upcoming.lotId}`).expect(200)).body).toMatchObject({ phase: 'UPCOMING', minimumNextBidMinor: null });
    });

    it('is a 404 for a lot that does not exist, a draft auction’s lot, a cancelled one’s, and a withdrawn lot', async () => {
      await api().get('/api/v1/auctions/public/lots/does-not-exist').expect(404);

      const draft = await asAdmin(api().post('/api/v1/admin/auctions')).send({ title: '[e2e] draft', startsAt: hours(24), endsAt: hours(48) }).expect(201);
      made.push(draft.body.id);
      const draftLot = await asAdmin(api().post(`/api/v1/admin/auctions/${draft.body.id}/lots`)).send({ title: 'Hidden', startPriceMinor: 1_000 }).expect(201);
      await api().get(`/api/v1/auctions/public/lots/${draftLot.body.id}`).expect(404);
      await api().get(`/api/v1/auctions/public/lots/${draftLot.body.id}/stream`).expect(404);

      const second = await asAdmin(api().post(`/api/v1/admin/auctions/${draft.body.id}/lots`)).send({ title: 'Also hidden', startPriceMinor: 1_000 }).expect(201);
      await asAdmin(api().post(`/api/v1/admin/auctions/${draft.body.id}/lots/${second.body.id}/withdraw`)).expect(201);
      await asAdmin(api().post(`/api/v1/admin/auctions/${draft.body.id}/schedule`)).expect(201);
      await api().get(`/api/v1/auctions/public/lots/${second.body.id}`).expect(404);

      await asAdmin(api().post(`/api/v1/admin/auctions/${draft.body.id}/cancel`)).send({ reason: 'e2e' }).expect(201);
      await api().get(`/api/v1/auctions/public/lots/${draftLot.body.id}`).expect(404);
    });

    it('says what the signed-in caller is to a lot, and turns a visitor away from that one route', async () => {
      const { lotId, open: openIt } = await openLot();
      await openIt();
      await api().get(`/api/v1/auctions/lots/${lotId}/me`).expect(401);

      expect((await asCustomer(api().get(`/api/v1/auctions/lots/${lotId}/me`)).expect(200)).body).toEqual({
        alias: null,
        participating: false,
        leading: false,
        eligible: true,
        registration: { mode: 'OPEN', status: 'NONE', alias: null, joinedAt: null, decisionReason: null, appeal: 'NONE', appealText: null },
      });
      await asCustomer(api().post(`/api/v1/auctions/lots/${lotId}/bids`)).send({ amountMinor: 100_000, idempotencyKey: key() }).expect(201);
      expect((await asCustomer(api().get(`/api/v1/auctions/lots/${lotId}/me`)).expect(200)).body).toMatchObject({
        alias: 'Bidder 1',
        participating: true,
        leading: true,
        eligible: true,
        registration: { mode: 'OPEN', status: 'APPROVED', alias: 'Bidder 1', appeal: 'NONE' },
      });

      const staff = await asAdmin(api().get(`/api/v1/auctions/lots/${lotId}/me`)).expect(200);
      expect(staff.body).toMatchObject({ eligible: false, reason: { code: 'BIDDER_NOT_ELIGIBLE', why: 'RUNS_AUCTION' } });
    });
  });

  describe('the live stream', () => {
    it('opens as server-sent events with the lot’s state first, then carries a bid the moment it is accepted', async () => {
      const { lotId, open: openIt } = await openLot();
      await openIt();
      const client = await watch(lotId);

      expect(client.status).toBe(200);
      expect(client.headers['content-type']).toContain('text/event-stream');
      expect(client.headers['cache-control']).toContain('no-transform');
      expect(client.headers['x-accel-buffering']).toBe('no');
      const first = await client.waitFor(() => true);
      expect(first).toMatchObject({ lotId, state: 'OPEN', bidSeq: 0, currentBidMinor: null, minimumNextBidMinor: 100_000 });
      expect(client.raw()).toContain('retry: 5000');

      const placedAt = Date.now();
      await asCustomer(api().post(`/api/v1/auctions/lots/${lotId}/bids`)).send({ amountMinor: 100_000, idempotencyKey: key() }).expect(201);
      const update = await client.waitFor((event) => event.bidSeq === 1);
      expect(Date.now() - placedAt).toBeLessThan(1_000);
      expect(update).toMatchObject({ state: 'OPEN', currentBidMinor: 100_000, minimumNextBidMinor: 105_000 });
      expect(update.newBids).toMatchObject([{ seq: 1, alias: 'Bidder 1', amountMinor: 100_000, kind: 'MANUAL' }]);
      expect(JSON.stringify(client.events)).not.toMatch(/ayesha|userId|reserve|idempotency|hash/i);
    });

    it('says upcoming, not closed, for a lot whose auction has not opened', async () => {
      const { lotId } = await openLot(); // scheduled, not opened
      const client = await watch(lotId);
      expect(await client.waitFor(() => true)).toMatchObject({ lotId, state: 'UPCOMING', bidSeq: 0, currentBidMinor: null, minimumNextBidMinor: null });
    });

    it('sends the current state to a watcher who connects late, with no gap', async () => {
      const { lotId, open: openIt } = await openLot();
      await openIt();
      await asCustomer(api().post(`/api/v1/auctions/lots/${lotId}/bids`)).send({ amountMinor: 100_000, idempotencyKey: key() }).expect(201);

      const client = await watch(lotId);
      const first = await client.waitFor(() => true);
      expect(first).toMatchObject({ bidSeq: 1, currentBidMinor: 100_000 });
      expect(first.newBids.map((bid) => bid.seq)).toEqual([1]);
    });

    it('tells every watcher at once, and a watcher of another lot nothing', async () => {
      const one = await openLot();
      const other = await openLot();
      await one.open();
      await other.open();
      const [a, b, elsewhere] = await Promise.all([watch(one.lotId), watch(one.lotId), watch(other.lotId)]);
      await Promise.all([a.waitFor(() => true), b.waitFor(() => true), elsewhere.waitFor(() => true)]);

      await asCustomer(api().post(`/api/v1/auctions/lots/${one.lotId}/bids`)).send({ amountMinor: 100_000, idempotencyKey: key() }).expect(201);
      await Promise.all([a.waitFor((e) => e.bidSeq === 1), b.waitFor((e) => e.bidSeq === 1)]);
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(elsewhere.events.every((event) => event.bidSeq === 0)).toBe(true);
    });

    it('moves the end on the stream when a bid lands in the closing window', async () => {
      const { lotId, open: openIt } = await openLot({ endsInMs: 60_000 });
      await openIt();
      const client = await watch(lotId);
      const first = await client.waitFor(() => true);

      await asCustomer(api().post(`/api/v1/auctions/lots/${lotId}/bids`)).send({ amountMinor: 100_000, idempotencyKey: key() }).expect(201);
      const moved = await client.waitFor((event) => event.bidSeq === 1);
      expect(Date.parse(moved.endsAt) - Date.parse(first.endsAt)).toBe(120_000);
      expect((await api().get(`/api/v1/auctions/public/lots/${lotId}`).expect(200)).body).toMatchObject({ extended: true, endsAt: moved.endsAt });
    });

    it('announces a close with its outcome — sold, or only that the reserve was not met — and nothing of the reserve', async () => {
      const { auctionId, lotId, open: openIt } = await openLot({ reservePriceMinor: 900_000 });
      await openIt();
      const client = await watch(lotId);
      await client.waitFor(() => true);
      await asCustomer(api().post(`/api/v1/auctions/lots/${lotId}/bids`)).send({ amountMinor: 100_000, idempotencyKey: key() }).expect(201);
      await client.waitFor((event) => event.bidSeq === 1);

      await prisma.auction.update({ where: { id: auctionId }, data: { endsAt: new Date(Date.now() - 5_000) } });
      await expect(lifecycle.closeLot(lotId)).resolves.toBe('closed');

      const closed = await client.waitFor((event) => event.state === 'CLOSED');
      expect(closed).toMatchObject({ bidSeq: 1, minimumNextBidMinor: null, outcome: { kind: 'NOT_SOLD', reason: 'RESERVE_NOT_MET' } });
      // A bid's alias is public. The reserve is not, and an unsold lot's outcome names no one.
      expect(JSON.stringify(closed)).not.toContain('900000');
      expect(JSON.stringify(closed.outcome)).not.toMatch(/Bidder|topBidder|finalMinor/);
      expect((await api().get(`/api/v1/auctions/public/lots/${lotId}`).expect(200)).body).toMatchObject({
        phase: 'CLOSED',
        minimumNextBidMinor: null,
        outcome: { kind: 'NOT_SOLD', reason: 'RESERVE_NOT_MET' },
      });

      const ended = await api().get('/api/v1/auctions/public/lots?state=ended&pageSize=100').expect(200);
      expect(ended.body.data.find((row: { lotId: string }) => row.lotId === lotId)).toMatchObject({ phase: 'CLOSED', outcome: { kind: 'NOT_SOLD' } });
    });

    it('names the winner on the page and in the list when the reserve was met', async () => {
      const { auctionId, lotId, open: openIt } = await openLot({ reservePriceMinor: 100_000 });
      await openIt();
      await asCustomer(api().post(`/api/v1/auctions/lots/${lotId}/bids`)).send({ amountMinor: 100_000, idempotencyKey: key() }).expect(201);
      await prisma.auction.update({ where: { id: auctionId }, data: { endsAt: new Date(Date.now() - 5_000) } });
      await lifecycle.closeLot(lotId);

      expect((await api().get(`/api/v1/auctions/public/lots/${lotId}`).expect(200)).body.outcome).toEqual({ kind: 'SOLD', topBidderAlias: 'Bidder 1', finalMinor: 100_000 });
      const ended = await api().get('/api/v1/auctions/public/lots?state=ended&pageSize=100').expect(200);
      expect(ended.body.data.find((row: { lotId: string }) => row.lotId === lotId)).toMatchObject({ outcome: { kind: 'SOLD', finalMinor: 100_000 } });
    });

    it('frees a stream’s slot when the watcher goes away', async () => {
      const { lotId, open: openIt } = await openLot();
      await openIt();
      const realtime = moduleRef.get(AuctionRealtimeService);
      const before = realtime.openStreams;
      const client = await watch(lotId);
      await client.waitFor(() => true);
      expect(realtime.openStreams).toBe(before + 1);
      client.close();
      const deadline = Date.now() + 2_000;
      while (realtime.openStreams > before && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
      expect(realtime.openStreams).toBe(before);
    });
  });

  describe('between nodes, through Redis', () => {
    it('carries one node’s event to another node’s watcher, and not back to the node that sent it', async () => {
      const redis = moduleRef.get(RedisService);
      const here = moduleRef.get(AuctionRealtimeService);
      const there = new AuctionRealtimeService(redis);
      await there.onModuleInit();
      await new Promise((resolve) => setTimeout(resolve, 300)); // let both subscriptions settle

      const received: LotLiveEvent[] = [];
      there.onEvent((event) => received.push(event));
      const echoed: LotLiveEvent[] = [];
      here.onEvent((event) => echoed.push(event));

      const event: LotLiveEvent = {
        lotId: 'cross-node-lot',
        state: 'OPEN',
        bidSeq: 1,
        currentBidMinor: 100_000,
        minimumNextBidMinor: 105_000,
        endsAt: new Date(Date.now() + 60_000).toISOString(),
        serverTime: new Date().toISOString(),
        newBids: [],
      };
      here.publish(event);

      const deadline = Date.now() + 2_000;
      while (received.length === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
      expect(received.map((e) => e.lotId)).toEqual(['cross-node-lot']);
      // `here` heard its own once, locally; the Redis echo of it was ignored.
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(echoed.filter((e) => e.lotId === 'cross-node-lot')).toHaveLength(1);
      await there.onApplicationShutdown();
    });
  });
});
