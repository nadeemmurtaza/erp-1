import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { AnalyticsService } from './analytics.service';
import { MetricRegistryService } from '../../../core/metrics/metric-registry.service';

/**
 * WO-D.2 (10-admin-dashboard.md Track D) — covers only `purchasingSpend()`
 * and `purchasingSuppliers()`. Real PrismaService + SettingsService against
 * the seeded test database, same idiom as analytics.comparison.spec.ts and
 * analytics.orders.spec.ts.
 */
describe('AnalyticsService — WO-D.2 purchasing spend/suppliers', () => {
  let service: AnalyticsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        MetricRegistryService,
        PrismaService,
        SettingsService,
        // Settings' shared L2 is not under test here: Redis reads as not connected, so every read is Postgres's.
        { provide: RedisService, useValue: { isReady: () => false } },
        { provide: AppConfigService, useValue: { isModuleEnabled: jest.fn().mockReturnValue(true) } },
      ],
    }).compile();

    service = module.get(AnalyticsService);
    prisma = module.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.supplierBill.deleteMany({ where: { supplier: { name: { startsWith: 'd2-spec ' } } } });
    await prisma.goodsReceiptItem.deleteMany({ where: { purchaseOrderItem: { purchaseOrder: { number: { startsWith: 'd2-spec-' } } } } });
    await prisma.goodsReceipt.deleteMany({ where: { purchaseOrder: { number: { startsWith: 'd2-spec-' } } } });
    await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { number: { startsWith: 'd2-spec-' } } } });
    await prisma.purchaseOrder.deleteMany({ where: { number: { startsWith: 'd2-spec-' } } });
    await prisma.supplierProduct.deleteMany({ where: { variant: { sku: { startsWith: 'd2-spec-' } } } });
    await prisma.review.deleteMany({ where: { product: { slug: { startsWith: 'd2-spec-' } } } });
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: 'd2-spec-' } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: 'd2-spec-' } } });
    await prisma.supplier.deleteMany({ where: { name: { startsWith: 'd2-spec ' } } });
  });

  let seq = 0;
  function uid(): string {
    seq += 1;
    return `d2-spec-${Date.now()}-${seq}`;
  }

  function daysAgo(n: number): Date {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - n);
    date.setUTCHours(12, 0, 0, 0);
    return date;
  }

  async function makeSupplier() {
    return prisma.supplier.create({ data: { name: `d2-spec ${uid()}` } });
  }

  async function makeVariant() {
    const product = await prisma.product.create({ data: { slug: uid(), kind: 'GOODS', basePrice: 1000 } });
    return prisma.productVariant.create({ data: { productId: product.id, sku: uid() } });
  }

  /** A PurchaseOrder, one PurchaseOrderItem, optionally one GoodsReceipt + item. */
  async function makePO(opts: {
    supplierId: string;
    variantId: string;
    quantity: number;
    unitCost: number;
    status?: 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
    sentAt?: Date;
    expectedAt?: Date;
    receivedAt?: Date;
    landedUnitCost?: number;
  }) {
    const lineTotal = opts.quantity * opts.unitCost;
    const po = await prisma.purchaseOrder.create({
      data: {
        number: uid(),
        supplierId: opts.supplierId,
        status: opts.status ?? 'SENT',
        subtotal: lineTotal,
        total: lineTotal,
        sentAt: opts.sentAt,
        expectedAt: opts.expectedAt,
      },
    });
    const item = await prisma.purchaseOrderItem.create({
      data: {
        purchaseOrderId: po.id,
        variantId: opts.variantId,
        quantityOrdered: opts.quantity,
        quantityReceived: opts.receivedAt ? opts.quantity : 0,
        unitCost: opts.unitCost,
        lineTotal,
      },
    });

    if (opts.receivedAt) {
      const location = await prisma.location.findFirstOrThrow({ where: { isDefault: true } });
      const receipt = await prisma.goodsReceipt.create({
        data: { number: uid(), purchaseOrderId: po.id, receivedAt: opts.receivedAt, locationId: location.id },
      });
      await prisma.goodsReceiptItem.create({
        data: {
          goodsReceiptId: receipt.id,
          purchaseOrderItemId: item.id,
          variantId: opts.variantId,
          quantity: opts.quantity,
          unitCost: opts.unitCost,
          landedUnitCost: opts.landedUnitCost ?? opts.unitCost,
        },
      });
    }

    return po;
  }

  async function makeBill(opts: {
    supplierId: string;
    amount: number;
    amountPaid?: number;
    status?: 'UNPAID' | 'PARTIAL' | 'PAID';
    issuedAt?: Date;
  }) {
    return prisma.supplierBill.create({
      data: {
        supplierId: opts.supplierId,
        amount: opts.amount,
        amountPaid: opts.amountPaid ?? 0,
        baseAmountMinor: opts.amount,
        status: opts.status ?? 'UNPAID',
        issuedAt: opts.issuedAt ?? new Date(),
      },
    });
  }

  async function makeSupplierProduct(supplierId: string, variantId: string) {
    return prisma.supplierProduct.create({ data: { supplierId, variantId } });
  }

  async function makeReview(productId: string, rating: number) {
    return prisma.review.create({ data: { productId, rating, status: 'PUBLISHED' } });
  }

  describe('purchasingSpend', () => {
    it('sums ordered (by sentAt), received (by receivedAt) and billed (by issuedAt) independently', async () => {
      const supplier = await makeSupplier();
      const variant = await makeVariant();

      // Sent and received in the window, landed cost differs from unitCost
      // on purpose — "received" must use landedUnitCost, not unitCost.
      await makePO({
        supplierId: supplier.id,
        variantId: variant.id,
        quantity: 10,
        unitCost: 100,
        sentAt: daysAgo(2),
        receivedAt: daysAgo(1),
        landedUnitCost: 120,
      });
      await makeBill({ supplierId: supplier.id, amount: 900, issuedAt: daysAgo(1) });

      const result = await service.purchasingSpend(30);

      expect(result.totals.ordered).toBeGreaterThanOrEqual(1000); // 10 * 100
      expect(result.totals.received).toBeGreaterThanOrEqual(1200); // 10 * 120 landed
      expect(result.totals.billed).toBeGreaterThanOrEqual(900);
    });

    it('excludes a CANCELLED order from "ordered"', async () => {
      const supplier = await makeSupplier();
      const variant = await makeVariant();

      const before = await service.purchasingSpend(30);
      await makePO({
        supplierId: supplier.id,
        variantId: variant.id,
        quantity: 5,
        unitCost: 100,
        status: 'CANCELLED',
        sentAt: daysAgo(1),
      });
      const after = await service.purchasingSpend(30);

      expect(after.totals.ordered).toBe(before.totals.ordered);
    });

    it('computes unpaid as a live balance (amount - amountPaid) across non-PAID bills, ignoring the days window', async () => {
      const supplier = await makeSupplier();
      const before = await service.purchasingSpend(7);

      // Issued well outside a 7-day window, but still owed today.
      await makeBill({ supplierId: supplier.id, amount: 1000, amountPaid: 400, status: 'PARTIAL', issuedAt: daysAgo(90) });
      await makeBill({ supplierId: supplier.id, amount: 500, amountPaid: 500, status: 'PAID', issuedAt: daysAgo(1) });

      const after = await service.purchasingSpend(7);

      // Only the PARTIAL bill's 600 outstanding counts; the PAID bill contributes 0.
      expect(after.totals.unpaid - before.totals.unpaid).toBe(600);
    });

    it('groups received spend by category, defaulting to Uncategorised, capped by LIMIT', async () => {
      const supplier = await makeSupplier();
      const variant = await makeVariant();
      await makePO({
        supplierId: supplier.id,
        variantId: variant.id,
        quantity: 3,
        unitCost: 200,
        sentAt: daysAgo(1),
        receivedAt: daysAgo(1),
      });

      const result = await service.purchasingSpend(30);
      const uncategorised = result.byCategory.find((row) => row.category === 'Uncategorised');
      expect(uncategorised).toBeDefined();
      expect(uncategorised!.spend).toBeGreaterThanOrEqual(600);
      expect(result.byCategory.length).toBeLessThanOrEqual(10);
    });

    it('renders a well-shaped, non-throwing response with no fixtures of its own', async () => {
      await expect(service.purchasingSpend(30)).resolves.toEqual(
        expect.objectContaining({
          totals: expect.objectContaining({
            ordered: expect.any(Number),
            received: expect.any(Number),
            billed: expect.any(Number),
            unpaid: expect.any(Number),
          }),
          series: expect.any(Array),
          byCategory: expect.any(Array),
        }),
      );
    });
  });

  describe('purchasingSuppliers', () => {
    it('ranks suppliers by received spend, descending, and computes each one\'s share of the list total', async () => {
      const big = await makeSupplier();
      const small = await makeSupplier();
      const variant = await makeVariant();

      await makePO({ supplierId: big.id, variantId: variant.id, quantity: 10, unitCost: 100, sentAt: daysAgo(2), receivedAt: daysAgo(1) });
      await makePO({ supplierId: small.id, variantId: variant.id, quantity: 1, unitCost: 100, sentAt: daysAgo(2), receivedAt: daysAgo(1) });

      const result = await service.purchasingSuppliers(30);
      const bigRow = result.rows.find((row) => row.supplierId === big.id)!;
      const smallRow = result.rows.find((row) => row.supplierId === small.id)!;

      expect(bigRow.spend).toBe(1000);
      expect(smallRow.spend).toBe(100);
      expect(bigRow.orders).toBe(1);
      // Shares sum to <=10000bps across the WHOLE ranked list, and the
      // bigger supplier's share must exceed the smaller one's.
      expect(bigRow.share).toBeGreaterThan(smallRow.share);
    });

    it('computes on-time rate only from POs with a promised date, and null when none exists', async () => {
      const onTimeSupplier = await makeSupplier();
      const noPromiseSupplier = await makeSupplier();
      const variant = await makeVariant();

      // Received 1 day before the promised date -> on time.
      await makePO({
        supplierId: onTimeSupplier.id,
        variantId: variant.id,
        quantity: 1,
        unitCost: 100,
        sentAt: daysAgo(10),
        expectedAt: daysAgo(2),
        receivedAt: daysAgo(3),
      });
      // No expectedAt at all -> not scored.
      await makePO({
        supplierId: noPromiseSupplier.id,
        variantId: variant.id,
        quantity: 1,
        unitCost: 100,
        sentAt: daysAgo(10),
        receivedAt: daysAgo(3),
      });

      const result = await service.purchasingSuppliers(30);
      const onTimeRow = result.rows.find((row) => row.supplierId === onTimeSupplier.id);
      const noPromiseRow = result.rows.find((row) => row.supplierId === noPromiseSupplier.id);

      expect(onTimeRow?.onTimeRateBps).toBe(10000);
      expect(noPromiseRow?.onTimeRateBps).toBeNull();
    });

    it('marks a late delivery as not on time', async () => {
      const lateSupplier = await makeSupplier();
      const variant = await makeVariant();

      // Received 2 days AFTER the promised date -> late.
      await makePO({
        supplierId: lateSupplier.id,
        variantId: variant.id,
        quantity: 1,
        unitCost: 100,
        sentAt: daysAgo(10),
        expectedAt: daysAgo(5),
        receivedAt: daysAgo(3),
      });

      const result = await service.purchasingSuppliers(30);
      const row = result.rows.find((r) => r.supplierId === lateSupplier.id);
      expect(row?.onTimeRateBps).toBe(0);
    });

    it('computes average lead time as sentAt to lastReceiptAt, in days', async () => {
      const supplier = await makeSupplier();
      const variant = await makeVariant();

      await makePO({
        supplierId: supplier.id,
        variantId: variant.id,
        quantity: 1,
        unitCost: 100,
        sentAt: daysAgo(10),
        receivedAt: daysAgo(5),
      });

      const result = await service.purchasingSuppliers(30);
      const row = result.rows.find((r) => r.supplierId === supplier.id);
      expect(row?.avgLeadDays).toBeCloseTo(5, 0);
    });

    it('renders an empty rows array on a database with no receipts in the window, never throws', async () => {
      await expect(service.purchasingSuppliers(1)).resolves.toEqual(
        expect.objectContaining({ rows: expect.any(Array) }),
      );
    });

    describe('WO-9.9 — avgProductRating / productReviewCount', () => {
      it('averages PUBLISHED review ratings across every product this supplier supplies', async () => {
        const supplier = await makeSupplier();
        const variant = await makeVariant();
        await makeSupplierProduct(supplier.id, variant.id);
        await makePO({ supplierId: supplier.id, variantId: variant.id, quantity: 1, unitCost: 100, sentAt: daysAgo(1), receivedAt: daysAgo(1) });
        await makeReview(variant.productId, 5);
        await makeReview(variant.productId, 3);

        const result = await service.purchasingSuppliers(30);
        const row = result.rows.find((r) => r.supplierId === supplier.id);

        expect(row?.avgProductRating).toBe(4);
        expect(row?.productReviewCount).toBe(2);
      });

      it('ignores a review with no PUBLISHED status', async () => {
        const supplier = await makeSupplier();
        const variant = await makeVariant();
        await makeSupplierProduct(supplier.id, variant.id);
        await makePO({ supplierId: supplier.id, variantId: variant.id, quantity: 1, unitCost: 100, sentAt: daysAgo(1), receivedAt: daysAgo(1) });
        await prisma.review.create({ data: { productId: variant.productId, rating: 1, status: 'PENDING' } });

        const result = await service.purchasingSuppliers(30);
        const row = result.rows.find((r) => r.supplierId === supplier.id);

        expect(row?.avgProductRating).toBeNull();
        expect(row?.productReviewCount).toBe(0);
      });

      it('is null with a review count of 0 when this supplier has no reviewed products', async () => {
        const supplier = await makeSupplier();
        const variant = await makeVariant();
        await makeSupplierProduct(supplier.id, variant.id);
        await makePO({ supplierId: supplier.id, variantId: variant.id, quantity: 1, unitCost: 100, sentAt: daysAgo(1), receivedAt: daysAgo(1) });

        const result = await service.purchasingSuppliers(30);
        const row = result.rows.find((r) => r.supplierId === supplier.id);

        expect(row?.avgProductRating).toBeNull();
        expect(row?.productReviewCount).toBe(0);
      });
    });
  });
});
