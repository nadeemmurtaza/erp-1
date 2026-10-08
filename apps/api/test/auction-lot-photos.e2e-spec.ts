import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import sharp from 'sharp';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import type { AuctionService } from '../src/modules/sales/auction/auction.service';

/**
 * Lot photos (launchpad-apps/234-auction-app.md WO-234.12) against the real
 * database, the real local storage driver and the real guards. The unit specs
 * prove each rule with the database mocked; this one proves what a mock cannot:
 * that twelve uploads at once leave exactly ten photos at ten different
 * positions and no stray object on disk, that a refused or removed photo takes
 * its file with it, that nothing changes once the auction is scheduled, and that
 * the public pages show the photos in order without ever naming a storage key.
 *
 * Uploads go to a temporary directory made for this run and removed at the end.
 * The module is off by default, so this file adds it to the allowlist for its
 * own run. Auctions are closed, never deleted.
 */
describe('Auction lot photos (e2e)', () => {
  const TITLE = '[e2e] auction lot photos';
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let auctions: AuctionService;
  let ACTOR: string;
  let adminToken: string;
  let customerToken: string;
  let uploads: string;
  const made: string[] = [];

  const api = () => request(app.getHttpServer());
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);
  const png = (shade: number) =>
    sharp({ create: { width: 48, height: 36, channels: 3, background: { r: shade, g: 80, b: 120 } } }).png().toBuffer();

  /** Every file the storage driver holds, so a stray object left by a refusal shows up as a count. */
  const filesOnDisk = (dir = uploads): number =>
    readdirSync(dir).reduce((total, name) => {
      const path = join(dir, name);
      return total + (statSync(path).isDirectory() ? filesOnDisk(path) : 1);
    }, 0);

  const draft = async () => {
    const auction = await auctions.create(
      { title: TITLE, startsAt: new Date(Date.now() + 3_600_000).toISOString(), endsAt: new Date(Date.now() + 7_200_000).toISOString(), registration: 'APPROVAL' },
      ACTOR,
    );
    made.push(auction.id);
    const lot = await auctions.addLot(auction.id, { title: 'Pallet of denim', startPriceMinor: 100_000 }, ACTOR);
    return { auctionId: auction.id, lotId: lot.id };
  };

  const upload = async (auctionId: string, lotId: string, body: Buffer, filename = 'photo.png', type = 'image/png') =>
    asAdmin(api().post(`/api/v1/admin/auctions/${auctionId}/lots/${lotId}/images`)).attach('file', body, { filename, contentType: type });

  const photosOf = async (auctionId: string) => {
    const detail = await asAdmin(api().get(`/api/v1/admin/auctions/${auctionId}`));
    expect(detail.status).toBe(200);
    return detail.body.lots[0].images as Array<{ id: string; url: string; order: number }>;
  };

  beforeAll(async () => {
    uploads = mkdtempSync(join(tmpdir(), 'lot-photos-e2e-'));
    process.env.LOCAL_STORAGE_DIR = uploads;
    process.env.STORAGE_DRIVER = 'local';
    process.env.MODULES = `${process.env.MODULES ?? ''},auction`;
    const { AppModule } = await import('../src/app.module');
    const { AuctionService: Auctions } = await import('../src/modules/sales/auction/auction.service');
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
    ACTOR = (await prisma.user.findFirstOrThrow({ where: { email: 'admin@yaseen.pk' }, select: { id: true } })).id;
    adminToken = (await api().post('/api/v1/auth/login').send({ identifier: 'admin@yaseen.pk', password: 'admin12345' })).body.accessToken;
    customerToken = (await api().post('/api/v1/auth/login').send({ identifier: 'ayesha@example.com', password: 'customer12345' })).body.accessToken;
  });

  afterAll(async () => {
    if (made.length) {
      await prisma.auctionLot.updateMany({ where: { auctionId: { in: made } }, data: { status: 'CLOSED' } });
      await prisma.auction.updateMany({ where: { id: { in: made } }, data: { status: 'CLOSED' } });
    }
    await app?.close();
    rmSync(uploads, { recursive: true, force: true });
  });

  it('adds photos in order, converts them to WebP in the lot folder, and shows them on the auction page', async () => {
    const { auctionId, lotId } = await draft();
    const first = await upload(auctionId, lotId, await png(10));
    const second = await upload(auctionId, lotId, await png(200));
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ id: expect.any(String), url: expect.stringContaining('auction-lots/'), order: 0 });
    expect(first.body.url).toMatch(/\.webp$/);
    expect(second.body.order).toBe(1);
    expect(Object.keys(first.body).sort()).toEqual(['id', 'order', 'url']);

    expect((await photosOf(auctionId)).map((image) => image.id)).toEqual([first.body.id, second.body.id]);
    expect(filesOnDisk()).toBe(2);
  });

  it('twelve uploads at once leave exactly ten photos at ten different positions and no stray object', async () => {
    const { auctionId, lotId } = await draft();
    const before = filesOnDisk();
    const body = await png(40);
    const results = await Promise.all(Array.from({ length: 12 }, () => upload(auctionId, lotId, body)));

    expect(results.filter((response) => response.status === 201)).toHaveLength(10);
    const refused = results.filter((response) => response.status === 409);
    expect(refused).toHaveLength(2);
    for (const response of refused) expect(response.body.code ?? response.body.error?.code ?? JSON.stringify(response.body)).toContain('LOT_PHOTOS_FULL');

    const rows = await prisma.auctionLotImage.findMany({ where: { lotId }, orderBy: { order: 'asc' } });
    expect(rows.map((row) => row.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // Every object the refused uploads stored was taken away again.
    expect(filesOnDisk() - before).toBe(10);
  });

  it('puts the photos in a new order, and refuses a list that leaves one out or names a stranger', async () => {
    const { auctionId, lotId } = await draft();
    const added = [];
    for (let shade = 0; shade < 3; shade += 1) added.push((await upload(auctionId, lotId, await png(shade * 50))).body.id as string);
    const [a, b, c] = added;

    const reordered = await asAdmin(api().patch(`/api/v1/admin/auctions/${auctionId}/lots/${lotId}/images/order`)).send({ imageIds: [c, a, b] });
    expect(reordered.status).toBe(200);
    expect(reordered.body.map((image: { id: string }) => image.id)).toEqual([c, a, b]);
    expect((await photosOf(auctionId)).map((image) => image.id)).toEqual([c, a, b]);

    for (const imageIds of [[c, a], [c, a, 'not-a-photo'], [c, c, a]]) {
      const refusal = await asAdmin(api().patch(`/api/v1/admin/auctions/${auctionId}/lots/${lotId}/images/order`)).send({ imageIds });
      expect(refusal.status).toBe(400);
    }
    expect((await photosOf(auctionId)).map((image) => image.id)).toEqual([c, a, b]);
  });

  it('removes a photo, closes the gap, deletes its file, and a second removal is a 404', async () => {
    const { auctionId, lotId } = await draft();
    const ids = [];
    for (let shade = 0; shade < 3; shade += 1) ids.push((await upload(auctionId, lotId, await png(shade * 60))).body.id as string);
    const filesBefore = filesOnDisk();

    const removed = await asAdmin(api().delete(`/api/v1/admin/auctions/${auctionId}/lots/${lotId}/images/${ids[0]}`));
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual([
      { id: ids[1], url: expect.any(String), order: 0 },
      { id: ids[2], url: expect.any(String), order: 1 },
    ]);
    expect(filesOnDisk()).toBe(filesBefore - 1);

    const again = await asAdmin(api().delete(`/api/v1/admin/auctions/${auctionId}/lots/${lotId}/images/${ids[0]}`));
    expect(again.status).toBe(404);
    expect(filesOnDisk()).toBe(filesBefore - 1);
  });

  it('is shown on the public lot page in order and as the cover on the list, with nothing but addresses', async () => {
    const { auctionId, lotId } = await draft();
    const ids = [];
    for (let shade = 0; shade < 3; shade += 1) ids.push((await upload(auctionId, lotId, await png(shade * 70))).body as { id: string; url: string });
    await asAdmin(api().patch(`/api/v1/admin/auctions/${auctionId}/lots/${lotId}/images/order`)).send({ imageIds: [ids[2].id, ids[0].id, ids[1].id] });
    const bare = await draft();
    await auctions.schedule(auctionId, ACTOR);
    await auctions.schedule(bare.auctionId, ACTOR);

    const page = await api().get(`/api/v1/auctions/public/lots/${lotId}`);
    expect(page.status).toBe(200);
    expect(page.body.images).toEqual([{ url: ids[2].url }, { url: ids[0].url }, { url: ids[1].url }]);
    expect(JSON.stringify(page.body)).not.toContain('storageKey');

    const list = await api().get('/api/v1/auctions/public/lots').query({ state: 'upcoming', q: 'Pallet of denim', pageSize: 100 });
    expect(list.status).toBe(200);
    const mine = list.body.data.find((lot: { lotId: string }) => lot.lotId === lotId);
    expect(mine.coverUrl).toBe(ids[2].url);

    // A lot with no photograph has an empty list and no cover: no broken image, no empty frame.
    const bareLot = (await prisma.auctionLot.findFirstOrThrow({ where: { auctionId: bare.auctionId } })).id;
    const barePage = await api().get(`/api/v1/auctions/public/lots/${bareLot}`);
    expect(barePage.body.images).toEqual([]);
    const bareRow = (await api().get('/api/v1/auctions/public/lots').query({ state: 'upcoming', q: 'Pallet of denim', pageSize: 100 })).body.data.find(
      (lot: { lotId: string }) => lot.lotId === bareLot,
    );
    expect(bareRow.coverUrl).toBeNull();
  });

  it.each(['SCHEDULED', 'OPEN', 'CANCELLED'])('refuses every photo change once the auction is %s, and keeps what it had', async (status) => {
    const { auctionId, lotId } = await draft();
    const kept = (await upload(auctionId, lotId, await png(90))).body as { id: string };
    const second = (await upload(auctionId, lotId, await png(91))).body as { id: string };
    await prisma.auction.update({ where: { id: auctionId }, data: { status: status as never } });
    const filesBefore = filesOnDisk();

    expect((await upload(auctionId, lotId, await png(92))).status).toBe(409);
    expect((await asAdmin(api().patch(`/api/v1/admin/auctions/${auctionId}/lots/${lotId}/images/order`)).send({ imageIds: [second.id, kept.id] })).status).toBe(409);
    expect((await asAdmin(api().delete(`/api/v1/admin/auctions/${auctionId}/lots/${lotId}/images/${kept.id}`))).status).toBe(409);

    expect((await photosOf(auctionId)).map((image) => image.id)).toEqual([kept.id, second.id]);
    expect(filesOnDisk()).toBe(filesBefore);
  });

  it('refuses a photo on a withdrawn lot', async () => {
    const { auctionId, lotId } = await draft();
    await auctions.withdrawLot(auctionId, lotId, ACTOR);
    const before = filesOnDisk();
    expect((await upload(auctionId, lotId, await png(10))).status).toBe(409);
    expect(filesOnDisk()).toBe(before);
  });

  it('is a 404 for a lot that belongs to another auction', async () => {
    const one = await draft();
    const other = await draft();
    expect((await upload(one.auctionId, other.lotId, await png(10))).status).toBe(404);
  });

  it('refuses a file that is not an image, whatever it says it is, and stores nothing', async () => {
    const { auctionId, lotId } = await draft();
    const before = filesOnDisk();
    const fake = await upload(auctionId, lotId, Buffer.from('MZ not really a picture at all'), 'photo.png', 'image/png');
    expect(fake.status).toBe(400);
    const wrongType = await upload(auctionId, lotId, Buffer.from('hello'), 'notes.txt', 'text/plain');
    expect(wrongType.status).toBe(400);
    const none = await asAdmin(api().post(`/api/v1/admin/auctions/${auctionId}/lots/${lotId}/images`));
    expect(none.status).toBe(400);
    expect(await prisma.auctionLotImage.count({ where: { lotId } })).toBe(0);
    expect(filesOnDisk()).toBe(before);
  });

  it('refuses a file over 8 MiB while it is arriving', async () => {
    const { auctionId, lotId } = await draft();
    const response = await upload(auctionId, lotId, Buffer.alloc(8 * 1024 * 1024 + 1024, 1));
    expect(response.status).toBe(413);
    expect(await prisma.auctionLotImage.count({ where: { lotId } })).toBe(0);
  });

  it('turns away a customer and a visitor on every photo route', async () => {
    const { auctionId, lotId } = await draft();
    const body = await png(10);
    const base = `/api/v1/admin/auctions/${auctionId}/lots/${lotId}/images`;
    const added = (await upload(auctionId, lotId, body)).body as { id: string };

    const asCustomer = (req: request.Test) => req.set('Authorization', `Bearer ${customerToken}`);
    expect((await asCustomer(api().post(base)).attach('file', body, { filename: 'p.png', contentType: 'image/png' })).status).toBe(403);
    expect((await asCustomer(api().patch(`${base}/order`)).send({ imageIds: [added.id] })).status).toBe(403);
    expect((await asCustomer(api().delete(`${base}/${added.id}`))).status).toBe(403);

    expect((await api().post(base).attach('file', body, { filename: 'p.png', contentType: 'image/png' })).status).toBe(401);
    expect((await api().patch(`${base}/order`).send({ imageIds: [added.id] })).status).toBe(401);
    expect((await api().delete(`${base}/${added.id}`)).status).toBe(401);
    expect(await prisma.auctionLotImage.count({ where: { lotId } })).toBe(1);
  });
});
