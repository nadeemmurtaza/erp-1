import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RolesService', () => {
  let service: RolesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      role: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
      permission: { findMany: jest.fn().mockResolvedValue([]) },
      roleGrant: { deleteMany: jest.fn(), createMany: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
      userRoleAssignment: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      userPermission: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  describe('create', () => {
    it('refuses a duplicate name', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.create({ name: 'Admin', permissions: [] })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses a blank name', async () => {
      await expect(service.create({ name: '   ', permissions: [] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('flags, but does not block, a permission set identical to an existing role', async () => {
      prisma.role.findMany.mockResolvedValue([
        {
          id: 'r1',
          name: 'Branch Lead',
          grants: [{ permission: { key: 'orders.manage' } }, { permission: { key: 'accounting.view' } }],
        },
      ]);
      prisma.role.create.mockResolvedValue({
        id: 'r2',
        name: 'Area Lead',
        description: null,
        grants: [{ permission: { key: 'orders.manage' } }, { permission: { key: 'accounting.view' } }],
        _count: { assignments: 0 },
      });

      const result = await service.create({
        name: 'Area Lead',
        permissions: ['orders.manage', 'accounting.view'],
      });

      expect(result.duplicateOfRoleName).toBe('Branch Lead');
      expect(result.role.name).toBe('Area Lead');
    });

    it('reports no duplicate when the permission set is genuinely different', async () => {
      prisma.role.findMany.mockResolvedValue([
        { id: 'r1', name: 'Branch Lead', grants: [{ permission: { key: 'orders.manage' } }] },
      ]);
      prisma.role.create.mockResolvedValue({
        id: 'r2',
        name: 'Bookkeeper',
        description: null,
        grants: [{ permission: { key: 'accounting.view' } }],
        _count: { assignments: 0 },
      });

      const result = await service.create({ name: 'Bookkeeper', permissions: ['accounting.view'] });

      expect(result.duplicateOfRoleName).toBeNull();
    });
  });

  describe('update / delete — the locked-permission orphan guard', () => {
    it('refuses to remove a locked permission from the only role that grants it, with no personal override anywhere', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'r1', name: 'Admin' });
      // No other role grants it, no personal GRANT override exists.
      prisma.roleGrant.findFirst.mockResolvedValue(null);
      prisma.userPermission.findFirst.mockResolvedValue(null);

      await expect(service.update('r1', { permissions: [] })).rejects.toThrow(/nobody holding/i);
    });

    it('allows removing a locked permission when another role still grants it', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'r1', name: 'Admin' });
      prisma.roleGrant.findFirst.mockResolvedValue({ id: 'g1' }); // some other role grants it
      prisma.role.update.mockResolvedValue({
        id: 'r1',
        name: 'Admin',
        description: null,
        grants: [],
        _count: { assignments: 0 },
      });

      await expect(service.update('r1', { permissions: [] })).resolves.toBeDefined();
    });

    it('allows removing a locked permission when a personal override grants it', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'r1', name: 'Admin' });
      prisma.roleGrant.findFirst.mockResolvedValue(null);
      prisma.userPermission.findFirst.mockResolvedValue({ id: 'o1' }); // someone has a personal grant
      prisma.role.update.mockResolvedValue({
        id: 'r1',
        name: 'Admin',
        description: null,
        grants: [],
        _count: { assignments: 0 },
      });

      await expect(service.update('r1', { permissions: [] })).resolves.toBeDefined();
    });

    it('refuses to delete the last role granting a locked permission', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'r1', name: 'Admin' });
      prisma.roleGrant.findFirst.mockResolvedValue(null);
      prisma.userPermission.findFirst.mockResolvedValue(null);

      await expect(service.delete('r1')).rejects.toThrow(/nobody holding/i);
      expect(prisma.role.delete).not.toHaveBeenCalled();
    });

    it('404s deleting a role that does not exist', async () => {
      prisma.role.findUnique.mockResolvedValue(null);
      await expect(service.delete('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('assertLockedKeysStillHeldAfterRevoke', () => {
    it('refuses a revoke that would leave a locked permission held by nobody', async () => {
      prisma.roleGrant.findFirst.mockResolvedValue(null);
      prisma.userPermission.findFirst.mockResolvedValue(null);

      await expect(
        service.assertLockedKeysStillHeldAfterRevoke('u1', ['settings.manage']),
      ).rejects.toThrow(/nobody holding/i);
    });

    it('allows the revoke when a role still grants it', async () => {
      prisma.roleGrant.findFirst.mockResolvedValue({ id: 'g1' });
      await expect(
        service.assertLockedKeysStillHeldAfterRevoke('u1', ['settings.manage']),
      ).resolves.toBeUndefined();
    });

    it('allows the revoke when it is not a locked key at all', async () => {
      await expect(service.assertLockedKeysStillHeldAfterRevoke('u1', ['orders.manage'])).resolves.toBeUndefined();
      expect(prisma.roleGrant.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('conflictsForUser', () => {
    it('flags a personal GRANT already covered by a held role as redundant', async () => {
      prisma.userRoleAssignment.findMany.mockResolvedValue([
        { role: { grants: [{ permission: { key: 'orders.manage' } }] } },
      ]);
      prisma.userPermission.findMany.mockResolvedValue([
        { effect: 'GRANT', permission: { key: 'orders.manage' } },
      ]);

      const result = await service.conflictsForUser('u1');

      expect(result.redundantGrants).toEqual(['orders.manage']);
      expect(result.overriddenRevokes).toEqual([]);
    });

    it('flags a personal REVOKE silenced by a held role as overridden', async () => {
      prisma.userRoleAssignment.findMany.mockResolvedValue([
        { role: { grants: [{ permission: { key: 'orders.manage' } }] } },
      ]);
      prisma.userPermission.findMany.mockResolvedValue([
        { effect: 'REVOKE', permission: { key: 'orders.manage' } },
      ]);

      const result = await service.conflictsForUser('u1');

      expect(result.overriddenRevokes).toEqual(['orders.manage']);
    });

    it('is empty when overrides do not touch any held role’s grants', async () => {
      prisma.userRoleAssignment.findMany.mockResolvedValue([{ role: { grants: [] } }]);
      prisma.userPermission.findMany.mockResolvedValue([
        { effect: 'GRANT', permission: { key: 'orders.manage' } },
      ]);

      const result = await service.conflictsForUser('u1');

      expect(result).toEqual({ redundantGrants: [], overriddenRevokes: [] });
    });
  });

  describe('assign / unassign', () => {
    it('404s assigning a role that does not exist', async () => {
      prisma.role.findUnique.mockResolvedValue(null);
      await expect(service.assign('u1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('upserts the assignment, idempotently', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      await service.assign('u1', 'r1');

      expect(prisma.userRoleAssignment.upsert).toHaveBeenCalledWith({
        where: { userId_roleId: { userId: 'u1', roleId: 'r1' } },
        create: { userId: 'u1', roleId: 'r1' },
        update: {},
      });
    });

    it('assignByNameIfExists is a no-op when the name does not exist', async () => {
      prisma.role.findUnique.mockResolvedValue(null);
      await service.assignByNameIfExists('u1', 'Nonexistent');
      expect(prisma.userRoleAssignment.upsert).not.toHaveBeenCalled();
    });
  });
});
