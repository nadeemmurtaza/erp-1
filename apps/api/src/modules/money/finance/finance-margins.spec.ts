import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { EventBusService } from '../../../core/events/event-bus.service';
import { StorageService } from '../../../core/storage/storage.service';
import { FinanceService } from './finance.service';

/**
 * WO-4.2/4.3 (04-finance.md) — margin by product/category, and unit
 * economics' contribution-per-order plus its averages. Real PrismaService
 * against the seeded test database, same idiom as finance.spec.ts.
 *
 * Deliberately sourced from OrderItem/OrderEconomics, never the general
 * ledger (RETAIL-ERP.md R15) — see FinanceService.marginBy's own comment.
 */
describe('FinanceService margins and unit economics', () => {
  let service: FinanceService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        FinanceService,
        PrismaService,
        { provide: EventBusService, useValue: { publish: jest.fn() } },
        { provide: StorageService, useValue: {} },
        { provide: AppConfigService, useValue: { nodeRole: 'STANDALONE', nodeId: 'main' } },
      ],
    }).compile();

    service = module.get(FinanceService);
    prisma = module.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.order.deleteMany({ where: { number: { startsWith: 'fin-margin-' } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: 'fin-margin-' } } });
  });

  let seq = 0;
  function tag(): string {
    seq += 1;
    return `fin-margin-${Date.now()}-${seq}`;
  }

  /** A DELIVERED order with one product-linked item and a matching OrderEconomics row, written directly — this suite tests the aggregation, not OrderEconomicsService's own computation (that's order-economics.service.spec.ts's job). */
  async function makeDeliveredSale(input: {
    unitPrice: number;
    unitCost: number;
    quantity: number;
    computedAt?: Date;
    revenueOverride?: number;
  }) {
    const category = await prisma.category.findFirstOrThrow({ select: { id: true } });
    const slug = tag();
    const product = await prisma.product.create({
      data: {
        slug,
        kind: 'GOODS',
        status: 'ACTIVE',
        categoryId: category.id,
        basePrice: input.unitPrice,
        translations: { create: [{ locale: 'en', name: `Margin test ${slug}` }] },
      },
    });

    const lineTotal = input.unitPrice * input.quantity;
    const order = await prisma.order.create({
      data: {
        number: tag(),
        status: 'DELIVERED',
        shippingAddress: {},
        itemsSubtotal: lineTotal,
        grandTotal: lineTotal,
        items: {
          create: [
            {
              productId: product.id,
              kind: 'GOODS',
              nameEn: `Margin test ${slug}`,
              unitPrice: input.unitPrice,
              unitCost: input.unitCost,
              quantity: input.quantity,
              lineTotal,
            },
          ],
        },
      },
    });

    const revenue = input.revenueOverride ?? lineTotal;
    const cogs = input.unitCost * input.quantity;
    await prisma.orderEconomics.create({
      data: {
        orderId: order.id,
        revenue,
        shippingIncome: 0,
        codFeeIncome: 0,
        cogs,
        shippingCost: 0,
        gatewayFee: 0,
        packagingCost: 0,
        contribution: revenue - cogs,
        computedAt: input.computedAt ?? new Date(),
      },
    });

    return { product, order };
  }

  describe('marginBy', () => {
    it('computes revenue, COGS and margin percent for a product', async () => {
      const { product } = await makeDeliveredSale({ unitPrice: 1000, unitCost: 600, quantity: 2 });

      const result = await service.marginBy('product', {});
      const row = result.rows.find((r) => r.key === product.id);

      expect(row).toBeDefined();
      expect(row!.revenue).toBe(2000);
      expect(row!.cogs).toBe(1200);
      expect(row!.marginAmount).toBe(800);
      expect(row!.marginPercent).toBe(40);
    });

    it('excludes a returned order (zero-revenue OrderEconomics) from the breakdown entirely', async () => {
      const { product } = await makeDeliveredSale({
        unitPrice: 1000,
        unitCost: 600,
        quantity: 1,
        revenueOverride: 0,
      });

      const result = await service.marginBy('product', {});
      expect(result.rows.find((r) => r.key === product.id)).toBeUndefined();
    });

    it('groups by category when asked', async () => {
      const { product } = await makeDeliveredSale({ unitPrice: 500, unitCost: 200, quantity: 1 });

      const result = await service.marginBy('category', {});
      const row = result.rows.find((r) => r.key === product.categoryId);
      expect(row).toBeDefined();
      expect(row!.revenue).toBeGreaterThanOrEqual(500);
    });
  });

  describe('unitEconomics', () => {
    it('paginates orders and averages contribution across them', async () => {
      await makeDeliveredSale({ unitPrice: 1000, unitCost: 700, quantity: 1 }); // contribution 300
      await makeDeliveredSale({ unitPrice: 2000, unitCost: 1500, quantity: 1 }); // contribution 500

      const result = await service.unitEconomics({ page: 1, pageSize: 25 });

      expect(result.averages.orderCount).toBeGreaterThanOrEqual(2);
      expect(result.data.length).toBeGreaterThanOrEqual(2);
      const numbers = result.data.map((row) => row.orderNumber);
      expect(new Set(numbers).size).toBe(result.data.length);
    });
  });
});
