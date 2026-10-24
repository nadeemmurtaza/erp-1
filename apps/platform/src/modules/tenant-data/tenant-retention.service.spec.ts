import { Test, TestingModule } from '@nestjs/testing';
import { TenantRetentionService } from './tenant-retention.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantCredentialResolverService } from '../../core/tenant-credentials/tenant-credential-resolver.service';
import { TenantExportService } from './tenant-export.service';
import { DEPLOYMENT_PROVISIONER } from '../tenants/deployment-provisioner.token';

describe('TenantRetentionService', () => {
  let prisma: any;
  let credentials: any;
  let exportsService: any;
  let provisioner: any;
  let service: TenantRetentionService;

  const tenant = { id: 't1', slug: 'acme', status: 'DEPROVISIONED', retentionExpiresAt: new Date(Date.now() - 1000) };

  beforeEach(async () => {
    prisma = { platformTenant: { findMany: jest.fn(), update: jest.fn() } };
    credentials = { resolveConnectionString: jest.fn() };
    exportsService = { hasCompletedExport: jest.fn() };
    provisioner = { name: 'fake', provision: jest.fn(), deprovision: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantRetentionService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantCredentialResolverService, useValue: credentials },
        { provide: TenantExportService, useValue: exportsService },
        { provide: DEPLOYMENT_PROVISIONER, useValue: provisioner },
      ],
    }).compile();

    service = module.get(TenantRetentionService);
  });

  it('tears down a tenant past retention with a completed export, and marks dataDeletedAt', async () => {
    prisma.platformTenant.findMany.mockResolvedValue([tenant]);
    exportsService.hasCompletedExport.mockResolvedValue(true);
    credentials.resolveConnectionString.mockResolvedValue('postgresql://x/tenant_acme');
    prisma.platformTenant.update.mockResolvedValue({ ...tenant, dataDeletedAt: new Date() });

    const result = await service.run();

    expect(result).toEqual({ deleted: 1, skippedNoExport: 0 });
    expect(provisioner.deprovision).toHaveBeenCalledWith({ slug: 'acme', connectionString: 'postgresql://x/tenant_acme' });
    expect(prisma.platformTenant.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { dataDeletedAt: expect.any(Date) } });
  });

  it('refuses to tear down a tenant with no completed export — the safety gate', async () => {
    prisma.platformTenant.findMany.mockResolvedValue([tenant]);
    exportsService.hasCompletedExport.mockResolvedValue(false);

    const result = await service.run();

    expect(result).toEqual({ deleted: 0, skippedNoExport: 1 });
    expect(provisioner.deprovision).not.toHaveBeenCalled();
  });

  it('only queries DEPROVISIONED tenants past retention with no data deleted yet', async () => {
    prisma.platformTenant.findMany.mockResolvedValue([]);

    await service.listOverdueForTeardown();

    expect(prisma.platformTenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'DEPROVISIONED', retentionExpiresAt: { lte: expect.any(Date) }, dataDeletedAt: null },
      }),
    );
  });

  it('does not fail the whole sweep when one tenant teardown throws', async () => {
    const tenant2 = { ...tenant, id: 't2', slug: 'other' };
    prisma.platformTenant.findMany.mockResolvedValue([tenant, tenant2]);
    exportsService.hasCompletedExport.mockResolvedValue(true);
    credentials.resolveConnectionString.mockResolvedValueOnce('postgresql://x/tenant_acme').mockResolvedValueOnce('postgresql://x/tenant_other');
    provisioner.deprovision.mockRejectedValueOnce(new Error('db busy')).mockResolvedValueOnce(undefined);
    prisma.platformTenant.update.mockResolvedValue({});

    const result = await service.run();

    expect(result).toEqual({ deleted: 1, skippedNoExport: 0 });
  });
});
