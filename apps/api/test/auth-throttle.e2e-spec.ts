import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { REFRESH_FAMILY_LOCK_NAMESPACE, REFRESH_REUSE_DETECTED_AUDIT_ACTION } from '../src/core/auth/auth.service';
import { loginIdentifierHash } from '../src/core/auth/login-identifier';
import { LoginRateLimitedException, LoginThrottleService, loginBucketKey } from '../src/core/auth/login-throttle.service';
import { RATE_LIMITED_AUDIT_ACTION } from '../src/core/auth/rate-limit-audit.service';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { RedisService } from '../src/core/redis/redis.service';
import { GLOBAL_THROTTLE } from '../src/core/throttling/global-throttle';
import { SharedThrottlerStorage } from '../src/core/throttling/shared-throttler-storage';

/**
 * 206-rate-limiting-caching-compression-hardening.md WO-206.1–206.3, against
 * the real Redis (REDIS_URL) and the real database — the parts a stub cannot
 * prove: the Lua token bucket's actual schedule, one counter shared by two
 * replicas, a distributed attack refused past five attempts, Postgres row
 * locks serialising two refreshes of one token, and family revocation.
 *
 * ThrottlerModule's per-IP limit is skipped under NODE_ENV=test (app.module.ts),
 * so every 429 here is the per-account bucket's. Time is simulated by ageing
 * stored state — a bucket's `ts`, a token's `rotatedAt` — never by waiting.
 */
describe('Sign-in rate limiting and refresh-token reuse detection (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let throttle: LoginThrottleService;

  const run = Date.now();
  const email = `throttle-e2e-${run}@example.com`;
  const password = 'firstpass123';
  let userId: string;

  const api = () => request(app.getHttpServer());
  const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
  const signIn = (identifier: string, secret: string, ip: string) =>
    api().post('/api/v1/auth/login').set('X-Forwarded-For', ip).send({ identifier, password: secret });

  /** Moves a bucket's clock back, as if `ms` had passed since it was last touched. */
  async function ageBucket(identifier: string, ms: number): Promise<void> {
    const key = loginBucketKey(identifier);
    const ts = Number(await redis.client('rateLimit').hget(key, 'ts'));
    await redis.client('rateLimit').hset(key, 'ts', String(ts - ms));
  }

  async function spend(identifier: string, attempts: number): Promise<Array<number | 'ok'>> {
    const outcomes: Array<number | 'ok'> = [];
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      outcomes.push(
        await throttle.consume(identifier).then(
          () => 'ok' as const,
          (error: unknown) => {
            if (error instanceof LoginRateLimitedException) return error.retryAfterSeconds;
            throw error;
          },
        ),
      );
    }
    return outcomes;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    // As main.ts does: the address one proxy hop reports is the client's.
    app.set('trust proxy', 1);
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    throttle = app.get(LoginThrottleService);

    const registered = await api().post('/api/v1/auth/register').send({ email, password }).expect(201);
    userId = registered.body.user.id;
  });

  afterAll(async () => {
    await throttle.reset(email);
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  describe('the per-account bucket, on a real Redis (WO-206.2)', () => {
    const identifier = `bucket-${run}@example.com`;

    beforeEach(() => throttle.reset(identifier));

    it('allows 5, then refuses with the time until the next token — within a second of 300 s', async () => {
      const outcomes = await spend(identifier, 6);

      expect(outcomes.slice(0, 5)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
      expect(outcomes[5]).toBeGreaterThanOrEqual(299);
      expect(outcomes[5]).toBeLessThanOrEqual(300);
    });

    it('a refusal spends nothing: refusing again still names the same refill', async () => {
      await spend(identifier, 5);
      const [first, second] = await spend(identifier, 2);

      expect(Math.abs((first as number) - (second as number))).toBeLessThanOrEqual(1);
    });

    it('refills exactly one token per 300 s once the burst is spent', async () => {
      await spend(identifier, 5);

      await ageBucket(identifier, 150_000);
      const [halfway] = await spend(identifier, 1);
      expect(halfway).toBeGreaterThanOrEqual(149);
      expect(halfway).toBeLessThanOrEqual(150);

      await ageBucket(identifier, 150_000);
      expect(await spend(identifier, 2)).toEqual(['ok', expect.any(Number)]);
    });

    it('is full again after 25 minutes idle — 5 × 300 s', async () => {
      await spend(identifier, 5);

      await ageBucket(identifier, 1_500_000);

      const outcomes = await spend(identifier, 6);
      expect(outcomes.slice(0, 5)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
      expect(typeof outcomes[5]).toBe('number');
    });

    it('never holds more than 5, however long it sits idle', async () => {
      await spend(identifier, 1);
      await ageBucket(identifier, 24 * 3_600_000);

      const outcomes = await spend(identifier, 6);
      expect(outcomes.filter((outcome) => outcome === 'ok')).toHaveLength(5);
    });

    it('reset refills to capacity at once', async () => {
      await spend(identifier, 6);

      await throttle.reset(identifier);

      expect((await spend(identifier, 5)).every((outcome) => outcome === 'ok')).toBe(true);
    });

    it('keeps the key only until it would be full again, so an idle identifier costs no memory', async () => {
      await spend(identifier, 1);

      const ttl = await redis.client('rateLimit').pttl(loginBucketKey(identifier));
      expect(ttl).toBeGreaterThan(299_000);
      expect(ttl).toBeLessThanOrEqual(300_000);
    });

    it('stores the identifier only as a hash', async () => {
      await spend(identifier, 1);

      const keys = await redis.client('rateLimit').keys(`auth:login-bucket:*`);
      expect(keys).toContain(`auth:login-bucket:${loginIdentifierHash(identifier)}`);
      expect(keys.join()).not.toContain('bucket-');
    });
  });

  describe('a distributed attack on one account, over HTTP (doc 206 acceptance)', () => {
    beforeEach(async () => {
      await throttle.reset(email);
      // Each test starts its own audit episode (RateLimitAuditService records
      // the first refusal per identifier per 5 minutes).
      await redis.client('rateLimit').del(`auth:rate-limited-audit:account:${loginIdentifierHash(email)}`);
    });

    it('refuses the 6th attempt within 5 minutes even from a 6th, never-seen address, with doc 206\'s 429', async () => {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await signIn(email, 'wrong-guess', `203.0.113.${attempt}`).expect(401);
      }

      // Even the right password: the bucket is spent before any password is compared.
      const refused = await signIn(email, password, '203.0.113.6').expect(429);

      // The bucket's own next refill: 300 s less what trickled back while
      // five bcrypt comparisons ran — the exact arithmetic is pinned by the
      // Redis-level tests above, where a consume takes milliseconds.
      const seconds = refused.body.retryAfterSeconds;
      expect(Number.isInteger(seconds)).toBe(true);
      expect(seconds).toBeGreaterThanOrEqual(270);
      expect(seconds).toBeLessThanOrEqual(300);
      expect(refused.body.message).toBe(`Too many attempts. Try again in ${seconds} seconds.`);
      expect(refused.headers['retry-after']).toBe(String(seconds));
      // Nothing about the account: not whether it exists, not attempts left.
      expect(JSON.stringify(refused.body)).not.toMatch(/remaining|exist|attempts left/i);
    });

    it('answers an unknown account exactly the same way — the bucket reveals no account', async () => {
      const nobody = `nobody-${run}@example.com`;
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await signIn(nobody, 'guess', `198.51.100.${attempt}`).expect(401);
      }
      const refused = await signIn(nobody, 'guess', '198.51.100.6').expect(429);
      expect(refused.body.message).toMatch(/^Too many attempts\. Try again in \d+ seconds\.$/);
      await throttle.reset(nobody);
    });

    it('audits the refusal once per episode: hashed identifier and source IP, never the email or the password', async () => {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await signIn(email, 'wrong-guess', `192.0.2.${attempt}`).expect(401);
      }
      await signIn(email, 'wrong-guess', '192.0.2.77').expect(429);
      await signIn(email, 'wrong-guess', '192.0.2.78').expect(429);
      await signIn(email, 'wrong-guess', '192.0.2.79').expect(429);

      const rows = await prisma.auditLog.findMany({
        where: { action: RATE_LIMITED_AUDIT_ACTION, entityId: sha256(email) },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const latest = rows[rows.length - 1];
      expect(latest).toMatchObject({
        actorId: null,
        entity: 'AuthIdentifier',
        entityId: sha256(email),
        data: expect.objectContaining({ layer: 'account', route: 'POST /auth/login' }),
      });
      expect(latest.ip).toMatch(/192\.0\.2\./);
      // Three refusals in this episode, at most one row for them.
      expect(rows.filter((row) => row.ip?.startsWith('192.0.2.'))).toHaveLength(1);
      const stored = JSON.stringify(rows);
      expect(stored).not.toContain(email);
      expect(stored).not.toContain('wrong-guess');
    });

    it('a correct password refills the bucket: 4 typos, a sign-in, then 5 more tries before any 429', async () => {
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        await signIn(email, 'typo', '203.0.113.50').expect(401);
      }
      await signIn(email, password, '203.0.113.50').expect(200);

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await signIn(email, 'typo', '203.0.113.50').expect(401);
      }
      await signIn(email, 'typo', '203.0.113.50').expect(429);
    });

    it('counts every spelling of an identifier against one bucket', async () => {
      const spellings = [email.toUpperCase(), ` ${email}`, email, `${email} `, email.replace('throttle', 'THROTTLE')];
      for (const spelling of spellings) {
        await signIn(spelling, 'guess', '203.0.113.60').expect(401);
      }
      await signIn(email, password, '203.0.113.60').expect(429);
    });
  });

  describe('Redis unreachable: sign-in fails closed (doc 206 §1.2)', () => {
    beforeEach(() => throttle.reset(email));

    afterEach(async () => {
      const client = redis.client('rateLimit');
      if (client.status !== 'ready') {
        await client.connect().catch(() => undefined);
      }
      await throttle.reset(email);
    });

    it('refuses sign-in with 503 rather than allowing unlimited attempts, and signs in again once Redis is back', async () => {
      redis.client('rateLimit').disconnect();

      const refused = await signIn(email, password, '203.0.113.90').expect(503);
      expect(refused.body.message).toBe('Sign-in is temporarily unavailable. Please try again in a minute.');

      await redis.client('rateLimit').connect();
      await signIn(email, password, '203.0.113.90').expect(200);
    });

    it('reports Redis in the readiness probe while it is down, without failing liveness', async () => {
      redis.client('rateLimit').disconnect();

      const ready = await api().get('/api/v1/health/ready').expect(200);
      expect(ready.body.status).toBe('degraded');
      expect(ready.body.checks).toMatchObject({ database: { ok: true }, redis: { ok: false } });
      await api().get('/api/v1/health').expect(200);
    });
  });

  describe('two API replicas share one rate-limit counter (WO-206.1, doc 206 §1.1)', () => {
    it('an attacker alternating between replicas meets a limit of 10, not 10 × replicas', async () => {
      const config = { get: () => process.env.REDIS_URL ?? 'redis://localhost:6379' } as any;
      const replicas = [new RedisService(config), new RedisService(config)];
      await Promise.all(replicas.map((replica) => replica.onModuleInit()));
      const storages = replicas.map(
        (replica) => new SharedThrottlerStorage(new ThrottlerStorageRedisService(replica.client('rateLimit')), [GLOBAL_THROTTLE]),
      );

      const key = `e2e-shared-${run}`;
      const blocked: boolean[] = [];
      for (let hit = 0; hit < 12; hit += 1) {
        const record = await storages[hit % 2].increment(key, 60_000, 10, 60_000, 'default');
        blocked.push(record.isBlocked);
      }

      expect(blocked.slice(0, 10).every((isBlocked) => !isBlocked)).toBe(true);
      expect(blocked.slice(10)).toEqual([true, true]);

      storages.forEach((storage) => storage.onApplicationShutdown());
      await Promise.all(replicas.map((replica) => replica.onApplicationShutdown()));
    });
  });

  describe('refresh-token rotation against real Postgres (WO-206.3)', () => {
    async function freshSession(): Promise<{ accessToken: string; refreshToken: string }> {
      await throttle.reset(email);
      const signedIn = await signIn(email, password, '203.0.113.100').expect(200);
      return signedIn.body;
    }

    it('five concurrent refreshes of one token all succeed with one and the same new pair — no "sudden logout"', async () => {
      const session = await freshSession();

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => api().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken })),
      );

      expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
      expect(new Set(responses.map((response) => response.body.refreshToken)).size).toBe(1);
      expect(new Set(responses.map((response) => response.body.accessToken)).size).toBe(1);

      const presented = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: sha256(session.refreshToken) } });
      const family = await prisma.refreshToken.findMany({ where: { familyId: presented.familyId } });
      // The presented token and exactly one successor: the races minted nothing.
      expect(family).toHaveLength(2);
      expect(presented.rotatedAt).not.toBeNull();
      expect(presented.replacedById).toBe(family.find((row) => row.id !== presented.id)!.id);
    });

    it('a token replayed after the grace window revokes its whole family and writes one audit row', async () => {
      const session = await freshSession();
      const rotated = await api().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(200);
      const otherDevice = await freshSession();

      // As if the first token were replayed ten minutes after its rotation.
      await prisma.refreshToken.update({
        where: { tokenHash: sha256(session.refreshToken) },
        data: { rotatedAt: new Date(Date.now() - 10 * 60_000) },
      });
      await api()
        .post('/api/v1/auth/refresh')
        .set('X-Forwarded-For', '198.51.100.200')
        .send({ refreshToken: session.refreshToken })
        .expect(401);

      // The legitimate holder of the current token is signed out too...
      await api().post('/api/v1/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(401);
      // ...while a separate sign-in (another device) is untouched.
      await api().post('/api/v1/auth/refresh').send({ refreshToken: otherDevice.refreshToken }).expect(200);

      const presented = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: sha256(session.refreshToken) } });
      expect(await prisma.refreshToken.count({ where: { familyId: presented.familyId, revokedAt: null } })).toBe(0);

      const audits = await prisma.auditLog.findMany({
        where: { action: REFRESH_REUSE_DETECTED_AUDIT_ACTION, entityId: userId, ip: '198.51.100.200' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0].data).toMatchObject({ familyId: presented.familyId, tokensRevoked: 1 });
    });

    it('a rotation in flight when reuse is detected cannot leave its successor live — the family lock serialises them', async () => {
      const session = await freshSession();
      const rotated = await api().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(200);
      const stale = await prisma.refreshToken.update({
        where: { tokenHash: sha256(session.refreshToken) },
        data: { rotatedAt: new Date(Date.now() - 10 * 60_000) },
      });
      const head = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: sha256(rotated.body.refreshToken) } });

      // Whoever holds the current token rotates it, and is still mid-way
      // (lock taken, successor written, not yet committed) when the stale
      // token is replayed.
      let lockTaken!: () => void;
      let finishRotation!: () => void;
      const locked = new Promise<void>((resolve) => (lockTaken = resolve));
      const released = new Promise<void>((resolve) => (finishRotation = resolve));
      const inFlight = prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REFRESH_FAMILY_LOCK_NAMESPACE}::int, hashtext(${stale.familyId})::int)`;
          await tx.refreshToken.update({ where: { id: head.id }, data: { revokedAt: new Date(), rotatedAt: new Date() } });
          const successor = await tx.refreshToken.create({
            data: {
              userId,
              tokenHash: sha256(`racing-successor-${run}`),
              familyId: stale.familyId,
              expiresAt: new Date(Date.now() + 86_400_000),
            },
          });
          lockTaken();
          await released;
          return successor;
        },
        { timeout: 20_000 },
      );

      await locked;
      const replay = api().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).then((response) => response);
      // Give the replay time to reach the family lock and wait on it.
      await new Promise((resolve) => setTimeout(resolve, 500));
      finishRotation();
      const successor = await inFlight;

      expect((await replay).status).toBe(401);
      // Read with a fresh snapshot after the rotation committed: revoked.
      const after = await prisma.refreshToken.findUniqueOrThrow({ where: { id: successor.id } });
      expect(after.revokedAt).not.toBeNull();
      expect(await prisma.refreshToken.count({ where: { familyId: stale.familyId, revokedAt: null } })).toBe(0);
    });

    it('a signed-out token is refused as before and is never taken for reuse', async () => {
      const session = await freshSession();
      await api().post('/api/v1/auth/logout').send({ refreshToken: session.refreshToken }).expect(204);
      const before = await prisma.auditLog.count({ where: { action: REFRESH_REUSE_DETECTED_AUDIT_ACTION, entityId: userId } });

      await api().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);

      expect(await prisma.auditLog.count({ where: { action: REFRESH_REUSE_DETECTED_AUDIT_ACTION, entityId: userId } })).toBe(before);
    });
  });
});
