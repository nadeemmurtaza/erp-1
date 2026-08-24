import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UserRole } from '../prisma/client';

/**
 * Resolves a user's currently effective permission keys: their role's grants
 * (RolePermission) with their own per-user overrides (UserPermission)
 * applied on top — a GRANT adds a permission the role doesn't have, a REVOKE
 * takes one away that it does.
 *
 * Called on every request (@see JwtStrategy) and on every token issue
 * (@see AuthService), the same places `role` is already re-read from the
 * database — so an admin editing a role's permissions or a user's overrides
 * from the Settings/Users screens takes effect within the access token's
 * lifetime, not just at the next login.
 */
@Injectable()
export class PermissionsResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForUser(userId: string, role: UserRole): Promise<string[]> {
    const [grants, overrides] = await Promise.all([
      this.prisma.rolePermission.findMany({
        where: { role },
        select: { permission: { select: { key: true } } },
      }),
      this.prisma.userPermission.findMany({
        where: { userId },
        select: { effect: true, permission: { select: { key: true } } },
      }),
    ]);

    const permissions = new Set(grants.map((grant) => grant.permission.key));
    for (const override of overrides) {
      if (override.effect === 'GRANT') {
        permissions.add(override.permission.key);
      } else {
        permissions.delete(override.permission.key);
      }
    }

    return [...permissions];
  }
}
