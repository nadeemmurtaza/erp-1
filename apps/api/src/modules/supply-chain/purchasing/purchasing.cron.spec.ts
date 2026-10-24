import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { PurchasingCron } from './purchasing.cron';
import { PurchasingService } from './purchasing.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { PrismaService } from '../../../core/prisma/prisma.service';

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
      supplier: { findMany: jest.fn().mockResolvedValue([]) },
      supplierProduct: { findMany: jest.fn().mockResolvedValue([]) },
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

  it('uses a forecast-driven quantity and carries its reasoning as a note when reorderQuantity is unset (WO-9.3)', async () => {
    settings.get.mockImplementation(async (key: string) => {
      if (key === SettingKey.PurchasingAutoDraftReorder) return true;
      if (key === SettingKey.DemandForecastSafetyStockDays) return 14;
      return null;
    });
    prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'v1',
        sku: 'SKU1',
        stock: 5,
        reorderPoint: 10,
        reorderQuantity: null,
        preferredSupplierId: 'sup1',
        costPrice: 500,
        forecast: { forecastedDailyDemand: 2, reasonEn: 'Demand typically runs about 2.0x higher this time of year, based on last year.' },
      },
    ]);
    prisma.supplier.findMany.mockResolvedValue([{ id: 'sup1', leadTimeDays: 7 }]);

    await cron.sweepReorderCandidates();

    expect(purchasing.upsertReorderDraftLine).toHaveBeenCalledWith({
      supplierId: 'sup1',
      variantId: 'v1',
      quantity: 42, // forecastedDailyDemand(2) * (leadTimeDays(7) + safetyStockDays(14))
      unitCost: 500,
      note: 'Demand typically runs about 2.0x higher this time of year, based on last year.',
    });
  });

  it('falls back to the old reorderPoint-minus-stock guess when no forecast exists yet for the variant', async () => {
    settings.get.mockImplementation(async (key: string) => {
      if (key === SettingKey.PurchasingAutoDraftReorder) return true;
      return null;
    });
    prisma.productVariant.findMany.mockResolvedValue([
      { id: 'v1', sku: 'SKU1', stock: 2, reorderPoint: 10, reorderQuantity: null, preferredSupplierId: 'sup1', costPrice: 500, forecast: null },
    ]);

    await cron.sweepReorderCandidates();

    expect(purchasing.upsertReorderDraftLine).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 8, note: undefined }),
    );
  });

  it('never overrides a buyer\'s own reorderQuantity with a forecast-driven number, even when a forecast exists', async () => {
    settings.get.mockImplementation(async (key: string) => {
      if (key === SettingKey.PurchasingAutoDraftReorder) return true;
      if (key === SettingKey.DemandForecastSafetyStockDays) return 14;
      return null;
    });
    prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'v1',
        sku: 'SKU1',
        stock: 5,
        reorderPoint: 10,
        reorderQuantity: 99,
        preferredSupplierId: 'sup1',
        costPrice: 500,
        forecast: { forecastedDailyDemand: 2, reasonEn: 'Demand typically runs higher this time of year.' },
      },
    ]);
    prisma.supplier.findMany.mockResolvedValue([{ id: 'sup1', leadTimeDays: 7 }]);

    await cron.sweepReorderCandidates();

    expect(purchasing.upsertReorderDraftLine).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 99, note: undefined }),
    );
  });
});
