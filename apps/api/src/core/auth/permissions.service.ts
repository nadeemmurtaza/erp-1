import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ResolvedPermissions {
  /** Every `Role` name this user currently holds — plural, unioned below (custom roles). */
  roles: string[];
  permissions: string[];
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
 * Called on every request (@see JwtStrategy) and on every token issue
 * (@see AuthService), the same places roles are already re-read from the
 * database — so a super admin editing a role's grants, assigning or
 * removing a role, overriding a permission, or issuing/revoking an
 * OrgUnitGrant takes effect within the access token's lifetime, not just at
 * the next login.
 */
@Injectable()
export class PermissionsResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForUser(userId: string): Promise<ResolvedPermissions> {
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
        select: { permissionKeys: true },
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

    return { roles, permissions: [...permissions] };
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
