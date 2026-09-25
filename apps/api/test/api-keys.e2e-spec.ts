import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/core/auth/password.util';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { OutboxDispatcher } from '../src/core/events/outbox.dispatcher';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { drainOutboxSince } from './support/outbox';

/**
 * Personal API keys through the real global guards, the real database, its
 * CHECK constraints and its revocation trigger
 * (docs/implementation/access-control-identity/163-personal-api-keys.md).
 *
 * The staff member here holds orders.manage and catalog.manage through a
 * custom role this suite creates, so a key can be shown carrying less than
 * its owner, and the owner can be demoted mid-test by removing a grant.
 */
describe('Personal API keys (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let outbox: OutboxDispatcher;
  let suiteStartedAt: Date;

  const suffix = `${Date.now()}`;
  const staffEmail = `api-key-staff-${suffix}@example.com`;
  const customerEmail = `api-key-customer-${suffix}@example.com`;
  const password = 'correct-horse-battery';

  let roleId: string;
  let staffId: string;
  let customerId: string;
  let adminToken: string;
  let staffToken: string;
  let customerToken: string;

  beforeAll(async () => {
    suiteStartedAt = new Date();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);
    outbox = app.get(OutboxDispatcher);

    const role = await prisma.role.create({
      data: {
        name: `API key e2e ${suffix}`,
        grants: {
          create: [
            { permission: { connect: { key: 'orders.manage' } } },
            { permission: { connect: { key: 'catalog.manage' } } },
          ],
        },
      },
    });
    roleId = role.id;

    const staff = await prisma.user.create({
      data: {
        email: staffEmail,
        passwordHash: await hashPassword(password),
        role: 'STAFF',
        roleAssignments: { create: { roleId } },
      },
    });
    staffId = staff.id;

    adminToken = await signIn('admin@yaseen.pk', 'admin12345');
    staffToken = await signIn(staffEmail, password);

    const registered = await api()
      .post('/api/v1/auth/register')
      .send({ email: customerEmail, password, firstName: 'Key', lastName: 'Holder' })
      .expect(201);
    customerId = registered.body.user.id;
    customerToken = registered.body.accessToken;
  });

  afterAll(async () => {
    try {
      // Deliver this suite's notices while the app is still up: closing with a
      // batch in flight would strand it in PROCESSING (support/outbox.ts).
      await drainOutboxSince(prisma, outbox, suiteStartedAt);
    } finally {
      // Test fixtures this suite created — ApiKey rows cascade with their owners.
      await prisma.user.deleteMany({ where: { email: { in: [staffEmail, customerEmail] } } });
      await prisma.role.deleteMany({ where: { id: roleId } });
      await app.close();
    }
  });

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function signIn(identifier: string, secret: string): Promise<string> {
    const response = await api().post('/api/v1/auth/login').send({ identifier, password: secret }).expect(200);
    return response.body.accessToken as string;
  }

  async function createKey(token: string, body: Record<string, unknown>): Promise<{ id: string; secret: string }> {
    const response = await api().post('/api/v1/api-keys').set(bearer(token)).send(body).expect(201);
    return { id: response.body.key.id, secret: response.body.secret };
  }

  describe('an admin key', () => {
    let key: { id: string; secret: string };

    beforeAll(async () => {
      key = await createKey(staffToken, {
        surface: 'ADMIN',
        name: 'Order export',
        permissionKeys: ['orders.manage'],
        expiresInDays: 30,
      });
    });

    it('is issued once, as an nxa_ secret, and stored only as its hash', async () => {
      expect(key.secret).toMatch(/^nxa_/);
      const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: key.id } });
      expect(row.keyHash).not.toContain(key.secret);
      expect(row.lastFour).toBe(key.secret.slice(-4));
    });

    it('reaches the route of the permission it carries', async () => {
      await api().get('/api/v1/admin/orders').set(bearer(key.secret)).expect(200);
    });

    it('is refused a route its owner can use but the key does not carry', async () => {
      await api().get('/api/v1/admin/catalog/categories').set(bearer(staffToken)).expect(200);
      await api().get('/api/v1/admin/catalog/categories').set(bearer(key.secret)).expect(403);
    });

    it('is refused a signed-in-only route — fail-closed', async () => {
      await api().get('/api/v1/auth/me').set(bearer(key.secret)).expect(403);
    });

    it('can never manage keys, even its own', async () => {
      await api().get('/api/v1/api-keys?surface=ADMIN').set(bearer(key.secret)).expect(403);
      await api()
        .post('/api/v1/api-keys')
        .set(bearer(key.secret))
        .send({ surface: 'ADMIN', name: 'Escalation', permissionKeys: ['orders.manage'], expiresInDays: 7 })
        .expect(403);
    });

    it('shrinks the moment its owner is demoted, and resumes when the grant returns', async () => {
      const grant = await prisma.roleGrant.findFirstOrThrow({
        where: { roleId, permission: { key: 'orders.manage' } },
      });
      await prisma.roleGrant.delete({ where: { id: grant.id } });

      await api().get('/api/v1/admin/orders').set(bearer(key.secret)).expect(403);
      const list = await api().get('/api/v1/api-keys?surface=ADMIN').set(bearer(staffToken)).expect(200);
      expect(list.body.data.find((item: { id: string }) => item.id === key.id)).toMatchObject({
        effectiveScopes: [],
        pausedScopes: ['orders.manage'],
      });

      await prisma.roleGrant.create({ data: { roleId, permissionId: grant.permissionId } });
      await api().get('/api/v1/admin/orders').set(bearer(key.secret)).expect(200);
    });

    it('rotates to a new secret with the same scopes; the old secret dies at once', async () => {
      const rotated = await api()
        .post(`/api/v1/api-keys/${key.id}/rotate`)
        .set(bearer(staffToken))
        .send({ expiresInDays: 30 })
        .expect(200);
      const newSecret: string = rotated.body.secret;

      expect(newSecret).not.toBe(key.secret);
      expect(rotated.body.key.permissionKeys).toEqual(['orders.manage']);
      await api().get('/api/v1/admin/orders').set(bearer(key.secret)).expect(401);
      await api().get('/api/v1/admin/orders').set(bearer(newSecret)).expect(200);
      key = { id: key.id, secret: newSecret };
    });

    it('queues the owner a security notice for every issued secret, carrying no secret', async () => {
      const mine = await prisma.outboxEvent.findMany({
        where: { name: 'user.api_key_issued', payload: { path: ['apiKeyId'], equals: key.id } },
      });

      expect(mine.map((event) => (event.payload as { reason: string }).reason).sort()).toEqual(['CREATED', 'ROTATED']);
      for (const event of mine) expect(JSON.stringify(event.payload)).not.toContain('nxa_');
    });

    it('leaves an audit trail of the lifecycle, not just of use', async () => {
      const actions = (await prisma.auditLog.findMany({ where: { entity: 'ApiKey', entityId: key.id } })).map(
        (row) => row.action,
      );
      expect(actions).toEqual(expect.arrayContaining(['api_key.created', 'api_key.rotated']));
    });

    it('is refused on its very next request once revoked — and the database keeps it revoked', async () => {
      await api().post(`/api/v1/api-keys/${key.id}/revoke`).set(bearer(staffToken)).expect(200);

      const refused = await api().get('/api/v1/admin/orders').set(bearer(key.secret)).expect(401);
      expect(JSON.stringify(refused.body)).toContain('revoked');

      // The api_key_revocation_is_final trigger, not the application.
      await expect(
        prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: null, revokedReason: null } }),
      ).rejects.toThrow(/a revoked key is final/);
      await expect(
        prisma.apiKey.update({ where: { id: key.id }, data: { permissionKeys: ['orders.manage', 'catalog.manage'] } }),
      ).rejects.toThrow(/a revoked key is final/);
    });
  });

  describe('what can never go into a key', () => {
    it('refuses a non-delegatable permission even to an admin who holds it', async () => {
      const response = await api()
        .post('/api/v1/api-keys')
        .set(bearer(adminToken))
        .send({ surface: 'ADMIN', name: 'Too strong', permissionKeys: ['users.manage'], expiresInDays: 7 })
        .expect(400);
      expect(JSON.stringify(response.body)).toContain('can never be put in an API key');
    });

    it('refuses a permission its owner does not hold — a customer can mint no admin key', async () => {
      await api()
        .post('/api/v1/api-keys')
        .set(bearer(customerToken))
        .send({ surface: 'ADMIN', name: 'Nope', permissionKeys: ['orders.manage'], expiresInDays: 7 })
        .expect(400);
    });

    it('is enforced by the database too: a key belongs to exactly one catalogue', async () => {
      const base = { userId: staffId, name: 'raw', lastFour: 'zzzz', expiresAt: new Date(Date.now() + 86_400_000) };

      await expect(
        prisma.apiKey.create({
          data: { ...base, keyHash: `raw-1-${suffix}`, surface: 'ADMIN', permissionKeys: ['orders.manage'], customerScopes: ['orders:read'] },
        }),
      ).rejects.toThrow(/ApiKey_one_catalogue_check/);
      await expect(
        prisma.apiKey.create({ data: { ...base, keyHash: `raw-2-${suffix}`, surface: 'ADMIN', permissionKeys: [] } }),
      ).rejects.toThrow(/ApiKey_one_catalogue_check/);
      await expect(
        prisma.apiKey.create({
          data: { ...base, keyHash: `raw-3-${suffix}`, surface: 'STOREFRONT', customerScopes: ['orders:read'], revokedAt: new Date() },
        }),
      ).rejects.toThrow(/ApiKey_revocation_fields_check/);
    });
  });

  describe('a storefront key', () => {
    let key: { id: string; secret: string };

    beforeAll(async () => {
      key = await createKey(customerToken, {
        surface: 'STOREFRONT',
        name: 'Shipping helper',
        customerScopes: ['orders:read', 'addresses:write'],
        expiresInDays: 30,
      });
    });

    it('is issued as an nxs_ secret and reaches the customer routes of its scopes', async () => {
      expect(key.secret).toMatch(/^nxs_/);
      await api().get('/api/v1/orders/mine').set(bearer(key.secret)).expect(200);
      // write implies read
      await api().get('/api/v1/addresses').set(bearer(key.secret)).expect(200);
    });

    it('is refused a customer route outside its scopes, and the sign-in identity', async () => {
      await api().get('/api/v1/wishlist').set(bearer(key.secret)).expect(403);
      await api().get('/api/v1/auth/me').set(bearer(key.secret)).expect(403);
      await api().patch('/api/v1/auth/me').set(bearer(key.secret)).send({ email: 'taken-over@example.com' }).expect(403);

      const customer = await prisma.user.findUniqueOrThrow({ where: { id: customerId } });
      expect(customer.email).toBe(customerEmail);
    });

    it('never reaches an admin route', async () => {
      await api().get('/api/v1/admin/orders').set(bearer(key.secret)).expect(403);
    });

    it('browses a public route as a guest would', async () => {
      await api().get('/api/v1/catalog/categories').set(bearer(key.secret)).expect(200);
    });
  });

  describe('oversight (users.manage) and deactivation', () => {
    it('lets a users.manage holder list every key — metadata only — and nobody else', async () => {
      const response = await api().get(`/api/v1/admin/api-keys?q=${suffix}&pageSize=50`).set(bearer(adminToken)).expect(200);

      const owners = response.body.data.map((item: { owner: { email: string } }) => item.owner.email);
      expect(owners).toEqual(expect.arrayContaining([staffEmail, customerEmail]));
      for (const item of response.body.data) expect(item).not.toHaveProperty('keyHash');

      await api().get('/api/v1/admin/api-keys').set(bearer(staffToken)).expect(403);
    });

    it("revokes a customer's key as an administrator", async () => {
      const key = await createKey(customerToken, {
        surface: 'STOREFRONT',
        name: 'To be revoked',
        customerScopes: ['orders:read'],
        expiresInDays: 7,
      });

      await api().post(`/api/v1/admin/api-keys/${key.id}/revoke`).set(bearer(adminToken)).expect(200);

      const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: key.id } });
      expect(row.revokedReason).toBe('ADMINISTRATOR');
      await api().get('/api/v1/orders/mine').set(bearer(key.secret)).expect(401);
    });

    it("revokes every key in the owner's deactivation, and reactivating does not revive them", async () => {
      const key = await createKey(staffToken, {
        surface: 'ADMIN',
        name: 'Before leaving',
        permissionKeys: ['orders.manage'],
        expiresInDays: 30,
      });
      await api().get('/api/v1/admin/orders').set(bearer(key.secret)).expect(200);

      await api().patch(`/api/v1/admin/users/${staffId}`).set(bearer(adminToken)).send({ isActive: false }).expect(200);
      expect((await prisma.apiKey.findUniqueOrThrow({ where: { id: key.id } })).revokedReason).toBe('OWNER_DEACTIVATED');
      await api().get('/api/v1/admin/orders').set(bearer(key.secret)).expect(401);

      await api().patch(`/api/v1/admin/users/${staffId}`).set(bearer(adminToken)).send({ isActive: true }).expect(200);
      await api().get('/api/v1/admin/orders').set(bearer(key.secret)).expect(401);
    });
  });

  // Last on purpose: it locks this suite's own address out of key
  // authentication for the rest of the window.
  describe('guessing keys', () => {
    it('refuses an address with a 429, before any lookup, once it has failed too often', async () => {
      const guess = (n: number) => `nxa_${'x'.repeat(40)}${String(n).padStart(3, '0')}`;
      let attempt = 0;
      let status = 401;
      while (status === 401 && attempt < 100) {
        status = (await api().get('/api/v1/admin/orders').set(bearer(guess(attempt)))).status;
        attempt += 1;
      }

      expect(status).toBe(429);
      expect(attempt).toBeGreaterThan(1);
      // A session from the same address is untouched: this limits key guessing, not the person.
      await api().get('/api/v1/admin/orders').set(bearer(adminToken)).expect(200);
    });
  });
});
