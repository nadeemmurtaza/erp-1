import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { normalizeEmail, normalizePkPhone } from '@newax/shared';
import { AuditService } from '../../core/audit/audit.service';
import { hashPassword } from '../../core/auth/password.util';
import { PermissionsResolverService } from '../../core/auth/permissions.service';
import { RolesService } from '../../core/auth/roles.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { UserRole } from '../../core/prisma/client';
import type {
  BackOfficeRole,
  CreateUserDto,
  PermissionOverrideDto,
  UpdateUserDto,
} from './dto/user.dto';

// The coarse *account kind* — still the fixed enum, and deliberately so:
// which users are staff at all vs a customer, and what a fresh signup
// defaults into, is a structural distinction, not a permission bundle.
// It answers "is this a back-office account", never "what can they do" —
// that question is 100% UserRoleAssignment/RoleGrant now (roles.service.ts).
const BACK_OFFICE_ROLES: UserRole[] = ['STAFF', 'TAILOR', 'ADMIN'];

@Injectable()
export class UsersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsResolverService,
    private readonly roles: RolesService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.user.findMany({
      where: { role: { in: BACK_OFFICE_ROLES } },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async get(id: string) {
    const user = await this.findBackOfficeUser(id);

    const [assignments, overrides, resolved, conflicts] = await Promise.all([
      this.prisma.userRoleAssignment.findMany({
        where: { userId: id },
        select: {
          role: {
            select: { id: true, name: true, grants: { select: { permission: { select: { key: true } } } } },
          },
        },
      }),
      this.prisma.userPermission.findMany({
        where: { userId: id },
        select: { effect: true, permission: { select: { key: true } } },
      }),
      this.permissions.resolveForUser(id),
      this.roles.conflictsForUser(id),
    ]);

    return {
      ...user,
      // Every custom Role this user holds, each with its own permission
      // set inline — plural, so the edit screen can show more than one.
      roles: assignments.map((assignment) => ({
        id: assignment.role.id,
        name: assignment.role.name,
        permissions: assignment.role.grants.map((grant) => grant.permission.key),
      })),
      overrides: overrides.map((o) => ({ key: o.permission.key, effect: o.effect })),
      effectivePermissions: resolved.permissions,
      // Non-blocking advisories — see RolesService.conflictsForUser().
      conflicts,
    };
  }

  async assignRole(actorId: string, targetId: string, roleId: string) {
    await this.findBackOfficeUser(targetId);
    await this.roles.assign(targetId, roleId);

    await this.audit.record({
      actorId,
      action: 'user.role_assigned',
      entity: 'User',
      entityId: targetId,
      data: { roleId },
    });

    return this.get(targetId);
  }

  async unassignRole(actorId: string, targetId: string, roleId: string) {
    await this.findBackOfficeUser(targetId);
    await this.roles.unassign(targetId, roleId);

    await this.audit.record({
      actorId,
      action: 'user.role_unassigned',
      entity: 'User',
      entityId: targetId,
      data: { roleId },
    });

    return this.get(targetId);
  }

  async create(actorId: string, dto: CreateUserDto) {
    const email = normalizeEmail(dto.email);
    if (!email) {
      throw new ConflictException('A valid email address is required.');
    }

    const phone = dto.phone ? normalizePkPhone(dto.phone).e164 : null;
    if (dto.phone && !phone) {
      throw new ConflictException('That phone number is not a valid number.');
    }

    const clash = await this.prisma.user.findFirst({
      where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
      select: { id: true, email: true },
    });
    if (clash) {
      throw new ConflictException(
        clash.email === email
          ? 'An account with this email already exists.'
          : 'An account with this phone number already exists.',
      );
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        phone,
        passwordHash: await hashPassword(dto.password),
        firstName: dto.firstName?.trim() || null,
        lastName: dto.lastName?.trim() || null,
        role: dto.role,
      },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await this.audit.record({
      actorId,
      action: 'user.created',
      entity: 'User',
      entityId: user.id,
      data: { role: user.role },
    });

    return user;
  }

  async update(actorId: string, targetId: string, dto: UpdateUserDto) {
    if (targetId === actorId && (dto.role !== undefined || dto.isActive !== undefined)) {
      throw new BadRequestException(
        'You cannot change your own role or active status — ask another admin.',
      );
    }

    const existing = await this.findBackOfficeUser(targetId);

    const data: {
      firstName?: string | null;
      lastName?: string | null;
      email?: string;
      phone?: string | null;
      role?: BackOfficeRole;
      isActive?: boolean;
    } = {};

    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim() || null;
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim() || null;

    if (dto.email !== undefined) {
      const email = normalizeEmail(dto.email);
      if (!email) {
        throw new ConflictException('A valid email address is required.');
      }
      const clash = await this.prisma.user.findFirst({
        where: { email, NOT: { id: targetId } },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException('An account with this email already exists.');
      }
      data.email = email;
    }

    if (dto.phone !== undefined) {
      const phone = dto.phone === '' ? null : normalizePkPhone(dto.phone).e164;
      if (dto.phone !== '' && !phone) {
        throw new ConflictException('That phone number is not a valid number.');
      }
      if (phone) {
        const clash = await this.prisma.user.findFirst({
          where: { phone, NOT: { id: targetId } },
          select: { id: true },
        });
        if (clash) {
          throw new ConflictException('An account with this phone number already exists.');
        }
      }
      data.phone = phone;
    }

    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: targetId },
        data,
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });

      // A role change or a deactivation should not leave old sessions valid
      // with permissions that no longer match what the admin just set.
      if (dto.role !== undefined || dto.isActive === false) {
        await tx.refreshToken.updateMany({
          where: { userId: targetId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return updated;
    });

    await this.audit.record({
      actorId,
      action: 'user.updated',
      entity: 'User',
      entityId: targetId,
      data: { from: { role: existing.role, isActive: existing.isActive }, to: data },
    });

    return user;
  }

  async resetPassword(actorId: string, targetId: string, newPassword: string): Promise<void> {
    await this.findBackOfficeUser(targetId);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: targetId },
        data: { passwordHash: await hashPassword(newPassword) },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      actorId,
      action: 'user.password_reset',
      entity: 'User',
      entityId: targetId,
    });
  }

  async updatePermissions(actorId: string, targetId: string, overrides: PermissionOverrideDto[]) {
    await this.findBackOfficeUser(targetId);

    const revokedKeys = overrides.filter((o) => o.effect === 'REVOKE').map((o) => o.key);
    await this.roles.assertLockedKeysStillHeldAfterRevoke(targetId, revokedKeys);

    const keys = overrides.map((o) => o.key);
    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: keys } },
      select: { id: true, key: true },
    });
    const idByKey = new Map(permissions.map((p) => [p.key, p.id]));
    const unknown = keys.filter((key) => !idByKey.has(key));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown permission key(s): ${unknown.join(', ')}.`);
    }

    await this.prisma.$transaction([
      this.prisma.userPermission.deleteMany({ where: { userId: targetId } }),
      this.prisma.userPermission.createMany({
        data: overrides.map((o) => ({
          userId: targetId,
          permissionId: idByKey.get(o.key)!,
          effect: o.effect,
        })),
      }),
    ]);

    await this.audit.record({
      actorId,
      action: 'user.permissions_updated',
      entity: 'User',
      entityId: targetId,
      data: { overrides },
    });

    return this.get(targetId);
  }

  private async findBackOfficeUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !BACK_OFFICE_ROLES.includes(user.role)) {
      throw new NotFoundException('That user does not exist.');
    }
    return user;
  }
}
