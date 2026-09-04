import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';

/**
 * Account security: registration's email-verification link, change-password,
 * and the forgot/reset-password flow. Every token is minted, hashed and
 * consumed the same way RefreshToken already is — these tests exercise that
 * path against the real database rather than mocking it away.
 *
 * publish() only writes an OutboxEvent row (see EventBusService); reading the
 * raw token straight off that row's JSON payload is simpler than forcing a
 * delivery through the outbox dispatcher, and it is exactly what the mailed
 * link would have carried.
 */
describe('Account security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const email = `auth-e2e-${Date.now()}@example.com`;
  let userId: string;
  let accessToken: string;
  let refreshToken: string;

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
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  async function latestTokenFor(eventName: string, uid: string): Promise<string> {
    const events = await prisma.outboxEvent.findMany({
      where: { name: eventName },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const event = events.find((row) => (row.payload as { userId?: string }).userId === uid);
    if (!event) throw new Error(`No ${eventName} event found for user ${uid}`);
    return (event.payload as { token: string }).token;
  }

  describe('registration and email verification', () => {
    it('registers an account and queues a verification email with a usable token', async () => {
      const response = await api()
        .post('/api/v1/auth/register')
        .send({ email, password: 'firstpass123', firstName: 'Auth', lastName: 'E2E' })
        .expect(201);

      userId = response.body.user.id;
      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.emailVerifiedAt).toBeNull();

      expect(await prisma.emailVerificationToken.count({ where: { userId } })).toBe(1);
    });

    it('rejects an unknown or garbage verification token', async () => {
      await api().post('/api/v1/auth/verify-email').send({ token: 'not-a-real-token' }).expect(401);
    });

    it('confirms the email with the mailed token, and the token cannot be reused', async () => {
      const token = await latestTokenFor('user.email_verification_requested', userId);

      await api().post('/api/v1/auth/verify-email').send({ token }).expect(204);

      const verified = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(verified.emailVerifiedAt).not.toBeNull();

      await api().post('/api/v1/auth/verify-email').send({ token }).expect(401);
    });

    it('resending verification for an already-verified address mints no new token', async () => {
      const before = await prisma.emailVerificationToken.count({ where: { userId } });

      await api()
        .post('/api/v1/auth/resend-verification')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      expect(await prisma.emailVerificationToken.count({ where: { userId } })).toBe(before);
    });
  });

  describe('change password', () => {
    it('refuses the wrong current password', async () => {
      await api()
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'wrongpassword', newPassword: 'secondpass123' })
        .expect(401);
    });

    it('changes the password, signs out other sessions, and confirms by mail', async () => {
      await api()
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'firstpass123', newPassword: 'secondpass123' })
        .expect(204);

      // The refresh token issued at registration must no longer work.
      await api().post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);

      // The old password no longer signs in; the new one does.
      await api()
        .post('/api/v1/auth/login')
        .send({ identifier: email, password: 'firstpass123' })
        .expect(401);

      const signedIn = await api()
        .post('/api/v1/auth/login')
        .send({ identifier: email, password: 'secondpass123' })
        .expect(200);
      accessToken = signedIn.body.accessToken;
      refreshToken = signedIn.body.refreshToken;

      const events = await prisma.outboxEvent.findMany({
        where: { name: 'user.password_changed' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      expect(events.some((row) => (row.payload as { userId?: string }).userId === userId)).toBe(
        true,
      );
    });
  });

  describe('forgot / reset password', () => {
    it('answers identically for an unregistered email — no token is minted', async () => {
      const before = await prisma.passwordResetToken.count();

      await api()
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'no-such-account@example.com' })
        .expect(204);

      expect(await prisma.passwordResetToken.count()).toBe(before);
    });

    it('mints a reset token for a real account', async () => {
      await api().post('/api/v1/auth/forgot-password').send({ email }).expect(204);
      expect(await prisma.passwordResetToken.count({ where: { userId } })).toBeGreaterThan(0);
    });

    it('rejects an unknown reset token', async () => {
      await api()
        .post('/api/v1/auth/reset-password')
        .send({ token: 'not-a-real-token', newPassword: 'thirdpass123' })
        .expect(401);
    });

    it('resets the password with the mailed token, and the token cannot be reused', async () => {
      const token = await latestTokenFor('user.password_reset_requested', userId);

      await api()
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'thirdpass123' })
        .expect(204);

      await api()
        .post('/api/v1/auth/login')
        .send({ identifier: email, password: 'thirdpass123' })
        .expect(200);

      await api()
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'fourthpass123' })
        .expect(401);
    });

    it('signed out every existing session, same as change-password does', async () => {
      await api().post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
    });
  });
});
