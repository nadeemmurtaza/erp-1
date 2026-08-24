import { BadRequestException, Injectable } from '@nestjs/common';
import { ADMIN_LOCKED_PERMISSIONS, USER_ROLES, type PermissionKey, type UserRole } from '@yaseen/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../core/prisma/client';

export interface AuditLogQuery {
  entity?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
  page: number;
  perPage: number;
}

/**
 * Backs the /admin/settings screen: the permission catalog, each role's
 * current grants (editable here — the whole point of PBAC over the old
 * hardcoded RolesGuard), and a read view over the audit trail that has been
 * writing silently since core/audit/audit.service.ts with no viewer until now.
 */
@Injectable()
export class SettingsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { label: 'asc' }],
    });
  }

  async listRoles(): Promise<Array<{ role: UserRole; permissions: string[] }>> {
    const grants = await this.prisma.rolePermission.findMany({
      select: { role: true, permission: { select: { key: true } } },
    });

    const byRole = new Map<UserRole, string[]>(USER_ROLES.map((role) => [role, []]));
    for (const grant of grants) {
      byRole.get(grant.role)?.push(grant.permission.key);
    }

    return USER_ROLES.map((role) => ({ role, permissions: byRole.get(role) ?? [] }));
  }

  /**
   * Replaces a role's entire permission set. ADMIN can never lose
   * settings.manage or roles.manage_permissions through this endpoint — that
   * would lock every admin out of the screen that could undo it.
   */
  async updateRolePermissions(
    role: UserRole,
    permissionKeys: PermissionKey[],
  ): Promise<{ role: UserRole; permissions: string[] }> {
    if (role === 'ADMIN') {
      const missingLocked = ADMIN_LOCKED_PERMISSIONS.filter(
        (key) => !permissionKeys.includes(key),
      );
      if (missingLocked.length > 0) {
        throw new BadRequestException(
          `ADMIN must always keep: ${missingLocked.join(', ')}.`,
        );
      }
    }

    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: permissionKeys } },
      select: { id: true, key: true },
    });

    const found = new Set(permissions.map((permission) => permission.key));
    const unknown = permissionKeys.filter((key) => !found.has(key));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown permission key(s): ${unknown.join(', ')}.`);
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { role } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({ role, permissionId: permission.id })),
      }),
    ]);

    return { role, permissions: permissions.map((permission) => permission.key) };
  }

  async listAuditLog(query: AuditLogQuery) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const [total, entries] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        include: {
          actor: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    return { total, page: query.page, perPage: query.perPage, entries };
  }
}
