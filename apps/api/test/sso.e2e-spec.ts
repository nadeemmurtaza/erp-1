import { createHash, createSign, generateKeyPairSync, randomBytes } from 'node:crypto';
import { createServer, get as httpGet, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SSO_HANDOFF_COOKIE, SSO_STATE_COOKIE } from '../src/core/auth/auth.constants';
import { hashPassword } from '../src/core/auth/password.util';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { OutboxDispatcher } from '../src/core/events/outbox.dispatcher';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { drainOutboxSince } from './support/outbox';

interface ProviderIdentity {
  sub: string;
  email: string;
  email_verified?: boolean;
}

/**
 * A minimal OpenID provider on loopback — discovery, a key set, an
 * authorize endpoint that consents at once, and a token endpoint that checks
 * the client secret, the redirect URI and the PKCE verifier before it signs
 * an RS256 ID token carrying the nonce it was given. Enough of the protocol
 * that openid-client runs every check it runs against Google or Entra.
 */
class LoopbackOidcProvider {
  issuer = '';
  /** Who the next sign-in asserts. */
  identity: ProviderIdentity = { sub: 'nobody', email: 'nobody@example.com', email_verified: true };

  private server!: Server;
  private readonly keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  private readonly codes = new Map<string, { nonce: string; challenge: string; redirectUri: string; identity: ProviderIdentity }>();

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  async start(): Promise<void> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.issuer = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  stop(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.issuer);

    if (url.pathname === '/.well-known/openid-configuration') {
      return json(res, 200, {
        issuer: this.issuer,
        authorization_endpoint: `${this.issuer}/authorize`,
        token_endpoint: `${this.issuer}/token`,
        jwks_uri: `${this.issuer}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic'],
        code_challenge_methods_supported: ['S256'],
      });
    }

    if (url.pathname === '/jwks') {
      return json(res, 200, { keys: [{ ...this.keys.publicKey.export({ format: 'jwk' }), kid: 'e2e', use: 'sig', alg: 'RS256' }] });
    }

    if (url.pathname === '/authorize') {
      const query = url.searchParams;
      if (
        query.get('client_id') !== this.clientId ||
        query.get('response_type') !== 'code' ||
        query.get('code_challenge_method') !== 'S256' ||
        !query.get('code_challenge') ||
        !query.get('nonce') ||
        !query.get('state')
      ) {
        return json(res, 400, { error: 'invalid_request' });
      }
      const code = randomBytes(16).toString('hex');
      this.codes.set(code, {
        nonce: query.get('nonce')!,
        challenge: query.get('code_challenge')!,
        redirectUri: query.get('redirect_uri')!,
        identity: this.identity,
      });
      const back = new URL(query.get('redirect_uri')!);
      back.searchParams.set('code', code);
      back.searchParams.set('state', query.get('state')!);
      // As Google does: parameters of the provider's own, which the callback
      // must ignore rather than refuse.
      back.searchParams.set('scope', query.get('scope') ?? '');
      back.searchParams.set('authuser', '0');
      res.writeHead(302, { Location: back.toString() });
      res.end();
      return;
    }

    if (url.pathname === '/token' && req.method === 'POST') {
      const form = new URLSearchParams(await readBody(req));
      const [id, secret] = Buffer.from((req.headers.authorization ?? '').replace(/^Basic /, ''), 'base64')
        .toString()
        .split(':')
        .map(decodeURIComponent);
      const issued = this.codes.get(form.get('code') ?? '');
      this.codes.delete(form.get('code') ?? '');

      const verifier = form.get('code_verifier') ?? '';
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      if (id !== this.clientId || secret !== this.clientSecret) return json(res, 401, { error: 'invalid_client' });
      if (!issued || issued.redirectUri !== form.get('redirect_uri') || issued.challenge !== challenge) {
        return json(res, 400, { error: 'invalid_grant' });
      }

      const now = Math.floor(Date.now() / 1000);
      const idToken = this.sign({
        iss: this.issuer,
        aud: this.clientId,
        iat: now,
        exp: now + 300,
        nonce: issued.nonce,
        ...issued.identity,
      });
      return json(res, 200, { access_token: 'loopback-access', token_type: 'Bearer', expires_in: 300, id_token: idToken });
    }

    return json(res, 404, { error: 'not_found' });
  }

  private sign(claims: Record<string, unknown>): string {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const signingInput = `${encode({ alg: 'RS256', typ: 'JWT', kid: 'e2e' })}.${encode(claims)}`;
    const signature = createSign('RSA-SHA256').update(signingInput).sign(this.keys.privateKey).toString('base64url');
    return `${signingInput}.${signature}`;
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/** Follows the provider's authorize redirect once and returns where it sends the browser back to. */
function authorize(url: string): Promise<URL> {
  return new Promise((resolve, reject) => {
    httpGet(url, (res) => {
      res.resume();
      if (res.statusCode !== 302 || !res.headers.location) {
        reject(new Error(`authorize answered ${res.statusCode}`));
        return;
      }
      resolve(new URL(res.headers.location));
    }).on('error', reject);
  });
}

/** `name=value` of one Set-Cookie header, ready to send back. */
function cookie(response: request.Response, name: string): string {
  const header = ([] as string[]).concat(response.headers['set-cookie'] ?? []).find((line) => line.startsWith(`${name}=`));
  if (!header) throw new Error(`no ${name} cookie was set`);
  return header.split(';')[0];
}

/**
 * Single sign-on end to end (access-control-identity/161-sso-identity-federation.md):
 * the real global guards and pipe, the real database, real sealed cookies,
 * and openid-client against a real (loopback) provider — discovery, PKCE,
 * the code exchange and ID-token verification all run for real.
 */
describe('Single sign-on (e2e)', () => {
  const suffix = `${Date.now()}`;
  const domain = `sso-e2e-${suffix}.test`;
  const password = 'correct-horse-battery';
  const adminEmail = `sso-admin-${suffix}@example.com`;
  const existingEmail = `existing-${suffix}@${domain}`;
  const newEmail = `new-${suffix}@${domain}`;
  const outsiderEmail = `outsider-${suffix}@elsewhere-${suffix}.test`;
  const clientId = `client-${suffix}`;
  const clientSecret = `secret-${randomBytes(12).toString('hex')}`;
  const adminPanel = `${(process.env.STOREFRONT_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/admin/login`;

  const provider = new LoopbackOidcProvider(clientId, clientSecret);
  let app: INestApplication;
  let prisma: PrismaService;
  let outbox: OutboxDispatcher;
  let suiteStartedAt: Date;
  let adminRoleId: string;
  let staffRoleId: string;
  let existingUserId: string;
  let adminToken: string;
  let connectionId: string;

  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    suiteStartedAt = new Date();
    await provider.start();
    // Before the module compiles: configuration is read once, at boot. The
    // callback URL is only ever a string passed to the provider and back —
    // the test drives the callback itself.
    process.env.API_PUBLIC_URL = 'http://api.sso-e2e.test';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: false } }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);
    outbox = app.get(OutboxDispatcher);

    // This suite's own roles, so it depends on no deployment's grants: one
    // that manages single sign-on, and a safe default for new sign-ins.
    adminRoleId = (
      await prisma.role.create({
        data: { name: `SSO e2e admin ${suffix}`, grants: { create: [{ permission: { connect: { key: 'settings.sso.manage' } } }] } },
      })
    ).id;
    staffRoleId = (
      await prisma.role.create({
        data: { name: `SSO e2e staff ${suffix}`, grants: { create: [{ permission: { connect: { key: 'orders.manage' } } }] } },
      })
    ).id;

    await prisma.user.create({
      data: { email: adminEmail, passwordHash: await hashPassword(password), role: 'STAFF', roleAssignments: { create: { roleId: adminRoleId } } },
    });
    existingUserId = (
      await prisma.user.create({ data: { email: existingEmail, passwordHash: await hashPassword(password), role: 'STAFF' } })
    ).id;

    const signedIn = await api().post('/api/v1/auth/login').send({ identifier: adminEmail, password }).expect(200);
    adminToken = signedIn.body.accessToken as string;
  });

  afterAll(async () => {
    try {
      await drainOutboxSince(prisma, outbox, suiteStartedAt);
    } finally {
      // Fixtures this suite created — refresh tokens and role assignments cascade with their users.
      await prisma.user.deleteMany({ where: { email: { in: [adminEmail, existingEmail, newEmail, outsiderEmail] } } });
      if (connectionId) await prisma.ssoConnection.deleteMany({ where: { id: connectionId } });
      await prisma.role.deleteMany({ where: { id: { in: [adminRoleId, staffRoleId] } } });
      await app.close();
      await provider.stop();
    }
  });

  /** Start → the provider → back to the callback, as a browser would. */
  async function throughProvider(identity: ProviderIdentity, tamper?: (callback: URL) => void): Promise<request.Response> {
    provider.identity = identity;
    const start = await api().get(`/api/v1/auth/sso/${connectionId}/start`).expect(302);
    const callback = await authorize(start.headers.location as string);
    tamper?.(callback);
    return api().get(`/api/v1/auth/sso/callback${callback.search}`).set('Cookie', cookie(start, SSO_STATE_COOKIE));
  }

  it('lets an admin register a connection — the secret is stored encrypted and never returned', async () => {
    const created = await api()
      .post('/api/v1/admin/sso/connections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        protocol: 'OIDC',
        label: `E2E provider ${suffix}`,
        issuerUrl: provider.issuer,
        clientId,
        credential: clientSecret,
        allowedEmailDomains: [domain],
        defaultRoleName: `SSO e2e staff ${suffix}`,
      })
      .expect(201);
    connectionId = created.body.id;

    expect(JSON.stringify(created.body)).not.toContain(clientSecret);
    expect(created.body.redirectUri).toBe('http://api.sso-e2e.test/api/v1/auth/sso/callback');
    const stored = await prisma.ssoConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(stored.credentialEncrypted).not.toContain(clientSecret);

    const options = await api().get('/api/v1/auth/sso/connections').expect(200);
    expect(options.body).toContainEqual({ id: connectionId, label: `E2E provider ${suffix}` });
  });

  it('refuses the admin routes to someone without settings.sso.manage', async () => {
    const outsider = await api().post('/api/v1/auth/login').send({ identifier: existingEmail, password }).expect(200);
    await api().get('/api/v1/admin/sso/connections').set('Authorization', `Bearer ${outsider.body.accessToken}`).expect(403);
  });

  it('provisions a brand-new address into the default role, with the session a password sign-in gets — never UserRegistered', async () => {
    const callback = await throughProvider({ sub: `new-${suffix}`, email: newEmail, email_verified: true });

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe(`${adminPanel}/sso-complete`);
    expect(callback.headers.location).not.toMatch(/token/i);

    const session = await api().post('/api/v1/auth/sso/session').set('Cookie', cookie(callback, SSO_HANDOFF_COOKIE)).expect(200);
    expect(session.body.accessToken).toEqual(expect.any(String));
    expect(session.body.user.email).toBe(newEmail);
    expect(session.body.user.permissions).toContain('orders.manage');

    const user = await prisma.user.findUniqueOrThrow({ where: { email: newEmail }, include: { roleAssignments: true } });
    expect(user.role).toBe('STAFF');
    expect(user.passwordHash).toBeNull();
    expect(user.ssoExternalId).toBe(`${provider.issuer}#new-${suffix}`);
    expect(user.roleAssignments.map((assignment) => assignment.roleId)).toEqual([staffRoleId]);

    const events = await prisma.outboxEvent.findMany({ where: { createdAt: { gte: suiteStartedAt } } });
    const forUser = events.filter((event) => (event.payload as { userId?: string } | null)?.userId === user.id);
    expect(forUser.map((event) => event.name)).toEqual(['user.sso_user_provisioned']);

    const audit = await prisma.auditLog.findFirst({ where: { entity: 'SsoConnection', entityId: connectionId, action: 'sso.user_provisioned' } });
    expect(audit?.actorId).toBe(user.id);

    // The handoff redeems once: its refresh token was rotated by that first use.
    await api().post('/api/v1/auth/sso/session').set('Cookie', cookie(callback, SSO_HANDOFF_COOKIE)).expect(401);
  });

  it('links an existing password account at an allowed domain — audited, and its owner is told', async () => {
    const callback = await throughProvider({ sub: `existing-${suffix}`, email: existingEmail.toUpperCase(), email_verified: true });
    expect(callback.headers.location).toBe(`${adminPanel}/sso-complete`);
    await api().post('/api/v1/auth/sso/session').set('Cookie', cookie(callback, SSO_HANDOFF_COOKIE)).expect(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: existingUserId } });
    expect(user.ssoExternalId).toBe(`${provider.issuer}#existing-${suffix}`);
    expect(user.passwordHash).not.toBeNull();

    const linked = await prisma.outboxEvent.findMany({ where: { createdAt: { gte: suiteStartedAt }, name: 'user.sso_account_linked' } });
    expect(linked.map((event) => (event.payload as { userId: string }).userId)).toContain(existingUserId);
    const audits = await prisma.auditLog.count({ where: { entityId: connectionId, action: 'sso.account_linked' } });
    expect(audits).toBe(1);

    // Signing in again is an ordinary sign-in: no second link, no second notice.
    const again = await throughProvider({ sub: `existing-${suffix}`, email: existingEmail, email_verified: true });
    expect(again.headers.location).toBe(`${adminPanel}/sso-complete`);
    expect(await prisma.auditLog.count({ where: { entityId: connectionId, action: 'sso.account_linked' } })).toBe(1);
  });

  it('refuses an address at any other domain, creating nothing, and says so only as "failed"', async () => {
    const callback = await throughProvider({ sub: `outsider-${suffix}`, email: outsiderEmail, email_verified: true });

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe(`${adminPanel}?sso=failed`);
    expect(callback.headers['set-cookie']?.toString() ?? '').not.toContain(`${SSO_HANDOFF_COOKIE}=`);
    expect(await prisma.user.count({ where: { email: outsiderEmail } })).toBe(0);
  });

  it('refuses a provider-unverified email', async () => {
    const callback = await throughProvider({ sub: `unverified-${suffix}`, email: `unverified-${suffix}@${domain}`, email_verified: false });
    expect(callback.headers.location).toBe(`${adminPanel}?sso=failed`);
    expect(await prisma.user.count({ where: { email: `unverified-${suffix}@${domain}` } })).toBe(0);
  });

  it('refuses a callback whose state is not the one this browser started (CSRF)', async () => {
    const callback = await throughProvider({ sub: `new-${suffix}`, email: newEmail, email_verified: true }, (url) =>
      url.searchParams.set('state', 'forged-state'),
    );
    expect(callback.headers.location).toBe(`${adminPanel}?sso=failed`);
  });

  it('unlinks an account and signs it out everywhere', async () => {
    await api()
      .post(`/api/v1/admin/sso/connections/${connectionId}/accounts/${existingUserId}/unlink`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: existingUserId } });
    expect(user.ssoExternalId).toBeNull();
    expect(await prisma.refreshToken.count({ where: { userId: existingUserId, revokedAt: null } })).toBe(0);

    const accounts = await api()
      .get(`/api/v1/admin/sso/connections/${connectionId}/accounts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(accounts.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: existingUserId, how: 'LINKED', linked: false }),
        expect.objectContaining({ email: newEmail, how: 'PROVISIONED', linked: true }),
      ]),
    );
  });

  it('signs nobody in through a suspended connection, and stops offering it', async () => {
    await api()
      .post(`/api/v1/admin/sso/connections/${connectionId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const options = await api().get('/api/v1/auth/sso/connections').expect(200);
    expect(options.body.map((option: { id: string }) => option.id)).not.toContain(connectionId);

    const start = await api().get(`/api/v1/auth/sso/${connectionId}/start`).expect(302);
    expect(start.headers.location).toBe(`${adminPanel}?sso=failed`);
  });
});
