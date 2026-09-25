import { Test, TestingModule } from '@nestjs/testing';
import { InventoryCron } from './inventory.cron';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { Logger } from '@nestjs/common';

describe('InventoryCron', () => {
  let cron: InventoryCron;
  let prisma: any;
  let settings: any;

  beforeEach(async () => {
    prisma = {
      productVariant: { findMany: jest.fn() },
      stockMovement: { findMany: jest.fn(), findFirst: jest.fn() },
      variantSalesStat: { upsert: jest.fn() },
      variantForecast: { upsert: jest.fn() },
      supplier: { findMany: jest.fn().mockResolvedValue([]) },
      supplierProduct: { findMany: jest.fn().mockResolvedValue([]) },
    };

    settings = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryCron,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();

    cron = module.get<InventoryCron>(InventoryCron);
    // Suppress logs
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  it('units30 matches a hand count', async () => {
    settings.get.mockImplementation(async (key: any) => {
      if (key === SettingKey.InventorySlowMoverDays) return 60;
      if (key === SettingKey.InventoryDeadStockDays) return 180;
      if (key === SettingKey.PurchasingAutoDraftReorder) return false;
      if (key === SettingKey.DemandForecastMinLastYearUnits) return 5;
      return null;
    });

    prisma.productVariant.findMany.mockResolvedValue([
      { id: 'v1', stock: 10, createdAt: new Date() }
    ]);

    const now = new Date();
    // Two sales 10 days ago (within 30 days) of 2 units each = 4 units.
    // One sale 50 days ago (outside 30, inside 90) of 3 units.
    prisma.stockMovement.findMany.mockResolvedValue([
      { delta: -2, createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000) },
      { delta: -2, createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000) },
      { delta: -3, createdAt: new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000) },
    ]);

    prisma.stockMovement.findFirst.mockResolvedValue(null);

    await cron.computeNightlyStats();

    expect(prisma.variantSalesStat.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ units30: 4, units90: 7 }),
      })
    );
  });

  it('a stock-0 variant is not a slow mover', async () => {
    settings.get.mockImplementation(async (key: any) => {
      if (key === SettingKey.InventorySlowMoverDays) return 60;
      if (key === SettingKey.InventoryDeadStockDays) return 180;
      if (key === SettingKey.PurchasingAutoDraftReorder) return false;
      if (key === SettingKey.DemandForecastMinLastYearUnits) return 5;
      return null;
    });

    // Created long ago, stock = 0
    prisma.productVariant.findMany.mockResolvedValue([
      { id: 'v1', stock: 0, createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) }
    ]);
    prisma.stockMovement.findMany.mockResolvedValue([]); // no sales
    prisma.stockMovement.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) // receipt 100 days ago
    });

    await cron.computeNightlyStats();

    expect(prisma.variantSalesStat.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ isSlowMover: false, isDeadStock: false }),
      })
    );
  });
});
