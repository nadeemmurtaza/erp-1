import { createHash } from 'node:crypto';
import { HttpStatus, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService, parseDuration, REFRESH_REUSE_DETECTED_AUDIT_ACTION, REFRESH_REUSE_GRACE_MS } from './auth.service';
import { LoginRateLimitedException } from './login-throttle.service';

jest.mock('./password.util', () => ({
  ...jest.requireActual('./password.util'),
  verifyPassword: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyPassword } = require('./password.util');

function loginThrottleStub() {
  return { consume: jest.fn().mockResolvedValue(undefined), reset: jest.fn().mockResolvedValue(undefined) };
}

/**
 * WO-165.6 (165-cross-tenant-marketplace-directory.md §3, piece one): the
 * `SsoConnection.enforceSso` guard clause on the password login route.
 * Password verification is stubbed — bcrypt itself is oidc.provider's and
 * password.util's own concern — so these tests isolate the enforcement
 * decision: who gets refused, who is exempt, and that a plain customer is
 * never affected.
 */
describe('AuthService.login — enforceSso (WO-165.6)', () => {
  let prisma: any;
  let service: AuthService;

  const STAFF_USER = {
    id: 'staff-1',
    email: 'staff@shop.test',
    phone: null,
    passwordHash: '$2b$stub',
    isActive: true,
    role: 'STAFF',
    firstName: 'S',
    lastName: 'T',
  };
  const CUSTOMER_USER = { ...STAFF_USER, id: 'cust-1', role: 'CUSTOMER' };
  const ENFORCING_ADMIN = { ...STAFF_USER, id: 'admin-1', role: 'ADMIN' };

  beforeEach(() => {
    verifyPassword.mockResolvedValue(true);
    prisma = {
      user: { findFirst: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
      ssoConnection: { findFirst: jest.fn() },
      refreshToken: { create: jest.fn() },
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue('token') };
    const config = { get: jest.fn().mockReturnValue('15m') };
    const permissions = { resolveForUser: jest.fn().mockResolvedValue({ roles: [], permissions: [] }) };
    service = new AuthService(
      prisma,
      jwt as any,
      config as any,
      {} as any,
      permissions as any,
      {} as any,
      loginThrottleStub() as any,
      {} as any,
    );
  });

  it('refuses password sign-in for a staff account once any active connection enforces SSO', async () => {
    prisma.user.findFirst.mockResolvedValue(STAFF_USER);
    prisma.ssoConnection.findFirst.mockResolvedValue({ label: 'Head office Workspace' });

    await expect(service.login('staff@shop.test', 'correct-password')).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('names the SSO connection in the refusal message, so the user knows which button to use', async () => {
    prisma.user.findFirst.mockResolvedValue(STAFF_USER);
    prisma.ssoConnection.findFirst.mockResolvedValue({ label: 'Head office Workspace' });

    await expect(service.login('staff@shop.test', 'correct-password')).rejects.toThrow(/Head office Workspace/);
  });

  it('exempts the admin who turned enforcement on, so they can never lock themselves out', async () => {
    prisma.user.findFirst.mockResolvedValue(ENFORCING_ADMIN);
    // The query itself excludes the enforcing admin's own id — modelled here
    // as the mock returning nothing for that actor.
    prisma.ssoConnection.findFirst.mockImplementation(({ where }: any) =>
      where.createdByUserId.not === ENFORCING_ADMIN.id ? Promise.resolve(null) : Promise.resolve({ label: 'x' }),
    );

    await expect(service.login('staff@shop.test', 'correct-password')).resolves.toMatchObject({ accessToken: 'token' });
  });

  it('never checks enforceSso for a plain customer account', async () => {
    prisma.user.findFirst.mockResolvedValue(CUSTOMER_USER);

    await expect(service.login('staff@shop.test', 'correct-password')).resolves.toMatchObject({ accessToken: 'token' });
    expect(prisma.ssoConnection.findFirst).not.toHaveBeenCalled();
  });

  it('signs a staff account in normally when no connection enforces SSO (byte-identical to today, doc 161\'s own acceptance)', async () => {
    prisma.user.findFirst.mockResolvedValue(STAFF_USER);
    prisma.ssoConnection.findFirst.mockResolvedValue(null);

    await expect(service.login('staff@shop.test', 'correct-password')).resolves.toMatchObject({ accessToken: 'token' });
  });
});

/**
 * WO-206.2 (206-rate-limiting-caching-compression-hardening.md §1.2): where
 * the per-account bucket sits in the password sign-in. The bucket's own
 * arithmetic runs against a real Redis in test/auth-throttle.e2e-spec.ts;
 * these pin the order of operations around it.
 */
describe('AuthService.login — per-account attempt bucket (WO-206.2)', () => {
  const CUSTOMER = {
    id: 'cust-1',
    email: 'ayesha@example.com',
    phone: null,
    passwordHash: '$2b$stub',
    isActive: true,
    role: 'CUSTOMER',
    firstName: 'A',
    lastName: 'K',
  };

  let prisma: any;
  let throttle: ReturnType<typeof loginThrottleStub>;
  let service: AuthService;

  beforeEach(() => {
    verifyPassword.mockReset();
    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(CUSTOMER), update: jest.fn() },
      ssoConnection: { findFirst: jest.fn() },
      refreshToken: { create: jest.fn() },
    };
    throttle = loginThrottleStub();
    service = new AuthService(
      prisma,
      { signAsync: jest.fn().mockResolvedValue('token') } as any,
      { get: jest.fn().mockReturnValue('15m') } as any,
      {} as any,
      { resolveForUser: jest.fn().mockResolvedValue({ roles: [], permissions: [] }) } as any,
      {} as any,
      throttle as any,
      {} as any,
    );
  });

  it('spends a token before anything else, passing the client IP along for the audit trail', async () => {
    verifyPassword.mockResolvedValue(true);

    await service.login('ayesha@example.com', 'right', { ip: '203.0.113.7' });

    expect(throttle.consume).toHaveBeenCalledWith('ayesha@example.com', { ip: '203.0.113.7' });
    expect(throttle.consume.mock.invocationCallOrder[0]).toBeLessThan(prisma.user.findFirst.mock.invocationCallOrder[0]);
  });

  it('a refused attempt (429) never reaches the account lookup or a password comparison', async () => {
    throttle.consume.mockRejectedValue(new LoginRateLimitedException(287));

    const refusal = service.login('ayesha@example.com', 'guess');

    await expect(refusal).rejects.toMatchObject({ retryAfterSeconds: 287 });
    await expect(refusal).rejects.toBeInstanceOf(LoginRateLimitedException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the bucket cannot be read — never an unlimited attempt', async () => {
    throttle.consume.mockRejectedValue(new ServiceUnavailableException('Sign-in is temporarily unavailable.'));

    await expect(service.login('ayesha@example.com', 'guess')).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('a correct password refills the bucket before the session is issued', async () => {
    verifyPassword.mockResolvedValue(true);

    await expect(service.login('ayesha@example.com', 'right')).resolves.toMatchObject({ accessToken: 'token' });

    expect(throttle.reset).toHaveBeenCalledWith('ayesha@example.com');
    expect(throttle.reset.mock.invocationCallOrder[0]).toBeLessThan(prisma.refreshToken.create.mock.invocationCallOrder[0]);
  });

  it('a wrong password leaves the spent token spent', async () => {
    verifyPassword.mockResolvedValue(false);

    await expect(service.login('ayesha@example.com', 'wrong')).rejects.toThrow(UnauthorizedException);
    expect(throttle.reset).not.toHaveBeenCalled();
  });

  it('an unknown account refills nothing either — its answer is the wrong-password answer', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    verifyPassword.mockResolvedValue(false);

    await expect(service.login('nobody@example.com', 'guess')).rejects.toThrow('Incorrect email/phone or password.');
    expect(throttle.reset).not.toHaveBeenCalled();
  });

  it('a sign-in starts a new refresh-token family of its own', async () => {
    verifyPassword.mockResolvedValue(true);

    await service.login('ayesha@example.com', 'right');

    const { data } = prisma.refreshToken.create.mock.calls[0][0];
    expect(data.familyId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

/**
 * WO-206.3 (doc 206 §2.2): refresh-token rotation with a 10-second grace
 * window and family revocation. RefreshToken is an in-memory table here so
 * each test states behaviour — which tokens are live afterwards — rather than
 * which Prisma calls were made; the real JwtService signs, so "the same
 * token pair" is checked byte for byte. Real concurrency against Postgres is
 * test/auth-throttle.e2e-spec.ts's.
 */
describe('AuthService.refresh — rotation, grace window, reuse detection (WO-206.3)', () => {
  const T0 = new Date('2026-09-28T10:00:00.000Z').getTime();
  const USER = {
    id: 'user-1',
    email: 'ayesha@example.com',
    phone: null,
    passwordHash: '$2b$stub',
    isActive: true,
    role: 'CUSTOMER',
    firstName: 'A',
    lastName: 'K',
  };
  const CONFIG: Record<string, string> = {
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'r'.repeat(40),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
  };

  interface Row {
    id: string;
    userId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
    revokedAt: Date | null;
    rotatedAt: Date | null;
    replacedById: string | null;
  }

  let rows: Map<string, Row>;
  let prisma: any;
  let audit: { record: jest.Mock };
  let service: AuthService;
  let sequence: number;

  const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value);
  const withUser = (row: Row | undefined) => (row ? { ...row, user: USER } : null);
  const liveTokens = () => [...rows.values()].filter((row) => row.revokedAt === null);

  function seedToken(plaintext: string, familyId: string): Row {
    const row: Row = {
      id: `rt-${++sequence}`,
      userId: USER.id,
      tokenHash: sha256(plaintext),
      familyId,
      expiresAt: new Date(T0 + parseDuration('30d')),
      revokedAt: null,
      rotatedAt: null,
      replacedById: null,
    };
    rows.set(row.id, row);
    return row;
  }

  beforeEach(() => {
    jest.useFakeTimers({
      now: T0,
      // Only the clock: jsonwebtoken and the promise chain need real ticks.
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'hrtime', 'performance'],
    });
    rows = new Map();
    sequence = 0;
    const table = {
      findUnique: jest.fn(async ({ where }: any) =>
        withUser(where.id ? rows.get(where.id) : [...rows.values()].find((row) => row.tokenHash === where.tokenHash)),
      ),
      create: jest.fn(async ({ data }: any) => {
        const row: Row = { id: `rt-${++sequence}`, revokedAt: null, rotatedAt: null, replacedById: null, ...data };
        rows.set(row.id, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => Object.assign(rows.get(where.id)!, data)),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = [...rows.values()].filter((row) => matches(row, where));
        hit.forEach((row) => Object.assign(row, data));
        return { count: hit.length };
      }),
    };
    prisma = { refreshToken: table };
    // pg_advisory_xact_lock — a no-op here; the lock's serialisation needs a
    // real Postgres (test/auth-throttle.e2e-spec.ts).
    prisma.$executeRaw = jest.fn().mockResolvedValue(1);
    prisma.$transaction = jest.fn(async (work: (tx: any) => Promise<unknown>) => work(prisma));
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new AuthService(
      prisma,
      new JwtService({}),
      { get: (key: string) => CONFIG[key] } as any,
      {} as any,
      { resolveForUser: jest.fn().mockResolvedValue({ roles: ['Customer'], permissions: [] }) } as any,
      {} as any,
      loginThrottleStub() as any,
      audit as any,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('rotates: spends the presented token and issues its successor in the same family', async () => {
    const first = seedToken('token-zero', 'family-1');

    const result = await service.refresh('token-zero');

    expect(result.refreshToken).not.toBe('token-zero');
    const successor = [...rows.values()].find((row) => row.tokenHash === sha256(result.refreshToken))!;
    expect(successor).toMatchObject({ familyId: 'family-1', revokedAt: null, rotatedAt: null });
    expect(rows.get(first.id)).toMatchObject({ rotatedAt: new Date(T0), revokedAt: new Date(T0), replacedById: successor.id });
    expect(liveTokens()).toEqual([successor]);
  });

  it('a replay inside the window gets back byte-for-byte the pair the first rotation issued, and mints nothing', async () => {
    seedToken('token-zero', 'family-1');
    const first = await service.refresh('token-zero');
    const rowCount = rows.size;

    jest.setSystemTime(T0 + 3_000);
    const replay = await service.refresh('token-zero');

    expect(replay.refreshToken).toBe(first.refreshToken);
    expect(replay.accessToken).toBe(first.accessToken);
    expect(rows.size).toBe(rowCount);
    expect(liveTokens()).toHaveLength(1);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('boundary: exactly 10 000 ms after rotation is still a race; 1 ms later is reuse', async () => {
    seedToken('token-zero', 'family-1');
    const first = await service.refresh('token-zero');

    jest.setSystemTime(T0 + REFRESH_REUSE_GRACE_MS);
    await expect(service.refresh('token-zero')).resolves.toMatchObject({ refreshToken: first.refreshToken });

    jest.setSystemTime(T0 + REFRESH_REUSE_GRACE_MS + 1);
    await expect(service.refresh('token-zero')).rejects.toThrow(UnauthorizedException);
    expect(liveTokens()).toHaveLength(0);
  });

  it('reuse outside the window revokes the whole family — the legitimately rotated head too — and audits it once', async () => {
    seedToken('token-zero', 'family-1');
    const otherDevice = seedToken('other-device', 'family-2');
    const stolenLater = await service.refresh('token-zero');
    jest.setSystemTime(T0 + 60_000);
    const head = await service.refresh(stolenLater.refreshToken);

    jest.setSystemTime(T0 + 15 * 60_000);
    await expect(service.refresh('token-zero', { ip: '198.51.100.23' })).rejects.toThrow(UnauthorizedException);

    expect(liveTokens()).toEqual([otherDevice]);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith({
      actorId: null,
      action: REFRESH_REUSE_DETECTED_AUDIT_ACTION,
      entity: 'User',
      entityId: USER.id,
      data: expect.objectContaining({ familyId: 'family-1', secondsSinceRotation: 900, tokensRevoked: 1 }),
      ip: '198.51.100.23',
    });

    // The head it killed is simply signed out now — revoked, never rotated,
    // so presenting it is no second reuse and writes no second row.
    await expect(service.refresh(head.refreshToken)).rejects.toThrow(UnauthorizedException);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('inside the window, a successor that was since signed out is not handed back — and that is no reuse', async () => {
    seedToken('token-zero', 'family-1');
    const first = await service.refresh('token-zero');
    await service.logout(first.refreshToken);

    jest.setSystemTime(T0 + 2_000);
    await expect(service.refresh('token-zero')).rejects.toThrow(UnauthorizedException);

    expect(audit.record).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ familyId: 'family-1' }) }));
  });

  it('a token revoked by logout, a password change, or before WO-206.3 (never rotated) is refused as before, never taken for reuse', async () => {
    const legacy = seedToken('legacy-token', 'legacy-family');
    legacy.revokedAt = new Date(T0 - 86_400_000);

    await expect(service.refresh('legacy-token')).rejects.toThrow('Your session has expired');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('two requests racing with one token: the loser is answered with the winner\'s pair, and nobody is signed out', async () => {
    seedToken('token-zero', 'family-1');
    let winner: Awaited<ReturnType<AuthService['refresh']>> | undefined;
    const realTransaction = prisma.$transaction;
    prisma.$transaction = jest.fn(async (work: (tx: any) => Promise<unknown>) => {
      if (!winner) {
        // The other request commits its rotation after this one passed its
        // checks but before it took the row lock.
        prisma.$transaction = realTransaction;
        winner = await service.refresh('token-zero');
      }
      return realTransaction(work);
    });

    const loser = await service.refresh('token-zero');

    expect(loser.refreshToken).toBe(winner!.refreshToken);
    expect(loser.accessToken).toBe(winner!.accessToken);
    expect(liveTokens()).toHaveLength(1);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('refuses an unknown token', async () => {
    await expect(service.refresh('never-issued')).rejects.toThrow(UnauthorizedException);
  });

  it('rotation and family revocation both take the family\'s lock before writing, so neither can miss the other', async () => {
    seedToken('token-zero', 'family-1');
    const lockedFamilies = () =>
      prisma.$executeRaw.mock.calls.map(([sql, ...values]: [TemplateStringsArray, ...unknown[]]) => ({
        sql: sql.join('?'),
        family: values[1],
      }));

    await service.refresh('token-zero');
    jest.setSystemTime(T0 + 60_000);
    await service.refresh('token-zero').catch(() => undefined);

    expect(lockedFamilies()).toEqual([
      { sql: expect.stringContaining('pg_advisory_xact_lock'), family: 'family-1' },
      { sql: expect.stringContaining('pg_advisory_xact_lock'), family: 'family-1' },
    ]);
    // Each lock is the first statement of its transaction.
    const firstWrite = Math.min(...prisma.refreshToken.updateMany.mock.invocationCallOrder);
    expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(firstWrite);
  });

  describe('singleUse — the single sign-on handoff redeems once (161-sso-identity-federation.md)', () => {
    it('a second redemption inside the window is refused, not replayed — and not taken for theft', async () => {
      seedToken('handoff-token', 'family-sso');
      const first = await service.refresh('handoff-token', {}, { singleUse: true });

      jest.setSystemTime(T0 + 2_000);
      await expect(service.refresh('handoff-token', {}, { singleUse: true })).rejects.toThrow(UnauthorizedException);

      expect(liveTokens().map((row) => row.tokenHash)).toEqual([sha256(first.refreshToken)]);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('a redemption after the window is reuse like any other: family revoked, audited', async () => {
      seedToken('handoff-token', 'family-sso');
      await service.refresh('handoff-token', {}, { singleUse: true });

      jest.setSystemTime(T0 + 60_000);
      await expect(service.refresh('handoff-token', {}, { singleUse: true })).rejects.toThrow(UnauthorizedException);

      expect(liveTokens()).toHaveLength(0);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: REFRESH_REUSE_DETECTED_AUDIT_ACTION }));
    });

    it('two redemptions racing: exactly one session is issued', async () => {
      seedToken('handoff-token', 'family-sso');
      let winner: Awaited<ReturnType<AuthService['refresh']>> | undefined;
      const realTransaction = prisma.$transaction;
      prisma.$transaction = jest.fn(async (work: (tx: any) => Promise<unknown>) => {
        if (!winner) {
          prisma.$transaction = realTransaction;
          winner = await service.refresh('handoff-token', {}, { singleUse: true });
        }
        return realTransaction(work);
      });

      await expect(service.refresh('handoff-token', {}, { singleUse: true })).rejects.toThrow(UnauthorizedException);

      expect(winner).toBeDefined();
      expect(liveTokens()).toHaveLength(1);
    });
  });
});

describe('parseDuration', () => {
  it.each([
    ['30s', 30_000],
    ['15m', 900_000],
    ['24h', 86_400_000],
    ['30d', 2_592_000_000],
  ])('parses %s', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseDuration(' 15m ')).toBe(900_000);
  });

  it('throws on a form it cannot parse, rather than silently returning NaN', () => {
    // A silent NaN here would create refresh tokens that expire at the epoch.
    expect(() => parseDuration('15 minutes')).toThrow(/Cannot parse duration/);
    expect(() => parseDuration('')).toThrow();
    expect(() => parseDuration('m15')).toThrow();
  });
});
