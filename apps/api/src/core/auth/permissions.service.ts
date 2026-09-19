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
 * base permissions are the union of every held role's grants, with their
 * own per-user overrides (`UserPermission`) applied on top — a GRANT adds a
 * permission no held role has, a REVOKE takes one away that some role does.
 *
 * Called on every request (@see JwtStrategy) and on every token issue
 * (@see AuthService), the same places roles are already re-read from the
 * database — so a super admin editing a role's grants, assigning or
 * removing a role, or overriding a permission from the Settings/Users
 * screens takes effect within the access token's lifetime, not just at the
 * next login.
 */
@Injectable()
export class PermissionsResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForUser(userId: string): Promise<ResolvedPermissions> {
    const [assignments, overrides] = await Promise.all([
      this.prisma.userRoleAssignment.findMany({
        where: { userId },
        select: {
          role: {
            select: { name: true, grants: { select: { permission: { select: { key: true } } } } },
          },
        },
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
    for (const override of overrides) {
      if (override.effect === 'GRANT') {
        permissions.add(override.permission.key);
      } else {
        permissions.delete(override.permission.key);
      }
    }

    return { roles, permissions: [...permissions] };
  }
}
