import { Test, TestingModule } from '@nestjs/testing';
import { InventoryListener } from './inventory.listener';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { SettingsService } from '../../core/settings/settings.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Logger } from '@nestjs/common';

describe('InventoryListener', () => {
  let listener: InventoryListener;
  let notifications: any;
  let settings: any;
  let prisma: any;

  beforeEach(async () => {
    notifications = { send: jest.fn() };
    settings = { get: jest.fn().mockResolvedValue({ supportEmail: 'admin@test.com', nameEn: 'Test Store' }) };
    prisma = {
      variantSalesStat: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      }
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryListener,
        { provide: NotificationsService, useValue: notifications },
        { provide: SettingsService, useValue: settings },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    listener = module.get<InventoryListener>(InventoryListener);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  it('debounces notifications within 24 hours', async () => {
    const payload = {
      productId: 'p1',
      variantId: 'v1',
      sku: 'SKU1',
      stock: 5,
      threshold: 10
    };

    // First call: no previous alert
    prisma.variantSalesStat.findUnique.mockResolvedValue(null);
    await listener.handleLowStock(payload);
    expect(notifications.send).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();

    // Second call: alerted 1 hour ago
    prisma.variantSalesStat.findUnique.mockResolvedValue({
      lastLowStockAlertAt: new Date(Date.now() - 60 * 60 * 1000)
    });
    await listener.handleLowStock(payload);
    expect(notifications.send).not.toHaveBeenCalled();

    jest.clearAllMocks();

    // Third call: alerted 25 hours ago
    prisma.variantSalesStat.findUnique.mockResolvedValue({
      lastLowStockAlertAt: new Date(Date.now() - 25 * 60 * 60 * 1000)
    });
    await listener.handleLowStock(payload);
    expect(notifications.send).toHaveBeenCalledTimes(1);
  });
});
