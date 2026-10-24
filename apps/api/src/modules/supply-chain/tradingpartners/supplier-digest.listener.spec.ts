import { Test, TestingModule } from '@nestjs/testing';
import { SupplierDigestListener } from './supplier-digest.listener';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { TradingPartnersService } from './trading-partners.service';

describe('SupplierDigestListener', () => {
  let listener: SupplierDigestListener;
  let prisma: any;
  let tradingPartners: any;

  beforeEach(async () => {
    prisma = { supplier: { findUnique: jest.fn() } };
    tradingPartners = { pushOutbound: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplierDigestListener,
        { provide: PrismaService, useValue: prisma },
        { provide: TradingPartnersService, useValue: tradingPartners },
      ],
    }).compile();

    listener = module.get(SupplierDigestListener);
  });

  it('does nothing when the supplier has no linked TradingPartner', async () => {
    prisma.supplier.findUnique.mockResolvedValue({ tradingPartnerId: null });

    await listener.onSupplierDigestReady({ supplierId: 'sup1', items: [] });

    expect(tradingPartners.pushOutbound).not.toHaveBeenCalled();
  });

  it('does nothing when the supplier itself is not found', async () => {
    prisma.supplier.findUnique.mockResolvedValue(null);

    await listener.onSupplierDigestReady({ supplierId: 'missing', items: [] });

    expect(tradingPartners.pushOutbound).not.toHaveBeenCalled();
  });

  it('pushes the digest items to the linked TradingPartner', async () => {
    prisma.supplier.findUnique.mockResolvedValue({ tradingPartnerId: 'tp1' });
    const items = [{ sku: 'SKU1', stock: 2, soldToday: 1, soldThisWeek: 5, actionNeeded: true }];

    await listener.onSupplierDigestReady({ supplierId: 'sup1', items });

    expect(tradingPartners.pushOutbound).toHaveBeenCalledWith('tp1', 'supplier.stock_digest', { items });
  });
});
