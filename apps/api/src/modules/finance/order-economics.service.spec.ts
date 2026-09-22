import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { DomainEvent } from '../../core/events/domain-events';
import { OrderEconomicsService } from './order-economics.service';

/**
 * WO-23.1's WO-B.3. Real PrismaService + SettingsService against the seeded
 * test database — only EventBusService is mocked, same idiom finance.spec.ts
 * already uses.
 */
describe('OrderEconomicsService', () => {
  let service: OrderEconomicsService;
  let prisma: PrismaService;
  let events: { publish: jest.Mock };

  beforeAll(async () => {
    events = { publish: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [OrderEconomicsService, PrismaService, SettingsService, { provide: EventBusService, useValue: events }],
    }).compile();

    service = module.get(OrderEconomicsService);
    prisma = module.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.order.deleteMany({ where: { number: { startsWith: 'oe-spec-' } } });
    events.publish.mockClear();
  });

  let seq = 0;
  function orderNumber(): string {
    seq += 1;
    return `oe-spec-${Date.now()}-${seq}`;
  }

  async function makeOrder(overrides: {
    itemsSubtotal?: number;
    stitchingSubtotal?: number;
    itemDiscountTotal?: number;
    orderDiscount?: number;
    shippingFee?: number;
    codFee?: number;
    grandTotal?: number;
    items?: Array<{ unitCost: number; quantity: number }>;
    shipmentCosts?: Array<number | null>;
    paymentProvider?: string;
  }) {
    return prisma.order.create({
      data: {
        number: orderNumber(),
        status: 'DELIVERED',
        shippingAddress: {},
        itemsSubtotal: overrides.itemsSubtotal ?? 10_000,
        stitchingSubtotal: overrides.stitchingSubtotal ?? 0,
        itemDiscountTotal: overrides.itemDiscountTotal ?? 0,
        orderDiscount: overrides.orderDiscount ?? 0,
        shippingFee: overrides.shippingFee ?? 0,
        codFee: overrides.codFee ?? 0,
        grandTotal: overrides.grandTotal ?? 10_000,
        items: {
          create: (overrides.items ?? [{ unitCost: 1000, quantity: 1 }]).map((item) => ({
            kind: 'GOODS',
            nameEn: 'Test item',
            unitPrice: item.unitCost + 500,
            unitCost: item.unitCost,
            quantity: item.quantity,
            lineTotal: (item.unitCost + 500) * item.quantity,
          })),
        },
        shipments:
          overrides.shipmentCosts === undefined
            ? undefined
            : { create: overrides.shipmentCosts.map((cost) => ({ cost })) },
        payments:
          overrides.paymentProvider === undefined
            ? undefined
            : { create: { provider: overrides.paymentProvider, amount: overrides.grandTotal ?? 10_000 } },
      },
    });
  }

  it('computes contribution on a fixture with known integers', async () => {
    const order = await makeOrder({
      itemsSubtotal: 10_000,
      stitchingSubtotal: 2_000,
      itemDiscountTotal: 500,
      orderDiscount: 500,
      shippingFee: 300,
      codFee: 100,
      grandTotal: 13_000,
      items: [
        { unitCost: 1000, quantity: 2 },
        { unitCost: 1500, quantity: 2 },
      ],
      shipmentCosts: [400],
      paymentProvider: 'jazzcash',
    });

    await service.computeForOrder(order.id, false);

    const economics = await prisma.orderEconomics.findUniqueOrThrow({ where: { orderId: order.id } });
    // revenue = 10000 + 2000 - 500 - 500 = 11000
    expect(economics.revenue).toBe(11_000);
    // cogs = 1000*2 + 1500*2 = 5000
    expect(economics.cogs).toBe(5_000);
    expect(economics.shippingIncome).toBe(300);
    expect(economics.codFeeIncome).toBe(100);
    expect(economics.shippingCost).toBe(400);
    expect(economics.shippingCostEstimated).toBe(false);
    // gatewayFee = round(13000 * 250 / 10000) = 325 (jazzcash falls back to `default`)
    expect(economics.gatewayFee).toBe(325);
    // packagingCost = the default FinancePackagingCostPerOrder setting
    expect(economics.packagingCost).toBe(5_000);
    // contribution = 11000 + 300 + 100 - 5000 - 400 - 325 - 5000 = 675
    expect(economics.contribution).toBe(675);
  });

  it('writes exactly one row on DELIVERED; replaying the event writes no second row and changes no value', async () => {
    const order = await makeOrder({ items: [{ unitCost: 200, quantity: 1 }] });

    await service.computeForOrder(order.id, false);
    const first = await prisma.orderEconomics.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(events.publish).toHaveBeenCalledTimes(1);

    await service.computeForOrder(order.id, false);
    const second = await prisma.orderEconomics.findUniqueOrThrow({ where: { orderId: order.id } });

    expect(await prisma.orderEconomics.count({ where: { orderId: order.id } })).toBe(1);
    expect(second).toEqual(first);
    expect(second.computedAt).toEqual(first.computedAt);
    // No second OrderEconomicsComputed for an unchanged replay.
    expect(events.publish).toHaveBeenCalledTimes(1);
  });

  it('returning a delivered order zeroes revenue and cogs, and only those two', async () => {
    const order = await makeOrder({
      itemsSubtotal: 5_000,
      shippingFee: 300,
      codFee: 100,
      grandTotal: 5_400,
      items: [{ unitCost: 800, quantity: 1 }],
      shipmentCosts: [200],
    });

    await service.computeForOrder(order.id, false);
    const delivered = await prisma.orderEconomics.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(delivered.revenue).toBe(5_000);
    expect(delivered.cogs).toBe(800);

    await service.computeForOrder(order.id, true);
    const returned = await prisma.orderEconomics.findUniqueOrThrow({ where: { orderId: order.id } });

    expect(returned.revenue).toBe(0);
    expect(returned.cogs).toBe(0);
    // Everything else already happened and is not reversed by a return.
    expect(returned.shippingIncome).toBe(delivered.shippingIncome);
    expect(returned.codFeeIncome).toBe(delivered.codFeeIncome);
    expect(returned.shippingCost).toBe(delivered.shippingCost);
    expect(returned.gatewayFee).toBe(delivered.gatewayFee);
    expect(returned.packagingCost).toBe(delivered.packagingCost);
  });

  it('gatewayFee is 0 for a COD order', async () => {
    const order = await makeOrder({ grandTotal: 20_000, paymentProvider: 'cod' });
    await service.computeForOrder(order.id, false);
    const economics = await prisma.orderEconomics.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(economics.gatewayFee).toBe(0);
  });

  it('gatewayFee is 0 for bank_transfer, matching the default settings table', async () => {
    const order = await makeOrder({ grandTotal: 20_000, paymentProvider: 'bank_transfer' });
    await service.computeForOrder(order.id, false);
    const economics = await prisma.orderEconomics.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(economics.gatewayFee).toBe(0);
  });

  it('shippingCost falls back to 0, flagged, when no shipment carries a cost — never a guess', async () => {
    const noShipmentAtAll = await makeOrder({});
    await service.computeForOrder(noShipmentAtAll.id, false);
    const a = await prisma.orderEconomics.findUniqueOrThrow({ where: { orderId: noShipmentAtAll.id } });
    expect(a.shippingCost).toBe(0);
    expect(a.shippingCostEstimated).toBe(true);

    const shipmentWithNullCost = await makeOrder({ shipmentCosts: [null] });
    await service.computeForOrder(shipmentWithNullCost.id, false);
    const b = await prisma.orderEconomics.findUniqueOrThrow({ where: { orderId: shipmentWithNullCost.id } });
    expect(b.shippingCost).toBe(0);
    expect(b.shippingCostEstimated).toBe(true);
  });

  it('publishes OrderEconomicsComputed with the same figures written to the row', async () => {
    const order = await makeOrder({ items: [{ unitCost: 100, quantity: 1 }] });
    await service.computeForOrder(order.id, false);

    const economics = await prisma.orderEconomics.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(events.publish).toHaveBeenCalledWith(
      DomainEvent.OrderEconomicsComputed,
      {
        orderId: order.id,
        revenue: economics.revenue,
        cogs: economics.cogs,
        contribution: economics.contribution,
      },
      expect.anything(),
    );
  });

  it('skips a deleted order rather than throwing', async () => {
    await expect(service.computeForOrder('does-not-exist', false)).resolves.toBeUndefined();
    expect(events.publish).not.toHaveBeenCalled();
  });
});
