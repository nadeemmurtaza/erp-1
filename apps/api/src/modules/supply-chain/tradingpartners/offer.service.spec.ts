import { Test, TestingModule } from '@nestjs/testing';
import { OfferService } from './offer.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { TradingPartnersService } from './trading-partners.service';

describe('OfferService', () => {
  let service: OfferService;
  let prisma: any;
  let tradingPartners: any;

  beforeEach(async () => {
    prisma = {
      offer: { create: jest.fn(), findMany: jest.fn() },
      tradingPartner: { findMany: jest.fn().mockResolvedValue([]) },
    };
    tradingPartners = { pushOutbound: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfferService,
        { provide: PrismaService, useValue: prisma },
        { provide: TradingPartnersService, useValue: tradingPartners },
      ],
    }).compile();

    service = module.get(OfferService);
  });

  describe('publish', () => {
    it('queries only ACTIVE CUSTOMER/BOTH partners with an outboundBaseUrl on file', async () => {
      prisma.offer.create.mockResolvedValue({ id: 'o1', title: 'Eid Sale', description: '10% off', discountLabel: '10%' });

      await service.publish({ title: 'Eid Sale', description: '10% off', discountLabel: '10%' });

      expect(prisma.tradingPartner.findMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE', kind: { in: ['CUSTOMER', 'BOTH'] }, outboundBaseUrl: { not: null } },
        select: { id: true },
      });
    });

    it('broadcasts offer.published to every matching partner', async () => {
      prisma.offer.create.mockResolvedValue({
        id: 'o1',
        title: 'Eid Sale',
        description: '10% off everything',
        discountLabel: '10%',
        validFrom: new Date(),
        validUntil: null,
      });
      prisma.tradingPartner.findMany.mockResolvedValue([{ id: 'tp1' }, { id: 'tp2' }]);

      const result = await service.publish({ title: 'Eid Sale', description: '10% off everything', discountLabel: '10%' });

      expect(tradingPartners.pushOutbound).toHaveBeenCalledWith(
        'tp1',
        'offer.published',
        expect.objectContaining({ title: 'Eid Sale', discountLabel: '10%' }),
      );
      expect(tradingPartners.pushOutbound).toHaveBeenCalledWith('tp2', 'offer.published', expect.anything());
      expect(result.id).toBe('o1');
    });

    it('does nothing when no partner matches', async () => {
      prisma.offer.create.mockResolvedValue({ id: 'o1', title: 'Eid Sale', description: 'x' });
      prisma.tradingPartner.findMany.mockResolvedValue([]);

      await service.publish({ title: 'Eid Sale', description: 'x' });

      expect(tradingPartners.pushOutbound).not.toHaveBeenCalled();
    });
  });
});
