import { Test } from '@nestjs/testing';
import { AppConfigService } from '../../core/config/app-config.service';
import { AuditService } from '../../core/audit/audit.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { FulfilmentService } from './fulfilment.service';
import { ManualCourierProvider } from './providers/manual.provider';

/**
 * WO-6.5/6.7 — applyStatusChange() is the one writer for a shipment status
 * transition; RTO detection is the courier-initiated-RETURNED-with-no-
 * active-return-request rule from 06-shipping-fulfilment-returns.md's own
 * WO-6.7 text.
 */
describe('FulfilmentService.applyStatusChange', () => {
  let service: FulfilmentService;
  let prisma: PrismaService;
  const publish = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        FulfilmentService,
        PrismaService,
        AuditService,
        SettingsService,
        ManualCourierProvider,
        { provide: EventBusService, useValue: { publish } },
        { provide: AppConfigService, useValue: { nodeRole: 'STANDALONE', nodeId: 'main', isCourierProviderEnabled: () => true } },
      ],
    }).compile();

    service = module.get(FulfilmentService);
    prisma = module.get(PrismaService);
  });

  afterEach(async () => {
    publish.mockClear();
    const orders = await prisma.order.findMany({ where: { number: { startsWith: 'fulfil-test-' } }, select: { id: true } });
    await prisma.returnRequest.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
    await prisma.order.deleteMany({ where: { number: { startsWith: 'fulfil-test-' } } });
  });

  let seq = 0;
  function tag(): string {
    seq += 1;
    return `fulfil-test-${Date.now()}-${seq}`;
  }

  async function makeOrderWithShipment(status: 'DISPATCHED' | 'IN_TRANSIT' = 'DISPATCHED') {
    const order = await prisma.order.create({
      data: { number: tag(), status: 'SHIPPED', shippingAddress: {}, itemsSubtotal: 1000, grandTotal: 1000 },
    });
    const shipment = await prisma.shipment.create({
      data: { orderId: order.id, courier: 'manual', trackingNumber: tag(), status, dispatchedAt: new Date() },
    });
    return { order, shipment };
  }

  it('is a no-op when the status has not actually changed', async () => {
    const { shipment } = await makeOrderWithShipment('DISPATCHED');

    const updated = await service.applyStatusChange(shipment.id, { status: 'DISPATCHED' }, null);

    expect(updated.status).toBe('DISPATCHED');
    expect(publish).not.toHaveBeenCalled();
  });

  it('writes a ShipmentEvent and publishes ShipmentStatusChanged on a real transition', async () => {
    const { shipment, order } = await makeOrderWithShipment('DISPATCHED');

    await service.applyStatusChange(shipment.id, { status: 'IN_TRANSIT', rawStatus: 'in transit' }, null);

    const events = await prisma.shipmentEvent.findMany({ where: { shipmentId: shipment.id } });
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('IN_TRANSIT');

    expect(publish).toHaveBeenCalledWith(
      'fulfilment.shipment_status_changed',
      expect.objectContaining({ orderId: order.id, toStatus: 'IN_TRANSIT', isRto: false }),
      expect.anything(),
    );
  });

  it('flags RETURNED as an RTO when the order has no active return request', async () => {
    const { shipment } = await makeOrderWithShipment('IN_TRANSIT');

    const updated = await service.applyStatusChange(shipment.id, { status: 'RETURNED' }, null);

    expect(updated.isRto).toBe(true);
    expect(updated.rtoAt).not.toBeNull();
    expect(publish).toHaveBeenCalledWith(
      'fulfilment.shipment_rto',
      expect.objectContaining({ shipmentId: shipment.id }),
      expect.anything(),
    );
  });

  it('does NOT flag RETURNED as an RTO when a customer return request already exists', async () => {
    const { shipment, order } = await makeOrderWithShipment('IN_TRANSIT');
    const category = await prisma.returnReasonCode.findFirstOrThrow();
    const orderItem = await prisma.orderItem.create({
      data: { orderId: order.id, kind: 'GOODS', nameEn: 'test item', unitPrice: 1000, quantity: 1, lineTotal: 1000 },
    });
    await prisma.returnRequest.create({
      data: {
        number: tag(),
        orderId: order.id,
        status: 'APPROVED',
        items: { create: [{ orderItemId: orderItem.id, reasonId: category.id, quantity: 1 }] },
      },
    });

    const updated = await service.applyStatusChange(shipment.id, { status: 'RETURNED' }, null);

    expect(updated.isRto).toBe(false);
    expect(publish).not.toHaveBeenCalledWith('fulfilment.shipment_rto', expect.anything(), expect.anything());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
