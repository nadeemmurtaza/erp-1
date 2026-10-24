import { Test, TestingModule } from '@nestjs/testing';
import { HostnameResolverService } from './hostname-resolver.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';

describe('HostnameResolverService', () => {
  let prisma: any;
  let service: HostnameResolverService;

  const activeTenant = { id: 't1', slug: 'acme', status: 'ACTIVE', resourceTier: 'STANDARD', deploymentRef: 'cred-1', customDomain: null, customDomainVerifiedAt: null };

  beforeEach(async () => {
    prisma = { platformTenant: { findUnique: jest.fn() } };
    const config = { get: (key: string) => (key === 'PLATFORM_HOSTNAME_BASE_DOMAIN' ? 'platform.test' : undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [HostnameResolverService, { provide: PrismaService, useValue: prisma }, { provide: AppConfigService, useValue: config }],
    }).compile();

    service = module.get(HostnameResolverService);
  });

  it('resolves a subdomain to its tenant', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue(activeTenant);

    const result = await service.resolve('acme.platform.test');

    expect(prisma.platformTenant.findUnique).toHaveBeenCalledWith({ where: { slug: 'acme' } });
    expect(result).toEqual({ tenantId: 't1', slug: 'acme', status: 'ACTIVE', resourceTier: 'STANDARD', deploymentRef: 'cred-1' });
  });

  it('never routes a SUSPENDED tenant even if the row exists', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue({ ...activeTenant, status: 'SUSPENDED' });
    await expect(service.resolve('acme.platform.test')).resolves.toBeNull();
  });

  it('never routes a claimed-but-unverified custom domain — the domain-hijack gap', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue({ ...activeTenant, customDomain: 'shop.example.com', customDomainVerifiedAt: null });
    await expect(service.resolve('shop.example.com')).resolves.toBeNull();
  });

  it('routes a verified custom domain', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue({ ...activeTenant, customDomain: 'shop.example.com', customDomainVerifiedAt: new Date() });
    const result = await service.resolve('shop.example.com');
    expect(result?.tenantId).toBe('t1');
  });

  it('routes a TRIAL tenant — a trial runs on the real product, not a stripped-down preview', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue({ ...activeTenant, status: 'TRIAL' });
    const result = await service.resolve('acme.platform.test');
    expect(result?.status).toBe('TRIAL');
  });

  it('caches a positive resolution and does not re-query within the TTL', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue(activeTenant);

    await service.resolve('acme.platform.test');
    await service.resolve('acme.platform.test');

    expect(prisma.platformTenant.findUnique).toHaveBeenCalledTimes(1);
  });

  it('invalidate() forces a re-query on the next resolve', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue(activeTenant);

    await service.resolve('acme.platform.test');
    service.invalidate('acme.platform.test');
    await service.resolve('acme.platform.test');

    expect(prisma.platformTenant.findUnique).toHaveBeenCalledTimes(2);
  });

  it('returns null for a tenant with no deploymentRef yet (still PROVISIONING)', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue({ ...activeTenant, status: 'ACTIVE', deploymentRef: null });
    await expect(service.resolve('acme.platform.test')).resolves.toBeNull();
  });
});
