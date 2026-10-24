import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SeatCounterService } from './seat-counter.service';
import { UsageMeteringService } from './usage-metering.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { PlatformNotificationsService } from '../../core/notifications/notifications.service';

describe('BillingService', () => {
  let prisma: any;
  let seatCounter: any;
  let notifications: any;
  let usageMetering: any;
  let config: any;
  let service: BillingService;

  const periodStart = new Date('2026-09-01T00:00:00Z');
  const periodEnd = new Date('2026-10-01T00:00:00Z');

  const perSeatTenant = {
    id: 't-seat',
    legalName: 'Seat Co',
    billingContactEmail: 'a@seatco.test',
    plan: { id: 'plan-seat', key: 'per-seat', pricingModel: 'PER_SEAT', perSeatPriceMinor: 500, monthlyPriceMinor: 0, oneTimeLicenseMinor: null },
  };
  const flatTenant = {
    id: 't-flat',
    legalName: 'Flat Co',
    billingContactEmail: 'a@flatco.test',
    plan: { id: 'plan-flat', key: 'flat', pricingModel: 'FLAT_MONTHLY', perSeatPriceMinor: null, monthlyPriceMinor: 9900, oneTimeLicenseMinor: null },
  };
  const oneTimeTenant = {
    id: 't-once',
    legalName: 'Once Co',
    billingContactEmail: 'a@once.test',
    plan: { id: 'plan-once', key: 'once', pricingModel: 'ONE_TIME_LICENSE', perSeatPriceMinor: null, monthlyPriceMinor: 0, oneTimeLicenseMinor: 500_000 },
  };
  const usageTenant = {
    id: 't-usage',
    legalName: 'Usage Co',
    billingContactEmail: 'a@usageco.test',
    plan: {
      id: 'plan-usage', key: 'usage', pricingModel: 'USAGE_BASED',
      perSeatPriceMinor: null, monthlyPriceMinor: 0, oneTimeLicenseMinor: null,
      transactionFeeBps: 100, usageRateCardMinor: { messages_sent: 100, products_over_limit: 50_000 }, includedAllowances: { products: 1000 },
    },
  };

  beforeEach(async () => {
    prisma = {
      platformTenant: { findUnique: jest.fn(), findMany: jest.fn() },
      platformInvoice: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(), findMany: jest.fn() },
      platformSubscription: { findFirst: jest.fn(), update: jest.fn() },
      platformInvoiceCreditNote: { create: jest.fn() },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };
    seatCounter = { countBillableSeats: jest.fn() };
    notifications = { send: jest.fn() };
    usageMetering = { getMetersForPeriod: jest.fn().mockResolvedValue(new Map()) };
    config = { get: jest.fn().mockReturnValue(15) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: SeatCounterService, useValue: seatCounter },
        { provide: PlatformNotificationsService, useValue: notifications },
        { provide: UsageMeteringService, useValue: usageMetering },
        { provide: AppConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(BillingService);
  });

  describe('issueInvoiceForPeriod', () => {
    it('a PER_SEAT invoice equals perSeatPriceMinor x countBillableSeats(), snapshotted', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(perSeatTenant);
      prisma.platformInvoice.findUnique.mockResolvedValue(null);
      seatCounter.countBillableSeats.mockResolvedValue(12);
      prisma.platformSubscription.findFirst.mockResolvedValue({ id: 'sub-1' });
      prisma.platformInvoice.create.mockResolvedValue({ id: 'inv-1', amountMinor: 6000 });

      await service.issueInvoiceForPeriod('t-seat', periodStart, periodEnd);

      expect(prisma.platformInvoice.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          amountMinor: 6000, // 12 * 500
          seatCount: 12,
          seatPriceMinorSnapshot: 500,
          pricingModel: 'PER_SEAT',
        }),
      });
      expect(notifications.send).toHaveBeenCalledWith('a@seatco.test', expect.any(String), expect.any(String));
    });

    it('is idempotent: retrying an already-billed period issues no second invoice', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(flatTenant);
      prisma.platformInvoice.findUnique.mockResolvedValue({ id: 'inv-existing' });

      const result = await service.issueInvoiceForPeriod('t-flat', periodStart, periodEnd);

      expect(result).toEqual({ id: 'inv-existing' });
      expect(prisma.platformInvoice.create).not.toHaveBeenCalled();
      expect(seatCounter.countBillableSeats).not.toHaveBeenCalled();
    });

    it('a ONE_TIME_LICENSE tenant is billed exactly once, ever — a second period never re-bills it', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(oneTimeTenant);
      prisma.platformInvoice.findUnique.mockResolvedValue(null); // not billed THIS period
      prisma.platformInvoice.findFirst.mockResolvedValue({ id: 'inv-already', pricingModel: 'ONE_TIME_LICENSE' }); // billed EVER

      const result = await service.issueInvoiceForPeriod('t-once', periodStart, periodEnd);

      expect(result).toBeNull();
      expect(prisma.platformInvoice.create).not.toHaveBeenCalled();
    });

    it('issues the one-time invoice and closes the subscription so no future run reconsiders it', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(oneTimeTenant);
      prisma.platformInvoice.findUnique.mockResolvedValue(null);
      prisma.platformInvoice.findFirst.mockResolvedValue(null);
      prisma.platformSubscription.findFirst.mockResolvedValue({ id: 'sub-once' });
      prisma.platformInvoice.create.mockResolvedValue({ id: 'inv-once', amountMinor: 500_000 });

      await service.issueInvoiceForPeriod('t-once', periodStart, periodEnd);

      expect(prisma.platformInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amountMinor: 500_000, oneTimePriceMinorSnapshot: 500_000 }) }),
      );
      expect(prisma.platformSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-once' },
        data: { status: 'CANCELLED', endedOn: expect.any(Date) },
      });
    });

    it('defers (never throws for the whole batch) when the seat count cannot be computed — "four hours down"', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(perSeatTenant);
      prisma.platformInvoice.findUnique.mockResolvedValue(null);
      seatCounter.countBillableSeats.mockRejectedValue(new Error('tenant database unreachable'));

      const result = await service.issueInvoiceForPeriod('t-seat', periodStart, periodEnd);

      expect(result).toBeNull();
      expect(prisma.platformInvoice.create).not.toHaveBeenCalled();
    });

    it('a FLAT_MONTHLY invoice equals monthlyPriceMinor, snapshotted', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(flatTenant);
      prisma.platformInvoice.findUnique.mockResolvedValue(null);
      prisma.platformSubscription.findFirst.mockResolvedValue({ id: 'sub-flat' });
      prisma.platformInvoice.create.mockResolvedValue({ id: 'inv-flat', amountMinor: 9900 });

      await service.issueInvoiceForPeriod('t-flat', periodStart, periodEnd);

      expect(prisma.platformInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amountMinor: 9900, flatPriceMinorSnapshot: 9900, seatCount: null }) }),
      );
    });
  });

  describe('runBillingForPeriod', () => {
    it('only bills ACTIVE tenants and never fails the whole run when one tenant defers', async () => {
      prisma.platformTenant.findMany.mockResolvedValue([{ id: 't-seat', plan: perSeatTenant.plan }, { id: 't-flat', plan: flatTenant.plan }]);
      prisma.platformInvoice.count.mockResolvedValue(0);
      prisma.platformTenant.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(where.id === 't-seat' ? perSeatTenant : flatTenant),
      );
      prisma.platformInvoice.findUnique.mockResolvedValue(null);
      seatCounter.countBillableSeats.mockRejectedValue(new Error('unreachable'));
      prisma.platformSubscription.findFirst.mockResolvedValue({ id: 'sub-flat' });
      prisma.platformInvoice.create.mockResolvedValue({ id: 'inv-flat' });

      const result = await service.runBillingForPeriod(periodStart, periodEnd);

      expect(prisma.platformTenant.findMany).toHaveBeenCalledWith({ where: { status: 'ACTIVE' } });
      expect(result.issued).toBe(1); // flat succeeded
      expect(result.skipped).toBe(1); // per-seat deferred
    });
  });

  describe('issueCreditNote', () => {
    it('creates a credit note and marks the invoice CREDITED, never editing the invoice amount', async () => {
      prisma.platformInvoice.findUnique.mockResolvedValue({ id: 'inv-1', amountMinor: 9900 });
      prisma.platformInvoiceCreditNote.create.mockResolvedValue({ id: 'cn-1' });

      await service.issueCreditNote('inv-1', 9900, 'wrong seat count');

      expect(prisma.$transaction).toHaveBeenCalled();
      const ops = prisma.$transaction.mock.calls[0][0];
      expect(ops).toHaveLength(2);
    });
  });

  describe('previewInvoice', () => {
    it('computes with no write — a dry run', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(perSeatTenant);
      seatCounter.countBillableSeats.mockResolvedValue(4);

      const preview = await service.previewInvoice('t-seat', periodStart, periodEnd);

      expect(preview.amountMinor).toBe(2000);
      expect(prisma.platformInvoice.create).not.toHaveBeenCalled();
    });
  });

  describe('USAGE_BASED (doc 153)', () => {
    it('a FLAT_MONTHLY/PER_SEAT/ONE_TIME_LICENSE tenant never reads UsageMeter at all', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(flatTenant);

      await service.previewInvoice('t-flat', periodStart, periodEnd);

      expect(usageMetering.getMetersForPeriod).not.toHaveBeenCalled();
    });

    it('the transaction fee comes straight off the meter, with no further math', async () => {
      usageMetering.getMetersForPeriod.mockResolvedValue(new Map([['transaction_fee_minor', 5_500]]));
      prisma.platformTenant.findUnique.mockResolvedValue(usageTenant);

      const preview = await service.previewInvoice('t-usage', periodStart, periodEnd);

      expect(preview.usageBreakdown!.transactionFeeMinor).toBe(5_500);
      expect(preview.amountMinor).toBe(5_500);
    });

    it('prices messages_sent per unit from the plan rate card', async () => {
      usageMetering.getMetersForPeriod.mockResolvedValue(new Map([['transaction_fee_minor', 0], ['messages_sent', 30]]));
      prisma.platformTenant.findUnique.mockResolvedValue(usageTenant);

      const preview = await service.previewInvoice('t-usage', periodStart, periodEnd);

      // 30 messages x 100 paisa (usageRateCardMinor.messages_sent) = 3,000.
      expect(preview.amountMinor).toBe(3_000);
      expect(preview.usageBreakdown!.lines).toContainEqual(
        expect.objectContaining({ metric: 'messages_sent', quantity: 30, amountMinor: 3_000 }),
      );
    });

    it('charges the flat over-limit fee once when a banded allowance is crossed, never per unit over', async () => {
      usageMetering.getMetersForPeriod.mockResolvedValue(
        new Map([['transaction_fee_minor', 0], ['products_count', 1_500]]), // allowance is 1,000
      );
      prisma.platformTenant.findUnique.mockResolvedValue(usageTenant);

      const preview = await service.previewInvoice('t-usage', periodStart, periodEnd);

      expect(preview.amountMinor).toBe(50_000); // the flat products_over_limit fee, not 500 x anything
      expect(preview.usageBreakdown!.lines).toContainEqual(
        expect.objectContaining({ metric: 'products_count', quantity: 1_500, allowance: 1_000, amountMinor: 50_000 }),
      );
    });

    it('charges nothing extra when a banded allowance is not crossed', async () => {
      usageMetering.getMetersForPeriod.mockResolvedValue(new Map([['transaction_fee_minor', 0], ['products_count', 400]]));
      prisma.platformTenant.findUnique.mockResolvedValue(usageTenant);

      const preview = await service.previewInvoice('t-usage', periodStart, periodEnd);

      expect(preview.amountMinor).toBe(0);
      expect(preview.usageBreakdown!.lines.find((l) => l.metric === 'products_count')).toBeUndefined();
    });

    it("a tenant's preview and their issued invoice agree exactly — both read the same UsageMeter rows", async () => {
      usageMetering.getMetersForPeriod.mockResolvedValue(new Map([['transaction_fee_minor', 12_340], ['messages_sent', 10]]));
      prisma.platformTenant.findUnique.mockResolvedValue(usageTenant);
      prisma.platformInvoice.findUnique.mockResolvedValue(null);
      prisma.platformSubscription.findFirst.mockResolvedValue({ id: 'sub-usage' });
      prisma.platformInvoice.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'inv-usage', ...data }));

      const preview = await service.previewInvoice('t-usage', periodStart, periodEnd);
      const invoice = await service.issueInvoiceForPeriod('t-usage', periodStart, periodEnd);

      expect(invoice!.amountMinor).toBe(preview.amountMinor);
      expect(prisma.platformInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            transactionFeeMinorSnapshot: 12_340,
            dueAt: expect.any(Date),
          }),
        }),
      );
    });
  });
});
