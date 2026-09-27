import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../core/audit/audit.service';
import { FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { FeatureFlagsAdminService } from './feature-flags-admin.service';

describe('FeatureFlagsAdminService — WO-37.2/37.5', () => {
  let service: FeatureFlagsAdminService;
  let prisma: any;
  let flags: any;
  let audit: any;

  const FLAG = {
    id: 'flag-1',
    key: 'payroll.advance-salary-v2',
    description: 'desc',
    rolloutPercent: 10,
    enabledOrgIds: [],
    killSwitch: false,
    moneyOrStockPath: true,
    proposedRolloutPercent: null,
    proposedKillSwitchOff: false,
    proposedById: null,
    proposedAt: null,
    approvedById: null,
    approvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    removalCriteria: null,
  };

  beforeEach(async () => {
    prisma = {
      featureFlag: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    flags = { invalidate: jest.fn() };
    audit = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureFlagsAdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: FeatureFlagsService, useValue: flags },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(FeatureFlagsAdminService);
  });

  describe('listStale', () => {
    it('queries flags older than 90 days with no removal criteria', async () => {
      prisma.featureFlag.findMany.mockResolvedValue([]);
      await service.listStale();

      const args = prisma.featureFlag.findMany.mock.calls[0][0];
      expect(args.where.removalCriteria).toBeNull();
      expect(args.where.createdAt.lt).toBeInstanceOf(Date);
    });
  });

  describe('update', () => {
    it('applies a routine edit directly and invalidates the cache', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ ...FLAG, moneyOrStockPath: false });
      prisma.featureFlag.update.mockResolvedValue({ ...FLAG, moneyOrStockPath: false, description: 'new' });

      await service.update('flag-1', { description: 'new' }, 'user-1');

      expect(flags.invalidate).toHaveBeenCalledWith(FLAG.key);
      expect(audit.record).toHaveBeenCalled();
    });

    it('refuses to clear the kill switch directly on a money/stock-path flag', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ ...FLAG, killSwitch: true });

      await expect(service.update('flag-1', { killSwitch: false }, 'user-1')).rejects.toThrow(ForbiddenException);
      expect(prisma.featureFlag.update).not.toHaveBeenCalled();
    });

    it('refuses to raise rolloutPercent to 100 directly on a money/stock-path flag', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue(FLAG);

      await expect(service.update('flag-1', { rolloutPercent: 100 }, 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('allows setting killSwitch to true directly even on a money/stock-path flag — turning risk down needs no approval', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue(FLAG);
      prisma.featureFlag.update.mockResolvedValue({ ...FLAG, killSwitch: true });

      await service.update('flag-1', { killSwitch: true }, 'user-1');

      expect(prisma.featureFlag.update).toHaveBeenCalled();
    });

    it('allows any rolloutPercent, including 100, directly on a non-money/stock-path flag', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ ...FLAG, moneyOrStockPath: false });
      prisma.featureFlag.update.mockResolvedValue({ ...FLAG, moneyOrStockPath: false, rolloutPercent: 100 });

      await service.update('flag-1', { rolloutPercent: 100 }, 'user-1');

      expect(prisma.featureFlag.update).toHaveBeenCalled();
    });
  });

  describe('proposeRollout', () => {
    it('refuses on a flag that is not money/stock-path', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ ...FLAG, moneyOrStockPath: false });

      await expect(service.proposeRollout('flag-1', { rolloutPercent: 100 }, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('refuses an empty proposal', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue(FLAG);

      await expect(service.proposeRollout('flag-1', {}, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('records who proposed the change and when', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue(FLAG);
      prisma.featureFlag.update.mockResolvedValue({ ...FLAG, proposedRolloutPercent: 100, proposedById: 'user-1' });

      await service.proposeRollout('flag-1', { rolloutPercent: 100 }, 'user-1');

      const args = prisma.featureFlag.update.mock.calls[0][0];
      expect(args.data.proposedRolloutPercent).toBe(100);
      expect(args.data.proposedById).toBe('user-1');
    });
  });

  describe('approveRollout', () => {
    it('refuses when nothing has been proposed', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue(FLAG);

      await expect(service.approveRollout('flag-1', 'user-2')).rejects.toThrow(ConflictException);
    });

    it('refuses the same person who proposed the change — never self-approved', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ ...FLAG, proposedById: 'user-1', proposedRolloutPercent: 100 });

      await expect(service.approveRollout('flag-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('commits the proposed rollout percentage when approved by a different person', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ ...FLAG, proposedById: 'user-1', proposedRolloutPercent: 100 });
      prisma.featureFlag.update.mockResolvedValue({ ...FLAG, rolloutPercent: 100, proposedById: null });

      await service.approveRollout('flag-1', 'user-2');

      const args = prisma.featureFlag.update.mock.calls[0][0];
      expect(args.data.rolloutPercent).toBe(100);
      expect(args.data.proposedById).toBeNull();
      expect(args.data.approvedById).toBe('user-2');
      expect(flags.invalidate).toHaveBeenCalledWith(FLAG.key);
    });

    it('commits clearing the kill switch when proposedKillSwitchOff is set', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({
        ...FLAG,
        killSwitch: true,
        proposedById: 'user-1',
        proposedKillSwitchOff: true,
      });
      prisma.featureFlag.update.mockResolvedValue({ ...FLAG, killSwitch: false });

      await service.approveRollout('flag-1', 'user-2');

      const args = prisma.featureFlag.update.mock.calls[0][0];
      expect(args.data.killSwitch).toBe(false);
    });

    it('throws NotFoundException for a missing flag', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue(null);

      await expect(service.approveRollout('missing', 'user-2')).rejects.toThrow(NotFoundException);
    });
  });
});
