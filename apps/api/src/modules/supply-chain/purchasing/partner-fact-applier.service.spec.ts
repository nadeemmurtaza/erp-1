import { Prisma } from '../../../core/prisma/client';
import { DomainEvent } from '../../../core/events/domain-events';
import { PartnerFactApplierService } from './partner-fact-applier.service';

const INBOX_ID = 'inbox1';
const FACT_ID = '3f2c1a4e-8d5b-4c7a-9e11-2a6b7c8d9e01';

const storedPayload = (overrides: Record<string, unknown> = {}) => ({
  factId: FACT_ID,
  type: 'sale.dispatched',
  schemaVersion: 1,
  occurredAt: '2026-09-30T09:14:00Z',
  documentRef: 'INV-2026-000412',
  currency: 'PKR',
  lines: [{ gtin: '8901234567890', name: 'Lawn suit, red, M', quantity: 40, unitPriceMinor: 349900 }],
  ...overrides,
});

const row = (overrides: Record<string, unknown> = {}) => ({
  id: INBOX_ID,
  tradingPartnerId: 'tp1',
  factId: FACT_ID,
  type: 'sale.dispatched',
  status: 'RECEIVED',
  payload: storedPayload(),
  ...overrides,
});

const uniqueViolation = (target: string[]) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });

describe('PartnerFactApplierService', () => {
  let service: PartnerFactApplierService;
  let prisma: any;
  let tx: object;
  let purchasing: { createPurchaseOrder: jest.Mock; createSupplierBill: jest.Mock };
  let events: { publish: jest.Mock };
  let settings: { get: jest.Mock };

  beforeEach(() => {
    tx = { marker: 'tx' };
    prisma = {
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
      partnerFactInbox: { findUnique: jest.fn().mockResolvedValue(row()) },
      supplier: {
        findMany: jest.fn().mockResolvedValue([{ id: 'sup1', name: 'Acme Textiles', currency: 'PKR' }]),
      },
      productVariant: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'var1', barcode: '8901234567890', costPrice: 340000, isActive: true }]),
      },
    };
    purchasing = {
      createPurchaseOrder: jest.fn().mockResolvedValue({ id: 'po1' }),
      createSupplierBill: jest.fn().mockResolvedValue({ id: 'bill1' }),
    };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    settings = { get: jest.fn().mockResolvedValue(25) };
    service = new PartnerFactApplierService(prisma, purchasing as any, events as any, settings as any);
  });

  describe('apply — a fact that checks out', () => {
    it('creates the order and the bill and answers "applied", all in ONE transaction', async () => {
      await expect(service.apply(INBOX_ID)).resolves.toBe('APPLIED');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // The order: created by the system (no user), already SENT, the seller's price as cost, linked to the fact.
      const [dto, userId, orderTx, options] = purchasing.createPurchaseOrder.mock.calls[0];
      expect(dto.supplierId).toBe('sup1');
      expect(dto.items).toEqual([
        { variantId: 'var1', quantityOrdered: 40, unitCost: 349900, note: 'Lawn suit, red, M' },
      ]);
      expect(dto.notes).toContain(FACT_ID);
      expect(dto.notes).toContain('INV-2026-000412');
      expect(userId).toBeNull();
      expect(orderTx).toBe(tx);
      expect(options).toEqual({ status: 'SENT', sourceFactInboxId: INBOX_ID });
      // The bill: the fact's total, the seller's document number, the order it settles — same transaction.
      const [bill, billTx] = purchasing.createSupplierBill.mock.calls[0];
      expect(bill).toMatchObject({
        supplierId: 'sup1',
        purchaseOrderId: 'po1',
        reference: 'INV-2026-000412',
        amount: 40 * 349900,
        currency: 'PKR',
      });
      expect(billTx).toBe(tx);
      // The answer, carrying the order id, written in the same transaction as the order.
      expect(events.publish).toHaveBeenCalledTimes(1);
      expect(events.publish).toHaveBeenCalledWith(
        DomainEvent.PartnerFactApplied,
        {
          inboxId: INBOX_ID,
          tradingPartnerId: 'tp1',
          factId: FACT_ID,
          type: 'sale.dispatched',
          purchaseOrderId: 'po1',
        },
        tx,
      );
    });

    it('bills the tax-inclusive total while costing the goods at the net price', async () => {
      prisma.partnerFactInbox.findUnique.mockResolvedValue(
        row({
          payload: storedPayload({
            lines: [{ gtin: '8901234567890', name: 'X', quantity: 10, unitPriceMinor: 349900, taxMinor: 594830 }],
          }),
        }),
      );

      await service.apply(INBOX_ID);

      expect(purchasing.createPurchaseOrder.mock.calls[0][0].items[0].unitCost).toBe(349900);
      expect(purchasing.createSupplierBill.mock.calls[0][0].amount).toBe(10 * 349900 + 594830);
    });

    it('uses a short fact reference when the seller sent no document number', async () => {
      prisma.partnerFactInbox.findUnique.mockResolvedValue(row({ payload: storedPayload({ documentRef: undefined }) }));

      await service.apply(INBOX_ID);

      expect(purchasing.createSupplierBill.mock.calls[0][0].reference).toBe('Fact 3f2c1a4e');
    });

    it('retries a fact that was waiting for review, once a person has fixed what was wrong', async () => {
      prisma.partnerFactInbox.findUnique.mockResolvedValue(row({ status: 'NEEDS_REVIEW' }));

      await expect(service.apply(INBOX_ID)).resolves.toBe('APPLIED');
    });

    it('looks only at active suppliers linked to THIS partner, and asks for variants only by the barcodes it needs', async () => {
      await service.apply(INBOX_ID);

      expect(prisma.supplier.findMany).toHaveBeenCalledWith({
        where: { tradingPartnerId: 'tp1', isActive: true },
        select: { id: true, name: true, currency: true },
      });
      expect(prisma.productVariant.findMany.mock.calls[0][0].where).toEqual({ barcode: { in: ['8901234567890'] } });
    });
  });

  describe('apply — a fact that is not ours to apply', () => {
    it.each([
      ['does not exist', null],
      ['is a receipt.confirmed', row({ type: 'receipt.confirmed' })],
      ['is already APPLIED', row({ status: 'APPLIED' })],
      ['was REJECTED by a person', row({ status: 'REJECTED' })],
    ])('skips a fact that %s — no read of suppliers, no write, no event', async (_label, stored) => {
      prisma.partnerFactInbox.findUnique.mockResolvedValue(stored);

      await expect(service.apply(INBOX_ID)).resolves.toBe('SKIPPED');

      expect(prisma.supplier.findMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  describe('apply — a fact that needs a person', () => {
    it('writes nothing and asks for review, with the reasons, when no supplier is linked', async () => {
      prisma.supplier.findMany.mockResolvedValue([]);

      await expect(service.apply(INBOX_ID)).resolves.toBe('REVIEW');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(purchasing.createPurchaseOrder).not.toHaveBeenCalled();
      expect(purchasing.createSupplierBill).not.toHaveBeenCalled();
      expect(events.publish).toHaveBeenCalledWith(DomainEvent.PartnerFactNeedsReview, {
        inboxId: INBOX_ID,
        tradingPartnerId: 'tp1',
        factId: FACT_ID,
        type: 'sale.dispatched',
        reason: expect.stringMatching(/No active supplier is linked/),
      });
    });

    it('holds a fact with an unknown barcode', async () => {
      prisma.productVariant.findMany.mockResolvedValue([]);

      await expect(service.apply(INBOX_ID)).resolves.toBe('REVIEW');
      expect(events.publish.mock.calls[0][1].reason).toMatch(/8901234567890/);
    });

    it('holds a fact whose stored payload cannot be read, without applying anything', async () => {
      prisma.partnerFactInbox.findUnique.mockResolvedValue(row({ payload: null }));

      await expect(service.apply(INBOX_ID)).resolves.toBe('REVIEW');
      expect(events.publish.mock.calls[0][1].reason).toMatch(/could not be read/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('uses the price-review threshold from the setting', async () => {
      prisma.productVariant.findMany.mockResolvedValue([
        { id: 'var1', barcode: '8901234567890', costPrice: 300000, isActive: true },
      ]);

      settings.get.mockResolvedValue(25); // 349900 is 17% above 300000
      await expect(service.apply(INBOX_ID)).resolves.toBe('APPLIED');

      settings.get.mockResolvedValue(10);
      await expect(service.apply(INBOX_ID)).resolves.toBe('REVIEW');
    });

    it.each([
      ['text', 'wide'],
      ['a negative number', -1],
      ['a fraction', 12.5],
      ['nothing', undefined],
    ])('falls back to a 25%% limit, never to "no check", when the setting holds %s', async (_label, value) => {
      prisma.productVariant.findMany.mockResolvedValue([
        { id: 'var1', barcode: '8901234567890', costPrice: 100000, isActive: true },
      ]);
      settings.get.mockResolvedValue(value);

      await expect(service.apply(INBOX_ID)).resolves.toBe('REVIEW'); // 349900 is far above 100000
    });
  });

  describe('apply — the second copy and real failures', () => {
    it('answers SKIPPED, not an error, when the order for this fact already exists (a redelivered event)', async () => {
      prisma.$transaction.mockRejectedValueOnce(uniqueViolation(['sourceFactInboxId']));

      await expect(service.apply(INBOX_ID)).resolves.toBe('SKIPPED');
    });

    it('does not mistake a DIFFERENT unique violation for an already-applied fact', async () => {
      prisma.$transaction.mockRejectedValueOnce(uniqueViolation(['number']));

      await expect(service.apply(INBOX_ID)).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    });

    it('throws an unexpected error so the outbox retries the event, rather than swallowing it', async () => {
      prisma.$transaction.mockRejectedValueOnce(new Error('connection reset'));

      await expect(service.apply(INBOX_ID)).rejects.toThrow('connection reset');
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  describe('preview — the read-only second caller of the plan', () => {
    it('returns the plan and writes nothing, publishes nothing', async () => {
      const plan = await service.preview(INBOX_ID);

      expect(plan?.outcome).toBe('APPLY');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(purchasing.createPurchaseOrder).not.toHaveBeenCalled();
      expect(purchasing.createSupplierBill).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('previews a fact that would be held, with its reasons, without parking it', async () => {
      prisma.supplier.findMany.mockResolvedValue([]);

      const plan = await service.preview(INBOX_ID);

      expect(plan?.outcome).toBe('REVIEW');
      expect(plan?.reasons[0]).toMatch(/No active supplier/);
      expect(events.publish).not.toHaveBeenCalled();
    });

    it.each([
      ['missing', null],
      ['already applied', row({ status: 'APPLIED' })],
      ['unreadable', row({ payload: null })],
    ])('returns null for a fact that is %s', async (_label, stored) => {
      prisma.partnerFactInbox.findUnique.mockResolvedValue(stored);
      await expect(service.preview(INBOX_ID)).resolves.toBeNull();
    });
  });
});
