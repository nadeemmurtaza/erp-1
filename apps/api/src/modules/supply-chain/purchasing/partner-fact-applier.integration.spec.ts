import { Test } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { EventBusService } from '../../../core/events/event-bus.service';
import { OutboxDispatcher } from '../../../core/events/outbox.dispatcher';
import { BranchPolicyRegistry } from '../../../core/extension-points/branch-policy.registry';
import { InventoryService } from '../inventory/inventory.service';
import { LotsService } from '../inventory/lots.service';
import { SerializedUnitsService } from '../inventory/serialized-units.service';
import { PartiesService } from '../../customers/parties/parties.service';
import { PartnerFactInboxService } from '../tradingpartners/partner-fact-inbox.service';
import { PartnerFactStatusListener } from '../tradingpartners/partner-fact-status.listener';
import type { SubmitPartnerFactDto } from '../tradingpartners/dto/partner-fact.dto';
import { PurchasingService } from './purchasing.service';
import { PartnerFactApplierService } from './partner-fact-applier.service';
import { PartnerFactListener } from './partner-fact.listener';

/**
 * WO-213.2 (213-partner-fact-exchange.md) — the buyer's side against a real
 * Postgres: a stored fact becomes a purchase order and a supplier bill exactly
 * once, however many times or however concurrently it is delivered, and
 * stock does not move until the goods are received.
 *
 * It drives the real chain: PartnerFactInboxService (WO-213.1) stores the fact
 * and queues the event, the real OutboxDispatcher delivers it, the listener
 * applies it, and PartnerFactStatusListener marks the inbox row.
 *
 * Self-contained: it creates its own partner, supplier, product and variant,
 * and removes exactly what it created. Only the heavy collaborators that
 * `createPurchaseOrder`/`createSupplierBill` never touch (stock, lots,
 * serials, parties) are stubbed.
 */
describe('Partner fact applier — real database (WO-213.2)', () => {
  let prisma: PrismaService;
  let inbox: PartnerFactInboxService;
  let applier: PartnerFactApplierService;
  let dispatcher: OutboxDispatcher;
  let partner: { id: string; kind: 'SUPPLIER' };
  let supplierId: string;
  let productId: string;
  let variantId: string;
  const created = { inboxIds: [] as string[] };
  const run = `${Date.now()}`;
  const gtin = `89${run.slice(-11)}`.slice(0, 13);

  const fact = (factId: string, overrides: Partial<SubmitPartnerFactDto> = {}): SubmitPartnerFactDto => ({
    factId,
    type: 'sale.dispatched',
    schemaVersion: 1,
    occurredAt: '2026-09-30T09:14:00.000Z',
    documentRef: `INV-${run}`,
    currency: 'PKR',
    lines: [{ gtin, name: 'WO-213.2 lawn suit', quantity: 40, unitPriceMinor: 349900, taxMinor: 0 }],
    ...overrides,
  });

  const uuid = (n: number) => `00000000-2132-4000-8000-${run.slice(-9).padStart(9, '0')}${String(n).padStart(3, '0')}`;

  async function store(factId: string, overrides: Partial<SubmitPartnerFactDto> = {}) {
    await inbox.accept(partner as any, fact(factId, overrides));
    const row = await prisma.partnerFactInbox.findUniqueOrThrow({
      where: { tradingPartnerId_factId: { tradingPartnerId: partner.id, factId } },
    });
    created.inboxIds.push(row.id);
    return row;
  }

  const ordersFor = (inboxId: string) =>
    prisma.purchaseOrder.findMany({ where: { sourceFactInboxId: inboxId }, include: { items: true } });
  const billsFor = (poId: string) => prisma.supplierBill.findMany({ where: { purchaseOrderId: poId } });
  const eventsNamed = (name: string, inboxId: string) =>
    prisma.outboxEvent.findMany({ where: { name, payload: { path: ['inboxId'], equals: inboxId } } });

  /** Runs the real outbox dispatcher until the inbox row stops changing or we give up. */
  async function drain(inboxId: string, until: (status: string) => boolean) {
    for (let i = 0; i < 12; i++) {
      await dispatcher.processBatch();
      const row = await prisma.partnerFactInbox.findUniqueOrThrow({ where: { id: inboxId } });
      if (until(row.status)) return row;
    }
    return prisma.partnerFactInbox.findUniqueOrThrow({ where: { id: inboxId } });
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        PrismaService,
        SettingsService,
        { provide: RedisService, useValue: { isReady: () => false } },
        { provide: AppConfigService, useValue: { nodeRole: 'STANDALONE', nodeId: 'main' } },
        EventBusService,
        OutboxDispatcher,
        {
          provide: BranchPolicyRegistry,
          useValue: { allowsBranchLocalPurchasing: jest.fn().mockResolvedValue(false) },
        },
        { provide: InventoryService, useValue: {} },
        { provide: LotsService, useValue: {} },
        { provide: SerializedUnitsService, useValue: {} },
        { provide: PartiesService, useValue: {} },
        PurchasingService,
        PartnerFactApplierService,
        PartnerFactListener,
        PartnerFactInboxService,
        PartnerFactStatusListener,
      ],
    }).compile();
    await module.init(); // registers the @OnDomainEvent subscribers

    prisma = module.get(PrismaService);
    inbox = module.get(PartnerFactInboxService);
    applier = module.get(PartnerFactApplierService);
    dispatcher = module.get(OutboxDispatcher);

    partner = (await prisma.tradingPartner.create({
      data: { name: `WO-213.2 partner ${run}`, kind: 'SUPPLIER', status: 'ACTIVE' },
      select: { id: true, kind: true },
    })) as typeof partner;
    supplierId = (
      await prisma.supplier.create({ data: { name: `WO-213.2 supplier ${run}`, tradingPartnerId: partner.id } })
    ).id;
    productId = (await prisma.product.create({ data: { slug: `wo-213-2-${run}`, kind: 'GOODS', basePrice: 500000 } }))
      .id;
    variantId = (
      await prisma.productVariant.create({
        data: { productId, sku: `WO2132-${run}`, barcode: gtin, costPrice: 340000, stock: 0 },
      })
    ).id;
  });

  afterAll(async () => {
    const orders = await prisma.purchaseOrder.findMany({ where: { supplierId }, select: { id: true } });
    const poIds = orders.map((o) => o.id);
    await prisma.outboxEvent.deleteMany({
      where: {
        OR: [
          { name: { startsWith: 'partners.' }, payload: { path: ['tradingPartnerId'], equals: partner.id } },
          { name: 'purchasing.supplier_bill_raised', payload: { path: ['supplierId'], equals: supplierId } },
        ],
      },
    });
    await prisma.supplierBill.deleteMany({ where: { supplierId } });
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: poIds } } });
    await prisma.partnerFactInbox.deleteMany({ where: { tradingPartnerId: partner.id } });
    await prisma.supplier.deleteMany({ where: { id: supplierId } });
    await prisma.productVariant.deleteMany({ where: { id: variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.tradingPartner.deleteMany({ where: { id: partner.id } });
    await prisma.$disconnect();
  });

  it('turns a stored fact into ONE sent purchase order and ONE bill, costed at the seller price, and marks the inbox', async () => {
    const row = await store(uuid(1));

    const settled = await drain(row.id, (s) => s === 'APPLIED');

    const [order] = await ordersFor(row.id);
    expect(order).toMatchObject({
      supplierId,
      status: 'SENT',
      createdById: null,
      subtotal: 40 * 349900,
      total: 40 * 349900,
    });
    expect(order.sentAt).not.toBeNull();
    expect(order.number).toMatch(/\d/);
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({ variantId, quantityOrdered: 40, quantityReceived: 0, unitCost: 349900 });

    const bills = await billsFor(order.id);
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({ supplierId, amount: 40 * 349900, currency: 'PKR', reference: `INV-${run}` });

    expect(settled).toMatchObject({ status: 'APPLIED', appliedPurchaseOrderId: order.id });
    expect(await eventsNamed('partners.fact_applied', row.id)).toHaveLength(1);
  });

  it('does not move stock, and does not touch the selling price or the cost — that waits for the goods to be received', async () => {
    const before = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    const row = await store(uuid(2));

    await drain(row.id, (s) => s === 'APPLIED');

    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    expect(after.stock).toBe(before.stock);
    expect(after.costPrice).toBe(before.costPrice);
    expect(after.priceOverride).toBe(before.priceOverride);
    expect(await prisma.stockMovement.count({ where: { variantId } })).toBe(0);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.basePrice).toBe(500000);
  });

  it('creates no second order when the same fact is applied again', async () => {
    const row = await store(uuid(3));
    await drain(row.id, (s) => s === 'APPLIED');

    await expect(applier.apply(row.id)).resolves.toBe('SKIPPED'); // already APPLIED
    // Even with the inbox row forced back to RECEIVED (a redelivery racing the status update), the
    // unique link on the order makes the second order impossible.
    await prisma.partnerFactInbox.update({ where: { id: row.id }, data: { status: 'RECEIVED' } });
    await expect(applier.apply(row.id)).resolves.toBe('SKIPPED');

    expect(await ordersFor(row.id)).toHaveLength(1);
    const [order] = await ordersFor(row.id);
    expect(await billsFor(order.id)).toHaveLength(1);
    expect(await eventsNamed('partners.fact_applied', row.id)).toHaveLength(1);
  });

  it('lets the database decide eight simultaneous applications: one order, one bill, seven no-ops', async () => {
    const row = await store(uuid(4));

    const results = await Promise.all(Array.from({ length: 8 }, () => applier.apply(row.id)));

    expect(results.filter((r) => r === 'APPLIED')).toHaveLength(1);
    expect(results.filter((r) => r === 'SKIPPED')).toHaveLength(7);
    const orders = await ordersFor(row.id);
    expect(orders).toHaveLength(1);
    expect(await billsFor(orders[0].id)).toHaveLength(1);
    expect(await eventsNamed('partners.fact_applied', row.id)).toHaveLength(1);
  });

  it('writes nothing and parks the fact, with the reason, when a barcode is unknown', async () => {
    const row = await store(uuid(5), {
      lines: [
        {
          gtin: '4006381333931',
          name: 'A product we have never stocked',
          quantity: 3,
          unitPriceMinor: 1000,
          taxMinor: 0,
        },
      ],
    });

    const settled = await drain(row.id, (s) => s === 'NEEDS_REVIEW');

    expect(settled.status).toBe('NEEDS_REVIEW');
    expect(settled.statusReason).toMatch(/4006381333931/);
    expect(settled.appliedPurchaseOrderId).toBeNull();
    expect(await ordersFor(row.id)).toHaveLength(0);
  });

  it('holds a price far from our cost, and shows why', async () => {
    const row = await store(uuid(6), {
      lines: [{ gtin, name: 'WO-213.2 lawn suit', quantity: 1, unitPriceMinor: 3499000, taxMinor: 0 }], // a decimal slip: ten times
    });

    const settled = await drain(row.id, (s) => s === 'NEEDS_REVIEW');

    expect(settled.statusReason).toMatch(/above our current cost/);
    expect(await ordersFor(row.id)).toHaveLength(0);
  });

  it('applies a fact after a person fixes what was wrong — a retry of a NEEDS_REVIEW fact', async () => {
    await prisma.supplier.update({ where: { id: supplierId }, data: { tradingPartnerId: null } });
    const row = await store(uuid(7));
    const held = await drain(row.id, (s) => s === 'NEEDS_REVIEW');
    expect(held.statusReason).toMatch(/No active supplier is linked/);

    await prisma.supplier.update({ where: { id: supplierId }, data: { tradingPartnerId: partner.id } });
    await expect(applier.apply(row.id)).resolves.toBe('APPLIED');

    const settled = await drain(row.id, (s) => s === 'APPLIED');
    expect(settled.status).toBe('APPLIED');
    expect(settled.statusReason).toBeNull();
    expect(await ordersFor(row.id)).toHaveLength(1);
  });

  it('rolls the purchase order back when raising the bill fails — never an order without its bill', async () => {
    const row = await store(uuid(8));
    const purchasing = {
      createPurchaseOrder: undefined as any,
      createSupplierBill: jest.fn().mockRejectedValue(new Error('bill failed')),
    };
    const real = (applier as any).purchasing as PurchasingService;
    purchasing.createPurchaseOrder = real.createPurchaseOrder.bind(real);
    const failing = new PartnerFactApplierService(
      prisma,
      purchasing as any,
      (applier as any).events,
      (applier as any).settings,
    );

    await expect(failing.apply(row.id)).rejects.toThrow('bill failed');

    expect(await ordersFor(row.id)).toHaveLength(0);
    expect(await eventsNamed('partners.fact_applied', row.id)).toHaveLength(0);
  });

  it('previews what it would do without writing anything', async () => {
    const row = await store(uuid(9));
    const beforeOrders = await prisma.purchaseOrder.count({ where: { supplierId } });

    const plan = await applier.preview(row.id);

    expect(plan?.outcome).toBe('APPLY');
    expect(await prisma.purchaseOrder.count({ where: { supplierId } })).toBe(beforeOrders);
    expect((await prisma.partnerFactInbox.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('RECEIVED');
  });

  it('has the unique index on the order that makes the second copy a no-op', async () => {
    const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'PurchaseOrder' AND indexname = 'PurchaseOrder_sourceFactInboxId_key'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/UNIQUE/);
  });
});
