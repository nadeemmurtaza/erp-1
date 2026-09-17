import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { toMinor } from '@yaseen/shared';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { SettingsService } from '../src/core/settings/settings.service';
import { SettingKey } from '../src/core/settings/settings.defaults';
import { OutboxDispatcher } from '../src/core/events/outbox.dispatcher';
import { setVariantStock, incrementVariantStock } from './support/stock';

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

  /** The design area this suite types a free-text note into. */
  const FINISH_GROUP_KEY = 'daaman_finish';

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

    const customer = await prisma.user.findUniqueOrThrow({
      where: { email: 'ayesha@example.com' },
    });
    kameezProfileId = (
      await prisma.measurementProfile.findFirstOrThrow({
        where: {
          garmentTypeId: kameez.id,
          label: 'Self',
          userId: customer.id,
        },
      })
    ).id;

    necklineOptionId = (
      await prisma.stitchingOption.findFirstOrThrow({
        where: { key: 'round', group: { key: 'neckline' } },
      })
    ).id;

    const finishGroup = await prisma.stitchingOptionGroup.findUniqueOrThrow({
      where: { key: FINISH_GROUP_KEY },
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
    await setVariantStock(prisma, readyVariantId, 500);
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
          await incrementVariantStock(prisma, item.variantId, item.quantity);
        }
      }
      await prisma.order.delete({ where: { id } });
    }

    await setVariantStock(prisma, readyVariantId, seededStock);
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

    it('gives simultaneous checkouts distinct order numbers', async () => {
      // Deliberately DIFFERENT variants per cart. Buying the same one makes
      // the stock row lock serialise the transactions, which hides a race in
      // the order-number counter; distinct variants remove that lock and let
      // the checkouts genuinely overlap.
      const variants = await prisma.productVariant.findMany({
        where: { isActive: true, stock: { gt: 0 }, product: { status: 'ACTIVE' } },
        select: { id: true },
        take: 6,
      });
      expect(variants.length).toBeGreaterThan(1);

      const agents = [];
      for (const variant of variants) {
        const agent = request.agent(app.getHttpServer());
        await agent
          .post('/api/v1/cart/items')
          .send({ variantId: variant.id, quantity: 1 })
          .expect(201);
        agents.push(agent);
      }

      const responses = await Promise.all(
        agents.map((agent) =>
          agent.post('/api/v1/orders').send({ shippingAddress: KARACHI, paymentMethod: 'cod' }),
        ),
      );

      for (const response of responses) {
        if (response.status === 201) createdOrderIds.push(response.body.id);
      }

      // Every one of them has to succeed: before the counter took an advisory
      // lock, all but the first died on Order.number's unique index and the
      // customer saw a 409 at the moment of payment.
      expect(responses.map((response) => response.status)).toEqual(
        variants.map(() => 201),
      );

      const numbers = responses.map((response) => response.body.number);
      expect(new Set(numbers).size).toBe(numbers.length);
    });

    it('defends the last unit against simultaneous checkouts', async () => {
      // Find a variant and set its stock to exactly 1
      const variant = await prisma.productVariant.findFirstOrThrow({
        where: { isActive: true, stock: { gt: 1 }, product: { status: 'ACTIVE' } },
      });
      await setVariantStock(prisma, variant.id, 1);

      // The seed may already have sold this variant, so the invariant is the
      // DELTA: exactly one SALE row may be written, no matter which request won.
      const salesBefore = await prisma.stockMovement.count({
        where: { variantId: variant.id, reason: 'SALE' },
      });

      const agent1 = request.agent(app.getHttpServer());
      await agent1.post('/api/v1/cart/items').send({ variantId: variant.id, quantity: 1 }).expect(201);
      
      const agent2 = request.agent(app.getHttpServer());
      await agent2.post('/api/v1/cart/items').send({ variantId: variant.id, quantity: 1 }).expect(201);

      const responses = await Promise.all([
        agent1.post('/api/v1/orders').send({ shippingAddress: KARACHI, paymentMethod: 'cod' }),
        agent2.post('/api/v1/orders').send({ shippingAddress: KARACHI, paymentMethod: 'cod' })
      ]);

      for (const res of responses) {
        if (res.status === 201) createdOrderIds.push(res.body.id);
      }

      const statuses = responses.map(r => r.status).sort();
      expect(statuses).toEqual([201, 400]);

      const failedResponse = responses.find((r) => r.status === 400);
      expect(String(failedResponse!.body.message)).toMatch(/sold out while you were checking out/i);

      // The status codes prove one request was rejected. They do NOT prove the
      // ledger stayed consistent — that is what this asserts.
      const salesAfter = await prisma.stockMovement.count({
        where: { variantId: variant.id, reason: 'SALE' },
      });
      expect(salesAfter - salesBefore).toBe(1);

      await setVariantStock(prisma, variant.id, 100);
    });

    it('survives opposite-order checkouts without deadlocking', async () => {
      const variants = await prisma.productVariant.findMany({
        where: { isActive: true, stock: { gte: 2 }, product: { status: 'ACTIVE' } },
        take: 2,
      });
      expect(variants.length).toBe(2);

      const agent1 = request.agent(app.getHttpServer());
      await agent1.post('/api/v1/cart/items').send({ variantId: variants[0].id, quantity: 1 }).expect(201);
      await agent1.post('/api/v1/cart/items').send({ variantId: variants[1].id, quantity: 1 }).expect(201);

      const agent2 = request.agent(app.getHttpServer());
      await agent2.post('/api/v1/cart/items').send({ variantId: variants[1].id, quantity: 1 }).expect(201);
      await agent2.post('/api/v1/cart/items').send({ variantId: variants[0].id, quantity: 1 }).expect(201);

      const responses = await Promise.all([
        agent1.post('/api/v1/orders').send({ shippingAddress: KARACHI, paymentMethod: 'cod' }),
        agent2.post('/api/v1/orders').send({ shippingAddress: KARACHI, paymentMethod: 'cod' })
      ]);

      for (const res of responses) {
        if (res.status === 201) createdOrderIds.push(res.body.id);
      }

      const statuses = responses.map(r => r.status);
      expect(statuses).toEqual([201, 201]);
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
            customDesignText: { [FINISH_GROUP_KEY]: 'Contrast piping in maroon' },
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
        [FINISH_GROUP_KEY]: 'Contrast piping in maroon',
      });
      // Carried over from the cart line for traceability — it never touched pricing.
      expect(item.sizeToken).toBe('M');
      const described = item.optionsSnapshot.find(
        (option: { custom: boolean }) => option.custom,
      );
      expect(described.groupKey).toBe(FINISH_GROUP_KEY);
      expect(described.groupLabelEn).toBe('Daaman finish');
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

  describe('backorder (checkout.allow_backorder)', () => {
    let settings: SettingsService;
    let outbox: OutboxDispatcher;

    beforeAll(() => {
      settings = app.get(SettingsService);
      outbox = app.get(OutboxDispatcher);
    });

    afterEach(async () => {
      await settings.set(SettingKey.OrdersAllowBackorder, false);
    });

    it('still refuses an out-of-stock item at cart-add while the setting is off (default)', async () => {
      const variant = await prisma.productVariant.findFirstOrThrow({
        where: { isActive: true, product: { status: 'ACTIVE' } },
      });
      await setVariantStock(prisma, variant.id, 0);

      const agent = request.agent(app.getHttpServer());
      const response = await agent.post('/api/v1/cart/items').send({ variantId: variant.id, quantity: 1 });

      expect(response.status).toBe(400);
      expect(String(response.body.message)).toMatch(/out of stock/i);

      await setVariantStock(prisma, variant.id, 100);
    });

    it('parks a backordered line as AWAITING_STOCK, then auto-fulfills it once stock is replenished', async () => {
      await settings.set(SettingKey.OrdersAllowBackorder, true);

      const variant = await prisma.productVariant.findFirstOrThrow({
        where: { isActive: true, product: { status: 'ACTIVE' }, producedInHouse: false },
      });
      await setVariantStock(prisma, variant.id, 0);

      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/v1/cart/items').send({ variantId: variant.id, quantity: 1 }).expect(201);

      const response = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: KARACHI, paymentMethod: 'cod' })
        .expect(201);
      createdOrderIds.push(response.body.id);

      const orderItem = await prisma.orderItem.findFirstOrThrow({
        where: { orderId: response.body.id, variantId: variant.id },
      });
      expect(orderItem.fulfillmentStatus).toBe('AWAITING_STOCK');
      expect(orderItem.awaitingSince).not.toBeNull();

      // The backordered line never took stock — still zero.
      const stockRow = await prisma.variantLocationStock.findFirstOrThrow({ where: { variantId: variant.id } });
      expect(stockRow.quantity).toBe(0);

      // Stock arrives through a real move() call (the admin adjust endpoint),
      // which is what actually fires StockReplenished — incrementVariantStock
      // (used elsewhere in this file) writes the row directly and bypasses it.
      await api()
        .post(`/api/v1/admin/inventory/${variant.id}/adjust`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ delta: 5, reason: 'restock' })
        .expect(201);

      // Drive the outbox directly rather than waiting on its 2s poll.
      await outbox.processBatch();

      const updatedItem = await prisma.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
      expect(updatedItem.fulfillmentStatus).toBe('READY');
      expect(updatedItem.awaitingSince).toBeNull();

      // 5 arrived, 1 allocated to the backordered line.
      const finalStock = await prisma.variantLocationStock.findFirstOrThrow({ where: { variantId: variant.id } });
      expect(finalStock.quantity).toBe(4);

      await setVariantStock(prisma, variant.id, 100);
    });
  });
});
