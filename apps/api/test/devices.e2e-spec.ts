import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';

/**
 * Push notification targets.
 *
 * The mobile app registers on every sign-in and on every launch, so registering
 * has to be free to repeat. The awkward case is a handset that changes hands:
 * the push token follows the device, not the person, so registering must MOVE
 * the token rather than leave the previous owner receiving somebody else's
 * garments.
 */
describe('Device registration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let customerToken: string;
  let tailorToken: string;
  let customerId: string;
  let tailorId: string;

  const TOKEN = 'ExponentPushToken[e2e-shared-handset]';
  const OTHER_TOKEN = 'ExponentPushToken[e2e-second-handset]';

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

    const signIn = async (identifier: string, password: string) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier, password })
        .expect(200);
      return response.body as { accessToken: string; user: { id: string } };
    };

    const customer = await signIn('ayesha@example.com', 'customer12345');
    customerToken = customer.accessToken;
    customerId = customer.user.id;

    const tailor = await signIn('tailor@yaseen.pk', 'tailor12345');
    tailorToken = tailor.accessToken;
    tailorId = tailor.user.id;

    await prisma.deviceToken.deleteMany({ where: { token: { in: [TOKEN, OTHER_TOKEN] } } });
  });

  afterAll(async () => {
    await prisma.deviceToken.deleteMany({ where: { token: { in: [TOKEN, OTHER_TOKEN] } } });
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  it('refuses an anonymous registration', async () => {
    await api().post('/api/v1/me/devices').send({ token: TOKEN }).expect(401);
  });

  it('registers a handset against the signed-in account', async () => {
    await api()
      .post('/api/v1/me/devices')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ token: TOKEN, platform: 'ANDROID', appVersion: '0.1.0', locale: 'ur' })
      .expect(201);

    const device = await prisma.deviceToken.findUniqueOrThrow({ where: { token: TOKEN } });
    expect(device.userId).toBe(customerId);
    expect(device.platform).toBe('ANDROID');
    expect(device.locale).toBe('ur');
  });

  it('registering the same handset again leaves one row', async () => {
    await api()
      .post('/api/v1/me/devices')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ token: TOKEN })
      .expect(201);

    expect(await prisma.deviceToken.count({ where: { token: TOKEN } })).toBe(1);
  });

  it('moves a handset that signs in as somebody else', async () => {
    await api()
      .post('/api/v1/me/devices')
      .set('Authorization', `Bearer ${tailorToken}`)
      .send({ token: TOKEN, platform: 'IOS' })
      .expect(201);

    const devices = await prisma.deviceToken.findMany({ where: { token: TOKEN } });
    expect(devices).toHaveLength(1);
    expect(devices[0]!.userId).toBe(tailorId);
    expect(devices[0]!.platform).toBe('IOS');
  });

  it('will not let one account unregister another account’s handset', async () => {
    // The tailor owns TOKEN at this point; the customer must not be able to
    // silence it.
    await api()
      .delete(`/api/v1/me/devices/${encodeURIComponent(TOKEN)}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(204);

    expect(await prisma.deviceToken.count({ where: { token: TOKEN } })).toBe(1);
  });

  it('unregisters a handset the caller owns', async () => {
    await api()
      .delete(`/api/v1/me/devices/${encodeURIComponent(TOKEN)}`)
      .set('Authorization', `Bearer ${tailorToken}`)
      .expect(204);

    expect(await prisma.deviceToken.count({ where: { token: TOKEN } })).toBe(0);
  });

  it('keeps a second handset for the same person', async () => {
    for (const token of [TOKEN, OTHER_TOKEN]) {
      await api()
        .post('/api/v1/me/devices')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ token })
        .expect(201);
    }

    expect(await prisma.deviceToken.count({ where: { userId: customerId } })).toBe(2);
  });

  it('refuses a registration with no token', async () => {
    await api()
      .post('/api/v1/me/devices')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ platform: 'ANDROID' })
      .expect(400);
  });
});
