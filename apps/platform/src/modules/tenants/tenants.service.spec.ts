import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantsService } from './tenants.service';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('TenantsService', () => {
  let prisma: any;
  let service: TenantsService;

  beforeEach(async () => {
    prisma = {
      platformTenant: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(TenantsService);
  });

  it('getById throws NotFoundException for a missing tenant', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue(null);
    await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
  });

  it('suspend sets status, suspendedAt and the reason', async () => {
    prisma.platformTenant.update.mockResolvedValue({ id: 't1', status: 'SUSPENDED' });

    await service.suspend('t1', 'non-payment');

    expect(prisma.platformTenant.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'SUSPENDED', suspendedAt: expect.any(Date), suspendedReason: 'non-payment' },
    });
  });

  it('reactivate clears the suspension fields', async () => {
    prisma.platformTenant.update.mockResolvedValue({ id: 't1', status: 'ACTIVE' });

    await service.reactivate('t1');

    expect(prisma.platformTenant.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'ACTIVE', suspendedAt: null, suspendedReason: null },
    });
  });
});
