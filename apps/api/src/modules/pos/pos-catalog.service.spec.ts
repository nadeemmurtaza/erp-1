import { PosCatalogService } from './pos-catalog.service';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('PosCatalogService — WO-21.4', () => {
  let service: PosCatalogService;
  let prisma: any;

  beforeEach(() => {
    prisma = { productVariant: { findMany: jest.fn() } };
    service = new PosCatalogService(prisma as PrismaService);
  });

  it('returns nothing for a blank search term, without querying', async () => {
    const result = await service.searchVariants('loc1', '   ');
    expect(result).toEqual([]);
    expect(prisma.productVariant.findMany).not.toHaveBeenCalled();
  });

  it('maps a variant to the till-relevant shape, effective price and this location’s own stock', async () => {
    prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'v1',
        productId: 'p1',
        sku: 'SKU1',
        barcode: '12345',
        priceOverride: null,
        product: { slug: 'kurta', basePrice: 2000, translations: [{ name: 'Kurta' }] },
        locationStocks: [{ quantity: 7 }],
      },
    ]);

    const result = await service.searchVariants('loc1', 'kurta');

    expect(result).toEqual([
      { variantId: 'v1', productId: 'p1', sku: 'SKU1', barcode: '12345', nameEn: 'Kurta', unitPrice: 2000, stock: 7 },
    ]);
  });

  it('prefers priceOverride over the product’s basePrice', async () => {
    prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'v1',
        productId: 'p1',
        sku: 'SKU1',
        barcode: null,
        priceOverride: 1500,
        product: { slug: 'kurta', basePrice: 2000, translations: [] },
        locationStocks: [],
      },
    ]);

    const result = await service.searchVariants('loc1', 'kurta');

    expect(result[0]!.unitPrice).toBe(1500);
    expect(result[0]!.nameEn).toBe('kurta');
    expect(result[0]!.stock).toBe(0);
  });
});
