import { Test, TestingModule } from '@nestjs/testing';
import { InventoryCron } from './inventory.cron';
import { PermissionsResolverService } from '../../../core/auth/permissions.service';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { LotsService } from './lots.service';
import { SpotCheckService } from './spot-check.service';
import { Logger } from '@nestjs/common';

describe('InventoryCron', () => {
  let cron: InventoryCron;
  let prisma: any;
  let settings: any;
  let spotChecks: any;
  let lots: any;
  let permissions: any;
  let notifications: any;

  beforeEach(async () => {
    prisma = {
      productVariant: { findMany: jest.fn() },
      stockMovement: { findMany: jest.fn(), findFirst: jest.fn() },
      variantSalesStat: { upsert: jest.fn() },
      variantForecast: { upsert: jest.fn() },
      markdownSuggestion: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      supplier: { findMany: jest.fn().mockResolvedValue([]) },
      supplierProduct: { findMany: jest.fn().mockResolvedValue([]) },
    };

    settings = {
      get: jest.fn(),
    };

    spotChecks = {
      maybeTriggerDueChecks: jest.fn().mockResolvedValue([]),
    };

    lots = {
      expiringLotsWithStock: jest.fn().mockResolvedValue([]),
    };

    permissions = {
      usersWithPermission: jest.fn().mockResolvedValue([]),
    };

    notifications = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryCron,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
        { provide: SpotCheckService, useValue: spotChecks },
        { provide: LotsService, useValue: lots },
        { provide: PermissionsResolverService, useValue: permissions },
        { provide: NotificationsService, useValue: notifications },
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

  describe('WO-9.8 — markdown suggestions', () => {
    function markdownSettings(overrides: Record<string, unknown> = {}) {
      return async (key: any) => {
        const values: Record<string, unknown> = {
          [SettingKey.InventorySlowMoverDays]: 60,
          [SettingKey.InventoryDeadStockDays]: 180,
          [SettingKey.DemandForecastMinLastYearUnits]: 5,
          [SettingKey.MarkdownVelocityMultiplierPer10Pct]: 1.4,
          [SettingKey.MarkdownTargetClearancePct]: 60,
          [SettingKey.MarkdownMinMarginBps]: 0,
          ...overrides,
        };
        return values[key] ?? null;
      };
    }

    const OLD_SALE = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);

    it('creates a suggestion for a slow-moving variant with a known cost and price', async () => {
      settings.get.mockImplementation(markdownSettings());
      prisma.productVariant.findMany.mockResolvedValue([
        {
          id: 'v1',
          stock: 2,
          createdAt: OLD_SALE,
          priceOverride: null,
          costPrice: 100000,
          product: { basePrice: 200000 },
        },
      ]);
      // 9 units sold 80 days ago: inside the 90-day window (units90 = 9,
      // used as the markdown baseline rate) but 80 days since the last sale
      // clears the 60-day slow-mover threshold, so this variant qualifies.
      prisma.stockMovement.findMany.mockResolvedValue([
        { delta: -9, createdAt: new Date(Date.now() - 80 * 24 * 60 * 60 * 1000) },
      ]);
      prisma.stockMovement.findFirst.mockResolvedValue({ createdAt: OLD_SALE });

      await cron.computeNightlyStats();

      expect(prisma.markdownSuggestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ variantId: 'v1', suggestedBps: expect.any(Number) }),
        }),
      );
    });

    it('never creates a second suggestion while one is already pending', async () => {
      settings.get.mockImplementation(markdownSettings());
      prisma.markdownSuggestion.findFirst.mockResolvedValue({ id: 'existing' });
      prisma.productVariant.findMany.mockResolvedValue([
        {
          id: 'v1',
          stock: 2,
          createdAt: OLD_SALE,
          priceOverride: null,
          costPrice: 100000,
          product: { basePrice: 200000 },
        },
      ]);
      prisma.stockMovement.findMany.mockResolvedValue([
        { delta: -9, createdAt: new Date(Date.now() - 80 * 24 * 60 * 60 * 1000) },
      ]);
      prisma.stockMovement.findFirst.mockResolvedValue({ createdAt: OLD_SALE });

      await cron.computeNightlyStats();

      expect(prisma.markdownSuggestion.create).not.toHaveBeenCalled();
    });

    it('creates nothing for a variant with an unknown cost (0 = never received against a PO)', async () => {
      settings.get.mockImplementation(markdownSettings());
      prisma.productVariant.findMany.mockResolvedValue([
        {
          id: 'v1',
          stock: 2,
          createdAt: OLD_SALE,
          priceOverride: null,
          costPrice: 0,
          product: { basePrice: 200000 },
        },
      ]);
      prisma.stockMovement.findMany.mockResolvedValue([
        { delta: -9, createdAt: new Date(Date.now() - 80 * 24 * 60 * 60 * 1000) },
      ]);
      prisma.stockMovement.findFirst.mockResolvedValue({ createdAt: OLD_SALE });

      await cron.computeNightlyStats();

      expect(prisma.markdownSuggestion.create).not.toHaveBeenCalled();
    });

    it('never even looks up a pending suggestion for a variant that is not ageing', async () => {
      settings.get.mockImplementation(markdownSettings());
      const recent = new Date();
      prisma.productVariant.findMany.mockResolvedValue([
        { id: 'v1', stock: 10, createdAt: recent, priceOverride: null, costPrice: 100000, product: { basePrice: 200000 } },
      ]);
      // Sold 2 days ago — nowhere near slow-mover/dead-stock territory.
      prisma.stockMovement.findMany.mockResolvedValue([
        { delta: -2, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
      ]);
      prisma.stockMovement.findFirst.mockResolvedValue(null);

      await cron.computeNightlyStats();

      expect(prisma.markdownSuggestion.findFirst).not.toHaveBeenCalled();
      expect(prisma.markdownSuggestion.create).not.toHaveBeenCalled();
    });

    it('uses priceOverride instead of the product base price when set', async () => {
      settings.get.mockImplementation(markdownSettings());
      prisma.productVariant.findMany.mockResolvedValue([
        {
          id: 'v1',
          stock: 2,
          createdAt: OLD_SALE,
          priceOverride: 150000,
          costPrice: 100000,
          product: { basePrice: 500000 },
        },
      ]);
      prisma.stockMovement.findMany.mockResolvedValue([
        { delta: -9, createdAt: new Date(Date.now() - 80 * 24 * 60 * 60 * 1000) },
      ]);
      prisma.stockMovement.findFirst.mockResolvedValue({ createdAt: OLD_SALE });

      await cron.computeNightlyStats();

      // marginBeforePaisa = currentPrice - costPrice = 150000 - 100000 = 50000,
      // which only matches if priceOverride (not the 500000 base price) was used.
      expect(prisma.markdownSuggestion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ marginBeforePaisa: 50000 }) }),
      );
    });
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

  describe('alertExpiringLots — 32-lots-batch-expiry-fefo.md WO-32.5', () => {
    it('sends nothing when no lots are expiring', async () => {
      lots.expiringLotsWithStock.mockResolvedValue([]);

      await cron.alertExpiringLots();

      expect(permissions.usersWithPermission).not.toHaveBeenCalled();
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('logs an escalation instead of a silent no-op when nobody holds inventory.manage', async () => {
      lots.expiringLotsWithStock.mockResolvedValue([
        { lotId: 'l1', lotCode: 'L001', expiresOn: new Date('2027-01-01'), sku: 'SKU-1', label: 'Widget', unsoldQuantity: 5 },
      ]);
      permissions.usersWithPermission.mockResolvedValue([]);
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

      await cron.alertExpiringLots();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('inventory.manage'));
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('sends one consolidated digest to every inventory.manage holder, never one per lot', async () => {
      lots.expiringLotsWithStock.mockResolvedValue([
        { lotId: 'l1', lotCode: 'L001', expiresOn: new Date('2027-01-01'), sku: 'SKU-1', label: 'Widget', unsoldQuantity: 5 },
        { lotId: 'l2', lotCode: 'L002', expiresOn: new Date('2027-01-05'), sku: 'SKU-2', label: 'Gadget', unsoldQuantity: 3 },
      ]);
      permissions.usersWithPermission.mockResolvedValue([
        { id: 'u1', email: 'a@example.com', firstName: 'A', lastName: 'One' },
        { id: 'u2', email: 'b@example.com', firstName: 'B', lastName: 'Two' },
      ]);

      await cron.alertExpiringLots();

      expect(permissions.usersWithPermission).toHaveBeenCalledWith('inventory.manage');
      expect(notifications.send).toHaveBeenCalledTimes(2);
      const bodies = notifications.send.mock.calls.map((call: any[]) => call[0].body);
      expect(bodies[0]).toContain('L001');
      expect(bodies[0]).toContain('L002');
      expect(bodies[0]).toBe(bodies[1]);
    });

    it('a failure is caught and logged, never thrown', async () => {
      lots.expiringLotsWithStock.mockRejectedValue(new Error('db unavailable'));
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

      await expect(cron.alertExpiringLots()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});
