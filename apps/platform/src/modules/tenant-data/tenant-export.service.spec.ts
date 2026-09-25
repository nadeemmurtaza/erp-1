import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantExportService } from './tenant-export.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { PlatformNotificationsService } from '../../core/notifications/notifications.service';
import { TenantCredentialResolverService } from '../../core/tenant-credentials/tenant-credential-resolver.service';
import { TENANT_EXPORT_RUNNER } from './export-runner.token';

describe('TenantExportService', () => {
  let prisma: any;
  let credentials: any;
  let notifications: any;
  let runner: any;
  let service: TenantExportService;

  const tenant = { id: 't1', slug: 'acme', legalName: 'Acme', billingContactEmail: 'a@acme.test' };

  beforeEach(async () => {
    prisma = {
      platformTenant: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
      tenantDataExport: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    };
    credentials = { resolveConnectionString: jest.fn() };
    notifications = { send: jest.fn() };
    runner = { name: 'fake', run: jest.fn() };
    const config = { get: (key: string) => (key === 'PLATFORM_EXPORT_DOWNLOAD_TTL_DAYS' ? 14 : undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantExportService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: config },
        { provide: TenantCredentialResolverService, useValue: credentials },
        { provide: PlatformNotificationsService, useValue: notifications },
        { provide: TENANT_EXPORT_RUNNER, useValue: runner },
      ],
    }).compile();

    service = module.get(TenantExportService);
  });

  it('throws for an unknown tenant', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue(null);
    await expect(service.requestExport('missing')).rejects.toThrow(NotFoundException);
  });

  it('runs the export end to end and marks it COMPLETE, notifying the tenant', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue(tenant);
    prisma.tenantDataExport.create.mockResolvedValue({ id: 'exp-1', tenantId: 't1' });
    prisma.tenantDataExport.update.mockResolvedValue({ id: 'exp-1' });
    prisma.platformTenant.findUniqueOrThrow.mockResolvedValue(tenant);
    credentials.resolveConnectionString.mockResolvedValue('postgresql://x/tenant_acme');
    runner.run.mockResolvedValue({ storageKey: '/exports/acme/exp-1.dump', sizeBytes: 1024 });
    prisma.tenantDataExport.findUniqueOrThrow.mockResolvedValue({ id: 'exp-1', status: 'COMPLETE' });

    const result = await service.requestExport('t1', 'MANUAL');

    expect(prisma.tenantDataExport.update).toHaveBeenCalledWith({
      where: { id: 'exp-1' },
      data: { status: 'RUNNING', startedAt: expect.any(Date) },
    });
    expect(runner.run).toHaveBeenCalledWith({ tenantSlug: 'acme', exportId: 'exp-1', connectionString: 'postgresql://x/tenant_acme' });
    expect(prisma.tenantDataExport.update).toHaveBeenCalledWith({
      where: { id: 'exp-1' },
      data: expect.objectContaining({ status: 'COMPLETE', storageKey: '/exports/acme/exp-1.dump', sizeBytes: 1024n }),
    });
    expect(notifications.send).toHaveBeenCalledWith('a@acme.test', expect.any(String), expect.any(String));
    expect(result.status).toBe('COMPLETE');
  });

  it('marks the export FAILED and logs the reason when the runner throws — never leaves it stuck RUNNING', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue(tenant);
    prisma.tenantDataExport.create.mockResolvedValue({ id: 'exp-1', tenantId: 't1' });
    prisma.tenantDataExport.update.mockResolvedValue({ id: 'exp-1' });
    prisma.platformTenant.findUniqueOrThrow.mockResolvedValue(tenant);
    credentials.resolveConnectionString.mockResolvedValue('postgresql://x/tenant_acme');
    runner.run.mockRejectedValue(new Error('pg_dump exited 1'));
    prisma.tenantDataExport.findUniqueOrThrow.mockResolvedValue({ id: 'exp-1', status: 'FAILED' });

    await service.requestExport('t1', 'MANUAL');

    expect(prisma.tenantDataExport.update).toHaveBeenCalledWith({
      where: { id: 'exp-1' },
      data: expect.objectContaining({ status: 'FAILED', failureReason: 'pg_dump exited 1' }),
    });
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('hasCompletedExport reflects a COMPLETE row existing', async () => {
    prisma.tenantDataExport.count.mockResolvedValue(1);
    await expect(service.hasCompletedExport('t1')).resolves.toBe(true);
  });
});
