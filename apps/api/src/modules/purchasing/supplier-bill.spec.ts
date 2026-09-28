import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PurchasingService } from './purchasing.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { LotsService } from '../inventory/lots.service';
import { SerializedUnitsService } from '../inventory/serialized-units.service';
import { PartiesService } from '../parties/parties.service';
import { SettingsService } from '../../core/settings/settings.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { BranchPolicyRegistry } from '../../core/extension-points/branch-policy.registry';
import { DomainEvent } from '../../core/events/domain-events';

/**
 * `createSupplierBill` / `recordSupplierBillPayment` (WO-19.3, RETAIL-ERP.md
 * R16) — the supplier-bill lifecycle the FX posting rules need something
 * real to react to. Base currency here is 'PKR' (packages/shared/brand.ts).
 */
describe('PurchasingService — supplier bills', () => {
  let service: PurchasingService;
  let tx: any;
  let events: any;

  beforeEach(async () => {
    tx = {
      supplier: { findUnique: jest.fn() },
      purchaseOrder: { findUnique: jest.fn() },
      supplierBill: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)) };
    events = { publish: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasingService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: {} },
        { provide: LotsService, useValue: {} },
        { provide: SerializedUnitsService, useValue: {} },
        { provide: PartiesService, useValue: {} },
        { provide: SettingsService, useValue: {} },
        { provide: AppConfigService, useValue: {} },
        { provide: EventBusService, useValue: events },
        { provide: BranchPolicyRegistry, useValue: { allowsBranchLocalPurchasing: jest.fn().mockResolvedValue(true) } },
      ],
    }).compile();

    service = module.get<PurchasingService>(PurchasingService);
  });

  describe('createSupplierBill', () => {
    it('books a base-currency bill at 1_000_000 with baseAmountMinor equal to the raw amount', async () => {
      tx.supplier.findUnique.mockResolvedValue({ id: 's1', currency: 'PKR' });
      tx.supplierBill.create.mockImplementation((args: any) => ({ id: 'b1', issuedAt: new Date(), ...args.data }));

      const bill = await service.createSupplierBill({ supplierId: 's1', amount: 50_000 });

      expect(bill.currency).toBe('PKR');
      expect(bill.fxRateScaled).toBe(1_000_000);
      expect(bill.baseAmountMinor).toBe(50_000);
      expect(events.publish).toHaveBeenCalledWith(
        DomainEvent.SupplierBillRaised,
        expect.objectContaining({ billId: 'b1', baseAmountMinor: 50_000 }),
        tx,
      );
    });

    it('converts a foreign-currency bill using the supplied rate', async () => {
      tx.supplier.findUnique.mockResolvedValue({ id: 's1', currency: 'USD' });
      tx.supplierBill.create.mockImplementation((args: any) => ({ id: 'b1', issuedAt: new Date(), ...args.data }));

      // $1,000.00 at 280.5 PKR/USD -> Rs 280,500.00
      const bill = await service.createSupplierBill({
        supplierId: 's1',
        amount: 100_000,
        currency: 'USD',
        fxRateScaled: 280_500_000,
      });

      expect(bill.baseAmountMinor).toBe(28_050_000);
      expect(bill.fxRateScaled).toBe(280_500_000);
    });

    it('refuses a foreign-currency bill with no fxRateScaled', async () => {
      tx.supplier.findUnique.mockResolvedValue({ id: 's1', currency: 'USD' });

      await expect(
        service.createSupplierBill({ supplierId: 's1', amount: 100_000, currency: 'USD' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.supplierBill.create).not.toHaveBeenCalled();
    });

    it('404s for an unknown supplier', async () => {
      tx.supplier.findUnique.mockResolvedValue(null);

      await expect(service.createSupplierBill({ supplierId: 'missing', amount: 1000 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses a purchase order belonging to a different supplier', async () => {
      tx.supplier.findUnique.mockResolvedValue({ id: 's1', currency: 'PKR' });
      tx.purchaseOrder.findUnique.mockResolvedValue({ id: 'po1', supplierId: 's2' });

      await expect(
        service.createSupplierBill({ supplierId: 's1', purchaseOrderId: 'po1', amount: 1000 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('recordSupplierBillPayment', () => {
    it('marks PARTIAL when the payment does not cover the full balance', async () => {
      tx.supplierBill.findUnique.mockResolvedValue({
        id: 'b1',
        currency: 'PKR',
        fxRateScaled: 1_000_000,
        amount: 1000,
        amountPaid: 0,
        status: 'UNPAID',
        supplierId: 's1',
      });
      tx.supplierBill.update.mockImplementation((args: any) => ({ id: 'b1', ...args.data }));

      const updated = await service.recordSupplierBillPayment('b1', { amountMinor: 400 });

      expect(updated.status).toBe('PARTIAL');
      expect(updated.amountPaid).toBe(400);
    });

    it('marks PAID and sets paidAt when the payment covers the remaining balance', async () => {
      tx.supplierBill.findUnique.mockResolvedValue({
        id: 'b1',
        currency: 'PKR',
        fxRateScaled: 1_000_000,
        amount: 1000,
        amountPaid: 600,
        status: 'PARTIAL',
        supplierId: 's1',
      });
      tx.supplierBill.update.mockImplementation((args: any) => ({ id: 'b1', ...args.data }));

      const updated = await service.recordSupplierBillPayment('b1', { amountMinor: 400 });

      expect(updated.status).toBe('PAID');
      expect(updated.paidAt).toBeInstanceOf(Date);
    });

    it('refuses a payment exceeding the outstanding balance', async () => {
      tx.supplierBill.findUnique.mockResolvedValue({
        id: 'b1',
        currency: 'PKR',
        fxRateScaled: 1_000_000,
        amount: 1000,
        amountPaid: 800,
        status: 'PARTIAL',
        supplierId: 's1',
      });

      await expect(service.recordSupplierBillPayment('b1', { amountMinor: 300 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tx.supplierBill.update).not.toHaveBeenCalled();
    });

    it('refuses a payment against an already-PAID bill', async () => {
      tx.supplierBill.findUnique.mockResolvedValue({
        id: 'b1',
        currency: 'PKR',
        fxRateScaled: 1_000_000,
        amount: 1000,
        amountPaid: 1000,
        status: 'PAID',
        supplierId: 's1',
      });

      await expect(service.recordSupplierBillPayment('b1', { amountMinor: 1 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses a foreign-currency bill payment with no settlement fxRateScaled', async () => {
      tx.supplierBill.findUnique.mockResolvedValue({
        id: 'b1',
        currency: 'USD',
        fxRateScaled: 280_000_000,
        amount: 1000,
        amountPaid: 0,
        status: 'UNPAID',
        supplierId: 's1',
      });

      await expect(service.recordSupplierBillPayment('b1', { amountMinor: 500 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('publishes SupplierBillPaid with both the booked and settlement rates, for the FX posting rule to compare', async () => {
      tx.supplierBill.findUnique.mockResolvedValue({
        id: 'b1',
        currency: 'USD',
        fxRateScaled: 280_000_000,
        amount: 1000,
        amountPaid: 0,
        status: 'UNPAID',
        supplierId: 's1',
      });
      tx.supplierBill.update.mockImplementation((args: any) => ({ id: 'b1', ...args.data }));

      await service.recordSupplierBillPayment('b1', { amountMinor: 1000, fxRateScaled: 282_000_000 });

      expect(events.publish).toHaveBeenCalledWith(
        DomainEvent.SupplierBillPaid,
        expect.objectContaining({
          billId: 'b1',
          amountMinor: 1000,
          currency: 'USD',
          billFxRateScaled: 280_000_000,
          settlementFxRateScaled: 282_000_000,
        }),
        tx,
      );
    });

    it('404s for an unknown bill', async () => {
      tx.supplierBill.findUnique.mockResolvedValue(null);

      await expect(service.recordSupplierBillPayment('missing', { amountMinor: 1 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
