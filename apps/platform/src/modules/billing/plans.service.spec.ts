import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PlansService } from './plans.service';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('PlansService', () => {
  let prisma: any;
  let service: PlansService;

  beforeEach(async () => {
    prisma = { platformPlan: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlansService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(PlansService);
  });

  it('refuses a duplicate plan key', async () => {
    prisma.platformPlan.findUnique.mockResolvedValue({ id: 'p1' });
    await expect(
      service.create({ key: 'solo-shared', editionCap: 'SOLO', includedResourceTier: 'STANDARD', pricingModel: 'FLAT_MONTHLY' }),
    ).rejects.toThrow(ConflictException);
  });

  it('requires perSeatPriceMinor for PER_SEAT', async () => {
    prisma.platformPlan.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ key: 'chain', editionCap: 'CHAIN', includedResourceTier: 'PLUS', pricingModel: 'PER_SEAT' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires oneTimeLicenseMinor and licenseDeploymentMode for ONE_TIME_LICENSE', async () => {
    prisma.platformPlan.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ key: 'perpetual', editionCap: 'ORG', includedResourceTier: 'DEDICATED', pricingModel: 'ONE_TIME_LICENSE' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a FLAT_MONTHLY plan with only its own fields set', async () => {
    prisma.platformPlan.findUnique.mockResolvedValue(null);
    prisma.platformPlan.create.mockResolvedValue({ id: 'p1' });

    await service.create({ key: 'solo', editionCap: 'SOLO', includedResourceTier: 'STANDARD', pricingModel: 'FLAT_MONTHLY', monthlyPriceMinor: 9900 });

    expect(prisma.platformPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ monthlyPriceMinor: 9900, perSeatPriceMinor: null, oneTimeLicenseMinor: null, licenseDeploymentMode: null }),
    });
  });

  it('creates a PER_SEAT plan with only its own fields set', async () => {
    prisma.platformPlan.findUnique.mockResolvedValue(null);
    prisma.platformPlan.create.mockResolvedValue({ id: 'p1' });

    await service.create({ key: 'chain', editionCap: 'CHAIN', includedResourceTier: 'PLUS', pricingModel: 'PER_SEAT', perSeatPriceMinor: 500 });

    expect(prisma.platformPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ monthlyPriceMinor: 0, perSeatPriceMinor: 500, oneTimeLicenseMinor: null }),
    });
  });
});
