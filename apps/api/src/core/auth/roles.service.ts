import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ADMIN_LOCKED_PERMISSIONS, type PermissionKey } from '@newax/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface RoleWithGrants {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  userCount: number;
}

export interface RoleWriteResult {
  role: RoleWithGrants;
  /** Non-blocking — the owner asked for a suggestion, not a wall: another role already holds this exact permission set. */
  duplicateOfRoleName: string | null;
}

export interface UserRoleConflicts {
  /** A GRANT override that does nothing — a held role already grants the same key. Harmless; worth tidying up. */
  redundantGrants: string[];
  /** A REVOKE override currently silenced by a held role's grant — the revoke has no effect while that role stays assigned. */
  overriddenRevokes: string[];
}

/**
 * Custom roles (owner's request, WO-R2/R3): create, edit, delete a `Role`,
 * assign or unassign one on a user, plus the "prevent duplication and
 * conflicts, suggest a resolution" half of that request.
 *
 * Two different kinds of conflict, two different responses:
 *  - A duplicate role NAME is refused outright (`ConflictException`) — two
 *    roles cannot share an identity.
 *  - A duplicate PERMISSION SET is not refused, only flagged
 *    (`duplicateOfRoleName`) — a super admin may genuinely want "Regional
 *    Manager" and "Area Lead" to grant the same things today and diverge
 *    later; only the human knows that.
 *  - An edit that would leave a House Rule 9 critical permission
 *    (`ADMIN_LOCKED_PERMISSIONS` — settings.manage, roles.manage_permissions)
 *    held by *nobody at all* is refused — the generalisation of the old
 *    single-ADMIN-role lockout guard to a world where that role can be
 *    renamed or deleted.
 */
@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<RoleWithGrants[]> {
    const roles = await this.prisma.role.findMany({
      include: {
        grants: { include: { permission: { select: { key: true } } } },
        _count: { select: { assignments: true } },
      },
      orderBy: { name: 'asc' },
    });

    return roles.map((role) => this.toRoleWithGrants(role));
  }

  async create(input: {
    name: string;
    description?: string;
    permissions: PermissionKey[];
  }): Promise<RoleWriteResult> {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('A role needs a name.');

    const clash = await this.prisma.role.findUnique({ where: { name } });
    if (clash) throw new ConflictException(`A role named "${name}" already exists.`);

    const duplicateOfRoleName = await this.findRoleWithIdenticalPermissions(input.permissions);
    const permissionRows = await this.prisma.permission.findMany({
      where: { key: { in: input.permissions } },
    });

    const role = await this.prisma.role.create({
      data: {
        name,
        description: input.description?.trim() || null,
        grants: { create: permissionRows.map((permission) => ({ permissionId: permission.id })) },
      },
      include: {
        grants: { include: { permission: { select: { key: true } } } },
        _count: { select: { assignments: true } },
      },
    });

    return { role: this.toRoleWithGrants(role), duplicateOfRoleName };
  }

  async update(
    roleId: string,
    input: { name?: string; description?: string; permissions?: PermissionKey[] },
  ): Promise<RoleWriteResult> {
    const existing = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!existing) throw new NotFoundException('Role not found.');

    let name: string | undefined;
    if (input.name !== undefined) {
      name = input.name.trim();
      if (!name) throw new BadRequestException('A role needs a name.');
      const clash = await this.prisma.role.findFirst({ where: { name, NOT: { id: roleId } } });
      if (clash) throw new ConflictException(`A role named "${name}" already exists.`);
    }

    let duplicateOfRoleName: string | null = null;

    if (input.permissions !== undefined) {
      await this.assertLockedPermissionsStillHeldSomewhere(roleId, input.permissions);
      duplicateOfRoleName = await this.findRoleWithIdenticalPermissions(input.permissions, roleId);

      const permissionRows = await this.prisma.permission.findMany({
        where: { key: { in: input.permissions } },
      });
      await this.prisma.roleGrant.deleteMany({ where: { roleId } });
      if (permissionRows.length > 0) {
        await this.prisma.roleGrant.createMany({
          data: permissionRows.map((permission) => ({ roleId, permissionId: permission.id })),
        });
      }
    }

    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: { name, description: input.description !== undefined ? input.description.trim() || null : undefined },
      include: {
        grants: { include: { permission: { select: { key: true } } } },
        _count: { select: { assignments: true } },
      },
    });

    return { role: this.toRoleWithGrants(updated), duplicateOfRoleName };
  }

  async delete(roleId: string): Promise<void> {
    const existing = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!existing) throw new NotFoundException('Role not found.');

    await this.assertLockedPermissionsStillHeldSomewhere(roleId, []);
    await this.prisma.role.delete({ where: { id: roleId } });
  }

  /** Idempotent — assigning a role a user already holds is a no-op, not an error. */
  async assign(userId: string, roleId: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found.');

    await this.prisma.userRoleAssignment.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });
  }

  async unassign(userId: string, roleId: string): Promise<void> {
    await this.prisma.userRoleAssignment.deleteMany({ where: { userId, roleId } });
  }

  /** Used at signup and by the seed backfill — silently does nothing if the named role has been renamed or removed. */
  async assignByNameIfExists(userId: string, name: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { name } });
    if (!role) return;
    await this.assign(userId, role.id);
  }

  /**
   * The same orphan guard as role edits (`assertLockedPermissionsStillHeldSomewhere`),
   * for the other place a critical permission can be taken away: a
   * personal `UserPermission` REVOKE override. Generalises the old
   * "cannot revoke from an ADMIN" check — that only ever protected the one
   * user being edited, checked by the now-vestigial `role` enum; this
   * checks whether the key is held *anywhere else at all*, by any role
   * assignment or any other user's personal grant.
   */
  async assertLockedKeysStillHeldAfterRevoke(userId: string, revokedKeys: string[]): Promise<void> {
    const lockedAmongRevoked = revokedKeys.filter((key) =>
      (ADMIN_LOCKED_PERMISSIONS as readonly string[]).includes(key),
    );
    if (lockedAmongRevoked.length === 0) return;

    for (const lockedKey of lockedAmongRevoked) {
      const grantedByRole = await this.prisma.roleGrant.findFirst({
        where: { permission: { key: lockedKey } },
      });
      if (grantedByRole) continue;

      const grantedByOtherUser = await this.prisma.userPermission.findFirst({
        where: { effect: 'GRANT', permission: { key: lockedKey }, NOT: { userId } },
      });
      if (grantedByOtherUser) continue;

      throw new BadRequestException(
        `This would leave nobody holding "${lockedKey}" — no role grants it and no other user has ` +
          'a personal override for it.',
      );
    }
  }

  /**
   * The per-user advisory half of "prevent conflicts and suggest a
   * resolution": not blocking anything (PermissionsResolverService's own
   * grant-then-override order already makes the *outcome* deterministic),
   * just surfacing combinations worth a human's attention on the user's own
   * profile screen.
   */
  async conflictsForUser(userId: string): Promise<UserRoleConflicts> {
    const [assignments, overrides] = await Promise.all([
      this.prisma.userRoleAssignment.findMany({
        where: { userId },
        select: { role: { select: { grants: { select: { permission: { select: { key: true } } } } } } },
      }),
      this.prisma.userPermission.findMany({
        where: { userId },
        select: { effect: true, permission: { select: { key: true } } },
      }),
    ]);

    const roleGranted = new Set<string>();
    for (const assignment of assignments) {
      for (const grant of assignment.role.grants) roleGranted.add(grant.permission.key);
    }

    const redundantGrants = overrides
      .filter((override) => override.effect === 'GRANT' && roleGranted.has(override.permission.key))
      .map((override) => override.permission.key);

    const overriddenRevokes = overrides
      .filter((override) => override.effect === 'REVOKE' && roleGranted.has(override.permission.key))
      .map((override) => override.permission.key);

    return { redundantGrants, overriddenRevokes };
  }

  private findRoleWithIdenticalPermissions(
    permissions: string[],
    excludeRoleId?: string,
  ): Promise<string | null> {
    return this.prisma.role
      .findMany({
        where: excludeRoleId ? { NOT: { id: excludeRoleId } } : undefined,
        include: { grants: { include: { permission: { select: { key: true } } } } },
      })
      .then((roles) => {
        const target = new Set(permissions);
        for (const role of roles) {
          const keys = new Set(role.grants.map((grant) => grant.permission.key));
          if (keys.size === target.size && [...keys].every((key) => target.has(key))) {
            return role.name;
          }
        }
        return null;
      });
  }

  /**
   * Refuses an edit or delete that would leave a critical permission
   * (`ADMIN_LOCKED_PERMISSIONS`) granted by no role and no personal
   * override, deployment-wide. `newPermissions: []` means "this role is
   * being deleted" — same check, since a deleted role grants nothing.
   */
  private async assertLockedPermissionsStillHeldSomewhere(
    roleId: string,
    newPermissions: string[],
  ): Promise<void> {
    for (const lockedKey of ADMIN_LOCKED_PERMISSIONS) {
      if (newPermissions.includes(lockedKey)) continue;

      const grantedByAnotherRole = await this.prisma.roleGrant.findFirst({
        where: { permission: { key: lockedKey }, roleId: { not: roleId } },
      });
      if (grantedByAnotherRole) continue;

      const grantedByOverride = await this.prisma.userPermission.findFirst({
        where: { effect: 'GRANT', permission: { key: lockedKey } },
      });
      if (grantedByOverride) continue;

      throw new BadRequestException(
        `This would leave nobody holding "${lockedKey}" — no other role grants it and no user has ` +
          'a personal override for it. Add it to another role first.',
      );
    }
  }

  private toRoleWithGrants(role: {
    id: string;
    name: string;
    description: string | null;
    grants: { permission: { key: string } }[];
    _count: { assignments: number };
  }): RoleWithGrants {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.grants.map((grant) => grant.permission.key),
      userCount: role._count.assignments,
    };
  }
}
