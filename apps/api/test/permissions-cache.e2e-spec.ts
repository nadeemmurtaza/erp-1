import { Logger } from '@nestjs/common';
import { PERMISSIONS_L1_TTL_MS, PERMISSIONS_L2_TTL_MS, PermissionsResolverService } from '../src/core/auth/permissions.service';
import { RolesService } from '../src/core/auth/roles.service';
import { PrismaClient } from '../src/core/prisma/client';
import type { PrismaService } from '../src/core/prisma/prisma.service';
import { RedisService } from '../src/core/redis/redis.service';

/**
 * 208-l1-l2-l3-caching-architecture.md §2's acceptance, on the real Postgres
 * and Redis: an L1 hit issues no query, one replica's read answers another,
 * a revocation through the real write path (RolesService) is refused on the
 * revoking replica's very next request and on every other replica within its
 * 10 s L1 — not the 60 s L2 — a role edit reaches every holder with one
 * Redis write, and a time-boxed grant stops counting at its own expiry.
 *
 * Two replicas are two independent service graphs in one process — their own
 * Redis connections, their own L1 — over one database, as two API processes
 * are. Queries are counted by Prisma's own query events. Time is a frozen
 * clock moved by hand, except where the database itself judges an expiry.
 */
/** A client that reports every SQL statement it sends — how queries are counted here. */
const queryLoggingClient = () => new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });

describe('Permission resolution cached across replicas (doc 208 §2, e2e)', () => {
  const run = Date.now();
  const realNow = Date.now.bind(Date);
  const config = { get: () => process.env.REDIS_URL ?? 'redis://localhost:6379' } as any;
  const queries: string[] = [];
  let prisma: ReturnType<typeof queryLoggingClient>;
  let base: number;
  let offset: number;

  interface Replica {
    redis: RedisService;
    permissions: PermissionsResolverService;
    roles: RolesService;
  }
  let A: Replica;
  let B: Replica;

  let roleId: string;
  let u1: string;
  let u2: string;
  const both = ['catalog.manage', 'orders.manage'];

  function replica(): Replica {
    const redis = new RedisService(config);
    const permissions = new PermissionsResolverService(prisma as unknown as PrismaService, redis);
    return { redis, permissions, roles: new RolesService(prisma as unknown as PrismaService, permissions) };
  }

  const held = async (r: Replica, userId: string) => (await r.permissions.resolveForUserCached(userId)).permissions.sort();

  /** Every test starts with nothing cached for its users, anywhere. */
  async function fresh(): Promise<void> {
    for (const r of [A, B]) {
      for (const userId of [u1, u2]) await r.permissions.invalidate(userId);
    }
  }

  beforeAll(async () => {
    prisma = queryLoggingClient();
    prisma.$on('query', (event) => queries.push(event.query));
    await prisma.$connect();

    A = replica();
    B = replica();
    await Promise.all([A.redis.onModuleInit(), B.redis.onModuleInit()]);

    roleId = (
      await prisma.role.create({
        data: {
          name: `Permission cache e2e ${run}`,
          grants: { create: [{ permission: { connect: { key: 'orders.manage' } } }, { permission: { connect: { key: 'catalog.manage' } } }] },
        },
      })
    ).id;
    const holder = (n: number) =>
      prisma.user.create({ data: { email: `permission-cache-${n}-${run}@example.com`, role: 'STAFF', roleAssignments: { create: { roleId } } } });
    u1 = (await holder(1)).id;
    u2 = (await holder(2)).id;
  });

  beforeEach(async () => {
    base = realNow();
    offset = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => base + offset);
    await fresh();
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    const client = A.redis.client('cache');
    for (const userId of [u1, u2]) await client.del(`permissions:${userId}`, `permissions.version:${userId}`);
    await prisma.user.deleteMany({ where: { id: { in: [u1, u2] } } });
    await prisma.role.deleteMany({ where: { id: roleId } });
    await Promise.all([A.redis.onApplicationShutdown(), B.redis.onApplicationShutdown()]);
    await prisma.$disconnect();
  });

  it('answers a second request within 10 s from L1: zero database queries, not even a Redis read (doc 208 acceptance)', async () => {
    expect(await held(A, u1)).toEqual(both);
    const afterFirst = queries.length;
    expect(afterFirst).toBeGreaterThan(0);
    const mget = jest.spyOn(A.redis.client('cache'), 'mget');

    offset = PERMISSIONS_L1_TTL_MS - 1;
    expect(await held(A, u1)).toEqual(both);

    expect(queries.length).toBe(afterFirst);
    expect(mget).not.toHaveBeenCalled();
  });

  it('answers replica B\'s first request from the L2 entry replica A wrote — no database query — kept in db 1 for 60 s', async () => {
    await held(A, u1);
    const afterA = queries.length;

    expect(await held(B, u1)).toEqual(both);
    expect(queries.length).toBe(afterA);

    const ttl = await A.redis.client('cache').pttl(`permissions:${u1}`);
    expect(ttl).toBeGreaterThan(PERMISSIONS_L2_TTL_MS - 5_000);
    expect(ttl).toBeLessThanOrEqual(PERMISSIONS_L2_TTL_MS);
    expect(await A.redis.client('rateLimit').exists(`permissions:${u1}`)).toBe(0);
  });

  it('refuses a revocation made through RolesService on the revoking replica\'s very next request, and on another replica once its own 10 s L1 lapses (doc 208 acceptance)', async () => {
    await held(A, u1);
    await held(B, u1);

    await A.roles.unassign(u1, roleId);

    // The shared entry went synchronously with the write.
    expect(await A.redis.client('cache').exists(`permissions:${u1}`)).toBe(0);
    expect(await held(A, u1)).toEqual([]);
    // B still holds its own L1 copy — the stated, accepted bound (doc 208 §2): nothing pushes to it.
    expect(await held(B, u1)).toEqual(both);
    offset = PERMISSIONS_L1_TTL_MS - 1;
    expect(await held(B, u1)).toEqual(both);
    // 10 s, not the 60 s L2: the L2 entry it would fall back to is gone.
    offset = PERMISSIONS_L1_TTL_MS;
    expect(await held(B, u1)).toEqual([]);

    // A grant takes the same path back: at once on A, within 10 s on B.
    await A.roles.assign(u1, roleId);
    expect(await held(A, u1)).toEqual(both);
    offset = 2 * PERMISSIONS_L1_TTL_MS;
    expect(await held(B, u1)).toEqual(both);
  });

  it('reaches every holder of an edited role with one Redis write — no holder is looked up', async () => {
    for (const r of [A, B]) for (const userId of [u1, u2]) await held(r, userId);

    await A.roles.update(roleId, { permissions: ['catalog.manage'] });

    // Nothing deleted u2's entry; it is simply no longer valid under the new generation.
    expect(await A.redis.client('cache').exists(`permissions:${u2}`)).toBe(1);
    expect(await held(A, u1)).toEqual(['catalog.manage']);
    expect(await held(A, u2)).toEqual(['catalog.manage']);
    expect(await held(B, u2)).toEqual(both);
    offset = PERMISSIONS_L1_TTL_MS;
    expect(await held(B, u1)).toEqual(['catalog.manage']);
    expect(await held(B, u2)).toEqual(['catalog.manage']);

    await A.roles.update(roleId, { permissions: ['orders.manage', 'catalog.manage'] });
    expect(await held(A, u2)).toEqual(both);
  });

  it('bounds a change no write site saw — a raw SQL grant removal — by the L2 entry\'s 60 s, never 60 + 10', async () => {
    await held(A, u1);
    const grant = await prisma.roleGrant.findFirstOrThrow({ where: { roleId, permission: { key: 'orders.manage' } } });
    await prisma.roleGrant.delete({ where: { id: grant.id } });

    try {
      offset = 55_000;
      expect(await held(B, u1)).toEqual(both);
      offset = PERMISSIONS_L2_TTL_MS - 1;
      expect(await held(B, u1)).toEqual(both);
      offset = PERMISSIONS_L2_TTL_MS;
      expect(await held(B, u1)).toEqual(['catalog.manage']);
    } finally {
      await prisma.roleGrant.create({ data: { roleId, permissionId: grant.permissionId } });
    }
  });

  it('stops counting a time-boxed OrgUnitGrant at its expiresAt, as the database judges it — not up to a TTL later', async () => {
    jest.restoreAllMocks(); // the database decides expiry by its own clock, so this one runs on real time
    await fresh();
    const type = await prisma.orgUnitType.create({ data: { key: `e2e-permission-cache-${run}`, label: 'Permission cache e2e' } });
    const unit = await prisma.orgUnit.create({ data: { code: `e2e-pc-${run}`, name: 'Permission cache e2e', typeId: type.id, path: [] } });
    const expiresAt = new Date(Date.now() + 1_500);
    await prisma.orgUnitGrant.create({
      data: { userId: u1, orgUnitId: unit.id, permissionKeys: ['hr.people.view'], expiresAt, grantedByUserId: u2, reason: 'permission cache e2e' },
    });

    try {
      expect(await held(A, u1)).toContain('hr.people.view');
      expect(await held(B, u1)).toContain('hr.people.view');
      // Shared for as long as the grant has left, not the 60 s TTL.
      expect(await A.redis.client('cache').pttl(`permissions:${u1}`)).toBeLessThanOrEqual(1_500);

      await new Promise((resolve) => setTimeout(resolve, expiresAt.getTime() - Date.now() + 25));

      expect(await held(A, u1)).not.toContain('hr.people.view');
      expect(await held(B, u1)).not.toContain('hr.people.view');
    } finally {
      await prisma.orgUnitGrant.deleteMany({ where: { orgUnitId: unit.id } });
      await prisma.orgUnit.delete({ where: { id: unit.id } });
      await prisma.orgUnitType.delete({ where: { id: type.id } });
    }
  });

  it('keeps answering while its Redis connection is down — from Postgres and its own L1 — and says a change there could not reach the others', async () => {
    const errors = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    B.redis.client('cache').disconnect();

    try {
      expect(await held(B, u1)).toEqual(both);
      await B.roles.unassign(u1, roleId);
      expect(await held(B, u1)).toEqual([]);
      expect(errors).toHaveBeenCalledWith(
        expect.stringContaining(`Could not invalidate "${u1}" in the shared cache: Redis is not connected`),
      );
    } finally {
      await B.redis.client('cache').connect();
      await B.roles.assign(u1, roleId);
    }
  });
});
