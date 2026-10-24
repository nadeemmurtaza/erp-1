import { Injectable, Logger } from '@nestjs/common';
import { TieredCache, type Loaded } from '../cache/tiered-cache';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface ResolvedPermissions {
  /** Every `Role` name this user currently holds — plural, unioned below (custom roles). */
  roles: string[];
  permissions: string[];
}

/**
 * L1: how long one process serves a user's resolved set
 * (208-l1-l2-l3-caching-architecture.md §2). 10 s, not settings' 30 s: a
 * stale *revocation* is a live over-permission window, not a cosmetic delay.
 * Every write that changes a user's permissions drops the entry at once in
 * the process that made it, so this is the most another replica can lag.
 */
export const PERMISSIONS_L1_TTL_MS = 10_000;
/** L1 entries per process, least recently used evicted past it (doc 208 §2). Measured sizes in doc 208 §6. */
export const PERMISSIONS_L1_MAX_ENTRIES = 10_000;
/**
 * L2: how long a resolved set is shared in Redis (`permissions:{userId}`,
 * doc 208 §2). Invalidated at every write site, so it bounds only a change
 * no write site saw — a raw SQL edit, a seed run — and an L1 entry filled
 * from it never outlives it.
 */
export const PERMISSIONS_L2_TTL_MS = 60_000;

function decodeResolved(json: unknown): ResolvedPermissions | undefined {
  if (typeof json !== 'object' || json === null) return undefined;
  const { roles, permissions } = json as Record<string, unknown>;
  return isStringArray(roles) && isStringArray(permissions) ? { roles, permissions } : undefined;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Resolves a user's currently effective roles and permission keys.
 *
 * A user may hold several `Role` rows at once (`UserRoleAssignment`); their
 * base permissions are the union of every held role's grants, PLUS every
 * key named by a currently-valid `OrgUnitGrant` they hold
 * (access-control-identity/21-access-over-the-org-tree.md's "explicit"
 * access — a time-boxed grant can hand someone a key no role of theirs
 * gives them, e.g. an auditor's fortnight-long read grant), with their own
 * per-user overrides (`UserPermission`) applied on top last — a GRANT adds
 * a permission nothing else confers, a REVOKE takes one away unconditionally,
 * grant-derived or not ("DENY wins last and unconditionally", doc 21).
 *
 * This union changes nothing for a user with zero `OrgUnitGrant` rows —
 * every deployment today, since nothing yet issues one — so today's
 * behaviour is unchanged; see GrantService for how a row gets there and
 * `reachableUnitIdsFor()` for the OrgUnit-subtree half doc 21 also needs,
 * which stays a separate, opt-in call rather than baked in here (this
 * resolver answers *may you at all*; *over which rows* is scope.guard.ts's
 * job, unchanged).
 *
 * Two ways in (doc 208 §2, ADR-077):
 *  - `resolveForUserCached()` — every authenticated request (@see JwtStrategy,
 *    ApiKeyAuthService): L1 in this process (10 s), L2 in Redis (60 s), then
 *    the database. Every write that changes the answer calls `invalidate()`
 *    or `invalidateAll()` after it commits, so a super admin editing a role's
 *    grants, assigning or removing a role, overriding a permission, or
 *    issuing/revoking an OrgUnitGrant takes effect on the very next request
 *    served by the replica that made the change, and within 10 s on every
 *    other replica (their L1 — the stated, accepted bound; nothing pushes
 *    to them). A grant that simply expires stops counting at its
 *    `expiresAt`, never up to a TTL later.
 *  - `resolveForUser()` — straight from the database, every time: for a
 *    decision that confers durable authority on the strength of the answer
 *    (issuing an OrgUnitGrant, minting an API key, adjusting someone else's
 *    attendance), for the sets a session is issued with, and for the
 *    effective permissions an admin reads right after editing them. None
 *    of those is per-request, so the cache would buy them nothing.
 */
@Injectable()
export class PermissionsResolverService {
  private readonly cache: TieredCache<ResolvedPermissions>;

  constructor(
    private readonly prisma: PrismaService,
    redis: RedisService,
  ) {
    this.cache = new TieredCache<ResolvedPermissions>(redis, new Logger(PermissionsResolverService.name), {
      namespace: 'permissions',
      l1: { maxEntries: PERMISSIONS_L1_MAX_ENTRIES, ttlMs: PERMISSIONS_L1_TTL_MS },
      l2: { ttlMs: PERMISSIONS_L2_TTL_MS },
      decode: decodeResolved,
    });
  }

  /** Uncached — see the class comment for who needs this rather than `resolveForUserCached()`. */
  async resolveForUser(userId: string): Promise<ResolvedPermissions> {
    return (await this.load(userId)).value;
  }

  /**
   * The per-request path: served from this process for up to 10 s and from
   * Redis for up to 60 s, dropped at every write that changes it. Each caller
   * gets its own copy, so nothing done to one request's arrays reaches another.
   */
  async resolveForUserCached(userId: string): Promise<ResolvedPermissions> {
    const cached = await this.cache.getOrLoad(userId, () => this.load(userId));
    return { roles: [...cached.roles], permissions: [...cached.permissions] };
  }

  /**
   * Call after — never before — a committed write that changed one user's
   * role assignments, permission overrides or OrgUnitGrants. Invalidating
   * inside an open transaction would let a concurrent request re-cache the
   * pre-write set as current.
   */
  invalidate(userId: string): Promise<void> {
    return this.cache.invalidate(userId);
  }

  /**
   * Call after a committed write that changed what a role grants or is
   * called, or deleted one: every holder's set changed, and a role can have
   * any number of holders, so every cached set goes — one Redis write, not
   * one per holder.
   */
  invalidateAll(): Promise<void> {
    return this.cache.invalidateAll();
  }

  private async load(userId: string): Promise<Loaded<ResolvedPermissions>> {
    const [assignments, grants, overrides] = await Promise.all([
      this.prisma.userRoleAssignment.findMany({
        where: { userId },
        select: {
          role: {
            select: { name: true, grants: { select: { permission: { select: { key: true } } } } },
          },
        },
      }),
      this.prisma.orgUnitGrant.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { permissionKeys: true, expiresAt: true },
      }),
      this.prisma.userPermission.findMany({
        where: { userId },
        select: { effect: true, permission: { select: { key: true } } },
      }),
    ]);

    const roles = assignments.map((assignment) => assignment.role.name);

    const permissions = new Set<string>();
    for (const assignment of assignments) {
      for (const grant of assignment.role.grants) {
        permissions.add(grant.permission.key);
      }
    }
    for (const grant of grants) {
      for (const key of grant.permissionKeys) {
        permissions.add(key);
      }
    }
    for (const override of overrides) {
      if (override.effect === 'GRANT') {
        permissions.add(override.permission.key);
      } else {
        permissions.delete(override.permission.key);
      }
    }

    // The set stops being true the moment the earliest grant in it expires —
    // no write marks that moment, so the cache is told when it is.
    const validUntil = grants.reduce<number | null>(
      (earliest, grant) => Math.min(earliest ?? Number.POSITIVE_INFINITY, grant.expiresAt.getTime()),
      null,
    );

    return { value: { roles, permissions: [...permissions] }, validUntil };
  }

  /**
   * The inverse of `resolveForUser()` — every user who currently holds a
   * given permission key, for a caller that needs to address a capability
   * rather than a fixed address (CLAUDE.md's "Audience is a capability, not
   * an address" — `inventory.listener.ts`'s `store.supportEmail` is the
   * standing counter-example this exists to avoid repeating). Unions
   * role-derived grants with a per-user GRANT override and subtracts a
   * per-user REVOKE, the same two layers `resolveForUser()` already applies
   * — deliberately omitting `OrgUnitGrant`-derived access (time-boxed,
   * narrow, and per `resolveForUser()`'s own doc comment unused by every
   * deployment today); a caller needing that reach too should compose
   * `resolveForUser()` per candidate instead of this batch shortcut.
   */
  async usersWithPermission(permissionKey: string): Promise<Array<{ id: string; email: string | null; firstName: string | null; lastName: string | null }>> {
    const [roleGranted, overrides] = await Promise.all([
      this.prisma.userRoleAssignment.findMany({
        where: { role: { grants: { some: { permission: { key: permissionKey } } } } },
        select: { userId: true },
      }),
      this.prisma.userPermission.findMany({
        where: { permission: { key: permissionKey } },
        select: { userId: true, effect: true },
      }),
    ]);

    const userIds = new Set(roleGranted.map((assignment) => assignment.userId));
    for (const override of overrides) {
      if (override.effect === 'GRANT') userIds.add(override.userId);
      else userIds.delete(override.userId);
    }
    if (userIds.size === 0) return [];

    return this.prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
  }
}
