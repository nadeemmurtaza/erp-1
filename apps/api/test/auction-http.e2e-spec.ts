import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';

/**
 * Auction admin routes (launchpad-apps/234-auction-app.md, WO-234.1) through
 * the real guards, pipes and filters: who is turned away, what a malformed
 * body does, and the draft → scheduled → cancelled path end to end. The module
 * is off by default, so this file adds it to the allowlist for its own run
 * (before AppModule is imported, which is when the allowlist is read) instead
 * of depending on what the CI environment enables.
 */
describe('Auction admin routes (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let customerToken: string;
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

    adminToken = (await api().post('/api/v1/auth/login').send({ identifier: 'admin@yaseen.pk', password: 'admin12345' })).body.accessToken;
    customerToken = (await api().post('/api/v1/auth/login').send({ identifier: 'ayesha@example.com', password: 'customer12345' })).body.accessToken;
  });

  afterAll(async () => {
    for (const id of made) {
      await asAdmin(api().post(`/api/v1/admin/auctions/${id}/cancel`)).send({ reason: 'e2e cleanup' });
    }
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
});
