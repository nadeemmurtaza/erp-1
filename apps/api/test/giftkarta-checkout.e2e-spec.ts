import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { toMinor } from '@newax/shared';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { setVariantStock } from './support/stock';

/**
 * Giftkarta — a third-party gift-card network redeemed at checkout
 * (payment-provider.ts's `requiresCode`/`redeemCode`), end to end: placing
 * an order with `paymentMethod: 'giftkarta'` leaves the order PENDING with
 * no external call made yet, and only `POST /payments/:paymentId/redeem-gift-card`
 * — the storefront's own follow-up step — actually calls out to the network,
 * confirming the order on success. `global.fetch` stands in for Giftkarta's
 * own API, since no real one exists to call in a test (see GiftkartaProvider's
 * own honesty note on why its exact request/response shape is a placeholder).
 */
describe('Giftkarta third-party gift card checkout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
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

  let originalPaymentProviders: string | undefined;
  let fetchSpy: jest.SpyInstance;

  beforeAll(async () => {
    originalPaymentProviders = process.env.PAYMENT_PROVIDERS;
    process.env.PAYMENT_PROVIDERS = 'cod,bank_transfer,giftkarta';
    process.env.GIFTKARTA_API_BASE_URL = 'https://giftkarta.test.invalid';
    process.env.GIFTKARTA_API_KEY = 'test-api-key';

    // Same reason payments-gateway.e2e-spec.ts imports AppModule dynamically:
    // ConfigModule.forRoot() reads process.env at import time, before a
    // static top-level import would let the assignments above land.
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);

    const product = await prisma.product.findFirstOrThrow({ where: { status: 'ACTIVE' }, select: { id: true } });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, sku: `GIFTKARTA-TEST-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
    createdVariantIds.push(variant.id);
    readyVariantId = variant.id;
    await setVariantStock(prisma, readyVariantId, 50);
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  afterAll(async () => {
    for (const id of createdOrderIds) {
      await prisma.order.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
    await app.close();

    if (originalPaymentProviders === undefined) {
      delete process.env.PAYMENT_PROVIDERS;
    } else {
      process.env.PAYMENT_PROVIDERS = originalPaymentProviders;
    }
    delete process.env.GIFTKARTA_API_BASE_URL;
    delete process.env.GIFTKARTA_API_KEY;
  });

  const api = () => request(app.getHttpServer());

  async function placeOrder(): Promise<{ id: string; number: string; paymentId: string; grandTotal: number }> {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/v1/cart/items').send({ variantId: readyVariantId, quantity: 1 }).expect(201);
    const response = await agent
      .post('/api/v1/orders')
      .send({ shippingAddress: KARACHI, paymentMethod: 'giftkarta' })
      .expect(201);
    createdOrderIds.push(response.body.id);
    return { id: response.body.id, number: response.body.number, paymentId: response.body.payment.paymentId, grandTotal: response.body.grandTotal };
  }

  function mockFetch(handlers: { balance?: object; redeem?: object; redeemStatus?: number }) {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/v1/gift-cards/balance')) {
        return new Response(JSON.stringify(handlers.balance ?? {}), { status: 200 });
      }
      if (url.endsWith('/v1/gift-cards/redeem')) {
        return new Response(JSON.stringify(handlers.redeem ?? {}), { status: handlers.redeemStatus ?? 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as jest.SpyInstance;
  }

  it('offers giftkarta once it is on the allowlist, requiring a code', async () => {
    const response = await api().get('/api/v1/payments/methods').expect(200);
    const giftkarta = response.body.find((m: { key: string }) => m.key === 'giftkarta');
    expect(giftkarta).toBeDefined();
    expect(giftkarta.requiresCode).toBe(true);
  });

  it('places the order PENDING with no external call made yet', async () => {
    mockFetch({});
    const order = await placeOrder();

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: order.paymentId } });
    expect(payment.status).toBe('PENDING');
    expect(payment.provider).toBe('giftkarta');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('redeems a valid code for the full amount and confirms the order', async () => {
    const order = await placeOrder();
    mockFetch({
      balance: { valid: true, balance: order.grandTotal, currency: 'PKR' },
      redeem: { success: true, transactionId: 'GK-TXN-1', remainingBalance: 0 },
    });

    const response = await api()
      .post(`/api/v1/payments/${order.paymentId}/redeem-gift-card`)
      .send({ code: 'ABCD-EFGH-IJKL' })
      .expect(201);

    expect(response.body.status).toBe('PAID');

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: order.paymentId } });
    expect(payment.status).toBe('PAID');
    expect(payment.providerRef).toBe('GK-TXN-1');
    expect(payment.paidAt).not.toBeNull();

    const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updatedOrder.status).toBe('CONFIRMED');
  });

  it('rejects a card with insufficient balance, leaving the payment PENDING for a retry', async () => {
    const order = await placeOrder();
    mockFetch({ balance: { valid: true, balance: toMinor(1), currency: 'PKR' } });

    const response = await api()
      .post(`/api/v1/payments/${order.paymentId}/redeem-gift-card`)
      .send({ code: 'LOW-BALANCE-CARD' })
      .expect(400);

    expect(String(response.body.message)).toMatch(/not have enough balance/i);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: order.paymentId } });
    expect(payment.status).toBe('FAILED');
    expect(payment.failureReason).toMatch(/not have enough balance/i);

    // A retry against the SAME payment is still possible — it was never
    // consumed, since the failure was caught before any redeem call.
    mockFetch({
      balance: { valid: true, balance: order.grandTotal, currency: 'PKR' },
      redeem: { success: true, transactionId: 'GK-TXN-RETRY', remainingBalance: 0 },
    });
    const retry = await api()
      .post(`/api/v1/payments/${order.paymentId}/redeem-gift-card`)
      .send({ code: 'A-BETTER-CARD' })
      .expect(201);
    expect(retry.body.status).toBe('PAID');
  });

  it('rejects an invalid code without touching the order', async () => {
    const order = await placeOrder();
    mockFetch({ balance: { valid: false, balance: 0, currency: 'PKR' } });

    await api()
      .post(`/api/v1/payments/${order.paymentId}/redeem-gift-card`)
      .send({ code: 'NOT-A-REAL-CARD' })
      .expect(400);

    const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updatedOrder.status).toBe('PENDING');
  });

  it('is idempotent — redeeming an already-PAID payment again changes nothing', async () => {
    const order = await placeOrder();
    mockFetch({
      balance: { valid: true, balance: order.grandTotal, currency: 'PKR' },
      redeem: { success: true, transactionId: 'GK-TXN-2', remainingBalance: 0 },
    });
    await api().post(`/api/v1/payments/${order.paymentId}/redeem-gift-card`).send({ code: 'A-VALID-CARD' }).expect(201);

    const secondAttempt = await api()
      .post(`/api/v1/payments/${order.paymentId}/redeem-gift-card`)
      .send({ code: 'A-DIFFERENT-CARD' })
      .expect(201);
    expect(secondAttempt.body.status).toBe('PAID');

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: order.paymentId } });
    // The first, real redemption's own reference — untouched by the second call.
    expect(payment.providerRef).toBe('GK-TXN-2');
  });
});
