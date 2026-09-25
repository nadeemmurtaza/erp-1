import { Test, TestingModule } from '@nestjs/testing';
import { InventoryCron } from './inventory.cron';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { SpotCheckService } from './spot-check.service';
import { Logger } from '@nestjs/common';

describe('InventoryCron', () => {
  let cron: InventoryCron;
  let prisma: any;
  let settings: any;
  let spotChecks: any;

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

    spotChecks = {
      maybeTriggerDueChecks: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryCron,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
        { provide: SpotCheckService, useValue: spotChecks },
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

  describe('maybeTriggerSpotCheck — 156-single-employee-branch-loss-prevention.md', () => {
    it('delegates to SpotCheckService and logs how many were created', async () => {
      spotChecks.maybeTriggerDueChecks.mockResolvedValue(['sc1', 'sc2']);
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

      await cron.maybeTriggerSpotCheck();

      expect(spotChecks.maybeTriggerDueChecks).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('2'));
    });

    it('logs nothing when nothing was due', async () => {
      spotChecks.maybeTriggerDueChecks.mockResolvedValue([]);
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
      logSpy.mockClear(); // spyOn on an already-spied prototype method keeps prior tests' call history

      await cron.maybeTriggerSpotCheck();

      expect(logSpy).not.toHaveBeenCalled();
    });

    it('a failure for the whole pass is caught and logged, never thrown — one bad tick must not crash the scheduler', async () => {
      spotChecks.maybeTriggerDueChecks.mockRejectedValue(new Error('db unavailable'));
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

      await expect(cron.maybeTriggerSpotCheck()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});
