import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppConfigService } from '../../core/config/app-config.service';
import { AuditService } from '../../core/audit/audit.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { SettingsService } from '../../core/settings/settings.service';
import { InventoryService } from '../inventory/inventory.service';
import { BundlesService } from '../catalog/bundles.service';
import { ReturnsService } from './returns.service';

/**
 * WO-6.6 — the refund-eligibility guard (returns.service.ts#resolve's own
 * doc comment: REFUND only for a full-order return, because
 * accounting/posting-rules.subscriber.ts#onPaymentRefunded has no partial-
 * refund support today), and inspect()'s itemized RETURN/WRITE_OFF split.
 */
describe('ReturnsService', () => {
  let service: ReturnsService;
  let prisma: PrismaService;
  let actorId: string;
  const move = jest.fn().mockResolvedValue({});
  const publish = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ReturnsService,
        PrismaService,
        AuditService,
        SettingsService,
        // Settings' shared L2 is not under test here: Redis reads as not connected, so every read is Postgres's.
        { provide: RedisService, useValue: { isReady: () => false } },
        { provide: EventBusService, useValue: { publish } },
        { provide: AppConfigService, useValue: { nodeRole: 'STANDALONE', nodeId: 'main' } },
        { provide: InventoryService, useValue: { move, defaultLocationId: jest.fn().mockResolvedValue('loc-test') } },
        // 150-product-kitting-bundles.md — no line in this suite returns a
        // bundle, so an empty map is the correct, honest stub.
        { provide: BundlesService, useValue: { bundlesByVariantId: jest.fn().mockResolvedValue(new Map()) } },
      ],
    }).compile();

    service = module.get(ReturnsService);
    prisma = module.get(PrismaService);
    actorId = (await prisma.user.findFirstOrThrow()).id;
  });

  afterEach(async () => {
    move.mockClear();
    publish.mockClear();
    const orders = await prisma.order.findMany({ where: { number: { startsWith: 'return-test-' } }, select: { id: true } });
    await prisma.returnRequest.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
    await prisma.order.deleteMany({ where: { number: { startsWith: 'return-test-' } } });
  });

  let seq = 0;
  function tag(): string {
    seq += 1;
    return `return-test-${Date.now()}-${seq}`;
  }

  async function makeInspectedReturn(input: { orderQuantity: number; returnedQuantity: number }) {
    const reason = await prisma.returnReasonCode.findFirstOrThrow();
    const variant = await prisma.productVariant.findFirst({ where: { isActive: true } });
    const order = await prisma.order.create({
      data: {
        number: tag(),
        status: 'DELIVERED',
        shippingAddress: {},
        itemsSubtotal: 1000,
        grandTotal: 1000,
        items: {
          create: [
            {
              variantId: variant?.id,
              kind: 'GOODS',
              nameEn: 'test item',
              unitPrice: 1000,
              quantity: input.orderQuantity,
              lineTotal: 1000 * input.orderQuantity,
            },
          ],
        },
      },
      include: { items: true },
    });

    const request = await prisma.returnRequest.create({
      data: {
        number: tag(),
        orderId: order.id,
        status: 'INSPECTED',
        items: {
          create: [{ orderItemId: order.items[0].id, reasonId: reason.id, quantity: input.returnedQuantity, restockable: true, restocked: true }],
        },
      },
    });

    return { order, request };
  }

  it('permits REFUND when the return covers the whole order', async () => {
    const { request } = await makeInspectedReturn({ orderQuantity: 2, returnedQuantity: 2 });

    const updated = await service.resolve(request.id, { resolution: 'REFUND' }, actorId);

    expect(updated.status).toBe('REFUNDED');
    expect(publish).toHaveBeenCalledWith('fulfilment.return_fully_refunded', expect.objectContaining({ returnId: request.id }));
  });

  it('refuses REFUND for a partial return, naming the remedy', async () => {
    const { request } = await makeInspectedReturn({ orderQuantity: 3, returnedQuantity: 1 });

    await expect(service.resolve(request.id, { resolution: 'REFUND' }, actorId)).rejects.toThrow(BadRequestException);
    await expect(service.resolve(request.id, { resolution: 'REFUND' }, actorId)).rejects.toThrow(/store credit, exchange or repair/);
  });

  it('permits a partial return to resolve as STORE_CREDIT without the full-order guard', async () => {
    const { request } = await makeInspectedReturn({ orderQuantity: 3, returnedQuantity: 1 });

    const updated = await service.resolve(request.id, { resolution: 'STORE_CREDIT' }, actorId);

    expect(updated.status).toBe('CLOSED');
  });

  it('inspect() moves RETURN for a restockable item and WRITE_OFF for a damaged one', async () => {
    const reason = await prisma.returnReasonCode.findFirstOrThrow();
    const variant = await prisma.productVariant.findFirst({ where: { isActive: true } });
    const order = await prisma.order.create({
      data: {
        number: tag(),
        status: 'DELIVERED',
        shippingAddress: {},
        itemsSubtotal: 2000,
        grandTotal: 2000,
        items: {
          create: [
            { variantId: variant?.id, kind: 'GOODS', nameEn: 'item A', unitPrice: 1000, quantity: 1, lineTotal: 1000 },
            { variantId: variant?.id, kind: 'GOODS', nameEn: 'item B', unitPrice: 1000, quantity: 1, lineTotal: 1000 },
          ],
        },
      },
      include: { items: true },
    });

    const request = await prisma.returnRequest.create({
      data: {
        number: tag(),
        orderId: order.id,
        status: 'RECEIVED',
        items: {
          create: [
            { orderItemId: order.items[0].id, reasonId: reason.id, quantity: 1 },
            { orderItemId: order.items[1].id, reasonId: reason.id, quantity: 1 },
          ],
        },
      },
      include: { items: true },
    });

    await service.inspect(
      request.id,
      {
        items: [
          { itemId: request.items[0].id, restockable: true },
          { itemId: request.items[1].id, restockable: false },
        ],
      },
      actorId,
    );

    expect(move).toHaveBeenCalledWith(expect.objectContaining({ reason: 'RETURN' }), expect.anything());
    expect(move).toHaveBeenCalledWith(expect.objectContaining({ reason: 'WRITE_OFF' }), expect.anything());

    const updated = await prisma.returnRequest.findUniqueOrThrow({ where: { id: request.id }, include: { items: true } });
    expect(updated.status).toBe('INSPECTED');
    expect(updated.items.every((item) => item.restocked)).toBe(true);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
