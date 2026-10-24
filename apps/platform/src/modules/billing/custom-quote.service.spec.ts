import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CustomQuoteService } from './custom-quote.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';

describe('CustomQuoteService', () => {
  let prisma: any;
  let service: CustomQuoteService;

  const tenant = { id: 't1' };
  const plan = { id: 'plan-1' };

  beforeEach(async () => {
    prisma = {
      platformTenant: { findUnique: jest.fn() },
      platformPlan: { findUnique: jest.fn() },
      platformCustomQuote: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    };
    const config = { get: () => 20 }; // 20% approval threshold

    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomQuoteService, { provide: PrismaService, useValue: prisma }, { provide: AppConfigService, useValue: config }],
    }).compile();

    service = module.get(CustomQuoteService);
  });

  describe('requestQuote', () => {
    it('auto-approves a discount at or below the threshold', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(tenant);
      prisma.platformPlan.findUnique.mockResolvedValue(plan);
      prisma.platformCustomQuote.create.mockResolvedValue({ id: 'q1' });

      await service.requestQuote({ tenantId: 't1', planId: 'plan-1', listPriceMinor: 10000, quotedPriceMinor: 8500, requestedByOpsClientId: 'ops-1' });

      expect(prisma.platformCustomQuote.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ requiresApproval: false, status: 'APPROVED', discountPct: 15 }) }),
      );
    });

    it('requires approval for a discount above the threshold', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(tenant);
      prisma.platformPlan.findUnique.mockResolvedValue(plan);
      prisma.platformCustomQuote.create.mockResolvedValue({ id: 'q1' });

      await service.requestQuote({ tenantId: 't1', planId: 'plan-1', listPriceMinor: 10000, quotedPriceMinor: 5000, requestedByOpsClientId: 'ops-1' });

      expect(prisma.platformCustomQuote.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ requiresApproval: true, status: 'PENDING', discountPct: 50 }) }),
      );
    });

    it('rejects a quotedPriceMinor above listPriceMinor', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(tenant);
      prisma.platformPlan.findUnique.mockResolvedValue(plan);
      await expect(
        service.requestQuote({ tenantId: 't1', planId: 'plan-1', listPriceMinor: 1000, quotedPriceMinor: 2000, requestedByOpsClientId: 'ops-1' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approve', () => {
    it('refuses the requester approving their own quote — the toxic pair', async () => {
      prisma.platformCustomQuote.findUnique.mockResolvedValue({ id: 'q1', status: 'PENDING', requestedByOpsClientId: 'ops-1' });

      await expect(service.approve('q1', 'ops-1')).rejects.toThrow(ForbiddenException);
      expect(prisma.platformCustomQuote.update).not.toHaveBeenCalled();
    });

    it('allows a different ops client to approve', async () => {
      prisma.platformCustomQuote.findUnique.mockResolvedValue({ id: 'q1', status: 'PENDING', requestedByOpsClientId: 'ops-1' });
      prisma.platformCustomQuote.update.mockResolvedValue({ id: 'q1', status: 'APPROVED' });

      const result = await service.approve('q1', 'ops-2');

      expect(result.status).toBe('APPROVED');
    });

    it('refuses to approve a quote that is not pending', async () => {
      prisma.platformCustomQuote.findUnique.mockResolvedValue({ id: 'q1', status: 'APPROVED', requestedByOpsClientId: 'ops-1' });
      await expect(service.approve('q1', 'ops-2')).rejects.toThrow(BadRequestException);
    });
  });
});
