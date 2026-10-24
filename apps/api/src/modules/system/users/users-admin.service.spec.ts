import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../../core/audit/audit.service';
import { ApiKeysService } from '../../../core/auth/api-keys/api-keys.service';
import { PermissionsResolverService } from '../../../core/auth/permissions.service';
import { RolesService } from '../../../core/auth/roles.service';
import { EmployeeOffboardingRegistry } from '../../../core/extension-points/employee-offboarding.registry';
import { PrismaService } from '../../../core/prisma/prisma.service';
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
        { provide: ApiKeysService, useValue: { revokeAllForUserInTransaction: jest.fn() } },
        { provide: EmployeeOffboardingRegistry, useValue: { unreturnedAssetsFor: jest.fn().mockResolvedValue([]) } },
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

describe('UsersAdminService.update — deactivation ends every personal API key (canonical ruling 6)', () => {
  let service: UsersAdminService;
  let prisma: any;
  let tx: any;
  let apiKeys: any;
  let audit: any;
  let offboarding: any;

  const target = { id: 'u2', role: 'STAFF', isActive: true };

  beforeEach(async () => {
    tx = {
      user: { update: jest.fn().mockResolvedValue({ ...target }) },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(target), findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (work: (client: unknown) => unknown) => work(tx)),
    };
    apiKeys = { revokeAllForUserInTransaction: jest.fn().mockResolvedValue(3) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    offboarding = { unreturnedAssetsFor: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersAdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: PermissionsResolverService, useValue: { resolveForUser: jest.fn() } },
        { provide: RolesService, useValue: {} },
        { provide: AuditService, useValue: audit },
        { provide: ApiKeysService, useValue: apiKeys },
        { provide: EmployeeOffboardingRegistry, useValue: offboarding },
      ],
    }).compile();

    service = module.get<UsersAdminService>(UsersAdminService);
  });

  it("revokes the deactivated user's API keys inside the same transaction that sets isActive = false", async () => {
    await service.update('admin1', 'u2', { isActive: false });

    expect(apiKeys.revokeAllForUserInTransaction).toHaveBeenCalledWith(tx, 'u2', 'admin1', 'OWNER_DEACTIVATED');
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.updated', data: expect.objectContaining({ apiKeysRevoked: 3 }) }),
    );
  });

  it('refuses to deactivate someone who still holds an unreturned asset (WO-79.4)', async () => {
    offboarding.unreturnedAssetsFor.mockResolvedValueOnce([{ assetTag: 'LT-001', category: 'laptop' }]);

    await expect(service.update('admin1', 'u2', { isActive: false })).rejects.toThrow(/LT-001/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(apiKeys.revokeAllForUserInTransaction).not.toHaveBeenCalled();
  });

  it('does not consult the offboarding gate for a role change or a plain edit', async () => {
    await service.update('admin1', 'u2', { role: 'TAILOR' });
    expect(offboarding.unreturnedAssetsFor).not.toHaveBeenCalled();
  });

  it('does not revoke API keys on a role change — they shrink with the live permissions instead', async () => {
    await service.update('admin1', 'u2', { role: 'TAILOR' });

    expect(tx.refreshToken.updateMany).toHaveBeenCalled();
    expect(apiKeys.revokeAllForUserInTransaction).not.toHaveBeenCalled();
  });

  it('touches neither sessions nor keys on a plain profile edit', async () => {
    await service.update('admin1', 'u2', { firstName: 'Sana' });

    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(apiKeys.revokeAllForUserInTransaction).not.toHaveBeenCalled();
  });

  it('fails the whole deactivation if revoking the keys fails — authority goes together or not at all', async () => {
    apiKeys.revokeAllForUserInTransaction.mockRejectedValueOnce(new Error('audit write failed'));

    await expect(service.update('admin1', 'u2', { isActive: false })).rejects.toThrow('audit write failed');
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('UsersAdminService.resetPassword — "sign them out everywhere" means keys too', () => {
  let service: UsersAdminService;
  let prisma: any;
  let tx: any;
  let apiKeys: any;
  let audit: any;

  const target = { id: 'u3', role: 'STAFF', isActive: true };

  beforeEach(async () => {
    tx = {
      user: { update: jest.fn().mockResolvedValue({ ...target }) },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(target) },
      $transaction: jest.fn(async (work: (client: unknown) => unknown) => work(tx)),
    };
    apiKeys = { revokeAllForUserInTransaction: jest.fn().mockResolvedValue(1) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersAdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: PermissionsResolverService, useValue: { resolveForUser: jest.fn() } },
        { provide: RolesService, useValue: {} },
        { provide: AuditService, useValue: audit },
        { provide: ApiKeysService, useValue: apiKeys },
        { provide: EmployeeOffboardingRegistry, useValue: { unreturnedAssetsFor: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();

    service = module.get<UsersAdminService>(UsersAdminService);
  });

  it('revokes every personal API key of the target user in the same transaction as the password change', async () => {
    await service.resetPassword('admin1', 'u3', 'a-new-strong-password');

    expect(apiKeys.revokeAllForUserInTransaction).toHaveBeenCalledWith(tx, 'u3', 'admin1', 'ADMINISTRATOR');
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u3' }, data: expect.objectContaining({ passwordHash: expect.any(String) }) }),
    );
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u3', revokedAt: null } }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.password_reset', data: expect.objectContaining({ apiKeysRevoked: 1 }) }),
    );
  });

  it('fails the whole reset if revoking the keys fails — a reset that leaves a key standing is not a real reset', async () => {
    apiKeys.revokeAllForUserInTransaction.mockRejectedValueOnce(new Error('revoke failed'));

    await expect(service.resetPassword('admin1', 'u3', 'a-new-strong-password')).rejects.toThrow('revoke failed');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('throws for a target that is not a back-office user', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(service.resetPassword('admin1', 'missing', 'a-new-strong-password')).rejects.toThrow(
      NotFoundException,
    );
  });
});

// 208-l1-l2-l3-caching-architecture.md §2 — a personal override is one of the
// writes that change what PermissionsResolverService resolves.
describe('UsersAdminService.updatePermissions — the override reaches the next request', () => {
  let service: UsersAdminService;
  let prisma: any;
  let permissions: { resolveForUser: jest.Mock; invalidate: jest.Mock };

  const target = { id: 'u4', role: 'STAFF', isActive: true };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(target) },
      permission: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', key: 'orders.manage' }]) },
      userPermission: {
        deleteMany: jest.fn().mockReturnValue('delete-overrides'),
        createMany: jest.fn().mockReturnValue('create-overrides'),
        findMany: jest.fn().mockResolvedValue([]),
      },
      userRoleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    permissions = {
      resolveForUser: jest.fn().mockResolvedValue({ roles: [], permissions: ['orders.manage'] }),
      invalidate: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersAdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: PermissionsResolverService, useValue: permissions },
        {
          provide: RolesService,
          useValue: {
            assertLockedKeysStillHeldAfterRevoke: jest.fn().mockResolvedValue(undefined),
            conflictsForUser: jest.fn().mockResolvedValue({ redundantGrants: [], overriddenRevokes: [] }),
          },
        },
        { provide: AuditService, useValue: { record: jest.fn().mockResolvedValue(undefined) } },
        { provide: ApiKeysService, useValue: {} },
        { provide: EmployeeOffboardingRegistry, useValue: {} },
      ],
    }).compile();

    service = module.get<UsersAdminService>(UsersAdminService);
  });

  it('drops the target\'s cached permission set once the overrides are committed, then shows the uncached result', async () => {
    const result = await service.updatePermissions('admin1', 'u4', [{ key: 'orders.manage', effect: 'GRANT' }]);

    expect(prisma.$transaction).toHaveBeenCalledWith(['delete-overrides', 'create-overrides']);
    expect(permissions.invalidate).toHaveBeenCalledWith('u4');
    expect(permissions.invalidate.mock.invocationCallOrder[0]).toBeGreaterThan(prisma.$transaction.mock.invocationCallOrder[0]);
    // The admin reads back the database's answer, never a cached one.
    expect(permissions.resolveForUser).toHaveBeenCalledWith('u4');
    expect(result.effectivePermissions).toEqual(['orders.manage']);
  });

  it('drops nothing when the write is refused — an unknown key writes no override', async () => {
    await expect(
      service.updatePermissions('admin1', 'u4', [{ key: 'no.such.key' as any, effect: 'GRANT' }]),
    ).rejects.toThrow(/Unknown permission key/);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(permissions.invalidate).not.toHaveBeenCalled();
  });

  it('drops nothing when the transaction fails — the old overrides still stand', async () => {
    prisma.$transaction.mockRejectedValueOnce(new Error('serialization failure'));

    await expect(service.updatePermissions('admin1', 'u4', [{ key: 'orders.manage', effect: 'GRANT' }])).rejects.toThrow(
      'serialization failure',
    );
    expect(permissions.invalidate).not.toHaveBeenCalled();
  });
});
