import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { API_KEY_MAX_ACTIVE_PER_SURFACE, API_KEY_MAX_LIFETIME_DAYS } from '@newax/shared';
import { AuditService } from '../../audit/audit.service';
import { DomainEvent } from '../../events/domain-events';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';
import { hashApiKey } from '../../security/api-token';
import type { AuthenticatedUser } from '../auth.constants';
import { PermissionsResolverService } from '../permissions.service';
import { ApiKeysService } from './api-keys.service';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let prisma: any;
  let audit: any;
  let events: any;
  let permissions: any;

  const session: AuthenticatedUser = {
    id: 'owner-1',
    roles: ['Staff'],
    permissions: ['orders.manage', 'catalog.manage', 'users.manage'],
    email: 'sana@example.com',
    phone: null,
  };
  const viaKey: AuthenticatedUser = {
    ...session,
    roles: [],
    apiKey: { id: 'key-9', surface: 'ADMIN', customerScopes: [] },
  };

  const future = new Date(Date.now() + 30 * 86_400_000);
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: 'key-1',
    userId: session.id,
    name: 'Order export',
    surface: 'ADMIN',
    lastFour: 'AbCd',
    permissionKeys: ['orders.manage'],
    customerScopes: [],
    createdAt: new Date('2026-09-01T00:00:00Z'),
    lastUsedAt: null,
    expiresAt: future,
    rotatedAt: null,
    revokedAt: null,
    revokedReason: null,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      apiKey: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(async ({ data }: any) => row({ ...data, id: 'key-new' })),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        updateManyAndReturn: jest.fn(),
      },
    };
    // Both $transaction shapes: a batch of queries, or an interactive callback
    // handed the same client as its `tx`.
    prisma.$transaction = jest.fn(async (work: unknown) =>
      Array.isArray(work) ? Promise.all(work) : (work as (tx: unknown) => unknown)(prisma),
    );
    audit = { recordEvidence: jest.fn().mockResolvedValue(undefined) };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    permissions = {
      resolveForUser: jest.fn().mockResolvedValue({ roles: ['Staff'], permissions: session.permissions }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: EventBusService, useValue: events },
        { provide: PermissionsResolverService, useValue: permissions },
      ],
    }).compile();

    service = module.get(ApiKeysService);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  const adminInput = (overrides: Record<string, unknown> = {}) => ({
    surface: 'ADMIN' as const,
    name: 'Order export',
    permissionKeys: ['orders.manage'],
    expiresInDays: 90,
    ...overrides,
  });

  describe('create', () => {
    it('returns the secret once, prefixed by surface, and stores only its hash and last four', async () => {
      const issued = await service.create(session, adminInput());

      expect(issued.secret).toMatch(/^nxa_[A-Za-z0-9_-]{43}$/);
      const data = prisma.apiKey.create.mock.calls[0][0].data;
      expect(data.keyHash).toBe(hashApiKey(issued.secret));
      expect(data.lastFour).toBe(issued.secret.slice(-4));
      expect(JSON.stringify(prisma.apiKey.create.mock.calls[0][0])).not.toContain(issued.secret);
      expect(issued.key).not.toHaveProperty('keyHash');
      expect(issued.key.effectiveScopes).toEqual(['orders.manage']);
    });

    it('gives a storefront key the nxs_ prefix and its scopes, and no admin permission', async () => {
      const issued = await service.create(session, {
        surface: 'STOREFRONT',
        name: 'Shipping helper',
        customerScopes: ['addresses:write', 'orders:read'],
        expiresInDays: 30,
      });

      expect(issued.secret.startsWith('nxs_')).toBe(true);
      expect(prisma.apiKey.create.mock.calls[0][0].data).toMatchObject({
        permissionKeys: [],
        customerScopes: ['addresses:write', 'orders:read'],
      });
      // A storefront key is capped by the account being active, not by roles.
      expect(permissions.resolveForUser).not.toHaveBeenCalled();
    });

    it('writes the audit row and the security notice inside the create transaction', async () => {
      await service.create(session, adminInput());

      expect(audit.recordEvidence).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: 'api_key.created', entity: 'ApiKey', entityId: 'key-new', actorId: session.id }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        DomainEvent.ApiKeyIssued,
        expect.objectContaining({ userId: session.id, apiKeyId: 'key-new', surface: 'ADMIN', reason: 'CREATED' }),
        prisma,
      );
      // The mail's payload carries no secret and no key name.
      const payload = events.publish.mock.calls[0][1];
      expect(payload).not.toHaveProperty('name');
      expect(Object.keys(payload).sort()).toEqual(['apiKeyId', 'lastFour', 'reason', 'surface', 'userId']);
    });

    it('fails the whole create when the audit write fails — evidence class', async () => {
      audit.recordEvidence.mockRejectedValueOnce(new Error('audit down'));
      await expect(service.create(session, adminInput())).rejects.toThrow('audit down');
    });

    describe('refuses what a key may never carry', () => {
      it('a non-delegatable permission, even one its owner holds, naming why', async () => {
        await expect(service.create(session, adminInput({ permissionKeys: ['users.manage'] }))).rejects.toThrow(
          /"users\.manage" can never be put in an API key/,
        );
        expect(prisma.apiKey.create).not.toHaveBeenCalled();
      });

      it('a permission the owner does not hold right now', async () => {
        await expect(service.create(session, adminInput({ permissionKeys: ['finance.manage'] }))).rejects.toThrow(
          'You do not hold "finance.manage"',
        );
      });

      it('checks what the owner holds now, not what the caller claims', async () => {
        permissions.resolveForUser.mockResolvedValue({ roles: [], permissions: [] });
        await expect(service.create(session, adminInput())).rejects.toBeInstanceOf(BadRequestException);
      });

      it('an unknown permission', async () => {
        await expect(service.create(session, adminInput({ permissionKeys: ['orders.nuke'] }))).rejects.toThrow(
          '"orders.nuke" is not a permission.',
        );
      });

      it('a key with no scope at all', async () => {
        await expect(service.create(session, adminInput({ permissionKeys: [] }))).rejects.toThrow(
          'Choose at least one permission',
        );
      });

      it('the other surface’s catalogue — an admin key with storefront scopes, and the reverse', async () => {
        await expect(service.create(session, adminInput({ customerScopes: ['orders:read'] }))).rejects.toBeInstanceOf(
          BadRequestException,
        );
        await expect(
          service.create(session, {
            surface: 'STOREFRONT',
            name: 'x',
            permissionKeys: ['orders.manage'],
            customerScopes: ['orders:read'],
            expiresInDays: 30,
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('an unknown storefront scope', async () => {
        await expect(
          service.create(session, { surface: 'STOREFRONT', name: 'x', customerScopes: ['cart:write'], expiresInDays: 30 }),
        ).rejects.toThrow('Unknown storefront scope(s): cart:write.');
      });
    });

    it('refuses a lifetime outside 1 to the ceiling, and a blank name', async () => {
      await expect(service.create(session, adminInput({ expiresInDays: 0 }))).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.create(session, adminInput({ expiresInDays: API_KEY_MAX_LIFETIME_DAYS + 1 })),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create(session, adminInput({ name: '   ' }))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sets the expiry the chosen number of days out', async () => {
      const before = Date.now();
      await service.create(session, adminInput({ expiresInDays: 7 }));
      const expiresAt: Date = prisma.apiKey.create.mock.calls[0][0].data.expiresAt;
      expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(7 * 86_400_000 - 1_000);
      expect(expiresAt.getTime() - before).toBeLessThanOrEqual(7 * 86_400_000 + 1_000);
    });

    it('refuses a new key once the owner holds the maximum live keys on that surface', async () => {
      prisma.apiKey.count.mockResolvedValue(API_KEY_MAX_ACTIVE_PER_SURFACE);
      await expect(service.create(session, adminInput())).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.apiKey.create).not.toHaveBeenCalled();
    });

    it('refuses a request made with an API key — a key never manages keys', async () => {
      await expect(service.create(viaKey, adminInput())).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.apiKey.create).not.toHaveBeenCalled();
    });
  });

  describe('listMine — what each key can do right now', () => {
    it('shows live scopes and paused ones, and nothing for a revoked or expired key', async () => {
      prisma.apiKey.findMany.mockResolvedValue([
        row({ id: 'a', permissionKeys: ['orders.manage', 'finance.manage'] }),
        row({ id: 'b', revokedAt: new Date(), revokedReason: 'OWNER' }),
        row({ id: 'c', expiresAt: new Date(Date.now() - 1_000) }),
      ]);
      prisma.apiKey.count.mockResolvedValue(3);

      const page = await service.listMine(session, 'ADMIN', 1, 20);

      expect(page.data.map((key) => [key.id, key.status, key.effectiveScopes, key.pausedScopes])).toEqual([
        ['a', 'ACTIVE', ['orders.manage'], ['finance.manage']],
        ['b', 'REVOKED', [], []],
        ['c', 'EXPIRED', [], []],
      ]);
      expect(prisma.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: session.id, surface: 'ADMIN' }, skip: 0, take: 20 }),
      );
      expect(page.meta.total).toBe(3);
    });

    it('never selects the hash', async () => {
      await service.listMine(session, 'ADMIN', 1, 20);
      expect(prisma.apiKey.findMany.mock.calls[0][0].select).not.toHaveProperty('keyHash');
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.apiKey.findFirst.mockResolvedValue(row());
      prisma.apiKey.updateManyAndReturn.mockImplementation(async ({ data }: any) => [row(data)]);
    });

    it('re-validates new scopes exactly as create does', async () => {
      await expect(service.update(session, 'key-1', { permissionKeys: ['roles.manage_permissions'] })).rejects.toThrow(
        /can never be put in an API key/,
      );
      await expect(service.update(session, 'key-1', { permissionKeys: ['finance.manage'] })).rejects.toThrow(
        'You do not hold "finance.manage"',
      );
      expect(prisma.apiKey.updateManyAndReturn).not.toHaveBeenCalled();
    });

    it('lets a paused permission the key already carries stay on it, but never adds one', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(row({ permissionKeys: ['orders.manage', 'finance.manage'] }));

      await expect(
        service.update(session, 'key-1', { permissionKeys: ['orders.manage', 'finance.manage', 'catalog.manage'] }),
      ).resolves.toMatchObject({ pausedScopes: ['finance.manage'] });
      await expect(
        service.update(session, 'key-1', { permissionKeys: ['orders.manage', 'payroll.manage'] }),
      ).rejects.toThrow('You do not hold "payroll.manage"');
    });

    it('records the old and the new scopes, in the same transaction, predicated on the values it read', async () => {
      await service.update(session, 'key-1', { permissionKeys: ['orders.manage', 'catalog.manage'] });

      expect(prisma.apiKey.updateManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'key-1',
            userId: session.id,
            revokedAt: null,
            permissionKeys: { equals: ['orders.manage'] },
          }),
        }),
      );
      expect(audit.recordEvidence).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          action: 'api_key.scopes_changed',
          data: expect.objectContaining({
            from: expect.objectContaining({ permissionKeys: ['orders.manage'] }),
            to: expect.objectContaining({ permissionKeys: ['orders.manage', 'catalog.manage'] }),
          }),
        }),
      );
    });

    it('records a rename as a rename', async () => {
      await service.update(session, 'key-1', { name: 'Nightly export' });
      expect(audit.recordEvidence).toHaveBeenCalledWith(prisma, expect.objectContaining({ action: 'api_key.renamed' }));
    });

    it('refuses a revoked key, and a request with nothing to change', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(row({ revokedAt: new Date(), revokedReason: 'OWNER' }));
      await expect(service.update(session, 'key-1', { name: 'x' })).rejects.toBeInstanceOf(ConflictException);
      await expect(service.update(session, 'key-1', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('conflicts, and audits nothing, when a revoke or another edit lands first', async () => {
      prisma.apiKey.updateManyAndReturn.mockResolvedValue([]);
      await expect(service.update(session, 'key-1', { name: 'x' })).rejects.toBeInstanceOf(ConflictException);
      expect(audit.recordEvidence).not.toHaveBeenCalled();
    });

    it("answers someone else's key exactly like a missing one", async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);
      await expect(service.update(session, 'not-mine', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.apiKey.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'not-mine', userId: session.id } }));
    });
  });

  describe('rotate', () => {
    beforeEach(() => {
      prisma.apiKey.findFirst.mockResolvedValue({ ...row(), keyHash: 'old-hash' });
      prisma.apiKey.updateManyAndReturn.mockImplementation(async ({ data }: any) => [
        row({ lastFour: data.lastFour, expiresAt: data.expiresAt, rotatedAt: data.rotatedAt }),
      ]);
    });

    it('issues a new secret, replaces the hash it read, and never changes the scopes', async () => {
      const issued = await service.rotate(session, 'key-1', 30);

      const call = prisma.apiKey.updateManyAndReturn.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'key-1', userId: session.id, revokedAt: null, keyHash: 'old-hash' });
      expect(call.data.keyHash).toBe(hashApiKey(issued.secret));
      expect(call.data).not.toHaveProperty('permissionKeys');
      expect(call.data).not.toHaveProperty('customerScopes');
      expect(issued.key.permissionKeys).toEqual(['orders.manage']);
      expect(issued.key).not.toHaveProperty('keyHash');
    });

    it('audits old and new last-four, and sends the security notice, in the transaction', async () => {
      const issued = await service.rotate(session, 'key-1', 30);

      expect(audit.recordEvidence).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          action: 'api_key.rotated',
          data: expect.objectContaining({
            from: expect.objectContaining({ lastFour: 'AbCd' }),
            to: expect.objectContaining({ lastFour: issued.secret.slice(-4) }),
          }),
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        DomainEvent.ApiKeyIssued,
        expect.objectContaining({ reason: 'ROTATED', apiKeyId: 'key-1' }),
        prisma,
      );
    });

    it('renews an expired key, but never a revoked one', async () => {
      prisma.apiKey.findFirst.mockResolvedValue({ ...row({ expiresAt: new Date(Date.now() - 1_000) }), keyHash: 'h' });
      await expect(service.rotate(session, 'key-1', 30)).resolves.toMatchObject({ key: { status: 'ACTIVE' } });

      prisma.apiKey.findFirst.mockResolvedValue({ ...row({ revokedAt: new Date(), revokedReason: 'OWNER' }), keyHash: 'h' });
      await expect(service.rotate(session, 'key-1', 30)).rejects.toBeInstanceOf(ConflictException);
    });

    it('lets exactly one of two concurrent rotations win', async () => {
      prisma.apiKey.updateManyAndReturn.mockResolvedValueOnce([]);
      await expect(service.rotate(session, 'key-1', 30)).rejects.toBeInstanceOf(ConflictException);
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('revokes the owner’s key with an audit row in the same transaction', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(row());
      prisma.apiKey.updateManyAndReturn.mockImplementation(async ({ data }: any) => [row(data)]);

      const view = await service.revoke(session, 'key-1');

      expect(prisma.apiKey.updateManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'key-1', revokedAt: null },
          data: expect.objectContaining({ revokedReason: 'OWNER', revokedById: session.id }),
        }),
      );
      expect(audit.recordEvidence).toHaveBeenCalledWith(prisma, expect.objectContaining({ action: 'api_key.revoked' }));
      expect(view.status).toBe('REVOKED');
      expect(view.effectiveScopes).toEqual([]);
    });

    it('is idempotent — revoking a revoked key writes nothing', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(row({ revokedAt: new Date(), revokedReason: 'OWNER' }));

      await service.revoke(session, 'key-1');

      expect(prisma.apiKey.updateManyAndReturn).not.toHaveBeenCalled();
      expect(audit.recordEvidence).not.toHaveBeenCalled();
    });

    it('audits nothing when a concurrent revoke landed first', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(row());
      prisma.apiKey.updateManyAndReturn.mockResolvedValue([]);
      prisma.apiKey.findUniqueOrThrow.mockResolvedValue(row({ revokedAt: new Date(), revokedReason: 'OWNER' }));

      await expect(service.revoke(session, 'key-1')).resolves.toMatchObject({ status: 'REVOKED' });
      expect(audit.recordEvidence).not.toHaveBeenCalled();
    });

    it('refuses a request made with an API key', async () => {
      await expect(service.revoke(viaKey, 'key-1')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('oversight (users.manage)', () => {
    const owner = {
      id: 'customer-7',
      email: 'ayesha@example.com',
      phone: null,
      firstName: 'Ayesha',
      lastName: null,
      role: 'CUSTOMER',
      isActive: true,
    };

    it("revokes someone else's key as ADMINISTRATOR, and one's own as OWNER", async () => {
      prisma.apiKey.updateManyAndReturn.mockImplementation(async ({ data }: any) => [row(data)]);

      prisma.apiKey.findUnique.mockResolvedValue({ ...row({ userId: owner.id }), user: owner });
      await service.revokeAsAdministrator(session, 'key-1');
      expect(prisma.apiKey.updateManyAndReturn.mock.calls[0][0].data.revokedReason).toBe('ADMINISTRATOR');

      prisma.apiKey.findUnique.mockResolvedValue({ ...row(), user: { ...owner, id: session.id } });
      await service.revokeAsAdministrator(session, 'key-1');
      expect(prisma.apiKey.updateManyAndReturn.mock.calls[1][0].data.revokedReason).toBe('OWNER');
    });

    it('lists every account’s keys with their owner, filtered and paginated, never the hash', async () => {
      prisma.apiKey.findMany.mockResolvedValue([{ ...row(), user: owner }]);
      prisma.apiKey.count.mockResolvedValue(1);

      const page = await service.listAll(session, { surface: 'STOREFRONT', status: 'REVOKED', q: 'ayesha', page: 2, pageSize: 10 });

      const query = prisma.apiKey.findMany.mock.calls[0][0];
      expect(query.where).toMatchObject({ surface: 'STOREFRONT', revokedAt: { not: null } });
      expect(query.where.OR).toHaveLength(4);
      expect(query).toMatchObject({ skip: 10, take: 10 });
      expect(query.select).not.toHaveProperty('keyHash');
      expect(page.data[0].owner).toEqual(owner);
    });

    it("redacts a STOREFRONT key's owner PII — oversight is metadata only, never the customer's data (163-personal-api-keys.md §5)", async () => {
      prisma.apiKey.findMany.mockResolvedValue([{ ...row({ surface: 'STOREFRONT' }), user: owner }]);
      prisma.apiKey.count.mockResolvedValue(1);

      const page = await service.listAll(session, { page: 1, pageSize: 10 });

      expect(page.data[0].owner).toEqual({
        id: owner.id,
        email: null,
        phone: null,
        firstName: null,
        lastName: null,
        role: owner.role,
        isActive: owner.isActive,
      });
    });

    it("keeps an ADMIN key owner's directory details — they're back-office staff, not customer data", async () => {
      const staff = { ...owner, id: 'staff-1', role: 'STAFF' };
      prisma.apiKey.findMany.mockResolvedValue([{ ...row({ surface: 'ADMIN' }), user: staff }]);
      prisma.apiKey.count.mockResolvedValue(1);

      const page = await service.listAll(session, { page: 1, pageSize: 10 });

      expect(page.data[0].owner).toEqual(staff);
    });
  });

  describe('revokeAllForUserInTransaction — the deactivation path', () => {
    it('revokes every live key of the owner in one statement, and audits exactly those', async () => {
      prisma.apiKey.updateManyAndReturn.mockResolvedValue([
        { id: 'k1', surface: 'ADMIN', lastFour: 'aaaa' },
        { id: 'k2', surface: 'STOREFRONT', lastFour: 'bbbb' },
      ]);

      const count = await service.revokeAllForUserInTransaction(prisma, 'owner-1', 'admin-1', 'OWNER_DEACTIVATED');

      expect(count).toBe(2);
      expect(prisma.apiKey.updateManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'owner-1', revokedAt: null },
          data: expect.objectContaining({ revokedReason: 'OWNER_DEACTIVATED', revokedById: 'admin-1' }),
        }),
      );
      const entries = audit.recordEvidence.mock.calls[0][1];
      expect(entries.map((entry: any) => entry.entityId)).toEqual(['k1', 'k2']);
      expect(entries.every((entry: any) => entry.data.reason === 'OWNER_DEACTIVATED')).toBe(true);
    });

    it('is a no-op for an owner with no live keys', async () => {
      prisma.apiKey.updateManyAndReturn.mockResolvedValue([]);

      await expect(
        service.revokeAllForUserInTransaction(prisma, 'owner-1', 'admin-1', 'OWNER_DEACTIVATED'),
      ).resolves.toBe(0);
      expect(audit.recordEvidence).not.toHaveBeenCalled();
    });

    it("revokes with reason ADMINISTRATOR for a password reset — a reset that leaves a key isn't really a reset", async () => {
      prisma.apiKey.updateManyAndReturn.mockResolvedValue([{ id: 'k1', surface: 'ADMIN', lastFour: 'aaaa' }]);

      await service.revokeAllForUserInTransaction(prisma, 'owner-1', 'admin-1', 'ADMINISTRATOR');

      expect(prisma.apiKey.updateManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ revokedReason: 'ADMINISTRATOR' }) }),
      );
      const entries = audit.recordEvidence.mock.calls[0][1];
      expect(entries[0].data.reason).toBe('ADMINISTRATOR');
    });
  });
});
