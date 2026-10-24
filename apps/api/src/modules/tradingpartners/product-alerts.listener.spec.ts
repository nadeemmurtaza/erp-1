import { Test, TestingModule } from '@nestjs/testing';
import { ProductAlertsListener } from './product-alerts.listener';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TradingPartnersService } from './trading-partners.service';

describe('ProductAlertsListener', () => {
  let listener: ProductAlertsListener;
  let prisma: any;
  let tradingPartners: any;

  beforeEach(async () => {
    prisma = { tradingPartner: { findMany: jest.fn() } };
    tradingPartners = { pushOutbound: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductAlertsListener,
        { provide: PrismaService, useValue: prisma },
        { provide: TradingPartnersService, useValue: tradingPartners },
      ],
    }).compile();

    listener = module.get(ProductAlertsListener);
  });

  it('queries only ACTIVE CUSTOMER/BOTH partners with an outboundBaseUrl on file', async () => {
    prisma.tradingPartner.findMany.mockResolvedValue([]);

    await listener.onProductPublished({ productId: 'p1', slug: 'shirt', nameEn: 'Shirt', basePriceMinor: 1000 });

    expect(prisma.tradingPartner.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', kind: { in: ['CUSTOMER', 'BOTH'] }, outboundBaseUrl: { not: null } },
      select: { id: true },
    });
  });

  it('pushes product.new to every matching partner on ProductPublished', async () => {
    prisma.tradingPartner.findMany.mockResolvedValue([{ id: 'tp1' }, { id: 'tp2' }]);
    const payload = { productId: 'p1', slug: 'shirt', nameEn: 'Shirt', basePriceMinor: 1000 };

    await listener.onProductPublished(payload);

    expect(tradingPartners.pushOutbound).toHaveBeenCalledWith('tp1', 'product.new', payload);
    expect(tradingPartners.pushOutbound).toHaveBeenCalledWith('tp2', 'product.new', payload);
  });

  it('pushes product.price_changed to every matching partner on ProductPriceChanged', async () => {
    prisma.tradingPartner.findMany.mockResolvedValue([{ id: 'tp1' }]);
    const payload = {
      productId: 'p1',
      slug: 'shirt',
      nameEn: 'Shirt',
      oldPriceMinor: 1000,
      newPriceMinor: 1200,
    };

    await listener.onProductPriceChanged(payload);

    expect(tradingPartners.pushOutbound).toHaveBeenCalledWith('tp1', 'product.price_changed', payload);
  });

  it('never leaks cost price or margin fields — payload is only what ProductAdminService published', async () => {
    prisma.tradingPartner.findMany.mockResolvedValue([{ id: 'tp1' }]);

    await listener.onProductPublished({ productId: 'p1', slug: 'shirt', nameEn: 'Shirt', basePriceMinor: 1000 });

    const pushedPayload = tradingPartners.pushOutbound.mock.calls[0][2];
    expect(pushedPayload).not.toHaveProperty('costPrice');
    expect(pushedPayload).not.toHaveProperty('margin');
  });
});
