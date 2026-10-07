import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { EventBusService } from '../../../core/events/event-bus.service';
import { AuditService } from '../../../core/audit/audit.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { InventoryService, InsufficientStockError } from '../../supply-chain/inventory/inventory.service';
import { PaymentsService } from '../payments/payments.service';
import { OrdersService } from './orders.service';
import { InstalmentPlanService } from './instalment-plan.service';

/**
 * finance-accounting/151-layby-installment-sales.md WO-151.2. Every
 * collaborator mocked, same idiom `posting-rules.subscriber.spec.ts`
 * already uses in this codebase — this service's job is the plan/payment
 * orchestration logic, not re-proving `InventoryService`/`OrdersService`
 * themselves.
 */
describe('InstalmentPlanService', () => {
  let service: InstalmentPlanService;
  let prisma: any;
  let events: any;
  let audit: any;
  let settings: any;
  let inventory: any;
  let payments: any;
  let orders: any;

  beforeEach(async () => {
    prisma = {
      instalmentPlan: { findUnique: jest.fn(), update: jest.fn() },
      payment: { create: jest.fn() },
      instalmentPayment: { create: jest.fn() },
      order: { findUnique: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    events = { publish: jest.fn() };
    audit = { record: jest.fn() };
    settings = { get: jest.fn().mockResolvedValue(false) };
    inventory = { move: jest.fn() };
    payments = { refund: jest.fn() };
    orders = { changeStatus: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstalmentPlanService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventBusService, useValue: events },
        { provide: AuditService, useValue: audit },
        { provide: SettingsService, useValue: settings },
        { provide: InventoryService, useValue: inventory },
        { provide: PaymentsService, useValue: payments },
        { provide: OrdersService, useValue: orders },
      ],
    }).compile();

    service = module.get(InstalmentPlanService);
  });

  const ACTIVE_PLAN = (overrides: Partial<any> = {}) => ({
    id: 'plan1',
    orderId: 'order1',
    type: 'LAYBY',
    totalMinor: 1000,
    status: 'ACTIVE',
    payments: [{ isDeposit: true, paymentId: 'dep1', payment: { amount: 200, status: 'PAID' } }],
    ...overrides,
  });

  describe('recordInstalmentPayment', () => {
    it('refuses a non-positive amount', async () => {
      await expect(service.recordInstalmentPayment('u1', 'order1', 0, 'cash')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws NotFoundException when the order has no plan', async () => {
      prisma.instalmentPlan.findUnique.mockResolvedValue(null);
      await expect(service.recordInstalmentPayment('u1', 'order1', 100, 'cash')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses when the plan is not ACTIVE', async () => {
      prisma.instalmentPlan.findUnique.mockResolvedValue(ACTIVE_PLAN({ status: 'CANCELLED' }));
      await expect(service.recordInstalmentPayment('u1', 'order1', 100, 'cash')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses an overpayment — remaining is 800, submitting 900', async () => {
      prisma.instalmentPlan.findUnique.mockResolvedValue(ACTIVE_PLAN());
      await expect(service.recordInstalmentPayment('u1', 'order1', 900, 'cash')).rejects.toThrow(/overpay/);
    });

    it('records a partial payment and leaves the plan ACTIVE', async () => {
      prisma.instalmentPlan.findUnique.mockResolvedValue(ACTIVE_PLAN());
      prisma.payment.create.mockResolvedValue({ id: 'pay2', amount: 300 });

      const result = await service.recordInstalmentPayment('u1', 'order1', 300, 'cash');

      expect(prisma.instalmentPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { planId: 'plan1', paymentId: 'pay2' } }),
      );
      expect(prisma.instalmentPlan.update).not.toHaveBeenCalled();
      expect(events.publish).toHaveBeenCalledWith(
        'payment.succeeded',
        expect.objectContaining({ orderId: 'order1', amount: 300 }),
        prisma,
      );
      expect(result.planStatus).toBe('ACTIVE');
      expect(audit.record).toHaveBeenCalled();
    });

    it('completing a LAYBY plan releases stock and advances the order past PENDING', async () => {
      prisma.instalmentPlan.findUnique.mockResolvedValue(ACTIVE_PLAN());
      prisma.payment.create.mockResolvedValue({ id: 'pay2', amount: 800 });
      prisma.order.findUnique.mockResolvedValue({
        id: 'order1',
        locationId: 'loc1',
        items: [{ variantId: 'v1', quantity: 2, unitCost: 100 }],
      });

      const result = await service.recordInstalmentPayment('u1', 'order1', 800, 'cash');

      expect(prisma.instalmentPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'plan1' }, data: { status: 'COMPLETED' } }),
      );
      expect(inventory.move).toHaveBeenCalledWith(
        expect.objectContaining({ variantId: 'v1', locationId: 'loc1', delta: -2, reason: 'POS_SALE' }),
        prisma,
      );
      expect(orders.changeStatus).toHaveBeenCalledWith('u1', 'order1', 'CONFIRMED', expect.any(String));
      expect(result.planStatus).toBe('COMPLETED');
      expect(result.fulfilmentError).toBeNull();
    });

    it('completing an INSTALMENT plan does not touch stock or order status — goods already released', async () => {
      prisma.instalmentPlan.findUnique.mockResolvedValue(ACTIVE_PLAN({ type: 'INSTALMENT' }));
      prisma.payment.create.mockResolvedValue({ id: 'pay2', amount: 800 });

      const result = await service.recordInstalmentPayment('u1', 'order1', 800, 'cash');

      expect(inventory.move).not.toHaveBeenCalled();
      expect(orders.changeStatus).not.toHaveBeenCalled();
      expect(result.planStatus).toBe('COMPLETED');
    });

    it('a stock failure on LAYBY completion never loses the payment already recorded', async () => {
      prisma.instalmentPlan.findUnique.mockResolvedValue(ACTIVE_PLAN());
      prisma.payment.create.mockResolvedValue({ id: 'pay2', amount: 800 });
      prisma.order.findUnique.mockResolvedValue({
        id: 'order1',
        locationId: 'loc1',
        items: [{ variantId: 'v1', quantity: 2, unitCost: 100 }],
      });
      inventory.move.mockRejectedValue(new InsufficientStockError('v1', 'SKU-1', 0, -2));

      const result = await service.recordInstalmentPayment('u1', 'order1', 800, 'cash');

      // The payment/plan-completion transaction already committed above —
      // a stock failure surfaces as a message, never an exception that
      // would suggest the payment itself failed.
      expect(result.planStatus).toBe('COMPLETED');
      expect(result.fulfilmentError).toMatch(/stock/i);
      expect(orders.changeStatus).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('throws NotFoundException when the order has no plan', async () => {
      prisma.instalmentPlan.findUnique.mockResolvedValue(null);
      await expect(service.cancel('u1', 'order1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to cancel a plan that is not ACTIVE', async () => {
      prisma.instalmentPlan.findUnique.mockResolvedValue(ACTIVE_PLAN({ status: 'COMPLETED' }));
      await expect(service.cancel('u1', 'order1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refunds the deposit when the forfeiture Setting is false (the default)', async () => {
      settings.get.mockResolvedValue(false);
      prisma.instalmentPlan.findUnique.mockResolvedValue(ACTIVE_PLAN());

      const result = await service.cancel('u1', 'order1');

      expect(payments.refund).toHaveBeenCalledWith('u1', 'dep1', undefined, expect.any(String));
      expect(result).toEqual({ depositRefunded: true, depositForfeited: false });
      expect(prisma.instalmentPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
      );
    });

    it('forfeits the deposit (no refund) when the Setting is true', async () => {
      settings.get.mockResolvedValue(true);
      prisma.instalmentPlan.findUnique.mockResolvedValue(ACTIVE_PLAN());

      const result = await service.cancel('u1', 'order1');

      expect(payments.refund).not.toHaveBeenCalled();
      expect(result).toEqual({ depositRefunded: false, depositForfeited: true });
    });

    it('neither refunds nor forfeits when no deposit was ever taken', async () => {
      prisma.instalmentPlan.findUnique.mockResolvedValue(ACTIVE_PLAN({ payments: [] }));

      const result = await service.cancel('u1', 'order1');

      expect(payments.refund).not.toHaveBeenCalled();
      expect(result).toEqual({ depositRefunded: false, depositForfeited: false });
    });
  });

  describe('markDefaulted', () => {
    it('throws NotFoundException when the order has no plan', async () => {
      prisma.instalmentPlan.findUnique.mockResolvedValue(null);
      await expect(service.markDefaulted('u1', 'order1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a plan that is not ACTIVE', async () => {
      prisma.instalmentPlan.findUnique.mockResolvedValue(ACTIVE_PLAN({ status: 'DEFAULTED' }));
      await expect(service.markDefaulted('u1', 'order1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('writes off an active plan — status DEFAULTED, no stock or order-status side effect', async () => {
      prisma.instalmentPlan.findUnique.mockResolvedValue(ACTIVE_PLAN());
      prisma.instalmentPlan.update.mockResolvedValue({ id: 'plan1', status: 'DEFAULTED' });

      await service.markDefaulted('u1', 'order1');

      expect(prisma.instalmentPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DEFAULTED', defaultedAt: expect.any(Date) }) }),
      );
      expect(inventory.move).not.toHaveBeenCalled();
      expect(orders.changeStatus).not.toHaveBeenCalled();
    });
  });
});
