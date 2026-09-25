import { HttpStatus, Logger, UnauthorizedException, type HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { hashApiKey } from '../../security/api-token';
import { PermissionsResolverService } from '../permissions.service';
import {
  API_KEY_FAILURE_LIMIT,
  API_KEY_FAILURE_WINDOW_MS,
  API_KEY_LAST_USED_RESOLUTION_MS,
  ApiKeyAuthService,
} from './api-key-auth.service';

describe('ApiKeyAuthService.authenticate', () => {
  let service: ApiKeyAuthService;
  let prisma: any;
  let permissions: any;

  const now = new Date('2026-09-25T12:00:00Z');
  const future = new Date('2026-12-01T00:00:00Z');
  const ADMIN_RAW = 'nxa_admin-secret-value-0001';
  const STORE_RAW = 'nxs_store-secret-value-0002';

  const owner = { id: 'owner-1', email: 'sana@example.com', phone: null, isActive: true };

  const adminRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'key-admin',
    userId: owner.id,
    surface: 'ADMIN',
    permissionKeys: ['orders.manage', 'catalog.manage'],
    customerScopes: [],
    expiresAt: future,
    revokedAt: null,
    lastUsedAt: null,
    user: owner,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      apiKey: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    permissions = {
      resolveForUser: jest.fn().mockResolvedValue({ roles: ['Staff'], permissions: ['orders.manage', 'catalog.manage'] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: PermissionsResolverService, useValue: permissions },
      ],
    }).compile();

    service = module.get(ApiKeyAuthService);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('looks the key up by its SHA-256 and acts as its owner, with no roles of its own', async () => {
    prisma.apiKey.findUnique.mockResolvedValue(adminRow());

    const principal = await service.authenticate(ADMIN_RAW, { now });

    expect(prisma.apiKey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { keyHash: hashApiKey(ADMIN_RAW) } }),
    );
    expect(principal).toEqual({
      id: owner.id,
      roles: [],
      permissions: ['orders.manage', 'catalog.manage'],
      email: owner.email,
      phone: null,
      apiKey: { id: 'key-admin', surface: 'ADMIN', customerScopes: [] },
    });
  });

  describe('a key never exceeds its owner', () => {
    it('keeps only the key’s permissions the owner still holds', async () => {
      prisma.apiKey.findUnique.mockResolvedValue(adminRow());
      permissions.resolveForUser.mockResolvedValue({ roles: [], permissions: ['orders.manage', 'finance.view'] });

      const principal = await service.authenticate(ADMIN_RAW, { now });

      expect(principal.permissions).toEqual(['orders.manage']);
    });

    it('re-resolves the owner on every request — a demotion shrinks the key on the very next one', async () => {
      prisma.apiKey.findUnique.mockResolvedValue(adminRow());

      const before = await service.authenticate(ADMIN_RAW, { now });
      permissions.resolveForUser.mockResolvedValue({ roles: [], permissions: [] });
      const after = await service.authenticate(ADMIN_RAW, { now });

      expect(before.permissions).toEqual(['orders.manage', 'catalog.manage']);
      expect(after.permissions).toEqual([]);
      expect(permissions.resolveForUser).toHaveBeenCalledTimes(2);
    });

    it('strips a non-delegatable permission even when the row carries it and the owner holds it', async () => {
      prisma.apiKey.findUnique.mockResolvedValue(adminRow({ permissionKeys: ['users.manage', 'orders.manage'] }));
      permissions.resolveForUser.mockResolvedValue({ roles: [], permissions: ['users.manage', 'orders.manage'] });

      const principal = await service.authenticate(ADMIN_RAW, { now });

      expect(principal.permissions).toEqual(['orders.manage']);
    });
  });

  it('gives a storefront key no admin permission and its scopes expanded, without resolving any role', async () => {
    prisma.apiKey.findUnique.mockResolvedValue(
      adminRow({ id: 'key-store', surface: 'STOREFRONT', permissionKeys: [], customerScopes: ['addresses:write'] }),
    );

    const principal = await service.authenticate(STORE_RAW, { now });

    expect(principal.permissions).toEqual([]);
    expect(principal.apiKey).toEqual({
      id: 'key-store',
      surface: 'STOREFRONT',
      customerScopes: ['addresses:read', 'addresses:write'],
    });
    expect(permissions.resolveForUser).not.toHaveBeenCalled();
  });

  describe('refusals — each a 401 that says why', () => {
    it('refuses a credential without a key prefix, without a lookup', async () => {
      await expect(service.authenticate('eyJhbGciOiJIUzI1NiJ9.e30.x', { now })).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.apiKey.findUnique).not.toHaveBeenCalled();
    });

    it('refuses a key it never issued', async () => {
      prisma.apiKey.findUnique.mockResolvedValue(null);
      await expect(service.authenticate(ADMIN_RAW, { now })).rejects.toThrow('This API key is not valid.');
    });

    it('refuses a key whose prefix disagrees with its stored surface', async () => {
      prisma.apiKey.findUnique.mockResolvedValue(adminRow({ surface: 'STOREFRONT' }));
      await expect(service.authenticate(ADMIN_RAW, { now })).rejects.toThrow('This API key is not valid.');
    });

    it('refuses a revoked key on its very next request — nothing is cached', async () => {
      prisma.apiKey.findUnique.mockResolvedValueOnce(adminRow());
      await service.authenticate(ADMIN_RAW, { now });

      prisma.apiKey.findUnique.mockResolvedValueOnce(adminRow({ revokedAt: now }));
      await expect(service.authenticate(ADMIN_RAW, { now })).rejects.toThrow('This API key has been revoked.');
    });

    it('refuses an expired key, at the exact expiry instant', async () => {
      prisma.apiKey.findUnique.mockResolvedValue(adminRow({ expiresAt: now }));
      await expect(service.authenticate(ADMIN_RAW, { now })).rejects.toThrow('This API key has expired.');
    });

    it('refuses a key whose owner has been deactivated, before resolving any permission', async () => {
      prisma.apiKey.findUnique.mockResolvedValue(adminRow({ user: { ...owner, isActive: false } }));

      await expect(service.authenticate(ADMIN_RAW, { now })).rejects.toThrow(
        'The account this API key belongs to is no longer active.',
      );
      expect(permissions.resolveForUser).not.toHaveBeenCalled();
    });

    it('never puts the raw key in a log line', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      prisma.apiKey.findUnique.mockResolvedValue(adminRow({ revokedAt: now }));

      await expect(service.authenticate(ADMIN_RAW, { now })).rejects.toBeInstanceOf(UnauthorizedException);

      for (const [message] of warn.mock.calls) {
        expect(String(message)).not.toContain(ADMIN_RAW);
      }
    });
  });

  describe('failed attempts — counted per address, because they never reach the global throttler', () => {
    const attacker = '203.0.113.9';

    async function failTimes(times: number, clientIp: string, at: Date = now): Promise<void> {
      for (let attempt = 0; attempt < times; attempt += 1) {
        await expect(service.authenticate(ADMIN_RAW, { clientIp, now: at })).rejects.toBeInstanceOf(UnauthorizedException);
      }
    }

    beforeEach(() => prisma.apiKey.findUnique.mockResolvedValue(null));

    it('refuses an address with a 429 and no lookup once it has failed too often', async () => {
      await failTimes(API_KEY_FAILURE_LIMIT, attacker);
      prisma.apiKey.findUnique.mockClear();

      const refusal = await service.authenticate(ADMIN_RAW, { clientIp: attacker, now }).catch((error: HttpException) => error);

      expect((refusal as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(prisma.apiKey.findUnique).not.toHaveBeenCalled();
    });

    it('leaves every other address alone', async () => {
      await failTimes(API_KEY_FAILURE_LIMIT, attacker);
      prisma.apiKey.findUnique.mockResolvedValue(adminRow());

      await expect(service.authenticate(ADMIN_RAW, { clientIp: '198.51.100.4', now })).resolves.toMatchObject({
        id: owner.id,
      });
    });

    it('lets the address try again once the window has passed', async () => {
      await failTimes(API_KEY_FAILURE_LIMIT, attacker);
      prisma.apiKey.findUnique.mockResolvedValue(adminRow());

      const later = new Date(now.getTime() + API_KEY_FAILURE_WINDOW_MS + 1);
      await expect(service.authenticate(ADMIN_RAW, { clientIp: attacker, now: later })).resolves.toMatchObject({
        id: owner.id,
      });
    });

    it('never counts a success — a busy integration is limited by the global throttler alone', async () => {
      prisma.apiKey.findUnique.mockResolvedValue(adminRow({ lastUsedAt: now }));
      for (let attempt = 0; attempt < API_KEY_FAILURE_LIMIT * 3; attempt += 1) {
        await service.authenticate(ADMIN_RAW, { clientIp: attacker, now });
      }
      await expect(service.authenticate(ADMIN_RAW, { clientIp: attacker, now })).resolves.toMatchObject({ id: owner.id });
    });

    it('counts revoked, expired and deactivated refusals too', async () => {
      prisma.apiKey.findUnique.mockResolvedValue(adminRow({ revokedAt: now }));
      await failTimes(API_KEY_FAILURE_LIMIT, attacker);

      await expect(service.authenticate(ADMIN_RAW, { clientIp: attacker, now })).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });
  });

  describe('lastUsedAt — operational, at most once a minute', () => {
    it('stamps a key that has never been used, guarded so a revoked row is never touched', async () => {
      prisma.apiKey.findUnique.mockResolvedValue(adminRow({ lastUsedAt: null }));

      await service.authenticate(ADMIN_RAW, { now });

      expect(prisma.apiKey.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: 'key-admin', revokedAt: null }),
        data: { lastUsedAt: now },
      });
    });

    it('does not write again within the resolution window', async () => {
      const recently = new Date(now.getTime() - API_KEY_LAST_USED_RESOLUTION_MS / 2);
      prisma.apiKey.findUnique.mockResolvedValue(adminRow({ lastUsedAt: recently }));

      await service.authenticate(ADMIN_RAW, { now });

      expect(prisma.apiKey.updateMany).not.toHaveBeenCalled();
    });

    it('never fails the request when the stamp cannot be written — it logs instead', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      prisma.apiKey.findUnique.mockResolvedValue(adminRow());
      prisma.apiKey.updateMany.mockRejectedValue(new Error('connection reset'));

      await expect(service.authenticate(ADMIN_RAW, { now })).resolves.toMatchObject({ id: owner.id });
      await new Promise((resolve) => setImmediate(resolve));

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('connection reset'));
    });
  });
});
