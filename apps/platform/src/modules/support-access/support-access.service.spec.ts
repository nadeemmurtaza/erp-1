import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SupportAccessService } from './support-access.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';

describe('SupportAccessService', () => {
  let prisma: any;
  let service: SupportAccessService;

  const tenant = { id: 't1', resourceTier: 'STANDARD' };
  const futureIso = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  beforeEach(async () => {
    prisma = {
      platformTenant: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
      supportAccessGrant: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };
    const config = { get: (key: string) => (key === 'PLATFORM_SUPPORT_GRANT_MAX_HOURS' ? 72 : undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportAccessService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(SupportAccessService);
  });

  describe('issue', () => {
    it('throws for an unknown tenant', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(null);
      await expect(
        service.issue({ tenantId: 't1', grantedToUserId: 'eng-1', reason: 'ticket-1', expiresAt: futureIso(1) }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a past expiresAt', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(tenant);
      await expect(
        service.issue({
          tenantId: 't1',
          grantedToUserId: 'eng-1',
          reason: 'ticket-1',
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a grant longer than the configured maximum — never indefinite', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(tenant);
      await expect(
        service.issue({ tenantId: 't1', grantedToUserId: 'eng-1', reason: 'ticket-1', expiresAt: futureIso(200) }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.supportAccessGrant.create).not.toHaveBeenCalled();
    });

    it('creates a grant with no approvedByUserId — approval is always a separate step', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(tenant);
      prisma.supportAccessGrant.create.mockResolvedValue({ id: 'g1' });

      await service.issue({ tenantId: 't1', grantedToUserId: 'eng-1', reason: 'ticket-1', expiresAt: futureIso(4) });

      expect(prisma.supportAccessGrant.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ grantedToUserId: 'eng-1' }) }),
      );
      expect(prisma.supportAccessGrant.create.mock.calls[0][0].data.approvedByUserId).toBeUndefined();
    });
  });

  describe('approve', () => {
    it('refuses the engineer a grant is for approving their own grant (the toxic pair)', async () => {
      prisma.supportAccessGrant.findUnique.mockResolvedValue({ id: 'g1', grantedToUserId: 'eng-1', approvedByUserId: null, revokedAt: null });

      await expect(service.approve('g1', 'eng-1')).rejects.toThrow(ForbiddenException);
      expect(prisma.supportAccessGrant.update).not.toHaveBeenCalled();
    });

    it('allows a different approver', async () => {
      prisma.supportAccessGrant.findUnique.mockResolvedValue({ id: 'g1', grantedToUserId: 'eng-1', approvedByUserId: null, revokedAt: null });
      prisma.supportAccessGrant.update.mockResolvedValue({ id: 'g1', approvedByUserId: 'eng-2' });

      const result = await service.approve('g1', 'eng-2');

      expect(result.approvedByUserId).toBe('eng-2');
    });

    it('refuses to re-approve an already-approved grant', async () => {
      prisma.supportAccessGrant.findUnique.mockResolvedValue({ id: 'g1', grantedToUserId: 'eng-1', approvedByUserId: 'eng-2', revokedAt: null });
      await expect(service.approve('g1', 'eng-3')).rejects.toThrow(BadRequestException);
    });
  });

  describe('recordAccess', () => {
    it('refuses a revoked grant', async () => {
      prisma.supportAccessGrant.findUnique.mockResolvedValue({
        id: 'g1',
        tenantId: 't1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 10_000),
      });
      prisma.platformTenant.findUniqueOrThrow.mockResolvedValue(tenant);

      await expect(service.recordAccess('g1')).rejects.toThrow(ForbiddenException);
    });

    it('refuses an expired grant even if markedInertAt has not run yet', async () => {
      prisma.supportAccessGrant.findUnique.mockResolvedValue({
        id: 'g1',
        tenantId: 't1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 10_000),
        markedInertAt: null,
      });
      prisma.platformTenant.findUniqueOrThrow.mockResolvedValue(tenant);

      await expect(service.recordAccess('g1')).rejects.toThrow(ForbiddenException);
    });

    it('refuses access to a DEDICATED-tenant grant awaiting its second approval', async () => {
      prisma.supportAccessGrant.findUnique.mockResolvedValue({
        id: 'g1',
        tenantId: 't1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 10_000),
        approvedByUserId: null,
      });
      prisma.platformTenant.findUniqueOrThrow.mockResolvedValue({ id: 't1', resourceTier: 'DEDICATED' });

      await expect(service.recordAccess('g1')).rejects.toThrow(ForbiddenException);
    });

    it('logs an access and appends to accessedAt for a live, approved grant', async () => {
      prisma.supportAccessGrant.findUnique.mockResolvedValue({
        id: 'g1',
        tenantId: 't1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 10_000),
        approvedByUserId: 'eng-2',
      });
      prisma.platformTenant.findUniqueOrThrow.mockResolvedValue({ id: 't1', resourceTier: 'DEDICATED' });
      prisma.supportAccessGrant.update.mockResolvedValue({ id: 'g1' });

      await service.recordAccess('g1');

      expect(prisma.supportAccessGrant.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { accessedAt: { push: expect.any(Date) } },
      });
    });

    it('allows access to a STANDARD-tenant grant with no approval required', async () => {
      prisma.supportAccessGrant.findUnique.mockResolvedValue({
        id: 'g1',
        tenantId: 't1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 10_000),
        approvedByUserId: null,
      });
      prisma.platformTenant.findUniqueOrThrow.mockResolvedValue(tenant);
      prisma.supportAccessGrant.update.mockResolvedValue({ id: 'g1' });

      await expect(service.recordAccess('g1')).resolves.toBeDefined();
    });
  });

  describe('markExpiredInert', () => {
    it('marks only unmarked, expired grants', async () => {
      prisma.supportAccessGrant.updateMany.mockResolvedValue({ count: 3 });
      const now = new Date();

      const count = await service.markExpiredInert(now);

      expect(count).toBe(3);
      expect(prisma.supportAccessGrant.updateMany).toHaveBeenCalledWith({
        where: { expiresAt: { lte: now }, markedInertAt: null },
        data: { markedInertAt: now },
      });
    });
  });

  describe('findByTicketReference', () => {
    it('filters by reason, case-insensitively', async () => {
      prisma.supportAccessGrant.findMany.mockResolvedValue([{ id: 'g1' }]);

      await service.findByTicketReference('TICKET-42');

      expect(prisma.supportAccessGrant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { reason: { contains: 'TICKET-42', mode: 'insensitive' } } }),
      );
    });
  });
});
