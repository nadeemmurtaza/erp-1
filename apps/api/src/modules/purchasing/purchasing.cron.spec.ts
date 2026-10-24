import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { PurchasingCron } from './purchasing.cron';
import { PurchasingService } from './purchasing.service';
import { SettingsService } from '../../core/settings/settings.service';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('PurchasingCron', () => {
  let cron: PurchasingCron;
  let prisma: any;
  let settings: any;
  let purchasing: any;

  beforeEach(async () => {
    prisma = {
      productVariant: {
        findMany: jest.fn(),
        fields: { reorderPoint: Symbol('reorderPoint') },
      },
    };
    settings = { get: jest.fn().mockResolvedValue(true) };
    purchasing = { upsertReorderDraftLine: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasingCron,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
        { provide: PurchasingService, useValue: purchasing },
      ],
    }).compile();

    cron = module.get(PurchasingCron);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  it('sweeps every candidate variant through the shared upsert', async () => {
    prisma.productVariant.findMany.mockResolvedValue([
      { id: 'v1', sku: 'SKU1', stock: 5, reorderPoint: 10, reorderQuantity: 20, preferredSupplierId: 'sup1', costPrice: 500 },
      { id: 'v2', sku: 'SKU2', stock: 2, reorderPoint: 10, reorderQuantity: null, preferredSupplierId: 'sup2', costPrice: 300 },
    ]);

    await cron.sweepReorderCandidates();

    expect(purchasing.upsertReorderDraftLine).toHaveBeenCalledTimes(2);
    expect(purchasing.upsertReorderDraftLine).toHaveBeenCalledWith({
      supplierId: 'sup1',
      variantId: 'v1',
      quantity: 20,
      unitCost: 500,
    });
    expect(purchasing.upsertReorderDraftLine).toHaveBeenCalledWith({
      supplierId: 'sup2',
      variantId: 'v2',
      quantity: 8,
      unitCost: 300,
    });
  });

  it('no-ops entirely when PurchasingAutoDraftReorder is off', async () => {
    settings.get.mockResolvedValue(false);
    await cron.sweepReorderCandidates();
    expect(prisma.productVariant.findMany).not.toHaveBeenCalled();
    expect(purchasing.upsertReorderDraftLine).not.toHaveBeenCalled();
  });
});
