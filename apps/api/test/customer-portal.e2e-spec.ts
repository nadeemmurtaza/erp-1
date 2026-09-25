import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { OutboxDispatcher } from '../src/core/events/outbox.dispatcher';
import { setVariantStock } from './support/stock';

/**
 * Phase 7 (docs/implementation/customer-portal-loyalty/07-customer-portal.md)
 * — the pieces with a real correctness story to prove against a live
 * database, not asserted by convention: a review's "Verified purchase" flag
 * only sets on an order that was actually delivered; loyalty points credit
 * exactly once per order and reverse when the order is returned (exit
 * criterion #5, structural: earning only ever fires on DELIVERED); a
 * back-in-stock alert deletes itself once sent; a return request refuses a
 * quantity that exceeds what was bought.
 */
describe('Customer portal (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let outbox: OutboxDispatcher;
  let adminToken: string;
  let customerToken: string;
  let customerId: string;
  let readyVariantId: string;

  const createdOrderIds: string[] = [];
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
    outbox = app.get(OutboxDispatcher);

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

    const product = await prisma.product.findFirstOrThrow({ where: { status: 'ACTIVE' }, select: { id: true } });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, sku: `PORTAL-TEST-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
    createdVariantIds.push(variant.id);
    readyVariantId = variant.id;
    await setVariantStock(prisma, readyVariantId, 10);
  });

  afterAll(async () => {
    await prisma.returnRequestLine.deleteMany({ where: { returnRequest: { orderId: { in: createdOrderIds } } } });
    await prisma.returnRequest.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await prisma.loyaltyTransaction.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await prisma.review.deleteMany({ where: { orderItem: { orderId: { in: createdOrderIds } } } }).catch(() => undefined);
    for (const id of createdOrderIds) {
      await prisma.order.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  async function placeAndDeliverOrder(): Promise<{ id: string; number: string }> {
    const agent = request.agent(app.getHttpServer());
    agent.set('Authorization', `Bearer ${customerToken}`);
    await agent.post('/api/v1/cart/items').send({ variantId: readyVariantId, quantity: 1 }).expect(201);
    const placed = await agent.post('/api/v1/orders').send({ shippingAddress: KARACHI, paymentMethod: 'cod' }).expect(201);
    createdOrderIds.push(placed.body.id);

    for (const status of ['CONFIRMED', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED']) {
      await api()
        .post(`/api/v1/admin/orders/${placed.body.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(201);
    }
    // The loyalty listener runs off the outbox, not inline with the request.
    await outbox.processBatch();
    return { id: placed.body.id, number: placed.body.number };
  }

  describe('reviews', () => {
    it('refuses a review with no delivered purchase, verified_purchase_only default on', async () => {
      const response = await api()
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: (await prisma.product.findFirstOrThrow({ where: { status: 'ACTIVE' } })).id, rating: 5 });

      expect(response.status).toBe(403);
    });

    it('accepts a review after delivery and marks it verified purchase', async () => {
      const order = await placeAndDeliverOrder();
      const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });

      const response = await api()
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: orderItem.productId, rating: 5, title: 'Great fit' })
        .expect(201);

      expect(response.body.orderItemId).toBe(orderItem.id);
      expect(response.body.status).toBe('PENDING');

      await prisma.review.delete({ where: { id: response.body.id } });
    });
  });

  describe('returns', () => {
    it('is not eligible before delivery, eligible after', async () => {
      const agent = request.agent(app.getHttpServer());
      agent.set('Authorization', `Bearer ${customerToken}`);
      await agent.post('/api/v1/cart/items').send({ variantId: readyVariantId, quantity: 1 }).expect(201);
      const placed = await agent.post('/api/v1/orders').send({ shippingAddress: KARACHI, paymentMethod: 'cod' }).expect(201);
      createdOrderIds.push(placed.body.id);

      const before = await api()
        .get(`/api/v1/returns/eligibility/${placed.body.number}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(before.body.eligible).toBe(false);

      for (const status of ['CONFIRMED', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED']) {
        await api()
          .post(`/api/v1/admin/orders/${placed.body.id}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status })
          .expect(201);
      }

      const after = await api()
        .get(`/api/v1/returns/eligibility/${placed.body.number}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(after.body.eligible).toBe(true);
    });

    it('refuses a return quantity exceeding what was purchased, and end-to-end approves a valid one', async () => {
      const order = await placeAndDeliverOrder();
      const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });

      await api()
        .post('/api/v1/returns')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ orderNumber: order.number, lines: [{ orderItemId: orderItem.id, quantity: orderItem.quantity + 1 }], reasonCode: 'DEFECTIVE' })
        .expect(400);

      const created = await api()
        .post('/api/v1/returns')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ orderNumber: order.number, lines: [{ orderItemId: orderItem.id, quantity: orderItem.quantity }], reasonCode: 'DEFECTIVE' })
        .expect(201);
      expect(created.body.status).toBe('REQUESTED');

      const decided = await api()
        .patch(`/api/v1/admin/returns/${created.body.id}/decide`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'APPROVED', decisionNote: 'Confirmed defective, refund issued.' })
        .expect(200);
      expect(decided.body.status).toBe('APPROVED');

      // A customer completes this without contacting the shop — status is
      // visible on their own return list the whole time (exit criterion #1).
      const mine = await api().get('/api/v1/returns').set('Authorization', `Bearer ${customerToken}`).expect(200);
      expect(mine.body.find((r: { id: string }) => r.id === created.body.id).status).toBe('APPROVED');
    });
  });

  describe('loyalty', () => {
    it('credits points once on DELIVERED and reverses them on RETURNED', async () => {
      const order = await placeAndDeliverOrder();

      const earned = await prisma.loyaltyTransaction.findUnique({
        where: { orderId_type: { orderId: order.id, type: 'EARNED' } },
      });
      expect(earned).not.toBeNull();
      expect(earned!.points).toBeGreaterThan(0);

      const balanceAfterEarn = await prisma.user.findUniqueOrThrow({ where: { id: customerId } });

      await api()
        .post(`/api/v1/admin/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'RETURNED' })
        .expect(201);
      await outbox.processBatch();

      const reversed = await prisma.loyaltyTransaction.findUnique({
        where: { orderId_type: { orderId: order.id, type: 'REVERSED' } },
      });
      expect(reversed).not.toBeNull();
      expect(reversed!.points).toBe(-earned!.points);

      const balanceAfterReturn = await prisma.user.findUniqueOrThrow({ where: { id: customerId } });
      expect(balanceAfterReturn.loyaltyPoints).toBe(balanceAfterEarn.loyaltyPoints - earned!.points);
    });

    it('redeems points into store credit, reusing the Phase 5 ledger', async () => {
      await prisma.loyaltyTransaction.create({
        data: { userId: customerId, type: 'ADJUSTED', points: 100, note: 'test grant' },
      });
      await prisma.user.update({ where: { id: customerId }, data: { loyaltyPoints: { increment: 100 } } });

      const before = await prisma.user.findUniqueOrThrow({ where: { id: customerId } });

      const response = await api()
        .post('/api/v1/loyalty/redeem')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ points: 100 })
        .expect(201);

      expect(response.body.storeCreditAdded).toBeGreaterThan(0);

      const after = await prisma.user.findUniqueOrThrow({ where: { id: customerId } });
      expect(after.loyaltyPoints).toBe(before.loyaltyPoints - 100);
      expect(after.storeCreditBalance).toBe(before.storeCreditBalance + response.body.storeCreditAdded);
    });
  });

  describe('wishlist and back-in-stock', () => {
    it('migrate() is idempotent — a second call with the same ids adds nothing new', async () => {
      const product = await prisma.product.findFirstOrThrow({ where: { status: 'ACTIVE' }, select: { id: true } });

      const first = await api()
        .post('/api/v1/wishlist/migrate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productIds: [product.id] })
        .expect(201);
      expect(first.body.migrated).toBe(1);

      const second = await api()
        .post('/api/v1/wishlist/migrate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productIds: [product.id] })
        .expect(201);
      expect(second.body.migrated).toBe(0);

      await prisma.wishlistItem.deleteMany({ where: { userId: customerId, productId: product.id } });
    });

    it('a back-in-stock alert fires exactly once and deletes the request', async () => {
      const variant = await prisma.productVariant.create({
        data: { productId: (await prisma.product.findFirstOrThrow({ where: { status: 'ACTIVE' } })).id, sku: `BIS-TEST-${Date.now()}` },
      });
      createdVariantIds.push(variant.id);
      await setVariantStock(prisma, variant.id, 0);

      await api()
        .post('/api/v1/back-in-stock')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ variantId: variant.id })
        .expect(201);

      const requestedBefore = await prisma.backInStockRequest.findUnique({
        where: { userId_variantId: { userId: customerId, variantId: variant.id } },
      });
      expect(requestedBefore).not.toBeNull();

      await api()
        .post(`/api/v1/admin/inventory/${variant.id}/adjust`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ delta: 5, reason: 'restock' })
        .expect(201);
      // BackInStockListener runs off the outbox, not inline with the request.
      await outbox.processBatch();

      const requestedAfter = await prisma.backInStockRequest.findUnique({
        where: { userId_variantId: { userId: customerId, variantId: variant.id } },
      });
      expect(requestedAfter).toBeNull();
    });
  });
});
