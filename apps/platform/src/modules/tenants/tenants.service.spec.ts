import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantsService } from './tenants.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { HostnameResolverService } from '../routing/hostname-resolver.service';

describe('TenantsService', () => {
  let prisma: any;
  let hostnameResolver: any;
  let service: TenantsService;

  beforeEach(async () => {
    prisma = {
      platformTenant: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    hostnameResolver = { invalidate: jest.fn(), subdomainFor: (slug: string) => `${slug}.platform.test` };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: HostnameResolverService, useValue: hostnameResolver },
      ],
    }).compile();

    service = module.get(TenantsService);
  });

  it('getById throws NotFoundException for a missing tenant', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue(null);
    await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
  });

  it('suspend sets status, suspendedAt and the reason, and invalidates the hostname cache', async () => {
    prisma.platformTenant.update.mockResolvedValue({ id: 't1', slug: 'acme', customDomain: null, status: 'SUSPENDED' });

    await service.suspend('t1', 'non-payment');

    expect(prisma.platformTenant.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'SUSPENDED', suspendedAt: expect.any(Date), suspendedReason: 'non-payment' },
    });
    expect(hostnameResolver.invalidate).toHaveBeenCalledWith('acme.platform.test');
  });

  it('reactivate clears the suspension fields and invalidates the hostname cache', async () => {
    prisma.platformTenant.update.mockResolvedValue({ id: 't1', slug: 'acme', customDomain: 'shop.example.com', status: 'ACTIVE' });

    await service.reactivate('t1');

    expect(prisma.platformTenant.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'ACTIVE', suspendedAt: null, suspendedReason: null },
    });
    expect(hostnameResolver.invalidate).toHaveBeenCalledWith('acme.platform.test', 'shop.example.com');
  });
});
