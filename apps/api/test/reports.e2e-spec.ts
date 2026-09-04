import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { SettingKey } from '../src/core/settings/settings.defaults';
import { SettingsService } from '../src/core/settings/settings.service';
import { shopDayKey } from '../src/core/time/shop-time';

/**
 * A "bring your own fabric" booking (StitchingOrder) never becomes an Order —
 * it has its own quoted fee instead of a grandTotal — so before this fix its
 * revenue was invisible to every report and to the dashboard. These tests
 * book one, quote it, and check the fee actually shows up everywhere it
 * should: the dedicated bookings export, the sales-by-day export, and the
 * admin dashboard's revenue figures.
 */
describe('Reports and dashboard: stitching-booking revenue (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let kameezGarmentId: string;
  let todayLabel: string;

  const createdBookingIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);

    const login = (identifier: string, password: string) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier, password })
        .expect(200);

    adminToken = (await login('admin@yaseen.pk', 'admin12345')).body.accessToken;

    const kameez = await prisma.garmentType.findUniqueOrThrow({ where: { key: 'kameez' } });
    kameezGarmentId = kameez.id;

    const timeZone = await app.get(SettingsService).get<string>(SettingKey.StoreTimezone);
    todayLabel = shopDayKey(new Date(), timeZone);
  });

  afterAll(async () => {
    await prisma.stitchingOrder.deleteMany({ where: { id: { in: createdBookingIds } } });
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  /** Parses the report's own RFC4180-lite escaping (see reports/csv.util.ts). None of this suite's values need the quoted-field path. */
  function parseCsv(text: string): { header: string[]; rows: string[][] } {
    const lines = text.split('\r\n').filter((line) => line.length > 0);
    const [header, ...rows] = lines.map((line) => line.split(','));
    return { header: header ?? [], rows };
  }

  it('books and quotes a stitching order, then finds its fee in every report and the dashboard', async () => {
    const before = await api()
      .get('/api/v1/admin/analytics/dashboard')
      .query({ days: 7 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const booking = await api()
      .post('/api/v1/stitching/bookings')
      .send({
        name: 'Own Fabric Revenue Check',
        phone: '03001112222',
        garments: [
          { garmentTypeId: kameezGarmentId, measurements: { length: 40, chest: 36 } },
        ],
      })
      .expect(201);

    createdBookingIds.push(booking.body.id);
    const bookingNumber = booking.body.number as string;

    const feePaisa = 150_000; // Rs 1,500
    await api()
      .post(`/api/v1/admin/stitching/bookings/${booking.body.id}/quote`)
      .send({ fee: feePaisa })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    // --- Dedicated stitching-bookings export ------------------------------
    const bookingsCsv = await api()
      .get('/api/v1/admin/reports/export/stitching-bookings')
      .query({ from: todayLabel, to: todayLabel })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { header: bookingsHeader, rows: bookingsRows } = parseCsv(bookingsCsv.text);
    expect(bookingsHeader).toContain('Quoted Fee (Rs)');
    const bookingRow = bookingsRows.find((row) => row[0] === bookingNumber);
    expect(bookingRow).toBeDefined();
    expect(Number(bookingRow![bookingsHeader.indexOf('Quoted Fee (Rs)')])).toBe(feePaisa / 100);

    // --- Sales-by-day export: fee shows up on today's row, broken out from
    // order revenue rather than silently merged into it ---------------------
    const salesCsv = await api()
      .get('/api/v1/admin/reports/export/sales-by-day')
      .query({ from: todayLabel, to: todayLabel })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { header: salesHeader, rows: salesRows } = parseCsv(salesCsv.text);
    const todayRow = salesRows.find((row) => row[0] === todayLabel);
    expect(todayRow).toBeDefined();
    const stitchingCol = salesHeader.indexOf('Stitching Booking Revenue (Rs)');
    const totalCol = salesHeader.indexOf('Total Revenue (Rs)');
    expect(Number(todayRow![stitchingCol])).toBeGreaterThanOrEqual(feePaisa / 100);
    expect(Number(todayRow![totalCol])).toBeGreaterThanOrEqual(feePaisa / 100);

    // --- Dashboard: today's and this month's revenue grew by exactly the fee
    const after = await api()
      .get('/api/v1/admin/analytics/dashboard')
      .query({ days: 7 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(after.body.today.revenue - before.body.today.revenue).toBe(feePaisa);
    expect(after.body.month.revenue - before.body.month.revenue).toBe(feePaisa);
  });

  it('never counts a cancelled booking or one with no quote yet as revenue', async () => {
    const before = await api()
      .get('/api/v1/admin/analytics/dashboard')
      .query({ days: 7 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const unquoted = await api()
      .post('/api/v1/stitching/bookings')
      .send({
        name: 'Unquoted Booking',
        phone: '03003334444',
        garments: [{ garmentTypeId: kameezGarmentId, measurements: { length: 40, chest: 36 } }],
      })
      .expect(201);
    createdBookingIds.push(unquoted.body.id);

    const cancelled = await api()
      .post('/api/v1/stitching/bookings')
      .send({
        name: 'Cancelled Booking',
        phone: '03005556666',
        garments: [{ garmentTypeId: kameezGarmentId, measurements: { length: 40, chest: 36 } }],
      })
      .expect(201);
    createdBookingIds.push(cancelled.body.id);

    await api()
      .post(`/api/v1/admin/stitching/bookings/${cancelled.body.id}/quote`)
      .send({ fee: 999_999 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    await api()
      .post(`/api/v1/admin/stitching/bookings/${cancelled.body.id}/status`)
      .send({ status: 'CANCELLED' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const after = await api()
      .get('/api/v1/admin/analytics/dashboard')
      .query({ days: 7 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(after.body.today.revenue).toBe(before.body.today.revenue);
    expect(after.body.month.revenue).toBe(before.body.month.revenue);
  });
});
