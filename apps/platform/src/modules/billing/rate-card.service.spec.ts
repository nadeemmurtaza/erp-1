import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { RateCardService } from './rate-card.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';

describe('RateCardService', () => {
  let prisma: any;
  let config: any;
  let service: RateCardService;

  const usagePlan = { id: 'plan-1', key: 'usage', pricingModel: 'USAGE_BASED', transactionFeeBps: 100 };
  const flatPlan = { id: 'plan-2', key: 'flat', pricingModel: 'FLAT_MONTHLY', transactionFeeBps: null };

  beforeEach(async () => {
    prisma = {
      platformPlan: { findUnique: jest.fn(), update: jest.fn() },
      platformRateCardChangeRequest: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    };
    config = { get: jest.fn().mockReturnValue(50) }; // PLATFORM_RATE_CARD_APPROVAL_THRESHOLD_BPS

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateCardService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(RateCardService);
  });

  describe('proposeChange', () => {
    it('rejects a proposal against a non-USAGE_BASED plan', async () => {
      prisma.platformPlan.findUnique.mockResolvedValue(flatPlan);

      await expect(
        service.proposeChange({ planId: 'plan-2', transactionFeeBps: 200, requestedByOpsClientId: 'ops-1' }),
      ).rejects.toThrow('not USAGE_BASED');
    });

    it('rejects an empty proposal', async () => {
      prisma.platformPlan.findUnique.mockResolvedValue(usagePlan);
      await expect(service.proposeChange({ planId: 'plan-1', requestedByOpsClientId: 'ops-1' })).rejects.toThrow();
    });

    it('auto-approves a small bps move with no JSON edit', async () => {
      prisma.platformPlan.findUnique.mockResolvedValue(usagePlan);
      prisma.platformRateCardChangeRequest.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      // 100 -> 110 is a 10 bps move, under the 50 bps threshold.
      const request = await service.proposeChange({ planId: 'plan-1', transactionFeeBps: 110, requestedByOpsClientId: 'ops-1' });

      expect(request.requiresApproval).toBe(false);
      expect(request.status).toBe('APPROVED');
    });

    it('requires approval for a bps move above the threshold — doc 153 "authority and blast radius"', async () => {
      prisma.platformPlan.findUnique.mockResolvedValue(usagePlan);
      prisma.platformRateCardChangeRequest.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const request = await service.proposeChange({ planId: 'plan-1', transactionFeeBps: 500, requestedByOpsClientId: 'ops-1' });

      expect(request.requiresApproval).toBe(true);
      expect(request.status).toBe('PENDING');
    });

    it('always requires approval for a rate-card JSON edit, even with no bps move', async () => {
      prisma.platformPlan.findUnique.mockResolvedValue(usagePlan);
      prisma.platformRateCardChangeRequest.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const request = await service.proposeChange({
        planId: 'plan-1',
        usageRateCardMinor: { messages_sent: 200 },
        requestedByOpsClientId: 'ops-1',
      });

      expect(request.requiresApproval).toBe(true);
    });
  });

  describe('approve', () => {
    it('refuses the toxic pair: the proposer cannot also approve', async () => {
      prisma.platformRateCardChangeRequest.findUnique.mockResolvedValue({
        id: 'req-1', status: 'PENDING', requestedByOpsClientId: 'ops-1',
      });

      await expect(service.approve('req-1', 'ops-1')).rejects.toThrow(ForbiddenException);
    });

    it('a different ops client can approve', async () => {
      prisma.platformRateCardChangeRequest.findUnique.mockResolvedValue({
        id: 'req-1', status: 'PENDING', requestedByOpsClientId: 'ops-1',
      });
      prisma.platformRateCardChangeRequest.update.mockResolvedValue({ id: 'req-1', status: 'APPROVED' });

      const result = await service.approve('req-1', 'ops-2');

      expect(result.status).toBe('APPROVED');
    });
  });

  describe('apply', () => {
    it('writes the approved proposed values onto the plan, keeping unset fields unchanged', async () => {
      prisma.platformRateCardChangeRequest.findUnique.mockResolvedValue({
        id: 'req-1', planId: 'plan-1', status: 'APPROVED',
        proposedTransactionFeeBps: 150, proposedUsageRateCardMinor: null, proposedIncludedAllowances: null,
      });
      prisma.platformPlan.findUnique.mockResolvedValue(usagePlan);
      prisma.platformRateCardChangeRequest.update.mockResolvedValue({ id: 'req-1', appliedAt: new Date() });

      await service.apply('req-1');

      expect(prisma.platformPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: expect.objectContaining({ transactionFeeBps: 150 }),
      });
    });

    it('refuses to apply a request that was never approved', async () => {
      prisma.platformRateCardChangeRequest.findUnique.mockResolvedValue({ id: 'req-1', status: 'PENDING' });

      await expect(service.apply('req-1')).rejects.toThrow('not approved');
    });
  });
});
