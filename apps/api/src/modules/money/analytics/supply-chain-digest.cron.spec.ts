import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SupplyChainDigestCron } from './supply-chain-digest.cron';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { EventBusService } from '../../../core/events/event-bus.service';
import { DomainEvent } from '../../../core/events/domain-events';

describe('SupplyChainDigestCron', () => {
  let cron: SupplyChainDigestCron;
  let prisma: any;
  let notifications: any;
  let settings: any;
  let events: any;

  beforeEach(async () => {
    prisma = {
      supplier: { findMany: jest.fn() },
      stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
      productVariant: { findMany: jest.fn().mockResolvedValue([]) },
      purchaseOrderItem: { findMany: jest.fn().mockResolvedValue([]) },
      workOrder: { findMany: jest.fn().mockResolvedValue([]) },
    };
    notifications = { send: jest.fn() };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    settings = {
      get: jest.fn().mockImplementation(async (key: string) => {
        if (key === SettingKey.PurchasingSupplierDigestLeadDays) return 3;
        if (key === SettingKey.PurchasingSupplierScorecardOtifThreshold) return 85;
        if (key === SettingKey.InventoryDemandSurgeHorizonDays) return 14;
        if (key === SettingKey.Store) return { nameEn: 'Yaseen', supportEmail: 'support@yaseen.pk' };
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplyChainDigestCron,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: SettingsService, useValue: settings },
        { provide: EventBusService, useValue: events },
      ],
    }).compile();

    cron = module.get(SupplyChainDigestCron);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  describe('sendSupplierDigests', () => {
    it('emails a supplier whose variant is at or below its reorder point', async () => {
      prisma.supplier.findMany.mockResolvedValue([
        {
          id: 'sup1',
          name: 'Acme Textiles',
          email: 'legacy@acme.test',
          party: { email: 'acme@acme.test' },
          preferredVariants: [{ id: 'v1', sku: 'SKU1', stock: 2, reorderPoint: 5 }],
        },
      ]);
      prisma.stockMovement.findMany.mockResolvedValue([
        { delta: -1, createdAt: new Date() },
        { delta: -2, createdAt: new Date() },
      ]);

      await cron.sendSupplierDigests();

      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'purchasing.supplier_digest',
          recipient: { email: 'acme@acme.test', name: 'Acme Textiles' },
          body: expect.stringContaining('SKU1'),
        }),
      );
    });

    it('prefers the Party email over the legacy Supplier.email column', async () => {
      prisma.supplier.findMany.mockResolvedValue([
        {
          id: 'sup1',
          name: 'Acme',
          email: 'legacy@acme.test',
          party: { email: 'party@acme.test' },
          preferredVariants: [{ id: 'v1', sku: 'SKU1', stock: 0, reorderPoint: 5 }],
        },
      ]);

      await cron.sendSupplierDigests();

      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: expect.objectContaining({ email: 'party@acme.test' }) }),
      );
    });

    it('publishes SupplierDigestReady even for a supplier with no email at all — the two channels are independent', async () => {
      prisma.supplier.findMany.mockResolvedValue([
        { id: 'sup1', name: 'Acme', email: null, party: null, preferredVariants: [{ id: 'v1', sku: 'SKU1', stock: 0, reorderPoint: 5 }] },
      ]);

      await cron.sendSupplierDigests();

      expect(notifications.send).not.toHaveBeenCalled();
      expect(events.publish).toHaveBeenCalledWith(
        DomainEvent.SupplierDigestReady,
        expect.objectContaining({ supplierId: 'sup1', items: [expect.objectContaining({ sku: 'SKU1' })] }),
      );
    });

    it('does not flag a variant with healthy stock and no reorderPoint set', async () => {
      prisma.supplier.findMany.mockResolvedValue([
        {
          id: 'sup1',
          name: 'Acme',
          email: 'acme@test.com',
          party: null,
          preferredVariants: [{ id: 'v1', sku: 'SKU1', stock: 500, reorderPoint: null }],
        },
      ]);

      await cron.sendSupplierDigests();
      expect(notifications.send).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  describe('sendSupplierScorecards', () => {
    it('alerts when OTIF falls below the threshold', async () => {
      const expectedAt = new Date('2026-01-10');
      const lateReceipt = new Date('2026-01-15');
      prisma.supplier.findMany.mockResolvedValue([
        {
          id: 'sup1',
          name: 'Acme',
          purchaseOrders: [
            {
              number: 'PO-2026-0001',
              status: 'RECEIVED',
              expectedAt,
              items: [{ quantityOrdered: 10, quantityReceived: 10 }],
              receipts: [{ receivedAt: lateReceipt }],
            },
          ],
        },
      ]);

      await cron.sendSupplierScorecards();

      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'purchasing.supplier_scorecard',
          subject: expect.stringContaining('Acme'),
          data: expect.objectContaining({ otifPercent: 0 }),
        }),
      );
    });

    it('does not alert when every scored PO was on-time and in-full', async () => {
      const expectedAt = new Date('2026-01-10');
      const onTimeReceipt = new Date('2026-01-08');
      prisma.supplier.findMany.mockResolvedValue([
        {
          id: 'sup1',
          name: 'Acme',
          purchaseOrders: [
            {
              number: 'PO-2026-0001',
              status: 'RECEIVED',
              expectedAt,
              items: [{ quantityOrdered: 10, quantityReceived: 10 }],
              receipts: [{ receivedAt: onTimeReceipt }],
            },
          ],
        },
      ]);

      await cron.sendSupplierScorecards();
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('ignores a SENT PO that is not yet overdue', async () => {
      const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      prisma.supplier.findMany.mockResolvedValue([
        {
          id: 'sup1',
          name: 'Acme',
          purchaseOrders: [
            { number: 'PO-2026-0002', status: 'SENT', expectedAt: future, items: [], receipts: [] },
          ],
        },
      ]);

      await cron.sendSupplierScorecards();
      expect(notifications.send).not.toHaveBeenCalled();
    });
  });

  describe('sendDemandAlerts', () => {
    it('alerts on a rising-velocity variant projected to stock out within the horizon', async () => {
      prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1', sku: 'SKU1', stock: 5 }]);
      const now = Date.now();
      prisma.stockMovement.findMany.mockResolvedValue([
        // Prior week (8-14 days ago): 4 units.
        { delta: -4, createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000) },
        // This week: 10 units -- a clear surge.
        { delta: -10, createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000) },
      ]);
      prisma.purchaseOrderItem.findMany.mockResolvedValue([]);
      prisma.workOrder.findMany.mockResolvedValue([]);

      await cron.sendDemandAlerts();

      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'inventory.demand_surge', body: expect.stringContaining('SKU1') }),
      );
    });

    it('does not alert when velocity is falling', async () => {
      prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1', sku: 'SKU1', stock: 5 }]);
      const now = Date.now();
      prisma.stockMovement.findMany.mockResolvedValue([
        { delta: -10, createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000) },
        { delta: -2, createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000) },
      ]);

      await cron.sendDemandAlerts();
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('counts open POs and work orders as cover before alerting', async () => {
      prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1', sku: 'SKU1', stock: 5 }]);
      const now = Date.now();
      prisma.stockMovement.findMany.mockResolvedValue([
        { delta: -4, createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000) },
        { delta: -10, createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000) },
      ]);
      // Plenty already in flight -- projected cover comfortably clears the horizon.
      prisma.purchaseOrderItem.findMany.mockResolvedValue([{ quantityOrdered: 500, quantityReceived: 0 }]);

      await cron.sendDemandAlerts();
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('skips a variant with no sales history at all', async () => {
      prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1', sku: 'SKU1', stock: 5 }]);
      prisma.stockMovement.findMany.mockResolvedValue([]);

      await cron.sendDemandAlerts();
      expect(notifications.send).not.toHaveBeenCalled();
    });
  });
});
