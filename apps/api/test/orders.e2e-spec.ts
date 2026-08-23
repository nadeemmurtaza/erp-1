import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { toMinor } from '@yaseen/shared';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';

/**
 * Checkout: the transaction that takes stock, takes money and creates a
 * commitment to a customer. Every assertion here is about something that would
 * cost the shop real money if it were wrong.
 */
describe('Orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

  let readyVariantId: string;
  let unstitchedVariantId: string;
  let kameezGarmentId: string;
  let kameezServiceId: string;
  let kameezProfileId: string;
  let necklineOptionId: string;
  let sleeveOptionId: string;
  let finishGroupId: string;
  const createdOrderIds: string[] = [];
  let seededStock = 0;
  let seededStitchingPrice = 0;
  let seededFinishAllowsText = false;

  const KARACHI = {
    fullName: 'Ayesha Khan',
    phone: '03001234567',
    line1: 'House 12, Street 5',
    city: 'Karachi',
    province: 'Sindh',
  };

  /** The garment's own fee, charged when no service product is picked. */
  const GARMENT_STITCHING_FEE = toMinor(900);

  /** A complete, in-range kameez set — what a guest types into the panel. */
  const KAMEEZ_MEASUREMENTS = {
    length: 41,
    chest: 37,
    waist: 33,
    hips: 39,
    shoulder: 14.5,
    sleeve_length: 21,
    sleeve_opening: 9.5,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);

    adminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'admin@yaseen.pk', password: 'admin12345' })
    ).body.accessToken;

    readyVariantId = (
      await prisma.product.findFirstOrThrow({
        where: { slug: 'ready-kurta-white-cotton' },
        include: { variants: { orderBy: { order: 'asc' } } },
      })
    ).variants[0]!.id;

    unstitchedVariantId = (
      await prisma.product.findFirstOrThrow({
        where: { slug: 'embroidered-lawn-3-piece-ferozi' },
        include: { variants: true },
      })
    ).variants[0]!.id;

    kameezServiceId = (
      await prisma.product.findFirstOrThrow({ where: { slug: 'stitching-kameez-standard' } })
    ).id;

    const kameez = await prisma.garmentType.findUniqueOrThrow({ where: { key: 'kameez' } });
    kameezGarmentId = kameez.id;

    // Pinned rather than read from the seed, which promises no figure — the
    // fallback assertions below are about exact money. Put back in afterAll.
    seededStitchingPrice = kameez.stitchingPrice;
    await prisma.garmentType.update({
      where: { id: kameez.id },
      data: { stitchingPrice: GARMENT_STITCHING_FEE, stitchingEnabled: true },
    });

    kameezProfileId = (
      await prisma.measurementProfile.findFirstOrThrow({
        where: {
          garmentTypeId: kameez.id,
          label: 'Self',
          user: { email: 'ayesha@example.com' },
        },
      })
    ).id;

    necklineOptionId = (
      await prisma.stitchingOption.findFirstOrThrow({
        where: { key: 'round', group: { key: 'neckline' } },
      })
    ).id;

    const finishGroup = await prisma.stitchingOptionGroup.findUniqueOrThrow({
      where: { key: 'kameez_finish' },
    });
    finishGroupId = finishGroup.id;
    seededFinishAllowsText = finishGroup.allowCustomText;
    await prisma.stitchingOptionGroup.update({
      where: { id: finishGroup.id },
      data: { allowCustomText: true },
    });

    // This suite places a dozen orders. Stock levels are not what it is testing,
    // so give it plenty and restore the seeded figure afterwards.
    seededStock = (
      await prisma.productVariant.findUniqueOrThrow({ where: { id: readyVariantId } })
    ).stock;
    await prisma.productVariant.update({
      where: { id: readyVariantId },
      data: { stock: 500 },
    });
    sleeveOptionId = (
      await prisma.stitchingOption.findFirstOrThrow({
        where: { key: 'plain', group: { key: 'sleeve_style' } },
      })
    ).id;
  });

  afterAll(async () => {
    for (const id of createdOrderIds) {
      const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
      if (!order) continue;

      // Release stock the unstitched fabric took; the ready variant is reset
      // wholesale below.
      for (const item of order.items) {
        if (item.variantId && item.variantId !== readyVariantId) {
          await prisma.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }
      await prisma.order.delete({ where: { id } });
    }

    await prisma.productVariant.update({
      where: { id: readyVariantId },
      data: { stock: seededStock },
    });
    await prisma.garmentType.update({
      where: { id: kameezGarmentId },
      data: { stitchingPrice: seededStitchingPrice },
    });
    await prisma.stitchingOptionGroup.update({
      where: { id: finishGroupId },
      data: { allowCustomText: seededFinishAllowsText },
    });
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  /** A guest agent with one ready-made item already in its cart. */
  async function cartWithReadyItem(quantity = 1) {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/cart/items')
      .send({ variantId: readyVariantId, quantity })
      .expect(201);
    return agent;
  }

  describe('payment methods', () => {
    it('offers only the providers on the allowlist', async () => {
      const response = await api().get('/api/v1/payments/methods').expect(200);
      const keys = response.body.map((method: { key: string }) => method.key);

      expect(keys).toEqual(expect.arrayContaining(['cod', 'bank_transfer']));
      // Written but dark until merchant credentials exist.
      expect(keys).not.toContain('jazzcash');
      expect(keys).not.toContain('easypaisa');
    });

    it('reports the COD collection fee', async () => {
      const response = await api().get('/api/v1/payments/methods').expect(200);
      const cod = response.body.find((method: { key: string }) => method.key === 'cod');
      expect(cod.fee).toBe(toMinor(100));
    });
  });

  describe('placing an order', () => {
    it('prices goods, shipping and the COD fee from the server', async () => {
      const agent = await cartWithReadyItem(2);

      const response = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod', email: 'ayesha@example.com' })
        .expect(201);

      createdOrderIds.push(response.body.id);

      const goods = toMinor(2999) * 2;
      expect(response.body.itemsSubtotal).toBe(goods);
      // Karachi zone: Rs 150, free above Rs 3,000 — this order clears it.
      expect(response.body.shippingFee).toBe(0);
      expect(response.body.codFee).toBe(toMinor(100));
      expect(response.body.grandTotal).toBe(goods + toMinor(100));
      expect(response.body.number).toMatch(/^YSN-\d{4}-\d{4}$/);
    });

    it('charges the zone shipping fee below the free threshold', async () => {
      // A single kurta is Rs 2,999, under Karachi's Rs 3,000 free-shipping bar.
      const agent = await cartWithReadyItem(1);

      const response = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod' })
        .expect(201);

      createdOrderIds.push(response.body.id);
      expect(response.body.shippingFee).toBe(toMinor(150));
    });

    it('uses the right zone for another city', async () => {
      const agent = await cartWithReadyItem(1);

      const response = await agent
        .post('/api/v1/orders')
        .send({
          shippingAddress: { ...KARACHI, city: 'Lahore', province: 'Punjab' },
          paymentMethod: 'cod',
        })
        .expect(201);

      createdOrderIds.push(response.body.id);
      expect(response.body.shippingZone).toBe('punjab');
      expect(response.body.shippingFee).toBe(toMinor(200));
    });

    it('falls back to the catch-all zone for an unknown city', async () => {
      const agent = await cartWithReadyItem(1);

      const response = await agent
        .post('/api/v1/orders')
        .send({
          shippingAddress: { ...KARACHI, city: 'Chitral', province: 'KPK' },
          paymentMethod: 'cod',
        })
        .expect(201);

      createdOrderIds.push(response.body.id);
      expect(response.body.shippingZone).toBe('rest_of_pakistan');
    });

    it('decrements stock by exactly what was ordered', async () => {
      const before = await prisma.productVariant.findUniqueOrThrow({
        where: { id: readyVariantId },
      });

      const agent = await cartWithReadyItem(2);
      const response = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod' })
        .expect(201);
      createdOrderIds.push(response.body.id);

      const after = await prisma.productVariant.findUniqueOrThrow({
        where: { id: readyVariantId },
      });
      expect(after.stock).toBe(before.stock - 2);
    });

    it('empties the cart once the order is placed', async () => {
      const agent = await cartWithReadyItem(1);
      const response = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod' })
        .expect(201);
      createdOrderIds.push(response.body.id);

      const cart = await agent.get('/api/v1/cart').expect(200);
      expect(cart.body.items).toHaveLength(0);
    });

    it('queues order.placed for the CRM and tailor queue to pick up', async () => {
      const agent = await cartWithReadyItem(1);
      const response = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod' })
        .expect(201);
      createdOrderIds.push(response.body.id);

      const events = await prisma.outboxEvent.findMany({ where: { name: 'order.placed' } });
      const forThisOrder = events.filter(
        (event) => (event.payload as { orderId?: string }).orderId === response.body.id,
      );
      expect(forThisOrder).toHaveLength(1);
    });

    it('snapshots the line so a later price change cannot rewrite history', async () => {
      const agent = await cartWithReadyItem(1);
      const response = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod' })
        .expect(201);
      createdOrderIds.push(response.body.id);

      const item = response.body.items[0];
      expect(item.nameEn).toBe('Ready-to-Wear Cotton Kurta — White');
      expect(item.unitPrice).toBe(toMinor(2999));
      expect(item.sku).toEqual(expect.any(String));
    });

    it('normalises the phone number to E.164', async () => {
      const agent = await cartWithReadyItem(1);
      const response = await agent
        .post('/api/v1/orders')
        .send({
          shippingAddress: { ...KARACHI, phone: '0300 123 4567' },
          paymentMethod: 'cod',
        })
        .expect(201);
      createdOrderIds.push(response.body.id);

      expect(response.body.guestPhone).toBe('+923001234567');
    });

    it('rejects an invalid phone number', async () => {
      const agent = await cartWithReadyItem(1);
      const response = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: { ...KARACHI, phone: '12345' }, paymentMethod: 'cod' })
        .expect(400);

      expect(String(response.body.message)).toMatch(/valid Pakistani phone/i);
    });

    it('rejects an empty cart', async () => {
      await api()
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod' })
        .expect(400);
    });

    it('rejects a payment method that is not enabled', async () => {
      const agent = await cartWithReadyItem(1);
      const response = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'jazzcash' })
        .expect(400);

      expect(String(response.body.message)).toMatch(/not an available payment method/i);
    });

    it('takes no stock when the order is rejected', async () => {
      const before = await prisma.productVariant.findUniqueOrThrow({
        where: { id: readyVariantId },
      });

      const agent = await cartWithReadyItem(1);
      await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: { ...KARACHI, phone: 'nonsense' }, paymentMethod: 'cod' })
        .expect(400);

      const after = await prisma.productVariant.findUniqueOrThrow({
        where: { id: readyVariantId },
      });
      expect(after.stock).toBe(before.stock);
    });
  });

  describe('stitched orders', () => {
    it('carries the measurements and style onto the order line', async () => {
      const customer = (
        await api()
          .post('/api/v1/auth/login')
          .send({ identifier: 'ayesha@example.com', password: 'customer12345' })
      ).body.accessToken;

      await api().delete('/api/v1/cart').set('Authorization', `Bearer ${customer}`).expect(200);

      await api()
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customer}`)
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            stitchingServiceId: kameezServiceId,
            measurementProfileId: kameezProfileId,
            optionIds: [necklineOptionId, sleeveOptionId],
          },
        })
        .expect(201);

      const response = await api()
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer}`)
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod' })
        .expect(201);

      createdOrderIds.push(response.body.id);

      const item = response.body.items[0];
      expect(item.stitchingServiceName).toContain('Kameez Stitching');
      expect(item.garmentTypeKey).toBe('kameez');
      expect(item.measurementSnapshot.values.chest).toBe(38);
      expect(item.optionsSnapshot).toHaveLength(2);
      // A premium make-up was chosen, so its price beats the garment's own.
      expect(item.stitchingFeeUnit).toBe(toMinor(1200));
      // The numbers came from a profile, so there is nothing typed in to keep.
      expect(item.measurementValues).toBeNull();

      // The event names the stitched line, so the tailor queue can pick it up.
      const event = await prisma.outboxEvent.findFirst({
        where: { name: 'order.placed' },
        orderBy: { createdAt: 'desc' },
      });
      expect(
        (event!.payload as { stitchingItemIds: string[] }).stitchingItemIds,
      ).toHaveLength(1);
    });

    it('checks out a guest line measured in the panel, priced from the garment', async () => {
      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/api/v1/cart/items')
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            garmentTypeId: kameezGarmentId,
            measurementValues: KAMEEZ_MEASUREMENTS,
            optionIds: [necklineOptionId, sleeveOptionId],
            customDesignText: { kameez_finish: 'Contrast piping in maroon' },
            sizeToken: 'M',
          },
        })
        .expect(201);

      const response = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod' })
        .expect(201);

      createdOrderIds.push(response.body.id);

      const item = response.body.items[0];
      expect(item.stitchingServiceId).toBeNull();
      expect(item.garmentTypeKey).toBe('kameez');
      expect(item.stitchingFeeUnit).toBe(GARMENT_STITCHING_FEE);
      expect(response.body.stitchingSubtotal).toBe(GARMENT_STITCHING_FEE);

      // Kept as the customer typed it, so a dispute is settled against their
      // own entry rather than the resolved set.
      expect(item.measurementValues.chest).toBe(37);
      // And resolved into the shape the workshop reads, profile or not.
      expect(item.measurementSnapshot.label).toBeNull();
      expect(item.measurementSnapshot.garmentTypeKey).toBe('kameez');
      expect(item.measurementSnapshot.values.chest).toBe(37);

      // A described area rides along with the chosen options, so the tailor's
      // worksheet shows it without learning a second shape.
      expect(item.customDesignText).toEqual({
        kameez_finish: 'Contrast piping in maroon',
      });
      // Carried over from the cart line for traceability — it never touched pricing.
      expect(item.sizeToken).toBe('M');
      const described = item.optionsSnapshot.find(
        (option: { custom: boolean }) => option.custom,
      );
      expect(described.groupKey).toBe('kameez_finish');
      expect(described.groupLabelEn).toBe('Finishing');
      expect(described.labelEn).toBe('Contrast piping in maroon');
      expect(described.priceDelta).toBe(0);

      // Still a stitched line, so the tailor queue is still told about it.
      const event = await prisma.outboxEvent.findFirst({
        where: { name: 'order.placed' },
        orderBy: { createdAt: 'desc' },
      });
      expect(
        (event!.payload as { stitchingItemIds: string[] }).stitchingItemIds,
      ).toHaveLength(1);
    });

    it('refuses to check out a stitched line whose measurements went missing', async () => {
      // The cart takes measurements when the line is added, so the only way one
      // reaches checkout unmeasured is a saved profile deleted afterwards —
      // onDelete: SetNull leaves the line pointing at nothing.
      const ayesha = await prisma.user.findUniqueOrThrow({
        where: { email: 'ayesha@example.com' },
      });
      const customer = (
        await api()
          .post('/api/v1/auth/login')
          .send({ identifier: 'ayesha@example.com', password: 'customer12345' })
      ).body.accessToken;

      await api().delete('/api/v1/cart').set('Authorization', `Bearer ${customer}`).expect(200);

      const spare = await prisma.measurementProfile.create({
        data: {
          userId: ayesha.id,
          garmentTypeId: kameezGarmentId,
          label: `Spare ${Date.now()}`,
          values: KAMEEZ_MEASUREMENTS,
        },
      });

      await api()
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customer}`)
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            garmentTypeId: kameezGarmentId,
            measurementProfileId: spare.id,
            optionIds: [necklineOptionId, sleeveOptionId],
          },
        })
        .expect(201);

      await prisma.measurementProfile.delete({ where: { id: spare.id } });

      const response = await api()
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer}`)
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod' })
        .expect(400);

      expect(String(response.body.message)).toMatch(/Add measurements/i);

      await api().delete('/api/v1/cart').set('Authorization', `Bearer ${customer}`).expect(200);
    });
  });

  describe('bank transfer', () => {
    it('leaves the payment awaiting approval until staff confirm it', async () => {
      const agent = await cartWithReadyItem(1);
      const order = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'bank_transfer' })
        .expect(201);
      createdOrderIds.push(order.body.id);

      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.body.id },
      });
      expect(payment.status).toBe('AWAITING_APPROVAL');
      expect(payment.provider).toBe('bank_transfer');
      // The customer is shown where to send the money.
      expect((payment.meta as { accounts?: unknown[] }).accounts).toBeTruthy();

      const queue = await api()
        .get('/api/v1/admin/payments/awaiting-approval')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(queue.body.map((row: { id: string }) => row.id)).toContain(payment.id);

      await api()
        .post(`/api/v1/admin/payments/${payment.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ note: 'Receipt checked against the bank statement' })
        .expect(201);

      const settled = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(settled.status).toBe('PAID');

      // Approving the money confirms the order.
      const confirmed = await prisma.order.findUniqueOrThrow({ where: { id: order.body.id } });
      expect(confirmed.status).toBe('CONFIRMED');
    });

    it('charges no fee for a bank transfer', async () => {
      const agent = await cartWithReadyItem(1);
      const order = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'bank_transfer' })
        .expect(201);
      createdOrderIds.push(order.body.id);

      expect(order.body.codFee).toBe(0);
    });
  });

  describe('order status', () => {
    let orderId: string;

    beforeAll(async () => {
      const agent = await cartWithReadyItem(1);
      const order = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod' })
        .expect(201);
      orderId = order.body.id;
      createdOrderIds.push(orderId);
    });

    it('refuses a transition that skips the journey', async () => {
      const response = await api()
        .post(`/api/v1/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'DELIVERED' })
        .expect(400);

      expect(String(response.body.message)).toMatch(/cannot become delivered/i);
    });

    it('walks the order through to delivered', async () => {
      for (const status of ['CONFIRMED', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED']) {
        await api()
          .post(`/api/v1/admin/orders/${orderId}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status })
          .expect(201);
      }

      const order = await api()
        .get(`/api/v1/admin/orders/${orderId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(order.body.status).toBe('DELIVERED');
      expect(order.body.deliveredAt).toBeTruthy();
      // Every step is on the record.
      expect(order.body.statusEvents.length).toBeGreaterThanOrEqual(6);
    });

    it('puts stock back when an order is cancelled', async () => {
      const agent = await cartWithReadyItem(2);
      const order = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod' })
        .expect(201);
      createdOrderIds.push(order.body.id);

      const afterOrder = await prisma.productVariant.findUniqueOrThrow({
        where: { id: readyVariantId },
      });

      await api()
        .post(`/api/v1/admin/orders/${order.body.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CANCELLED', note: 'Customer changed their mind' })
        .expect(201);

      const afterCancel = await prisma.productVariant.findUniqueOrThrow({
        where: { id: readyVariantId },
      });
      expect(afterCancel.stock).toBe(afterOrder.stock + 2);
    });
  });

  describe('tracking', () => {
    let number: string;

    beforeAll(async () => {
      const agent = await cartWithReadyItem(1);
      const order = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod' })
        .expect(201);
      number = order.body.number;
      createdOrderIds.push(order.body.id);
    });

    it('lets a guest track with the phone number they ordered with', async () => {
      const response = await api()
        .post(`/api/v1/orders/${number}/track`)
        .send({ phone: '0300 1234567' })
        .expect(201);

      expect(response.body.number).toBe(number);
    });

    it('refuses a wrong phone number, so order numbers alone reveal nothing', async () => {
      await api()
        .post(`/api/v1/orders/${number}/track`)
        .send({ phone: '03009999999' })
        .expect(403);
    });

    it('404s on an order number that does not exist', async () => {
      await api()
        .post('/api/v1/orders/YSN-2026-9999/track')
        .send({ phone: '03001234567' })
        .expect(404);
    });
  });

  describe('admin access', () => {
    it('refuses a customer', async () => {
      const customer = (
        await api()
          .post('/api/v1/auth/login')
          .send({ identifier: 'ayesha@example.com', password: 'customer12345' })
      ).body.accessToken;

      await api()
        .get('/api/v1/admin/orders')
        .set('Authorization', `Bearer ${customer}`)
        .expect(403);
    });

    it('lists orders for staff', async () => {
      const response = await api()
        .get('/api/v1/admin/orders?pageSize=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.meta.total).toBeGreaterThan(0);
    });
  });
});
