import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsResolverService } from './permissions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PermissionsResolverService.resolveForUser', () => {
  let service: PermissionsResolverService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      userRoleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      userPermission: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PermissionsResolverService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<PermissionsResolverService>(PermissionsResolverService);
  });

  const roleAssignment = (name: string, permissionKeys: string[]) => ({
    role: { name, grants: permissionKeys.map((key) => ({ permission: { key } })) },
  });

  it('is empty for a user with no role and no overrides', async () => {
    const result = await service.resolveForUser('u1');
    expect(result).toEqual({ roles: [], permissions: [] });
  });

  it('returns one role’s own grants', async () => {
    prisma.userRoleAssignment.findMany.mockResolvedValue([roleAssignment('Admin', ['a', 'b'])]);

    const result = await service.resolveForUser('u1');

    expect(result.roles).toEqual(['Admin']);
    expect(result.permissions.sort()).toEqual(['a', 'b']);
  });

  it('unions permissions across several held roles', async () => {
    prisma.userRoleAssignment.findMany.mockResolvedValue([
      roleAssignment('Bookkeeper', ['accounting.view']),
      roleAssignment('Branch Lead', ['orders.manage', 'accounting.view']),
    ]);

    const result = await service.resolveForUser('u1');

    expect(result.roles.sort()).toEqual(['Bookkeeper', 'Branch Lead']);
    expect(result.permissions.sort()).toEqual(['accounting.view', 'orders.manage']);
  });

  it('a personal GRANT override adds a permission no held role has', async () => {
    prisma.userRoleAssignment.findMany.mockResolvedValue([roleAssignment('Tailor', ['stitching.jobs.view_queue'])]);
    prisma.userPermission.findMany.mockResolvedValue([{ effect: 'GRANT', permission: { key: 'orders.manage' } }]);

    const result = await service.resolveForUser('u1');

    expect(result.permissions.sort()).toEqual(['orders.manage', 'stitching.jobs.view_queue']);
  });

  it('a personal REVOKE override takes away a permission a held role grants', async () => {
    prisma.userRoleAssignment.findMany.mockResolvedValue([roleAssignment('Admin', ['a', 'b'])]);
    prisma.userPermission.findMany.mockResolvedValue([{ effect: 'REVOKE', permission: { key: 'b' } }]);

    const result = await service.resolveForUser('u1');

    expect(result.permissions).toEqual(['a']);
  });

  it('applies overrides on top of the union of every role, not just one', async () => {
    prisma.userRoleAssignment.findMany.mockResolvedValue([
      roleAssignment('Role A', ['x']),
      roleAssignment('Role B', ['y']),
    ]);
    prisma.userPermission.findMany.mockResolvedValue([
      { effect: 'REVOKE', permission: { key: 'y' } },
      { effect: 'GRANT', permission: { key: 'z' } },
    ]);

    const result = await service.resolveForUser('u1');

    expect(result.permissions.sort()).toEqual(['x', 'z']);
  });
});
