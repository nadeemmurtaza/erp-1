import { UnauthorizedException } from '@nestjs/common';
import { AuthService, parseDuration } from './auth.service';

jest.mock('./password.util', () => ({
  ...jest.requireActual('./password.util'),
  verifyPassword: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyPassword } = require('./password.util');

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
    service = new AuthService(prisma, jwt as any, config as any, {} as any, permissions as any, {} as any);
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
