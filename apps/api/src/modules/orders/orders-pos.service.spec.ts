import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { AuditService } from '../../core/audit/audit.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { CheckoutValidatorRegistry } from '../../core/checkout/checkout-validator.registry';
import { EntityEnrichmentRegistry } from '../../core/extension-points/entity-enrichment.registry';
import { StockIntakeRegistry } from '../../core/extension-points/stock-intake.registry';
import { InventoryService } from '../inventory/inventory.service';
import { PaymentsService } from '../payments/payments.service';
import { TaxService } from '../tax/tax.service';
import { ShippingService } from '../fulfilment/shipping.service';
import { PromotionsService } from '../promotions/promotions.service';
import { GiftCardsService } from '../giftcards/giftcards.service';
import { StoreCreditService } from '../giftcards/store-credit.service';
import { CodRiskService } from './cod-risk.service';
import { OrdersService } from './orders.service';

/**
 * OrdersService.placeFromPos() (RETAIL-ERP.md R11, WO-21.3) — the till's
 * sale path. Real Postgres, real InventoryService, so these assertions are
 * about the actual invariant: an Order that's DELIVERED and paid the
 * instant it's rung up, stock posted through postUnconditional() rather
 * than move(), and R5's oversell never rejected.
 */
describe('OrdersService — placeFromPos (WO-21.3)', () => {
  let orders: OrdersService;
  let inventory: InventoryService;
  let prisma: PrismaService;
  let defaultLocationId: string;
  let productId: string;
  let unitPrice: number;
  let cashierUserId: string;
  const createdVariantIds: string[] = [];
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        InventoryService,
        PrismaService,
        SettingsService,
        StockIntakeRegistry,
        EntityEnrichmentRegistry,
        { provide: AppConfigService, useValue: { nodeRole: 'STANDALONE', nodeId: 'test-node' } },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: EventEmitter2, useValue: { emitAsync: jest.fn() } },
        EventBusService,
        { provide: PaymentsService, useValue: {} },
        { provide: CheckoutValidatorRegistry, useValue: { validateAll: jest.fn().mockResolvedValue([]) } },
        { provide: TaxService, useValue: {} },
        { provide: ShippingService, useValue: {} },
        // placeFromPos() (the only method this suite exercises) never
        // touches discounts/gift cards/store credit — plain stubs, never
        // called.
        { provide: PromotionsService, useValue: {} },
        { provide: GiftCardsService, useValue: {} },
        { provide: StoreCreditService, useValue: {} },
        // placeFromPos() never scores COD risk — that's place()'s own
        // web-checkout path (WO-9.4); a till sale is DELIVERED/paid at
        // creation, so RTO risk does not apply to it.
        { provide: CodRiskService, useValue: {} },
      ],
    }).compile();

    orders = module.get(OrdersService);
    inventory = module.get(InventoryService);
    prisma = module.get(PrismaService);
    defaultLocationId = await inventory.defaultLocationId();

    const product = await prisma.product.findFirstOrThrow({ select: { id: true, basePrice: true } });
    productId = product.id;
    unitPrice = product.basePrice;

    const user = await prisma.user.findFirstOrThrow({ select: { id: true } });
    cashierUserId = user.id;
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
  });

  async function freshVariant(costPrice = 500) {
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: `POS-SALE-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        costPrice,
      },
    });
    createdVariantIds.push(variant.id);
    return variant;
  }

  it('rejects a sale with no lines', async () => {
    await expect(orders.placeFromPos({ locationId: defaultLocationId, terminalId: 't1', shiftId: 's1', cashierUserId: 'u1', lines: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('places a DELIVERED, POS-channel order paid in full by cash, and posts stock', async () => {
    const variant = await freshVariant();
    await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 10, reason: 'ADJUSTMENT' });

    const order = await orders.placeFromPos({
      locationId: defaultLocationId,
      terminalId: 'terminal-1',
      shiftId: 'shift-1',
      cashierUserId,
      lines: [{ variantId: variant.id, quantity: 3 }],
    });
    createdOrderIds.push(order.id);

    expect(order.status).toBe('DELIVERED');
    expect(order.channel).toBe('POS');
    expect(order.locationId).toBe(defaultLocationId);
    expect(order.terminalId).toBe('terminal-1');
    expect(order.shiftId).toBe('shift-1');
    expect(order.payment).toEqual(
      expect.objectContaining({ provider: 'cash', status: 'PAID', amount: order.grandTotal }),
    );

    const stock = await prisma.variantLocationStock.findUniqueOrThrow({
      where: { variantId_locationId: { variantId: variant.id, locationId: defaultLocationId } },
    });
    expect(stock.quantity).toBe(7);

    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { variantId: variant.id, refType: 'Order', refId: order.id },
    });
    expect(movement.reason).toBe('POS_SALE');
  });

  // 68-realtime-gross-profit.md: a POS sale is created straight at DELIVERED
  // and used to never publish order.status_changed at all — FinanceListener's
  // OrderEconomics, loyalty's earn-on-DELIVERED and the delivery notification
  // all silently never fired for a till sale. This is the direct test of the
  // fix, not an assumption.
  it('publishes order.status_changed(toStatus: DELIVERED) — FinanceListener/loyalty/notifications depend on this firing for POS too', async () => {
    const variant = await freshVariant();
    await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 5, reason: 'ADJUSTMENT' });

    const order = await orders.placeFromPos({
      locationId: defaultLocationId,
      terminalId: 'terminal-1',
      shiftId: 'shift-1',
      cashierUserId,
      lines: [{ variantId: variant.id, quantity: 1 }],
    });
    createdOrderIds.push(order.id);

    const outboxRow = await prisma.outboxEvent.findFirstOrThrow({
      where: { name: 'order.status_changed', payload: { path: ['orderId'], equals: order.id } },
    });
    expect(outboxRow.payload).toEqual(
      expect.objectContaining({ orderId: order.id, fromStatus: null, toStatus: 'DELIVERED', actorId: cashierUserId }),
    );
  });

  it('never rejects an oversell — postUnconditional() lets it through and opens a StockVariance', async () => {
    const variant = await freshVariant();
    await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 2, reason: 'ADJUSTMENT' });

    const order = await orders.placeFromPos({
      locationId: defaultLocationId,
      terminalId: 'terminal-1',
      shiftId: 'shift-1',
      cashierUserId,
      lines: [{ variantId: variant.id, quantity: 5 }],
    });
    createdOrderIds.push(order.id);

    expect(order.status).toBe('DELIVERED');

    const stock = await prisma.variantLocationStock.findUniqueOrThrow({
      where: { variantId_locationId: { variantId: variant.id, locationId: defaultLocationId } },
    });
    expect(stock.quantity).toBe(-3);

    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { variantId: variant.id, refType: 'Order', refId: order.id },
    });
    expect(movement.reason).toBe('POS_OFFLINE_VARIANCE');

    const variance = await prisma.stockVariance.findUniqueOrThrow({ where: { stockMovementId: movement.id } });
    expect(variance.overshootQty).toBe(3);
    expect(variance.status).toBe('OPEN');
  });

  it('rejects an unknown or inactive variant rather than silently skipping the line', async () => {
    await expect(
      orders.placeFromPos({
        locationId: defaultLocationId,
        terminalId: 't1',
        shiftId: 's1',
        cashierUserId: 'u1',
        lines: [{ variantId: 'does-not-exist', quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /**
   * WO-21.5: changeStatus()'s RETURNED/CANCELLED stock release used to
   * always credit the DEFAULT location, even for a POS order sold from a
   * different one — silently corrupting that location's stock the moment a
   * till return was processed. Fixed to prefer order.locationId.
   */
  describe('changeStatus — return releases stock to the order\'s own location', () => {
    let secondLocationId: string;

    beforeAll(async () => {
      const location = await prisma.location.create({
        data: { name: 'WO-21.5 Test Branch', code: `WO215-${Date.now()}`, isDefault: false },
      });
      secondLocationId = location.id;
    });

    afterAll(async () => {
      await prisma.location.delete({ where: { id: secondLocationId } });
    });

    it('credits the POS order\'s own selling location, not the default one', async () => {
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: secondLocationId, delta: 5, reason: 'ADJUSTMENT' });

      const order = await orders.placeFromPos({
        locationId: secondLocationId,
        terminalId: 'terminal-2',
        shiftId: 'shift-2',
        cashierUserId,
        lines: [{ variantId: variant.id, quantity: 2 }],
      });
      createdOrderIds.push(order.id);

      await orders.changeStatus(cashierUserId, order.id, 'RETURNED');

      const secondLocationStock = await prisma.variantLocationStock.findUniqueOrThrow({
        where: { variantId_locationId: { variantId: variant.id, locationId: secondLocationId } },
      });
      expect(secondLocationStock.quantity).toBe(5); // 5 - 2 sold + 2 returned

      const defaultLocationStock = await prisma.variantLocationStock.findUnique({
        where: { variantId_locationId: { variantId: variant.id, locationId: defaultLocationId } },
      });
      expect(defaultLocationStock?.quantity ?? 0).toBe(0);
    });

    it('still falls back to the default location for an order with no locationId (a web order)', async () => {
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 5, reason: 'ADJUSTMENT' });

      const order = await orders.placeFromPos({
        locationId: defaultLocationId,
        terminalId: 'terminal-3',
        shiftId: 'shift-3',
        cashierUserId,
        lines: [{ variantId: variant.id, quantity: 2 }],
      });
      createdOrderIds.push(order.id);
      // Simulate a web order's shape: no locationId set.
      await prisma.order.update({ where: { id: order.id }, data: { locationId: null } });

      await orders.changeStatus(cashierUserId, order.id, 'RETURNED');

      const defaultLocationStock = await prisma.variantLocationStock.findUniqueOrThrow({
        where: { variantId_locationId: { variantId: variant.id, locationId: defaultLocationId } },
      });
      expect(defaultLocationStock.quantity).toBe(5);
    });
  });

  // finance-accounting/151-layby-installment-sales.md
  describe('placeFromPos — instalmentPlan (WO-151.3)', () => {
    it('LAYBY: creates the order PENDING, decrements no stock, and takes only the deposit', async () => {
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 10, reason: 'ADJUSTMENT' });

      const total = unitPrice * 2;
      const depositMinor = Math.floor(total * 0.2);
      const order = await orders.placeFromPos({
        locationId: defaultLocationId,
        terminalId: 'terminal-1',
        shiftId: 'shift-1',
        cashierUserId,
        lines: [{ variantId: variant.id, quantity: 2 }],
        instalmentPlan: {
          type: 'LAYBY',
          depositMinor,
          schedule: [{ dueDate: new Date('2026-11-01'), amountMinor: total - depositMinor }],
        },
      });
      createdOrderIds.push(order.id);

      expect(order.status).toBe('PENDING');
      expect(order.deliveredAt).toBeNull();
      expect(order.grandTotal).toBe(total);
      expect(order.payment).toEqual(expect.objectContaining({ amount: depositMinor, status: 'PAID' }));

      const stock = await prisma.variantLocationStock.findUniqueOrThrow({
        where: { variantId_locationId: { variantId: variant.id, locationId: defaultLocationId } },
      });
      expect(stock.quantity).toBe(10); // unchanged — nothing reserved or decremented

      const plan = await prisma.instalmentPlan.findUniqueOrThrow({ where: { orderId: order.id } });
      expect(plan).toEqual(expect.objectContaining({ type: 'LAYBY', totalMinor: total, depositMinor, status: 'ACTIVE' }));

      const link = await prisma.instalmentPayment.findFirstOrThrow({ where: { planId: plan.id } });
      expect(link).toEqual(expect.objectContaining({ isDeposit: true }));
    });

    it('LAYBY: never publishes order.status_changed(DELIVERED) at creation — the order is not delivered', async () => {
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 5, reason: 'ADJUSTMENT' });

      const order = await orders.placeFromPos({
        locationId: defaultLocationId,
        terminalId: 'terminal-1',
        shiftId: 'shift-1',
        cashierUserId,
        lines: [{ variantId: variant.id, quantity: 1 }],
        instalmentPlan: { type: 'LAYBY', depositMinor: 0, schedule: [{ dueDate: new Date('2026-11-01'), amountMinor: unitPrice }] },
      });
      createdOrderIds.push(order.id);

      const outboxRow = await prisma.outboxEvent.findFirst({
        where: { name: 'order.status_changed', payload: { path: ['orderId'], equals: order.id } },
      });
      expect(outboxRow).toBeNull();
      expect(order.payment).toBeNull(); // depositMinor: 0 — no Payment row at all
    });

    it('INSTALMENT: releases goods immediately (DELIVERED, stock decremented) despite the schedule', async () => {
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 10, reason: 'ADJUSTMENT' });

      const total = unitPrice * 2;
      const depositMinor = Math.floor(total * 0.3);
      const order = await orders.placeFromPos({
        locationId: defaultLocationId,
        terminalId: 'terminal-1',
        shiftId: 'shift-1',
        cashierUserId,
        lines: [{ variantId: variant.id, quantity: 2 }],
        instalmentPlan: {
          type: 'INSTALMENT',
          depositMinor,
          schedule: [{ dueDate: new Date('2026-11-01'), amountMinor: total - depositMinor }],
        },
      });
      createdOrderIds.push(order.id);

      expect(order.status).toBe('DELIVERED');
      expect(order.deliveredAt).not.toBeNull();

      const stock = await prisma.variantLocationStock.findUniqueOrThrow({
        where: { variantId_locationId: { variantId: variant.id, locationId: defaultLocationId } },
      });
      expect(stock.quantity).toBe(8); // decremented immediately, unlike LAYBY

      const plan = await prisma.instalmentPlan.findUniqueOrThrow({ where: { orderId: order.id } });
      expect(plan.type).toBe('INSTALMENT');
    });

    it('refuses a plan whose deposit + schedule does not equal the order total', async () => {
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 5, reason: 'ADJUSTMENT' });

      await expect(
        orders.placeFromPos({
          locationId: defaultLocationId,
          terminalId: 'terminal-1',
          shiftId: 'shift-1',
          cashierUserId,
          lines: [{ variantId: variant.id, quantity: 1 }],
          // deposit + schedule deliberately exceeds the real total (unitPrice) by 1.
          instalmentPlan: { type: 'LAYBY', depositMinor: 1, schedule: [{ dueDate: new Date(), amountMinor: unitPrice }] },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a plan with an empty schedule', async () => {
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: defaultLocationId, delta: 5, reason: 'ADJUSTMENT' });

      await expect(
        orders.placeFromPos({
          locationId: defaultLocationId,
          terminalId: 'terminal-1',
          shiftId: 'shift-1',
          cashierUserId,
          lines: [{ variantId: variant.id, quantity: 1 }],
          instalmentPlan: { type: 'LAYBY', depositMinor: 500, schedule: [] },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
