import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProvisioningService } from './provisioning.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { TenantCredentialResolverService } from '../../core/tenant-credentials/tenant-credential-resolver.service';
import { TenantExportService } from '../tenant-data/tenant-export.service';
import { HostnameResolverService } from '../routing/hostname-resolver.service';
import { DEPLOYMENT_PROVISIONER } from './deployment-provisioner.token';
import { ProvisioningError, type DeploymentProvisioner } from './deployment-provisioner';

const ENCRYPTION_KEY = 'test-platform-encryption-key-32b';

describe('ProvisioningService', () => {
  let prisma: any;
  let provisioner: jest.Mocked<DeploymentProvisioner>;
  let exportsService: any;
  let service: ProvisioningService;

  const dto = { slug: 'acme', legalName: 'Acme Retail', planKey: 'solo-shared' };
  const plan = { id: 'plan-1', key: 'solo-shared', isActive: true, includedResourceTier: 'STANDARD' };

  beforeEach(async () => {
    prisma = {
      platformTenant: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn() },
      platformPlan: { findUnique: jest.fn() },
      platformSubscription: { findFirst: jest.fn(), create: jest.fn() },
      tenantDeploymentCredential: { findUnique: jest.fn(), create: jest.fn() },
    };
    provisioner = {
      name: 'fake',
      provision: jest.fn(),
      deprovision: jest.fn(),
    };
    exportsService = { requestExport: jest.fn().mockResolvedValue({ id: 'exp-1' }) };
    const hostnameResolver = { invalidate: jest.fn(), subdomainFor: (slug: string) => `${slug}.platform.test` };
    const config = {
      get: (key: string) => {
        if (key === 'PLATFORM_ENCRYPTION_KEY') return ENCRYPTION_KEY;
        if (key === 'PLATFORM_RETENTION_DAYS_DEFAULT') return 30;
        if (key === 'PLATFORM_RETENTION_DAYS_TRIAL') return 7;
        return undefined;
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProvisioningService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: config },
        { provide: TenantCredentialResolverService, useValue: { resolveConnectionString: jest.fn() } },
        { provide: TenantExportService, useValue: exportsService },
        { provide: HostnameResolverService, useValue: hostnameResolver },
        { provide: DEPLOYMENT_PROVISIONER, useValue: provisioner },
      ],
    }).compile();

    service = module.get(ProvisioningService);
  });

  it('provisions a brand-new tenant end to end', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue(null);
    prisma.platformPlan.findUnique.mockResolvedValue(plan);
    prisma.platformTenant.create.mockResolvedValue({ id: 't1', slug: 'acme', status: 'PROVISIONING' });
    prisma.platformSubscription.findFirst.mockResolvedValue(null);
    provisioner.provision.mockResolvedValue({ connectionString: 'postgresql://x/tenant_acme' });
    prisma.tenantDeploymentCredential.findUnique.mockResolvedValue(null);
    prisma.tenantDeploymentCredential.create.mockResolvedValue({ id: 'cred-1' });
    prisma.platformTenant.update.mockResolvedValue({ id: 't1', slug: 'acme', status: 'ACTIVE', deploymentRef: 'cred-1' });

    const result = await service.provisionTenant(dto);

    expect(prisma.platformTenant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'acme', planId: 'plan-1' }) }),
    );
    expect(provisioner.provision).toHaveBeenCalledWith({ slug: 'acme' });
    expect(prisma.tenantDeploymentCredential.create).toHaveBeenCalled();
    const stored = prisma.tenantDeploymentCredential.create.mock.calls[0][0].data.connectionStringEncrypted;
    expect(stored).not.toContain('tenant_acme');
    expect(prisma.platformTenant.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'ACTIVE', deploymentRef: 'cred-1' },
    });
    expect(result.status).toBe('ACTIVE');
  });

  it('is idempotent: returns the existing tenant without re-provisioning when already ACTIVE', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue({ id: 't1', slug: 'acme', status: 'ACTIVE' });

    const result = await service.provisionTenant(dto);

    expect(result.status).toBe('ACTIVE');
    expect(provisioner.provision).not.toHaveBeenCalled();
    expect(prisma.platformTenant.create).not.toHaveBeenCalled();
  });

  it('resumes a PROVISIONING tenant on retry instead of creating a second one', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue({ id: 't1', slug: 'acme', status: 'PROVISIONING' });
    prisma.platformPlan.findUnique.mockResolvedValue(plan);
    prisma.platformSubscription.findFirst.mockResolvedValue({ id: 'sub-1' });
    provisioner.provision.mockResolvedValue({ connectionString: 'postgresql://x/tenant_acme' });
    prisma.tenantDeploymentCredential.findUnique.mockResolvedValue(null);
    prisma.tenantDeploymentCredential.create.mockResolvedValue({ id: 'cred-1' });
    prisma.platformTenant.update.mockResolvedValue({ id: 't1', slug: 'acme', status: 'ACTIVE' });

    await service.provisionTenant(dto);

    expect(prisma.platformTenant.create).not.toHaveBeenCalled();
    expect(prisma.platformSubscription.create).not.toHaveBeenCalled();
    expect(provisioner.provision).toHaveBeenCalledTimes(1);
  });

  it('refuses to re-provision a SUSPENDED tenant\'s slug', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue({ id: 't1', slug: 'acme', status: 'SUSPENDED' });

    await expect(service.provisionTenant(dto)).rejects.toThrow(ConflictException);
  });

  it('rejects an unknown or inactive plan', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue(null);
    prisma.platformPlan.findUnique.mockResolvedValue(null);

    await expect(service.provisionTenant(dto)).rejects.toThrow(NotFoundException);
    expect(provisioner.provision).not.toHaveBeenCalled();
  });

  it('leaves the tenant row at PROVISIONING when the provisioner fails, for a retryable action', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue(null);
    prisma.platformPlan.findUnique.mockResolvedValue(plan);
    prisma.platformTenant.create.mockResolvedValue({ id: 't1', slug: 'acme', status: 'PROVISIONING' });
    prisma.platformSubscription.findFirst.mockResolvedValue(null);
    provisioner.provision.mockRejectedValue(new Error('database cluster unreachable'));

    await expect(service.provisionTenant(dto)).rejects.toThrow(ProvisioningError);
    expect(prisma.platformTenant.update).not.toHaveBeenCalled();
    expect(prisma.tenantDeploymentCredential.create).not.toHaveBeenCalled();
  });

  describe('deprovisionTenant', () => {
    it('marks the tenant DEPROVISIONED without touching the database provisioner, sets retentionExpiresAt, and fires an automatic export', async () => {
      prisma.platformTenant.findUniqueOrThrow.mockResolvedValue({ id: 't1', status: 'ACTIVE' });
      prisma.platformTenant.update.mockResolvedValue({ id: 't1', status: 'DEPROVISIONED' });

      const result = await service.deprovisionTenant('t1');

      expect(result.status).toBe('DEPROVISIONED');
      expect(provisioner.deprovision).not.toHaveBeenCalled();
      expect(prisma.platformTenant.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: expect.objectContaining({ status: 'DEPROVISIONED', retentionExpiresAt: expect.any(Date) }),
      });
      expect(exportsService.requestExport).toHaveBeenCalledWith('t1', 'DEPROVISION');
    });

    it('gives a TRIAL tenant the shorter retention window', async () => {
      prisma.platformTenant.findUniqueOrThrow.mockResolvedValue({ id: 't1', status: 'TRIAL' });
      prisma.platformTenant.update.mockResolvedValue({ id: 't1', status: 'DEPROVISIONED' });

      await service.deprovisionTenant('t1');

      const data = prisma.platformTenant.update.mock.calls[0][0].data;
      const daysOut = (data.retentionExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(daysOut).toBeLessThan(8);
      expect(daysOut).toBeGreaterThan(6);
    });

    it('does not let a failed automatic export undo the DEPROVISIONED transition', async () => {
      prisma.platformTenant.findUniqueOrThrow.mockResolvedValue({ id: 't1', status: 'ACTIVE' });
      prisma.platformTenant.update.mockResolvedValue({ id: 't1', status: 'DEPROVISIONED' });
      exportsService.requestExport.mockRejectedValue(new Error('pg_dump unavailable'));

      const result = await service.deprovisionTenant('t1');

      expect(result.status).toBe('DEPROVISIONED');
    });
  });
});
