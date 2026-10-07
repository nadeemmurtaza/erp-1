import { Test, TestingModule } from '@nestjs/testing';
import { SizeRecommendationService } from './size-recommendation.service';
import { PrismaService } from '../../../core/prisma/prisma.service';

describe('SizeRecommendationService', () => {
  let service: SizeRecommendationService;
  let prisma: any;

  const kameez = {
    id: 'garment1',
    labelEn: 'Kameez',
    labelUr: 'قمیض',
    isActive: true,
    order: 1,
    fields: [
      { id: 'f1', key: 'chest', labelEn: 'Chest', labelUr: 'چھاتی', unit: 'INCH', min: 30, max: 50, required: true, order: 1, isActive: true, helpEn: null, helpUr: null },
    ],
    sizeChart: [
      { sizeToken: 'M', values: { chest: 40 } },
      { sizeToken: 'L', values: { chest: 44 } },
    ],
  };

  beforeEach(async () => {
    prisma = {
      product: { findUnique: jest.fn() },
      garmentType: { findMany: jest.fn() },
      measurementProfile: { findFirst: jest.fn() },
      productSizeBias: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SizeRecommendationService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(SizeRecommendationService);
  });

  it('returns null for a guest — no measurement profile can exist without an account', async () => {
    const result = await service.recommendForProduct(null, 'prod1');

    expect(result).toBeNull();
    expect(prisma.product.findUnique).not.toHaveBeenCalled();
  });

  it('returns null when the product has no linked garment type at all', async () => {
    prisma.product.findUnique.mockResolvedValue({ garmentTypes: [], variants: [{ size: 'M' }] });

    const result = await service.recommendForProduct('user1', 'prod1');

    expect(result).toBeNull();
  });

  it('returns null when the product sells no sized variant', async () => {
    prisma.product.findUnique.mockResolvedValue({ garmentTypes: [{ garmentTypeId: 'garment1' }], variants: [] });

    const result = await service.recommendForProduct('user1', 'prod1');

    expect(result).toBeNull();
    expect(prisma.garmentType.findMany).not.toHaveBeenCalled();
  });

  it('returns null when the customer has no saved profile for any of the product\'s garment types', async () => {
    prisma.product.findUnique.mockResolvedValue({
      garmentTypes: [{ garmentTypeId: 'garment1' }],
      variants: [{ size: 'M' }, { size: 'L' }],
    });
    prisma.garmentType.findMany.mockResolvedValue([kameez]);
    prisma.measurementProfile.findFirst.mockResolvedValue(null);

    const result = await service.recommendForProduct('user1', 'prod1');

    expect(result).toBeNull();
  });

  it('recommends a size from the matching profile, defaulting bias shift to 0 with no ProductSizeBias row yet', async () => {
    prisma.product.findUnique.mockResolvedValue({
      garmentTypes: [{ garmentTypeId: 'garment1' }],
      variants: [{ size: 'M' }, { size: 'L' }],
    });
    prisma.garmentType.findMany.mockResolvedValue([kameez]);
    prisma.measurementProfile.findFirst.mockResolvedValue({ id: 'profile1', values: { chest: 40 } });

    const result = await service.recommendForProduct('user1', 'prod1');

    expect(result).toEqual(
      expect.objectContaining({
        garmentTypeId: 'garment1',
        garmentTypeLabel: 'Kameez',
        profileId: 'profile1',
        recommendedSize: 'M',
        matchedSize: 'M',
        confidence: 'high',
      }),
    );
  });

  it('applies ProductSizeBias.shift when a bias row exists', async () => {
    prisma.product.findUnique.mockResolvedValue({
      garmentTypes: [{ garmentTypeId: 'garment1' }],
      variants: [{ size: 'M' }, { size: 'L' }],
    });
    prisma.garmentType.findMany.mockResolvedValue([kameez]);
    prisma.measurementProfile.findFirst.mockResolvedValue({ id: 'profile1', values: { chest: 40 } });
    prisma.productSizeBias.findUnique.mockResolvedValue({ shift: 1 });

    const result = await service.recommendForProduct('user1', 'prod1');

    expect(result?.matchedSize).toBe('M');
    expect(result?.recommendedSize).toBe('L');
  });

  it('returns the Urdu label when asked for the ur locale', async () => {
    prisma.product.findUnique.mockResolvedValue({
      garmentTypes: [{ garmentTypeId: 'garment1' }],
      variants: [{ size: 'M' }],
    });
    prisma.garmentType.findMany.mockResolvedValue([kameez]);
    prisma.measurementProfile.findFirst.mockResolvedValue({ id: 'profile1', values: { chest: 40 } });

    const result = await service.recommendForProduct('user1', 'prod1', 'ur');

    expect(result?.garmentTypeLabel).toBe('قمیض');
  });

  it('falls through to the next linked garment type when the customer has no profile for the first', async () => {
    const shalwar = { ...kameez, id: 'garment2', labelEn: 'Shalwar', order: 2, sizeChart: [{ sizeToken: 'M', values: { chest: 40 } }] };
    prisma.product.findUnique.mockResolvedValue({
      garmentTypes: [{ garmentTypeId: 'garment1' }, { garmentTypeId: 'garment2' }],
      variants: [{ size: 'M' }],
    });
    prisma.garmentType.findMany.mockResolvedValue([kameez, shalwar]);
    prisma.measurementProfile.findFirst
      .mockResolvedValueOnce(null) // no profile for kameez
      .mockResolvedValueOnce({ id: 'profile2', values: { chest: 40 } }); // has one for shalwar

    const result = await service.recommendForProduct('user1', 'prod1');

    expect(result?.garmentTypeId).toBe('garment2');
    expect(result?.profileId).toBe('profile2');
  });
});
