import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TrialsService } from './trials.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantsService } from '../tenants/tenants.service';

describe('TrialsService', () => {
  let prisma: any;
  let tenants: any;
  let service: TrialsService;

  const trialTenant = { id: 't1', status: 'TRIAL', trialExpiresAt: new Date('2026-10-01T00:00:00Z') };

  beforeEach(async () => {
    prisma = {
      platformTenant: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      trialExtension: { create: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
    };
    tenants = { suspend: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TrialsService, { provide: PrismaService, useValue: prisma }, { provide: TenantsService, useValue: tenants }],
    }).compile();

    service = module.get(TrialsService);
  });

  describe('extend', () => {
    it('requires platform.trials.extend to be a TRIAL tenant', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue({ id: 't1', status: 'ACTIVE' });
      await expect(service.extend('t1', new Date('2026-11-01'), 'goodwill', 'ops-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects extending to an earlier or equal date', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(trialTenant);
      await expect(service.extend('t1', new Date('2026-09-01'), 'goodwill', 'ops-1')).rejects.toThrow(BadRequestException);
    });

    it('records the extension and pushes trialExpiresAt forward', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(trialTenant);
      prisma.platformTenant.update.mockResolvedValue({ ...trialTenant, trialExpiresAt: new Date('2026-11-01T00:00:00Z') });

      await service.extend('t1', new Date('2026-11-01T00:00:00Z'), 'customer asked for more time', 'ops-1');

      expect(prisma.trialExtension.create).toHaveBeenCalledWith({
        data: {
          tenantId: 't1',
          previousExpiresAt: trialTenant.trialExpiresAt,
          newExpiresAt: new Date('2026-11-01T00:00:00Z'),
          reason: 'customer asked for more time',
          extendedByOpsClientId: 'ops-1',
        },
      });
    });

    it('throws for an unknown tenant', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(null);
      await expect(service.extend('missing', new Date(), 'x', 'ops-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('convert', () => {
    it('moves a TRIAL tenant to ACTIVE', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(trialTenant);
      prisma.platformTenant.update.mockResolvedValue({ ...trialTenant, status: 'ACTIVE' });

      const result = await service.convert('t1');

      expect(prisma.platformTenant.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'ACTIVE' } });
      expect(result.status).toBe('ACTIVE');
    });

    it('refuses to convert a non-TRIAL tenant', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue({ id: 't1', status: 'ACTIVE' });
      await expect(service.convert('t1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('expireToSuspended', () => {
    it('delegates to TenantsService.suspend, reusing its own cache invalidation', async () => {
      tenants.suspend.mockResolvedValue({ id: 't1', status: 'SUSPENDED' });
      await service.expireToSuspended('t1');
      expect(tenants.suspend).toHaveBeenCalledWith('t1', 'Trial expired without conversion');
    });
  });

  describe('listExtendedMoreThanOnce', () => {
    it('maps the groupBy result to a plain report', async () => {
      prisma.trialExtension.groupBy.mockResolvedValue([{ tenantId: 't1', _count: { id: 3 } }]);
      await expect(service.listExtendedMoreThanOnce()).resolves.toEqual([{ tenantId: 't1', extensionCount: 3 }]);
    });
  });
});
