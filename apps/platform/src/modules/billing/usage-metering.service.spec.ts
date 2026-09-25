import { Test, TestingModule } from '@nestjs/testing';
import { UsageMeteringService } from './usage-metering.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantCredentialResolverService } from '../../core/tenant-credentials/tenant-credential-resolver.service';
import { SeatCounterService } from './seat-counter.service';

const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockEnd = jest.fn();

jest.mock('pg', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    query: mockQuery,
    end: mockEnd,
  })),
}));

const usageBasedTenant = {
  id: 't-usage',
  planId: 'plan-usage',
  plan: { id: 'plan-usage', pricingModel: 'USAGE_BASED', transactionFeeBps: 100 }, // 1%
};
const flatTenant = {
  id: 't-flat',
  planId: 'plan-flat',
  plan: { id: 'plan-flat', pricingModel: 'FLAT_MONTHLY', transactionFeeBps: null },
};

function outboxRow(overrides: Partial<{ id: string; name: string; payload: unknown; createdAt: Date }>) {
  return { id: 'evt-1', name: 'order.status_changed', payload: {}, createdAt: new Date('2026-09-10T00:00:00Z'), ...overrides };
}

describe('UsageMeteringService', () => {
  let prisma: any;
  let credentials: any;
  let seatCounter: any;
  let service: UsageMeteringService;
  // The transaction client every `prisma.$transaction(async (tx) => ...)`
  // callback receives — a fresh object per test.
  let tx: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockEnd.mockResolvedValue(undefined);
    credentials = { resolveConnectionString: jest.fn().mockResolvedValue('postgresql://x/tenant_x') };
    seatCounter = { countBillableSeats: jest.fn().mockResolvedValue(3) };

    tx = {
      meteredOrderFee: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
      usageMeter: { upsert: jest.fn() },
      usageMeteringCursor: { upsert: jest.fn() },
      platformInvoice: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      platformInvoiceCreditNote: { create: jest.fn().mockResolvedValue({ id: 'cn-1' }) },
    };

    prisma = {
      platformTenant: { findUnique: jest.fn(), findMany: jest.fn() },
      usageMeteringCursor: { findUnique: jest.fn().mockResolvedValue(null) },
      usageMeter: { findMany: jest.fn(), upsert: jest.fn() },
      $transaction: jest.fn(async (arg: any) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        return arg(tx);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsageMeteringService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantCredentialResolverService, useValue: credentials },
        { provide: SeatCounterService, useValue: seatCounter },
      ],
    }).compile();

    service = module.get(UsageMeteringService);
  });

  describe('pollTenant', () => {
    it('never opens a tenant connection for a non-USAGE_BASED tenant — zero UsageMeter rows accrue', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(flatTenant);

      const result = await service.pollTenant('t-flat');

      expect(result).toEqual({ scanned: 0, metered: 0, reversed: 0 });
      expect(credentials.resolveConnectionString).not.toHaveBeenCalled();
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('meters a DELIVERED order regardless of channel — the direct test that a POS sale (doc 68 fix) is metered exactly like an e-commerce one', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(usageBasedTenant);
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('"OutboxEvent"')) {
          return Promise.resolve({
            rows: [
              outboxRow({ id: 'evt-pos', payload: { orderId: 'order-pos', toStatus: 'DELIVERED' } }),
            ],
          });
        }
        if (sql.includes('"Order"')) {
          // Grand total looked up purely by orderId — POS and e-commerce
          // orders are indistinguishable at this layer, which is the point.
          return Promise.resolve({ rows: [{ id: 'order-pos', grandTotal: 10_000 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await service.pollTenant('t-usage');

      expect(result).toEqual({ scanned: 1, metered: 1, reversed: 0 });
      expect(tx.meteredOrderFee.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tenantId: 't-usage', orderId: 'order-pos', feeMinor: 100 }), // 1% of 10,000
      });
      expect(tx.usageMeter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_metric_periodStart: expect.objectContaining({ tenantId: 't-usage', metric: 'transaction_fee_minor' }) },
          create: expect.objectContaining({ quantity: 100 }),
          update: { quantity: { increment: 100 } },
        }),
      );
      expect(mockEnd).toHaveBeenCalledTimes(1);
    });

    it('a rescanned DELIVERED row for the same order metres no second fee — the second copy of the write', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(usageBasedTenant);
      tx.meteredOrderFee.findUnique.mockResolvedValue({ id: 'mof-1', tenantId: 't-usage', orderId: 'order-1', feeMinor: 100, reversedAt: null });
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('"OutboxEvent"')) {
          return Promise.resolve({ rows: [outboxRow({ payload: { orderId: 'order-1', toStatus: 'DELIVERED' } })] });
        }
        if (sql.includes('"Order"')) return Promise.resolve({ rows: [{ id: 'order-1', grandTotal: 10_000 }] });
        return Promise.resolve({ rows: [] });
      });

      const result = await service.pollTenant('t-usage');

      expect(result.metered).toBe(0);
      expect(tx.meteredOrderFee.create).not.toHaveBeenCalled();
      expect(tx.usageMeter.upsert).not.toHaveBeenCalled();
    });

    it('reverses a RETURNED order by exactly its own metered fee when the period is still open — never more, never less', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(usageBasedTenant);
      tx.meteredOrderFee.findUnique.mockResolvedValue({
        id: 'mof-1', tenantId: 't-usage', orderId: 'order-1', feeMinor: 250, reversedAt: null,
        periodStart: new Date('2026-09-01T00:00:00Z'), periodEnd: new Date('2026-10-01T00:00:00Z'),
      });
      tx.platformInvoice.findUnique.mockResolvedValue(null); // period not yet invoiced
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('"OutboxEvent"')) {
          return Promise.resolve({ rows: [outboxRow({ payload: { orderId: 'order-1', toStatus: 'RETURNED' } })] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await service.pollTenant('t-usage');

      expect(result.reversed).toBe(1);
      expect(tx.usageMeter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { quantity: { increment: -250 } } }),
      );
      expect(tx.meteredOrderFee.update).toHaveBeenCalledWith({
        where: { id: 'mof-1' },
        data: { reversedAt: expect.any(Date), reversalCreditNoteId: null },
      });
      expect(tx.platformInvoiceCreditNote.create).not.toHaveBeenCalled();
    });

    it('credits the already-issued invoice instead of mutating a closed period, when the return arrives after billing', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(usageBasedTenant);
      tx.meteredOrderFee.findUnique.mockResolvedValue({
        id: 'mof-1', tenantId: 't-usage', orderId: 'order-1', feeMinor: 250, reversedAt: null,
        periodStart: new Date('2026-09-01T00:00:00Z'), periodEnd: new Date('2026-10-01T00:00:00Z'),
      });
      tx.platformInvoice.findUnique.mockResolvedValue({ id: 'inv-already-issued' });
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('"OutboxEvent"')) {
          return Promise.resolve({ rows: [outboxRow({ payload: { orderId: 'order-1', toStatus: 'RETURNED' } })] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await service.pollTenant('t-usage');

      expect(result.reversed).toBe(1);
      expect(tx.platformInvoiceCreditNote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ invoiceId: 'inv-already-issued', amountMinor: 250 }),
      });
      expect(tx.platformInvoice.update).toHaveBeenCalledWith({ where: { id: 'inv-already-issued' }, data: { status: 'CREDITED' } });
      // The closed period's own UsageMeter row is never decremented.
      expect(tx.usageMeter.upsert).not.toHaveBeenCalled();
      expect(tx.meteredOrderFee.update).toHaveBeenCalledWith({
        where: { id: 'mof-1' },
        data: { reversedAt: expect.any(Date), reversalCreditNoteId: 'cn-1' },
      });
    });

    it('a RETURNED order never metered in the first place is skipped silently, never throws', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(usageBasedTenant);
      tx.meteredOrderFee.findUnique.mockResolvedValue(null);
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('"OutboxEvent"')) {
          return Promise.resolve({ rows: [outboxRow({ payload: { orderId: 'order-never-metered', toStatus: 'RETURNED' } })] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await service.pollTenant('t-usage');

      expect(result.reversed).toBe(0);
    });

    it('increments messages_sent by one per notification.sent event', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(usageBasedTenant);
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('"OutboxEvent"')) {
          return Promise.resolve({ rows: [outboxRow({ id: 'evt-n', name: 'notification.sent', payload: { template: 'order.confirmed', channelsAttempted: 2 } })] });
        }
        return Promise.resolve({ rows: [] });
      });

      await service.pollTenant('t-usage');

      expect(tx.usageMeter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_metric_periodStart: expect.objectContaining({ metric: 'messages_sent' }) },
          create: expect.objectContaining({ quantity: 1 }),
          update: { quantity: { increment: 1 } },
        }),
      );
    });

    it('closes the tenant connection even when the outbox query fails, and defers rather than throwing', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(usageBasedTenant);
      mockQuery.mockRejectedValue(new Error('tenant db unreachable'));

      const result = await service.pollTenant('t-usage');

      expect(result).toEqual({ scanned: 0, metered: 0, reversed: 0 });
      expect(mockEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe('snapshotAllowances', () => {
    it('does nothing for a non-USAGE_BASED tenant', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(flatTenant);

      await service.snapshotAllowances('t-flat');

      expect(seatCounter.countBillableSeats).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('SETS products_count/seats_count to the latest observed value, not an increment', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(usageBasedTenant);
      mockQuery.mockResolvedValue({ rows: [{ count: '42' }] });
      seatCounter.countBillableSeats.mockResolvedValue(7);

      await service.snapshotAllowances('t-usage');

      expect(prisma.usageMeter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { quantity: 42 } }),
      );
      expect(prisma.usageMeter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { quantity: 7 } }),
      );
    });
  });

  describe('getMetersForPeriod', () => {
    it('reads UsageMeter rows into a metric -> quantity map', async () => {
      prisma.usageMeter.findMany.mockResolvedValue([
        { metric: 'transaction_fee_minor', quantity: 500 },
        { metric: 'messages_sent', quantity: 12 },
      ]);

      const meters = await service.getMetersForPeriod('t-usage', new Date('2026-09-01T00:00:00Z'));

      expect(meters.get('transaction_fee_minor')).toBe(500);
      expect(meters.get('messages_sent')).toBe(12);
    });
  });
});
