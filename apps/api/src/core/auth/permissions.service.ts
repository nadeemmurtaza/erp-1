import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UserRole } from '../prisma/client';

/**
 * Resolves a role's currently granted permission keys from RolePermission.
 *
 * Called on every request (@see JwtStrategy) and on every token issue
 * (@see AuthService), the same places `role` is already re-read from the
 * database — so an admin editing a role's permissions from the Settings
 * screen takes effect within the access token's lifetime, not just at the
 * next login.
 */
@Injectable()
export class PermissionsResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(role: UserRole): Promise<string[]> {
    const grants = await this.prisma.rolePermission.findMany({
      where: { role },
      select: { permission: { select: { key: true } } },
    });
    return grants.map((grant) => grant.permission.key);
  }
}
