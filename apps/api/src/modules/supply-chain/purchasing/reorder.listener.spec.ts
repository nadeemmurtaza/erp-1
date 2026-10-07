import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { PurchasingReorderListener } from './reorder.listener';
import { PurchasingService } from './purchasing.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingKey } from '../../../core/settings/settings.defaults';

describe('PurchasingReorderListener', () => {
  let listener: PurchasingReorderListener;
  let purchasing: any;
  let settings: any;
  let prisma: any;

  const basePayload = {
    productId: 'p1',
    variantId: 'v1',
    sku: 'SKU1',
    stock: 5,
    reorderPoint: 10,
    reorderQuantity: 20,
    producedInHouse: false,
    preferredSupplierId: 'sup1',
  };

  beforeEach(async () => {
    purchasing = { upsertReorderDraftLine: jest.fn() };
    settings = { get: jest.fn().mockResolvedValue(true) };
    prisma = {
      productVariant: { findUnique: jest.fn().mockResolvedValue({ costPrice: 500 }) },
      variantForecast: { findUnique: jest.fn().mockResolvedValue(null) },
      supplierProduct: { findUnique: jest.fn().mockResolvedValue(null) },
      supplier: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasingReorderListener,
        { provide: PurchasingService, useValue: purchasing },
        { provide: SettingsService, useValue: settings },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    listener = module.get(PurchasingReorderListener);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  it('drafts a PO line for an externally sourced variant', async () => {
    await listener.onReorderPointReached(basePayload);

    expect(purchasing.upsertReorderDraftLine).toHaveBeenCalledWith({
      supplierId: 'sup1',
      variantId: 'v1',
      quantity: 20,
      unitCost: 500,
    });
  });

  it('ignores producedInHouse variants — production module owns those', async () => {
    await listener.onReorderPointReached({ ...basePayload, producedInHouse: true });
    expect(purchasing.upsertReorderDraftLine).not.toHaveBeenCalled();
  });

  it('ignores a variant with no preferred supplier', async () => {
    await listener.onReorderPointReached({ ...basePayload, preferredSupplierId: null });
    expect(purchasing.upsertReorderDraftLine).not.toHaveBeenCalled();
  });

  it('respects PurchasingAutoDraftReorder being off', async () => {
    settings.get.mockResolvedValue(false);
    await listener.onReorderPointReached(basePayload);
    expect(purchasing.upsertReorderDraftLine).not.toHaveBeenCalled();
    expect(settings.get).toHaveBeenCalledWith(SettingKey.PurchasingAutoDraftReorder);
  });

  it('falls back to (reorderPoint - stock) when reorderQuantity is unset', async () => {
    await listener.onReorderPointReached({ ...basePayload, reorderQuantity: null });
    expect(purchasing.upsertReorderDraftLine).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 5 }),
    );
  });

  it('uses a forecast-driven quantity and carries its reasoning as a note when reorderQuantity is unset and a forecast exists (WO-9.3)', async () => {
    settings.get.mockImplementation(async (key: string) => {
      if (key === SettingKey.PurchasingAutoDraftReorder) return true;
      if (key === SettingKey.DemandForecastSafetyStockDays) return 14;
      return null;
    });
    prisma.variantForecast.findUnique.mockResolvedValue({
      forecastedDailyDemand: 2,
      reasonEn: 'Demand typically runs about 2.0x higher this time of year, based on last year.',
    });
    prisma.supplier.findUnique.mockResolvedValue({ leadTimeDays: 7 });

    await listener.onReorderPointReached({ ...basePayload, reorderQuantity: null });

    expect(purchasing.upsertReorderDraftLine).toHaveBeenCalledWith({
      supplierId: 'sup1',
      variantId: 'v1',
      quantity: 42, // forecastedDailyDemand(2) * (leadTimeDays(7) + safetyStockDays(14))
      unitCost: 500,
      note: 'Demand typically runs about 2.0x higher this time of year, based on last year.',
    });
  });

  it('prefers a SupplierProduct lead-time override over the supplier default', async () => {
    settings.get.mockImplementation(async (key: string) => {
      if (key === SettingKey.PurchasingAutoDraftReorder) return true;
      if (key === SettingKey.DemandForecastSafetyStockDays) return 0;
      return null;
    });
    prisma.variantForecast.findUnique.mockResolvedValue({ forecastedDailyDemand: 1, reasonEn: null });
    prisma.supplierProduct.findUnique.mockResolvedValue({ leadTimeDays: 21 });
    prisma.supplier.findUnique.mockResolvedValue({ leadTimeDays: 7 });

    await listener.onReorderPointReached({ ...basePayload, reorderQuantity: null });

    expect(purchasing.upsertReorderDraftLine).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 21 }), // 1 * (21 + 0), not the supplier's own 7-day default
    );
  });

  it('never overrides a buyer\'s own reorderQuantity with a forecast-driven number, even when a forecast exists', async () => {
    prisma.variantForecast.findUnique.mockResolvedValue({ forecastedDailyDemand: 2, reasonEn: 'Demand is higher.' });
    prisma.supplier.findUnique.mockResolvedValue({ leadTimeDays: 7 });

    await listener.onReorderPointReached(basePayload); // reorderQuantity: 20, from basePayload

    expect(purchasing.upsertReorderDraftLine).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 20, note: undefined }),
    );
  });

  it('falls back to (reorderPoint - stock) when a forecast exists but no lead time can be resolved', async () => {
    prisma.variantForecast.findUnique.mockResolvedValue({ forecastedDailyDemand: 2, reasonEn: 'Demand is higher.' });
    // Neither supplierProduct nor supplier default resolves a lead time.

    await listener.onReorderPointReached({ ...basePayload, reorderQuantity: null });

    expect(purchasing.upsertReorderDraftLine).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 5, note: undefined }),
    );
  });
});
