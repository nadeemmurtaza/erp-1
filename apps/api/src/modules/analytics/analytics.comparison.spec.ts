import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { AppConfigService } from '../../core/config/app-config.service';
import { shopDayKey } from '../../core/time/shop-time';
import { AnalyticsService } from './analytics.service';
import { MetricRegistryService } from '../../core/metrics/metric-registry.service';

/**
 * WO-23.1's WO-B.5 — covers only the new `comparison()` method. The rest of
 * AnalyticsService (summary/stitchingAnalytics/extendedAnalytics/
 * visitorAnalytics) had no unit tests before this file and stays out of
 * scope here (change minimization) — real PrismaService + SettingsService
 * against the seeded test database, same idiom as finance.spec.ts and
 * order-economics.service.spec.ts; only AppConfigService is mocked, since
 * "is the finance module on" is a config concern, not a database one.
 *
 * Fixture dates are always relative to "now" (never a fixed calendar date):
 * `comparison()`'s own window is `days` back from now, so a hardcoded past
 * date eventually falls outside every window the tests use.
 */
describe('AnalyticsService.comparison', () => {
  let service: AnalyticsService;
  let prisma: PrismaService;
  let settings: SettingsService;
  let config: { isModuleEnabled: jest.Mock };
  let timeZone: string;

  beforeAll(async () => {
    config = { isModuleEnabled: jest.fn().mockReturnValue(true) };
    const module = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        MetricRegistryService,
        PrismaService,
        SettingsService,
        // Settings' shared L2 is not under test here: Redis reads as not connected, so every read is Postgres's.
        { provide: RedisService, useValue: { isReady: () => false } },
        { provide: AppConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(AnalyticsService);
    prisma = module.get(PrismaService);
    settings = module.get(SettingsService);
    timeZone = await settings.get<string>(SettingKey.StoreTimezone);
  });

  afterEach(async () => {
    await prisma.order.deleteMany({ where: { number: { startsWith: 'cmp-spec-' } } });
    await prisma.expense.deleteMany({ where: { description: { startsWith: 'cmp-spec ' } } });
    await prisma.goodsReceipt.deleteMany({ where: { number: { startsWith: 'cmp-spec-' } } });
    await prisma.purchaseOrder.deleteMany({ where: { number: { startsWith: 'cmp-spec-' } } });
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: 'cmp-spec-' } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: 'cmp-spec-' } } });
    await prisma.supplier.deleteMany({ where: { name: { startsWith: 'cmp-spec ' } } });
    config.isModuleEnabled.mockReturnValue(true);
  });

  let seq = 0;
  function uid(): string {
    seq += 1;
    return `cmp-spec-${Date.now()}-${seq}`;
  }

  /** Noon UTC, `n` calendar days before now — clear of any midnight/DST edge. */
  function daysAgo(n: number): Date {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - n);
    date.setUTCHours(12, 0, 0, 0);
    return date;
  }

  /** The shop-local day-bucket key `comparison()` would give to `daysAgo(n)`. */
  function dayKeyDaysAgo(n: number): string {
    return shopDayKey(daysAgo(n), timeZone);
  }

  async function makeOrder(opts: {
    grandTotal: number;
    itemsSubtotal: number;
    status?: 'DELIVERED' | 'CANCELLED' | 'RETURNED';
    placedAt: Date;
    items?: Array<{ unitCost: number; quantity: number }>;
  }) {
    return prisma.order.create({
      data: {
        number: uid(),
        status: opts.status ?? 'DELIVERED',
        shippingAddress: {},
        itemsSubtotal: opts.itemsSubtotal,
        grandTotal: opts.grandTotal,
        placedAt: opts.placedAt,
        items: {
          create: (opts.items ?? []).map((item) => ({
            kind: 'GOODS',
            nameEn: 'cmp-spec item',
            unitPrice: item.unitCost + 100,
            unitCost: item.unitCost,
            quantity: item.quantity,
            lineTotal: (item.unitCost + 100) * item.quantity,
          })),
        },
      },
    });
  }

  /** A PurchaseOrder -> GoodsReceipt -> GoodsReceiptItem chain, the "Purchases" figure's real source. */
  async function makeGoodsReceipt(opts: {
    quantity: number;
    landedUnitCost: number;
    receivedAt: Date;
    poTotal?: number;
    poSentAt?: Date;
  }) {
    const supplier = await prisma.supplier.create({ data: { name: `cmp-spec ${uid()}` } });
    const product = await prisma.product.create({ data: { slug: uid(), kind: 'GOODS', basePrice: 1000 } });
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: uid() } });
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        number: uid(),
        supplierId: supplier.id,
        total: opts.poTotal ?? opts.quantity * opts.landedUnitCost,
        sentAt: opts.poSentAt,
      },
    });
    const poItem = await prisma.purchaseOrderItem.create({
      data: {
        purchaseOrderId: purchaseOrder.id,
        variantId: variant.id,
        quantityOrdered: opts.quantity,
        unitCost: opts.landedUnitCost,
        lineTotal: opts.quantity * opts.landedUnitCost,
      },
    });
    const location = await prisma.location.findFirstOrThrow({ where: { isDefault: true } });
    const receipt = await prisma.goodsReceipt.create({
      data: { number: uid(), purchaseOrderId: purchaseOrder.id, receivedAt: opts.receivedAt, locationId: location.id },
    });
    await prisma.goodsReceiptItem.create({
      data: {
        goodsReceiptId: receipt.id,
        purchaseOrderItemId: poItem.id,
        variantId: variant.id,
        quantity: opts.quantity,
        unitCost: opts.landedUnitCost,
        landedUnitCost: opts.landedUnitCost,
      },
    });
    return { supplier, product, variant, purchaseOrder, receipt };
  }

  it('computes sales, cogs-derived grossProfit, purchases and expenses on a fixture with known integers', async () => {
    await makeOrder({
      grandTotal: 10_000,
      itemsSubtotal: 10_000,
      placedAt: daysAgo(5),
      items: [{ unitCost: 3000, quantity: 2 }], // cogs 6000
    });
    await makeGoodsReceipt({ quantity: 5, landedUnitCost: 400, receivedAt: daysAgo(5) }); // 2000
    await prisma.expense.create({
      data: {
        categoryId: (await prisma.expenseCategory.findFirstOrThrow()).id,
        amount: 1500,
        description: 'cmp-spec fixture expense',
        incurredAt: daysAgo(5),
      },
    });

    const result = await service.comparison(30, 'day', true);
    const day = result.buckets.find((b) => b.t === dayKeyDaysAgo(5));

    expect(day).toBeDefined();
    expect(day!.sales).toBe(10_000);
    expect(day!.purchases).toBe(2000);
    expect(day!.expenses).toBe(1500);
    expect(day!.grossProfit).toBe(10_000 - 6000);
    expect(day!.net).toBe(10_000 - 6000 - 1500);
  });

  it('excludes CANCELLED and RETURNED orders from both sales and cogs', async () => {
    await makeOrder({
      grandTotal: 5000,
      itemsSubtotal: 5000,
      status: 'CANCELLED',
      placedAt: daysAgo(6),
      items: [{ unitCost: 1000, quantity: 1 }],
    });
    await makeOrder({
      grandTotal: 7000,
      itemsSubtotal: 7000,
      status: 'RETURNED',
      placedAt: daysAgo(6),
      items: [{ unitCost: 2000, quantity: 1 }],
    });
    await makeOrder({
      grandTotal: 3000,
      itemsSubtotal: 3000,
      status: 'DELIVERED',
      placedAt: daysAgo(6),
      items: [{ unitCost: 500, quantity: 1 }],
    });

    const result = await service.comparison(30, 'day', true);
    const day = result.buckets.find((b) => b.t === dayKeyDaysAgo(6))!;
    expect(day.sales).toBe(3000);
    expect(day.grossProfit).toBe(3000 - 500);
  });

  it('reads Purchases from GoodsReceiptItem.quantity*landedUnitCost by receivedAt, never PurchaseOrder.total by sentAt', async () => {
    await makeGoodsReceipt({
      quantity: 10,
      landedUnitCost: 250, // real cost: 2500
      receivedAt: daysAgo(7),
      poTotal: 999_999, // deliberately wrong, to prove this is NOT what's read
      poSentAt: daysAgo(400), // deliberately outside the window
    });

    const result = await service.comparison(30, 'day', true);
    const day = result.buckets.find((b) => b.t === dayKeyDaysAgo(7))!;
    expect(day.purchases).toBe(2500);
  });

  it('every figure in the payload is an integer', async () => {
    await makeOrder({
      grandTotal: 12_345,
      itemsSubtotal: 12_345,
      placedAt: daysAgo(8),
      items: [{ unitCost: 777, quantity: 3 }],
    });
    await makeGoodsReceipt({ quantity: 3, landedUnitCost: 111, receivedAt: daysAgo(8) });

    const result = await service.comparison(30, 'day', true);
    for (const bucket of result.buckets) {
      expect(Number.isInteger(bucket.sales)).toBe(true);
      expect(Number.isInteger(bucket.purchases)).toBe(true);
      expect(Number.isInteger(bucket.expenses)).toBe(true);
      if (bucket.grossProfit !== null) expect(Number.isInteger(bucket.grossProfit)).toBe(true);
      if (bucket.net !== null) expect(Number.isInteger(bucket.net)).toBe(true);
    }
    expect(Number.isInteger(result.totals.sales)).toBe(true);
    expect(Number.isInteger(result.totals.purchases)).toBe(true);
    expect(Number.isInteger(result.totals.expenses)).toBe(true);
  });

  it('zeroes expenses and flags financeEnabled false when MODULES excludes finance — never an error', async () => {
    config.isModuleEnabled.mockReturnValue(false);
    await prisma.expense.create({
      data: {
        categoryId: (await prisma.expenseCategory.findFirstOrThrow()).id,
        amount: 9999,
        description: 'cmp-spec should be invisible',
        incurredAt: daysAgo(9),
      },
    });

    const result = await service.comparison(30, 'day', true);
    expect(result.financeEnabled).toBe(false);
    expect(result.buckets.every((b) => b.expenses === 0)).toBe(true);
    expect(result.totals.expenses).toBe(0);
  });

  it('grossProfit and net are null throughout, totals included, without inventory.view_cost', async () => {
    await makeOrder({
      grandTotal: 4000,
      itemsSubtotal: 4000,
      placedAt: daysAgo(10),
      items: [{ unitCost: 500, quantity: 1 }],
    });

    const result = await service.comparison(30, 'day', false);
    expect(result.buckets.every((b) => b.grossProfit === null && b.net === null)).toBe(true);
    expect(result.totals.grossProfit).toBeNull();
    expect(result.totals.net).toBeNull();
    // The sales figure itself is still visible — only cost-derived numbers hide.
    const day = result.buckets.find((b) => b.t === dayKeyDaysAgo(10))!;
    expect(day.sales).toBe(4000);
  });

  it('bucket=month over days=365 returns 12-13 buckets, oldest first, partial current month last', async () => {
    const result = await service.comparison(365, 'month', true);
    expect(result.buckets.length).toBeGreaterThanOrEqual(12);
    expect(result.buckets.length).toBeLessThanOrEqual(13);
    const keys = result.buckets.map((b) => b.t);
    expect(keys).toEqual([...keys].sort());
    const currentMonthKey = `${dayKeyDaysAgo(0).slice(0, 7)}-01`;
    expect(keys.at(-1)).toBe(currentMonthKey);
  });

  it('daily buckets sum to monthly buckets sum to totals, to the paisa', async () => {
    await makeOrder({
      grandTotal: 1000,
      itemsSubtotal: 1000,
      placedAt: daysAgo(60),
      items: [{ unitCost: 100, quantity: 1 }],
    });
    await makeOrder({
      grandTotal: 2000,
      itemsSubtotal: 2000,
      placedAt: daysAgo(20),
      items: [{ unitCost: 200, quantity: 1 }],
    });
    await makeGoodsReceipt({ quantity: 1, landedUnitCost: 300, receivedAt: daysAgo(40) });

    const [daily, monthly] = await Promise.all([service.comparison(90, 'day', true), service.comparison(90, 'month', true)]);

    const sumOf = (buckets: typeof daily.buckets) => buckets.reduce((sum, b) => sum + b.sales + b.purchases, 0);
    expect(sumOf(daily.buckets)).toBe(sumOf(monthly.buckets));
    expect(sumOf(monthly.buckets)).toBe(daily.totals.sales + daily.totals.purchases);
  });
});
