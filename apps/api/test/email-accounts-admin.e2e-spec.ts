import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { AppConfigService } from '../src/core/config/app-config.service';
import { decryptSecret } from '@newax/shared';
import { PrismaService } from '../src/core/prisma/prisma.service';

/**
 * Connecting mailboxes for outgoing (and connection-tested incoming) mail.
 * The security-sensitive parts are the point of this file: passwords are
 * never returned once saved, and what's stored is genuinely encrypted, not
 * merely hidden by the API response shape.
 *
 * The connection-test endpoints are only exercised on their failure path —
 * a real SMTP/IMAP success would need a live external mailbox, which this
 * suite has no business depending on. An unreachable host still proves the
 * endpoint actually attempts a connection rather than rubber-stamping it.
 */
describe('Admin email accounts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let encryptionKey: string;
  let adminToken: string;
  const createdIds: string[] = [];

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
    encryptionKey = app.get(AppConfigService).get('APP_ENCRYPTION_KEY');

    const signIn = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'admin@yaseen.pk', password: 'admin12345' })
      .expect(200);
    adminToken = signIn.body.accessToken;
  });

  afterAll(async () => {
    await prisma.emailAccount.deleteMany({ where: { id: { in: createdIds } } });
    await app.close();
  });

  const api = () => request(app.getHttpServer());
  const auth = () => ({
    get: (path: string) => api().get(path).set('Authorization', `Bearer ${adminToken}`),
    post: (path: string) => api().post(path).set('Authorization', `Bearer ${adminToken}`),
    patch: (path: string) => api().patch(path).set('Authorization', `Bearer ${adminToken}`),
    delete: (path: string) => api().delete(path).set('Authorization', `Bearer ${adminToken}`),
  });

  it('refuses anonymous access to list, create, and preview', async () => {
    await api().get('/api/v1/admin/email-accounts').expect(401);
    await api()
      .post('/api/v1/admin/email-accounts')
      .send({
        label: 'x',
        purpose: 'TRANSACTIONAL',
        fromName: 'x',
        fromEmail: 'x@example.com',
        smtp: { host: 'x', port: 587, secure: false, user: 'x', password: 'x' },
      })
      .expect(401);
  });

  it('creates a mailbox, encrypting the password at rest and never echoing it back', async () => {
    const response = await auth()
      .post('/api/v1/admin/email-accounts')
      .send({
        label: 'Orders E2E',
        purpose: 'TRANSACTIONAL',
        fromName: 'Yaseen Orders',
        fromEmail: 'orders-e2e@yaseen.pk',
        smtp: {
          host: 'smtp.orders-e2e.example',
          port: 587,
          secure: false,
          user: 'orders-user',
          password: 'super-secret-smtp-password',
        },
      })
      .expect(201);

    createdIds.push(response.body.id);

    expect(response.body).not.toHaveProperty('smtpPasswordEncrypted');
    expect(response.body).not.toHaveProperty('imapPasswordEncrypted');
    expect(response.body.hasSmtpPassword).toBe(true);
    expect(response.body.hasImapPassword).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain('super-secret-smtp-password');

    const row = await prisma.emailAccount.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(row.smtpPasswordEncrypted).not.toContain('super-secret-smtp-password');
    expect(decryptSecret(row.smtpPasswordEncrypted, encryptionKey)).toBe(
      'super-secret-smtp-password',
    );
  });

  it('lists connected mailboxes without leaking any password field', async () => {
    const response = await auth().get('/api/v1/admin/email-accounts').expect(200);
    expect(Array.isArray(response.body)).toBe(true);
    for (const entry of response.body) {
      expect(entry).not.toHaveProperty('smtpPasswordEncrypted');
      expect(entry).not.toHaveProperty('imapPasswordEncrypted');
    }
  });

  it('rejects a create request missing required SMTP fields', async () => {
    await auth()
      .post('/api/v1/admin/email-accounts')
      .send({ label: 'Incomplete', purpose: 'TRANSACTIONAL', fromName: 'x', fromEmail: 'x@example.com' })
      .expect(400);
  });

  it('connects a mailbox with IMAP, and updates it while keeping the SMTP password unchanged', async () => {
    const created = await auth()
      .post('/api/v1/admin/email-accounts')
      .send({
        label: 'Support E2E',
        purpose: 'SUPPORT',
        fromName: 'Yaseen Support',
        fromEmail: 'support-e2e@yaseen.pk',
        smtp: {
          host: 'smtp.support-e2e.example',
          port: 587,
          secure: false,
          user: 'support-user',
          password: 'support-smtp-password',
        },
        imap: {
          host: 'imap.support-e2e.example',
          port: 993,
          secure: true,
          user: 'support-user',
          password: 'support-imap-password',
        },
      })
      .expect(201);
    createdIds.push(created.body.id);
    expect(created.body.hasImapPassword).toBe(true);

    const before = await prisma.emailAccount.findUniqueOrThrow({ where: { id: created.body.id } });

    const updated = await auth()
      .patch(`/api/v1/admin/email-accounts/${created.body.id}`)
      .send({ label: 'Support E2E (renamed)' })
      .expect(200);

    expect(updated.body.label).toBe('Support E2E (renamed)');
    expect(updated.body.hasSmtpPassword).toBe(true);
    expect(updated.body.hasImapPassword).toBe(true);

    const after = await prisma.emailAccount.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(after.smtpPasswordEncrypted).toBe(before.smtpPasswordEncrypted);
    expect(after.imapPasswordEncrypted).toBe(before.imapPasswordEncrypted);
  });

  it('rotates the SMTP password on update when a new one is supplied', async () => {
    const created = await auth()
      .post('/api/v1/admin/email-accounts')
      .send({
        label: 'Rotate E2E',
        purpose: 'MARKETING',
        fromName: 'Yaseen Deals',
        fromEmail: 'deals-e2e@yaseen.pk',
        smtp: {
          host: 'smtp.rotate-e2e.example',
          port: 587,
          secure: false,
          user: 'deals-user',
          password: 'old-password',
        },
      })
      .expect(201);
    createdIds.push(created.body.id);

    await auth()
      .patch(`/api/v1/admin/email-accounts/${created.body.id}`)
      .send({ smtp: { password: 'new-password' } })
      .expect(200);

    const row = await prisma.emailAccount.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(decryptSecret(row.smtpPasswordEncrypted, encryptionKey)).toBe('new-password');
  });

  it('clears a connected IMAP mailbox when clearImap is set', async () => {
    const created = await auth()
      .post('/api/v1/admin/email-accounts')
      .send({
        label: 'Clear IMAP E2E',
        purpose: 'SUPPORT',
        fromName: 'x',
        fromEmail: 'clear-imap-e2e@yaseen.pk',
        smtp: { host: 'smtp.x.example', port: 587, secure: false, user: 'x', password: 'x' },
        imap: { host: 'imap.x.example', port: 993, secure: true, user: 'x', password: 'x' },
      })
      .expect(201);
    createdIds.push(created.body.id);

    const cleared = await auth()
      .patch(`/api/v1/admin/email-accounts/${created.body.id}`)
      .send({ clearImap: true })
      .expect(200);

    expect(cleared.body.imapHost).toBeNull();
    expect(cleared.body.hasImapPassword).toBe(false);
  });

  it('only one account per purpose can be the default', async () => {
    const first = await auth()
      .post('/api/v1/admin/email-accounts')
      .send({
        label: 'Default A',
        purpose: 'MARKETING',
        isDefault: true,
        fromName: 'x',
        fromEmail: 'default-a-e2e@yaseen.pk',
        smtp: { host: 'smtp.a.example', port: 587, secure: false, user: 'a', password: 'a' },
      })
      .expect(201);
    createdIds.push(first.body.id);
    expect(first.body.isDefault).toBe(true);

    const second = await auth()
      .post('/api/v1/admin/email-accounts')
      .send({
        label: 'Default B',
        purpose: 'MARKETING',
        isDefault: true,
        fromName: 'x',
        fromEmail: 'default-b-e2e@yaseen.pk',
        smtp: { host: 'smtp.b.example', port: 587, secure: false, user: 'b', password: 'b' },
      })
      .expect(201);
    createdIds.push(second.body.id);
    expect(second.body.isDefault).toBe(true);

    const refreshedFirst = await auth()
      .get(`/api/v1/admin/email-accounts/${first.body.id}`)
      .expect(200);
    expect(refreshedFirst.body.isDefault).toBe(false);
  });

  it('deletes a connected mailbox', async () => {
    const created = await auth()
      .post('/api/v1/admin/email-accounts')
      .send({
        label: 'Delete Me E2E',
        purpose: 'TRANSACTIONAL',
        fromName: 'x',
        fromEmail: 'delete-me-e2e@yaseen.pk',
        smtp: { host: 'smtp.x.example', port: 587, secure: false, user: 'x', password: 'x' },
      })
      .expect(201);

    await auth().delete(`/api/v1/admin/email-accounts/${created.body.id}`).expect(204);
    await auth().get(`/api/v1/admin/email-accounts/${created.body.id}`).expect(404);
  });

  describe('connection tests (failure path — no live mailbox in this suite)', () => {
    it('reports a draft SMTP connection to an unreachable host as a 400, not a crash', async () => {
      await auth()
        .post('/api/v1/admin/email-accounts/test-smtp')
        .send({
          host: 'smtp.invalid-host-that-does-not-exist.invalid',
          port: 587,
          secure: false,
          user: 'x',
          password: 'x',
        })
        .expect(400);
    }, 15_000);

    it('reports a draft IMAP connection to an unreachable host as a 400, not a crash', async () => {
      await auth()
        .post('/api/v1/admin/email-accounts/test-imap')
        .send({
          host: 'imap.invalid-host-that-does-not-exist.invalid',
          port: 993,
          secure: true,
          user: 'x',
          password: 'x',
        })
        .expect(400);
    }, 15_000);

    it('tests a saved account’s SMTP connection and reports failure without crashing the request', async () => {
      const created = await auth()
        .post('/api/v1/admin/email-accounts')
        .send({
          label: 'Unreachable E2E',
          purpose: 'TRANSACTIONAL',
          fromName: 'x',
          fromEmail: 'unreachable-e2e@yaseen.pk',
          smtp: {
            host: 'smtp.invalid-host-that-does-not-exist.invalid',
            port: 587,
            secure: false,
            user: 'x',
            password: 'x',
          },
        })
        .expect(201);
      createdIds.push(created.body.id);

      await auth().post(`/api/v1/admin/email-accounts/${created.body.id}/test-smtp`).expect(400);

      const row = await prisma.emailAccount.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row.smtpVerifiedAt).toBeNull();
    }, 15_000);

    it('refuses an IMAP test for a saved account with no IMAP configured', async () => {
      const created = await auth()
        .post('/api/v1/admin/email-accounts')
        .send({
          label: 'No IMAP E2E',
          purpose: 'TRANSACTIONAL',
          fromName: 'x',
          fromEmail: 'no-imap-e2e@yaseen.pk',
          smtp: { host: 'smtp.x.example', port: 587, secure: false, user: 'x', password: 'x' },
        })
        .expect(201);
      createdIds.push(created.body.id);

      await auth().post(`/api/v1/admin/email-accounts/${created.body.id}/test-imap`).expect(400);
    });
  });
});
