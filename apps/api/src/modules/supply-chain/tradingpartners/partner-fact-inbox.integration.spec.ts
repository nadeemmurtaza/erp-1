import { Test } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../../core/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { EventBusService } from '../../../core/events/event-bus.service';
import { PartnerFactInboxService } from './partner-fact-inbox.service';
import type { SubmitPartnerFactDto } from './dto/partner-fact.dto';

/**
 * WO-213.1 (213-partner-fact-exchange.md) — real-Postgres tests for the parts a
 * mocked Prisma cannot prove: the unique constraint deciding a race, the inbox
 * row and its event committing or rolling back together, the ON DELETE
 * RESTRICT, and the partial index that exists only in the migration.
 *
 * Self-contained: it creates its own partners and removes exactly what it
 * created, so it needs no seed data.
 */
describe('PartnerFactInbox — real database (WO-213.1)', () => {
  let prisma: PrismaService;
  let service: PartnerFactInboxService;
  let supplier: { id: string; kind: 'SUPPLIER' };
  let otherSupplier: { id: string; kind: 'SUPPLIER' };
  const tag = `WO-213.1 ${Date.now()}`;

  const fact = (factId: string, overrides: Partial<SubmitPartnerFactDto> = {}): SubmitPartnerFactDto => ({
    factId,
    type: 'sale.dispatched',
    schemaVersion: 1,
    occurredAt: '2026-09-30T09:14:00.000Z',
    documentRef: 'INV-1',
    currency: 'PKR',
    lines: [
      {
        gtin: '8901234567890',
        name: 'Lawn suit',
        quantity: 40,
        unitPriceMinor: 349900,
      },
    ],
    ...overrides,
  });

  const events = (partnerId: string) =>
    prisma.outboxEvent.findMany({
      where: {
        name: 'partners.fact_received',
        payload: { path: ['tradingPartnerId'], equals: partnerId },
      },
    });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [PrismaService, EventBusService, PartnerFactInboxService],
    }).compile();
    await module.init();

    prisma = module.get(PrismaService);
    service = module.get(PartnerFactInboxService);

    supplier = (await prisma.tradingPartner.create({
      data: { name: `${tag} A`, kind: 'SUPPLIER', status: 'ACTIVE' },
      select: { id: true, kind: true },
    })) as typeof supplier;
    otherSupplier = (await prisma.tradingPartner.create({
      data: { name: `${tag} B`, kind: 'SUPPLIER', status: 'ACTIVE' },
      select: { id: true, kind: true },
    })) as typeof otherSupplier;
  });

  afterAll(async () => {
    const ids = [supplier.id, otherSupplier.id];
    await prisma.outboxEvent.deleteMany({
      where: {
        name: 'partners.fact_received',
        OR: ids.map((id) => ({
          payload: { path: ['tradingPartnerId'], equals: id },
        })),
      },
    });
    await prisma.partnerFactInbox.deleteMany({
      where: { tradingPartnerId: { in: ids } },
    });
    await prisma.tradingPartner.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('stores a fact and queues exactly one PartnerFactReceived that points at the stored row', async () => {
    const factId = '11111111-1111-4111-8111-111111111111';

    const result = await service.accept(supplier as any, fact(factId));

    expect(result).toEqual({ factId, status: 'RECEIVED', duplicate: false });
    const row = await prisma.partnerFactInbox.findUniqueOrThrow({
      where: {
        tradingPartnerId_factId: { tradingPartnerId: supplier.id, factId },
      },
    });
    expect(row).toMatchObject({
      type: 'sale.dispatched',
      schemaVersion: 1,
      documentRef: 'INV-1',
      status: 'RECEIVED',
    });
    expect(row.payload).toMatchObject({
      factId,
      lines: [{ gtin: '8901234567890' }],
    });
    const queued = (await events(supplier.id)).filter((e) => (e.payload as any).factId === factId);
    expect(queued).toHaveLength(1);
    expect(queued[0].payload).toMatchObject({
      inboxId: row.id,
      tradingPartnerId: supplier.id,
      type: 'sale.dispatched',
    });
  });

  it('answers a second copy from the stored row: still one row, still one event', async () => {
    const factId = '22222222-2222-4222-8222-222222222222';
    await service.accept(supplier as any, fact(factId));

    const again = await service.accept(supplier as any, fact(factId));

    expect(again).toEqual({ factId, status: 'RECEIVED', duplicate: true });
    expect(
      await prisma.partnerFactInbox.count({
        where: { tradingPartnerId: supplier.id, factId },
      }),
    ).toBe(1);
    expect((await events(supplier.id)).filter((e) => (e.payload as any).factId === factId)).toHaveLength(1);
  });

  it('lets the unique constraint decide ten simultaneous copies: one stored, nine answered as duplicates', async () => {
    const factId = '33333333-3333-4333-8333-333333333333';

    const results = await Promise.all(Array.from({ length: 10 }, () => service.accept(supplier as any, fact(factId))));

    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(results.filter((r) => r.duplicate)).toHaveLength(9);
    expect(
      await prisma.partnerFactInbox.count({
        where: { tradingPartnerId: supplier.id, factId },
      }),
    ).toBe(1);
    expect((await events(supplier.id)).filter((e) => (e.payload as any).factId === factId)).toHaveLength(1);
  });

  it('refuses the same factId with different content, and leaves the stored fact untouched', async () => {
    const factId = '44444444-4444-4444-8444-444444444444';
    await service.accept(supplier as any, fact(factId));

    const changed = fact(factId, {
      lines: [
        {
          gtin: '8901234567890',
          name: 'Lawn suit',
          quantity: 41,
          unitPriceMinor: 349900,
        },
      ],
    });
    await expect(service.accept(supplier as any, changed)).rejects.toBeInstanceOf(ConflictException);

    const row = await prisma.partnerFactInbox.findUniqueOrThrow({
      where: {
        tradingPartnerId_factId: { tradingPartnerId: supplier.id, factId },
      },
    });
    expect((row.payload as any).lines[0].quantity).toBe(40);
  });

  it('treats the same factId from two different partners as two different facts', async () => {
    const factId = '55555555-5555-4555-8555-555555555555';

    const a = await service.accept(supplier as any, fact(factId));
    const b = await service.accept(otherSupplier as any, fact(factId));

    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(false);
  });

  it('rolls the inbox row back when queueing the event fails — never a stored fact nobody will apply', async () => {
    const factId = '66666666-6666-4666-8666-666666666666';
    const failingBus = {
      publish: jest.fn().mockRejectedValue(new Error('outbox unavailable')),
    };
    const failing = new PartnerFactInboxService(prisma, failingBus as any);

    await expect(failing.accept(supplier as any, fact(factId))).rejects.toThrow('outbox unavailable');

    expect(
      await prisma.partnerFactInbox.count({
        where: { tradingPartnerId: supplier.id, factId },
      }),
    ).toBe(0);
  });

  it('refuses to delete a partner that has sent a fact (ON DELETE RESTRICT), and deletes one that has not', async () => {
    const lonely = await prisma.tradingPartner.create({
      data: { name: `${tag} lonely`, kind: 'SUPPLIER' },
    });
    await expect(prisma.tradingPartner.delete({ where: { id: lonely.id } })).resolves.toBeDefined();

    await expect(prisma.tradingPartner.delete({ where: { id: supplier.id } })).rejects.toMatchObject({
      constructor: Prisma.PrismaClientKnownRequestError,
      code: 'P2003',
    });
  });

  it('has the partial index that serves the operator queue — it exists only in the migration', async () => {
    const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'PartnerFactInbox' AND indexname = 'PartnerFactInbox_open_receivedAt_idx'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/WHERE/);
    expect(rows[0].indexdef).toMatch(/RECEIVED/);
    expect(rows[0].indexdef).toMatch(/NEEDS_REVIEW/);
  });
});
