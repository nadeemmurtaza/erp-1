import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PERMISSIONS_L1_MAX_ENTRIES,
  PERMISSIONS_L1_TTL_MS,
  PERMISSIONS_L2_TTL_MS,
  PermissionsResolverService,
} from './permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('PermissionsResolverService.resolveForUser', () => {
  let service: PermissionsResolverService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      userRoleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      orgUnitGrant: { findMany: jest.fn().mockResolvedValue([]) },
      userPermission: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsResolverService,
        { provide: PrismaService, useValue: prisma },
        // The shared L2 is test/permissions-cache.e2e-spec.ts's, against a real
        // Redis; here Redis reads as not connected, so only L1 is in play.
        { provide: RedisService, useValue: { isReady: () => false } },
      ],
    }).compile();

    service = module.get<PermissionsResolverService>(PermissionsResolverService);
  });

  afterEach(() => jest.restoreAllMocks());

  const roleAssignment = (name: string, permissionKeys: string[]) => ({
    role: { name, grants: permissionKeys.map((key) => ({ permission: { key } })) },
  });
  /** A currently-valid grant, as the real query returns it: keys and expiry. */
  const orgUnitGrant = (permissionKeys: string[], expiresAt = new Date(Date.now() + 86_400_000)) => ({
    permissionKeys,
    expiresAt,
  });

  it('is empty for a user with no role and no overrides', async () => {
    const result = await service.resolveForUser('u1');
    expect(result).toEqual({ roles: [], permissions: [] });
  });

  it('returns one role’s own grants', async () => {
    prisma.userRoleAssignment.findMany.mockResolvedValue([roleAssignment('Admin', ['a', 'b'])]);

    const result = await service.resolveForUser('u1');

    expect(result.roles).toEqual(['Admin']);
    expect(result.permissions.sort()).toEqual(['a', 'b']);
  });

  it('unions permissions across several held roles', async () => {
    prisma.userRoleAssignment.findMany.mockResolvedValue([
      roleAssignment('Bookkeeper', ['accounting.view']),
      roleAssignment('Branch Lead', ['orders.manage', 'accounting.view']),
    ]);

    const result = await service.resolveForUser('u1');

    expect(result.roles.sort()).toEqual(['Bookkeeper', 'Branch Lead']);
    expect(result.permissions.sort()).toEqual(['accounting.view', 'orders.manage']);
  });

  it('a personal GRANT override adds a permission no held role has', async () => {
    prisma.userRoleAssignment.findMany.mockResolvedValue([roleAssignment('Tailor', ['stitching.jobs.view_queue'])]);
    prisma.userPermission.findMany.mockResolvedValue([{ effect: 'GRANT', permission: { key: 'orders.manage' } }]);

    const result = await service.resolveForUser('u1');

    expect(result.permissions.sort()).toEqual(['orders.manage', 'stitching.jobs.view_queue']);
  });

  it('a personal REVOKE override takes away a permission a held role grants', async () => {
    prisma.userRoleAssignment.findMany.mockResolvedValue([roleAssignment('Admin', ['a', 'b'])]);
    prisma.userPermission.findMany.mockResolvedValue([{ effect: 'REVOKE', permission: { key: 'b' } }]);

    const result = await service.resolveForUser('u1');

    expect(result.permissions).toEqual(['a']);
  });

  it('applies overrides on top of the union of every role, not just one', async () => {
    prisma.userRoleAssignment.findMany.mockResolvedValue([
      roleAssignment('Role A', ['x']),
      roleAssignment('Role B', ['y']),
    ]);
    prisma.userPermission.findMany.mockResolvedValue([
      { effect: 'REVOKE', permission: { key: 'y' } },
      { effect: 'GRANT', permission: { key: 'z' } },
    ]);

    const result = await service.resolveForUser('u1');

    expect(result.permissions.sort()).toEqual(['x', 'z']);
  });

  // access-control-identity/21-access-over-the-org-tree.md — a currently-
  // valid OrgUnitGrant can hand a key no held role gives, and only the
  // query's own `revokedAt`/`expiresAt` predicate decides "currently valid"
  // (the resolver trusts the predicate, not a client-supplied filter).
  describe('explicit OrgUnitGrant keys (doc 21)', () => {
    it('a valid grant adds a key no held role has', async () => {
      prisma.userRoleAssignment.findMany.mockResolvedValue([roleAssignment('Auditor', ['analytics.view'])]);
      prisma.orgUnitGrant.findMany.mockResolvedValue([orgUnitGrant(['hr.people.view'])]);

      const result = await service.resolveForUser('u1');

      expect(result.permissions.sort()).toEqual(['analytics.view', 'hr.people.view']);
    });

    it('unions keys across several valid grants', async () => {
      prisma.orgUnitGrant.findMany.mockResolvedValue([
        orgUnitGrant(['hr.people.view']),
        orgUnitGrant(['org.structure.view', 'hr.people.view']),
      ]);

      const result = await service.resolveForUser('u1');

      expect(result.permissions.sort()).toEqual(['hr.people.view', 'org.structure.view']);
    });

    it('a personal REVOKE removes a grant-derived key too — DENY wins last and unconditionally', async () => {
      prisma.orgUnitGrant.findMany.mockResolvedValue([orgUnitGrant(['hr.people.view'])]);
      prisma.userPermission.findMany.mockResolvedValue([{ effect: 'REVOKE', permission: { key: 'hr.people.view' } }]);

      const result = await service.resolveForUser('u1');

      expect(result.permissions).toEqual([]);
    });

    it('only reads grants for the requested user — the query itself is the isolation, proven by the call args', async () => {
      await service.resolveForUser('u1');

      expect(prisma.orgUnitGrant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', revokedAt: null }) }),
      );
    });

    it('reads each grant\'s expiry with its keys — the cache needs to know when the set stops being true', async () => {
      await service.resolveForUser('u1');

      expect(prisma.orgUnitGrant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: { permissionKeys: true, expiresAt: true } }),
      );
    });
  });

  // 208-l1-l2-l3-caching-architecture.md §2 (WO-208.2, WO-208.5) — the L1
  // half, with Redis not connected. The L2 half and more than one replica are
  // test/permissions-cache.e2e-spec.ts's.
  describe('resolveForUserCached — L1 (doc 208 §2)', () => {
    const T0 = 1_800_000_000_000;
    let now: number;
    const queries = () =>
      prisma.userRoleAssignment.findMany.mock.calls.length +
      prisma.orgUnitGrant.findMany.mock.calls.length +
      prisma.userPermission.findMany.mock.calls.length;

    beforeEach(() => {
      now = T0;
      jest.spyOn(Date, 'now').mockImplementation(() => now);
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      prisma.userRoleAssignment.findMany.mockResolvedValue([roleAssignment('Branch Lead', ['orders.manage'])]);
    });

    it('pins doc 208\'s parameters: L1 10 s capped at 10,000 users, L2 60 s', () => {
      expect([PERMISSIONS_L1_TTL_MS, PERMISSIONS_L1_MAX_ENTRIES, PERMISSIONS_L2_TTL_MS]).toEqual([10_000, 10_000, 60_000]);
    });

    it('a second request within 10 s issues zero database queries — doc 208\'s acceptance', async () => {
      const first = await service.resolveForUserCached('u1');
      expect(queries()).toBe(3);

      now = T0 + PERMISSIONS_L1_TTL_MS - 1;
      const second = await service.resolveForUserCached('u1');

      expect(queries()).toBe(3);
      expect(second).toEqual(first);
      expect(second).toEqual({ roles: ['Branch Lead'], permissions: ['orders.manage'] });
    });

    it('re-reads the database once 10 s have passed — a change no write site saw shows within the TTL', async () => {
      await service.resolveForUserCached('u1');
      prisma.userRoleAssignment.findMany.mockResolvedValue([]);

      now = T0 + PERMISSIONS_L1_TTL_MS;
      const after = await service.resolveForUserCached('u1');

      expect(queries()).toBe(6);
      expect(after.permissions).toEqual([]);
    });

    it('invalidate(userId) makes that user\'s very next request re-read, and no one else\'s', async () => {
      await service.resolveForUserCached('u1');
      await service.resolveForUserCached('u2');
      prisma.userRoleAssignment.findMany.mockResolvedValue([]);

      await service.invalidate('u1');

      expect((await service.resolveForUserCached('u1')).permissions).toEqual([]);
      expect((await service.resolveForUserCached('u2')).permissions).toEqual(['orders.manage']);
      expect(queries()).toBe(9);
    });

    it('invalidateAll() makes every user\'s next request re-read — a role edit changes every holder', async () => {
      await service.resolveForUserCached('u1');
      await service.resolveForUserCached('u2');
      prisma.userRoleAssignment.findMany.mockResolvedValue([]);

      await service.invalidateAll();

      expect((await service.resolveForUserCached('u1')).permissions).toEqual([]);
      expect((await service.resolveForUserCached('u2')).permissions).toEqual([]);
    });

    it('a time-boxed grant stops counting at its expiresAt, not up to 10 s later', async () => {
      prisma.orgUnitGrant.findMany.mockResolvedValue([orgUnitGrant(['hr.people.view'], new Date(T0 + 3_000))]);
      expect((await service.resolveForUserCached('u1')).permissions).toContain('hr.people.view');

      now = T0 + 2_999;
      await service.resolveForUserCached('u1');
      expect(queries()).toBe(3);

      // The query's own `expiresAt > now` drops it from here on.
      prisma.orgUnitGrant.findMany.mockResolvedValue([]);
      now = T0 + 3_000;
      expect((await service.resolveForUserCached('u1')).permissions).not.toContain('hr.people.view');
      expect(queries()).toBe(6);
    });

    it('holds at most 10,000 users per process — the least recently used goes first', async () => {
      for (let n = 0; n <= PERMISSIONS_L1_MAX_ENTRIES; n += 1) await service.resolveForUserCached(`user-${n}`);
      const loaded = queries();

      await service.resolveForUserCached(`user-${PERMISSIONS_L1_MAX_ENTRIES}`);
      expect(queries()).toBe(loaded);

      await service.resolveForUserCached('user-0');
      expect(queries()).toBe(loaded + 3);
    });

    it('gives every caller its own arrays — one request cannot change what the next is served', async () => {
      const first = await service.resolveForUserCached('u1');
      first.permissions.push('users.manage');
      first.roles.length = 0;

      expect(await service.resolveForUserCached('u1')).toEqual({ roles: ['Branch Lead'], permissions: ['orders.manage'] });
    });

    it('resolveForUser() stays uncached: it reads every time and never touches what the cached path serves', async () => {
      await service.resolveForUserCached('u1');
      prisma.userRoleAssignment.findMany.mockResolvedValue([]);

      expect((await service.resolveForUser('u1')).permissions).toEqual([]);
      expect((await service.resolveForUser('u1')).permissions).toEqual([]);
      expect(queries()).toBe(9);
      // Within its 10 s the cached path still serves what it read — the stated bound, nothing wider.
      expect((await service.resolveForUserCached('u1')).permissions).toEqual(['orders.manage']);
    });
  });

  describe('usersWithPermission — the inverse batch query', () => {
    it('returns [] with no user lookup at all when nobody holds it', async () => {
      const result = await service.usersWithPermission('inventory.manage');

      expect(result).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('returns every user whose role grants the key', async () => {
      prisma.userRoleAssignment.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', email: 'a@example.com', firstName: 'A', lastName: 'One' },
        { id: 'u2', email: 'b@example.com', firstName: 'B', lastName: 'Two' },
      ]);

      const result = await service.usersWithPermission('inventory.manage');

      expect(result.map((u) => u.id).sort()).toEqual(['u1', 'u2']);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: expect.arrayContaining(['u1', 'u2']) } } }),
      );
    });

    it('a personal GRANT override adds a user no role gives it to', async () => {
      prisma.userRoleAssignment.findMany.mockResolvedValue([]);
      prisma.userPermission.findMany.mockResolvedValue([{ userId: 'u3', effect: 'GRANT' }]);
      prisma.user.findMany.mockResolvedValue([{ id: 'u3', email: 'c@example.com', firstName: 'C', lastName: null }]);

      const result = await service.usersWithPermission('inventory.recall');

      expect(result.map((u) => u.id)).toEqual(['u3']);
    });

    it('a personal REVOKE removes a role-derived holder — DENY wins unconditionally', async () => {
      prisma.userRoleAssignment.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
      prisma.userPermission.findMany.mockResolvedValue([{ userId: 'u2', effect: 'REVOKE' }]);
      prisma.user.findMany.mockResolvedValue([{ id: 'u1', email: 'a@example.com', firstName: 'A', lastName: 'One' }]);

      const result = await service.usersWithPermission('inventory.manage');

      expect(result.map((u) => u.id)).toEqual(['u1']);
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['u1'] } } }));
    });
  });
});
