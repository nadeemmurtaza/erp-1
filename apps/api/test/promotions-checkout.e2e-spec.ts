import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { toMinor } from '@newax/shared';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { setVariantStock } from './support/stock';

/**
 * Phase 5 (docs/implementation/05-promotions-giftcards.md) checkout
 * integration — discounts, promo codes, gift cards and store credit applied
 * against a REAL checkout, not a mocked OrdersService. The exit criteria this
 * proves: #2 (a usageLimit:1 code redeemed by two simultaneous checkouts
 * succeeds exactly once) and #3 (a gift card cannot be over-redeemed under
 * concurrency) both need a real database transaction to actually race.
 */
describe('Promotions & gift cards at checkout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let customerToken: string;
  let customerId: string;
  let readyVariantId: string;
  let readyUnitPrice: number;

  const createdOrderIds: string[] = [];
  const createdDiscountIds: string[] = [];
  const createdGiftCardIds: string[] = [];
  const createdVariantIds: string[] = [];

  const KARACHI = {
    fullName: 'Ayesha Khan',
    phone: '03001234567',
    line1: 'House 12, Street 5',
    city: 'Karachi',
    province: 'Sindh',
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);

    adminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'admin@yaseen.pk', password: 'admin12345' })
    ).body.accessToken;

    const customerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'ayesha@example.com', password: 'customer12345' });
    customerToken = customerLogin.body.accessToken;
    const customer = await prisma.user.findUniqueOrThrow({ where: { email: 'ayesha@example.com' } });
    customerId = customer.id;

    // A dedicated variant, never the shared seed catalogue — this suite runs
    // alongside every other e2e file against the same database (jest.config.js's
    // own note on why they run one at a time), and a handful of concurrency
    // tests below each consume real stock. Reusing a seeded product risks
    // exactly the flaky "sold out" 400 orders.e2e-spec.ts's own freshVariant()
    // helper exists to avoid.
    const product = await prisma.product.findFirstOrThrow({ where: { status: 'ACTIVE' }, select: { id: true, basePrice: true } });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, sku: `WO5-TEST-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
    createdVariantIds.push(variant.id);
    readyVariantId = variant.id;
    readyUnitPrice = product.basePrice;
    await setVariantStock(prisma, readyVariantId, 500);
  });

  afterAll(async () => {
    for (const id of createdOrderIds) {
      const order = await prisma.order.findUnique({ where: { id } });
      if (order) await prisma.order.delete({ where: { id } });
    }
    await prisma.giftCard.deleteMany({ where: { id: { in: createdGiftCardIds } } });
    await prisma.discount.deleteMany({ where: { id: { in: createdDiscountIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  async function cartWithReadyItem(token?: string, quantity = 1) {
    const agent = request.agent(app.getHttpServer());
    const req = agent.post('/api/v1/cart/items');
    if (token) req.set('Authorization', `Bearer ${token}`);
    await req.send({ variantId: readyVariantId, quantity }).expect(201);
    return { agent, auth: (r: request.Test) => (token ? r.set('Authorization', `Bearer ${token}`) : r) };
  }

  describe('automatic discounts', () => {
    it('applies an active PERCENTAGE ORDER discount without a code', async () => {
      const discount = await api()
        .post('/api/v1/admin/promotions/discounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '10% off everything', type: 'PERCENTAGE', scope: 'ORDER', value: 1000, isActive: true })
        .expect(201);
      createdDiscountIds.push(discount.body.id);

      const { agent } = await cartWithReadyItem();
      const response = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod' })
        .expect(201);
      createdOrderIds.push(response.body.id);

      const expectedDiscount = Math.round((readyUnitPrice * 1000) / 10_000);
      expect(response.body.orderDiscount).toBe(expectedDiscount);

      const rows = await prisma.orderDiscount.findMany({ where: { orderId: response.body.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.amount).toBe(expectedDiscount);

      await api()
        .patch(`/api/v1/admin/promotions/discounts/${discount.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);
    });
  });

  describe('promo codes', () => {
    let discountId: string;

    beforeAll(async () => {
      const discount = await api()
        .post('/api/v1/admin/promotions/discounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Coded fixed discount', type: 'FIXED_AMOUNT', scope: 'ORDER', value: toMinor(200), isActive: true })
        .expect(201);
      discountId = discount.body.id;
      createdDiscountIds.push(discountId);
    });

    it('rejects an unknown code', async () => {
      const { agent } = await cartWithReadyItem();
      const response = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod', promoCode: 'NOT-A-REAL-CODE' })
        .expect(400);
      expect(String(response.body.message)).toMatch(/not valid/i);
    });

    it('applies a valid code and increments its usage count exactly once', async () => {
      const code = await api()
        .post('/api/v1/admin/promotions/promo-codes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ discountId, code: `SAVE200-${Date.now()}` })
        .expect(201);

      const { agent } = await cartWithReadyItem();
      const response = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod', promoCode: code.body.code })
        .expect(201);
      createdOrderIds.push(response.body.id);

      expect(response.body.orderDiscount).toBe(toMinor(200));

      const updated = await prisma.promoCode.findUniqueOrThrow({ where: { id: code.body.id } });
      expect(updated.usageCount).toBe(1);
    });

    it('a usageLimit:1 code redeemed by two simultaneous checkouts succeeds exactly once (exit criterion #2)', async () => {
      const code = await api()
        .post('/api/v1/admin/promotions/promo-codes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ discountId, code: `RACE-${Date.now()}`, usageLimit: 1 })
        .expect(201);

      const cart1 = await cartWithReadyItem();
      const cart2 = await cartWithReadyItem();

      const responses = await Promise.all([
        cart1.agent.post('/api/v1/orders').send({ shippingAddress: KARACHI, paymentMethod: 'cod', promoCode: code.body.code }),
        cart2.agent.post('/api/v1/orders').send({ shippingAddress: KARACHI, paymentMethod: 'cod', promoCode: code.body.code }),
      ]);

      for (const res of responses) {
        if (res.status === 201) createdOrderIds.push(res.body.id);
      }

      const statuses = responses.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 400]);

      const updated = await prisma.promoCode.findUniqueOrThrow({ where: { id: code.body.id } });
      expect(updated.usageCount).toBe(1);

      const discountRows = await prisma.orderDiscount.count({ where: { promoCodeId: code.body.id } });
      expect(discountRows).toBe(1);
    });
  });

  describe('gift cards', () => {
    it('applies as tender, reducing the amount charged to the chosen payment method', async () => {
      const giftCard = await api()
        .post('/api/v1/admin/gift-cards')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ initialValue: toMinor(1000) })
        .expect(201);
      createdGiftCardIds.push(giftCard.body.id);

      const { agent } = await cartWithReadyItem();
      const response = await agent
        .post('/api/v1/orders')
        .send({
          shippingAddress: KARACHI,
          paymentMethod: 'cod',
          giftCardCode: giftCard.body.code,
          giftCardAmount: toMinor(500),
        })
        .expect(201);
      createdOrderIds.push(response.body.id);

      const payments = await prisma.payment.findMany({ where: { orderId: response.body.id } });
      const giftCardPayment = payments.find((p) => p.provider === 'gift_card');
      expect(giftCardPayment?.amount).toBe(toMinor(500));
      expect(giftCardPayment?.status).toBe('PAID');

      const codPayment = payments.find((p) => p.provider === 'cod');
      expect(codPayment?.amount).toBe(response.body.grandTotal - toMinor(500));

      const updatedCard = await prisma.giftCard.findUniqueOrThrow({ where: { id: giftCard.body.id } });
      expect(updatedCard.balance).toBe(toMinor(500));
    });

    it('cannot be over-redeemed under concurrency (exit criterion #3)', async () => {
      const giftCard = await api()
        .post('/api/v1/admin/gift-cards')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ initialValue: toMinor(300) })
        .expect(201);
      createdGiftCardIds.push(giftCard.body.id);

      // Two orders each try to spend Rs 300 of a Rs 300 card at once — only
      // one can possibly succeed with the full amount.
      const cart1 = await cartWithReadyItem();
      const cart2 = await cartWithReadyItem();

      const responses = await Promise.all([
        cart1.agent.post('/api/v1/orders').send({
          shippingAddress: KARACHI,
          paymentMethod: 'cod',
          giftCardCode: giftCard.body.code,
          giftCardAmount: toMinor(300),
        }),
        cart2.agent.post('/api/v1/orders').send({
          shippingAddress: KARACHI,
          paymentMethod: 'cod',
          giftCardCode: giftCard.body.code,
          giftCardAmount: toMinor(300),
        }),
      ]);

      for (const res of responses) {
        if (res.status === 201) createdOrderIds.push(res.body.id);
      }

      const statuses = responses.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 400]);

      const updatedCard = await prisma.giftCard.findUniqueOrThrow({ where: { id: giftCard.body.id } });
      expect(updatedCard.balance).toBe(0);

      // The ledger replays to the balance — WO-5's exit criterion #3, second half.
      const ledgerSum = await prisma.giftCardTransaction.aggregate({
        where: { giftCardId: giftCard.body.id },
        _sum: { delta: true },
      });
      expect(ledgerSum._sum.delta).toBe(0);
    });
  });

  describe('store credit', () => {
    it('applies as tender for a signed-in customer, reducing the amount charged to the chosen payment method', async () => {
      // ayesha@example.com is a shared seed customer other e2e suites also
      // use — read the balance before issuing rather than assuming it
      // starts at zero, so this assertion holds regardless of run history.
      const before = await prisma.user.findUniqueOrThrow({ where: { id: customerId }, select: { storeCreditBalance: true } });

      await api()
        .post(`/api/v1/admin/customers/${customerId}/store-credit`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ amount: toMinor(400), reason: 'goodwill', note: 'e2e fixture' })
        .expect(201);

      // ayesha@example.com's cart may carry leftovers from another e2e
      // suite sharing this database — start clean so this test's totals are
      // exactly one ready item, not whatever else was left behind.
      await api().delete('/api/v1/cart').set('Authorization', `Bearer ${customerToken}`).expect(200);
      const { agent, auth } = await cartWithReadyItem(customerToken);
      const response = await auth(agent.post('/api/v1/orders'))
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod', storeCreditAmount: toMinor(400) })
        .expect(201);
      createdOrderIds.push(response.body.id);

      const payments = await prisma.payment.findMany({ where: { orderId: response.body.id } });
      const storeCreditPayment = payments.find((p) => p.provider === 'store_credit');
      expect(storeCreditPayment?.amount).toBe(toMinor(400));

      const after = await prisma.user.findUniqueOrThrow({ where: { id: customerId }, select: { storeCreditBalance: true } });
      expect(after.storeCreditBalance).toBe(before.storeCreditBalance);
    });

    it('is refused for a guest checkout', async () => {
      const { agent } = await cartWithReadyItem();
      const response = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod', storeCreditAmount: toMinor(100) })
        .expect(400);
      expect(String(response.body.message)).toMatch(/sign in/i);
    });
  });
});
