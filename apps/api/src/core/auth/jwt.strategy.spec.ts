import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

/**
 * Every request's second half of authentication: the account row is read
 * fresh, the permission set comes through the resolver's cache
 * (208-l1-l2-l3-caching-architecture.md §2 — the hot path doc 208 found).
 */
describe('JwtStrategy.validate', () => {
  let prisma: { user: { findUnique: jest.Mock } };
  let permissions: { resolveForUserCached: jest.Mock; resolveForUser: jest.Mock };
  let strategy: JwtStrategy;

  const payload = { sub: 'u1', email: 'staff@example.com', phone: null };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    permissions = {
      resolveForUserCached: jest.fn().mockResolvedValue({ roles: ['Branch Lead'], permissions: ['orders.manage'] }),
      resolveForUser: jest.fn(),
    };
    strategy = new JwtStrategy(
      { get: () => 'test-access-secret-at-least-32-characters-long' } as any,
      prisma as any,
      permissions as any,
    );
  });

  it('builds the principal from the cached permission set — never the uncached three-query read', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'staff@example.com', phone: null, isActive: true });

    await expect(strategy.validate(payload as any)).resolves.toEqual({
      id: 'u1',
      roles: ['Branch Lead'],
      permissions: ['orders.manage'],
      email: 'staff@example.com',
      phone: null,
    });
    expect(permissions.resolveForUserCached).toHaveBeenCalledWith('u1');
    expect(permissions.resolveForUser).not.toHaveBeenCalled();
  });

  it('reads the account itself fresh: a deactivated account is refused before any permission is resolved', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'staff@example.com', phone: null, isActive: false });

    await expect(strategy.validate(payload as any)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(permissions.resolveForUserCached).not.toHaveBeenCalled();
  });

  it('refuses a token whose account no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(strategy.validate(payload as any)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(permissions.resolveForUserCached).not.toHaveBeenCalled();
  });
});
