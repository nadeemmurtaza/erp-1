import { PosDashboardService } from './pos-dashboard.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';

describe('PosDashboardService — pos-hardware/76 WO-76.1', () => {
  let service: PosDashboardService;
  let prisma: any;
  let settings: { get: jest.Mock };

  beforeEach(() => {
    prisma = {
      order: { aggregate: jest.fn() },
      contact: { count: jest.fn() },
      $queryRaw: jest.fn(),
    };
    settings = { get: jest.fn().mockResolvedValue('Asia/Karachi') };
    service = new PosDashboardService(prisma as PrismaService, settings as unknown as SettingsService);
  });

  it('scopes daily sales to the given locationId and today only', async () => {
    prisma.order.aggregate.mockResolvedValue({ _sum: { grandTotal: 5000 }, _count: { _all: 3 } });
    prisma.contact.count.mockResolvedValue(10);
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await service.summary('loc1');

    expect(prisma.order.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ locationId: 'loc1' }),
      }),
    );
    expect(result.dailySales).toEqual({ revenue: 5000, orderCount: 3 });
  });

  it('returns zero revenue/orders when nothing sold yet today, never null', async () => {
    prisma.order.aggregate.mockResolvedValue({ _sum: { grandTotal: null }, _count: { _all: 0 } });
    prisma.contact.count.mockResolvedValue(0);
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await service.summary('loc1');

    expect(result.dailySales).toEqual({ revenue: 0, orderCount: 0 });
  });

  it('maps low-stock rows to numbers (raw SQL returns bigint-like values)', async () => {
    prisma.order.aggregate.mockResolvedValue({ _sum: { grandTotal: 0 }, _count: { _all: 0 } });
    prisma.contact.count.mockResolvedValue(0);
    prisma.$queryRaw.mockResolvedValue([
      { variantId: 'v1', sku: 'SKU1', productName: 'Kurta', variantLabel: 'Medium / Blue', stock: 2, reorderPoint: 3 },
    ]);

    const result = await service.summary('loc1');

    expect(result.lowStockVariants).toEqual([
      { variantId: 'v1', sku: 'SKU1', productName: 'Kurta', variantLabel: 'Medium / Blue', stock: 2, reorderPoint: 3 },
    ]);
  });

  it('never filters totalCustomers by location — Contact carries no locationId', async () => {
    prisma.order.aggregate.mockResolvedValue({ _sum: { grandTotal: 0 }, _count: { _all: 0 } });
    prisma.contact.count.mockResolvedValue(42);
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await service.summary('loc1');

    expect(prisma.contact.count).toHaveBeenCalledWith();
    expect(result.totalCustomers).toBe(42);
  });
});
