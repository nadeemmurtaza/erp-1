import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../core/audit/audit.service';
import { PermissionsResolverService } from '../../core/auth/permissions.service';
import { RolesService } from '../../core/auth/roles.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { UsersAdminService } from './users-admin.service';

describe('UsersAdminService.create — role selection at creation time', () => {
  let service: UsersAdminService;
  let prisma: any;
  let roles: any;
  let audit: any;

  const baseDto = {
    email: 'sana@example.com',
    password: 'a-strong-password',
    role: 'STAFF' as const,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'sana@example.com',
          phone: null,
          firstName: null,
          lastName: null,
          role: 'STAFF',
          isActive: true,
          createdAt: new Date(),
        }),
      },
      userRoleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      userPermission: { findMany: jest.fn().mockResolvedValue([]) },
    };
    roles = {
      assign: jest.fn().mockResolvedValue(undefined),
      conflictsForUser: jest.fn().mockResolvedValue({ redundantGrants: [], overriddenRevokes: [] }),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersAdminService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: PermissionsResolverService,
          useValue: { resolveForUser: jest.fn().mockResolvedValue({ roles: [], permissions: [] }) },
        },
        { provide: RolesService, useValue: roles },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<UsersAdminService>(UsersAdminService);
  });

  it('creates the user with no custom roles when roleIds is omitted', async () => {
    const result = await service.create('actor1', baseDto);

    expect(roles.assign).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'u1', role: 'STAFF' });
  });

  it('assigns every requested custom Role, distinct from the coarse account-kind role', async () => {
    prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u1', role: 'STAFF' });

    await service.create('actor1', { ...baseDto, roleIds: ['r1', 'r2'] });

    expect(roles.assign).toHaveBeenCalledWith('u1', 'r1');
    expect(roles.assign).toHaveBeenCalledWith('u1', 'r2');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ roleIds: ['r1', 'r2'] }) }),
    );
  });

  it('propagates a not-found error for an unknown roleId rather than silently skipping it', async () => {
    roles.assign.mockRejectedValueOnce(new NotFoundException('Role not found.'));

    await expect(service.create('actor1', { ...baseDto, roleIds: ['missing'] })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
