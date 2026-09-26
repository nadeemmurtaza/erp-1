import { createHmac, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { setVariantStock } from './support/stock';

/**
 * JazzCash's hosted-checkout redirect, end to end: initiate() at order
 * placement hands the storefront a form to POST to JazzCash, and
 * handleCallback() settles the order once JazzCash posts the customer back.
 *
 * Both providers stay off the PAYMENT_PROVIDERS allowlist everywhere else in
 * this suite (see orders.e2e-spec.ts) — this file is the one place they run,
 * so it configures its own app instance with them enabled rather than
 * mutating the shared one every other spec file uses.
 */
describe('JazzCash checkout redirect (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let readyVariantId: string;
  let seededStock = 0;
  const createdOrderIds: string[] = [];

  const KARACHI = {
    fullName: 'Ayesha Khan',
    phone: '03001234567',
    line1: 'House 12, Street 5',
    city: 'Karachi',
    province: 'Sindh',
  };

  const SALT = 'test-integrity-salt';
  let originalPaymentProviders: string | undefined;

  beforeAll(async () => {
    originalPaymentProviders = process.env.PAYMENT_PROVIDERS;
    process.env.PAYMENT_PROVIDERS = 'cod,bank_transfer,jazzcash';
    process.env.JAZZCASH_MERCHANT_ID = 'TEST-MERCHANT';
    process.env.JAZZCASH_PASSWORD = 'test-password';
    process.env.JAZZCASH_INTEGRITY_SALT = SALT;
    process.env.JAZZCASH_RETURN_URL = 'http://localhost:3000/checkout/callback/jazzcash';
    process.env.JAZZCASH_SANDBOX = 'true';

    // ConfigModule.forRoot() (in AppConfigModule) reads process.env inside its
    // own @Module() decorator, which runs the moment AppModule's import graph
    // is evaluated — a static top-level `import { AppModule }` would resolve
    // (and so lock in PAYMENT_PROVIDERS) before the assignments above ever
    // run. The dynamic import here defers that until after them.
    const { AppModule } = await import('../src/app.module');
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

    readyVariantId = (
      await prisma.product.findFirstOrThrow({
        where: { slug: 'ready-kurta-white-cotton' },
        include: { variants: { orderBy: { order: 'asc' } } },
      })
    ).variants[0]!.id;

    seededStock = (
      await prisma.productVariant.findUniqueOrThrow({ where: { id: readyVariantId } })
    ).stock;
    await setVariantStock(prisma, readyVariantId, 50);
  });

  afterAll(async () => {
    for (const id of createdOrderIds) {
      await prisma.order.delete({ where: { id } }).catch(() => undefined);
    }
    await setVariantStock(prisma, readyVariantId, seededStock);
    await app.close();

    // This process.env is shared by every other spec file in the same jest
    // worker (maxWorkers: 1) — leaving PAYMENT_PROVIDERS mutated here breaks
    // any of them that place an order after this file runs, since it changes
    // which providers are actually registered on their own fresh app.
    if (originalPaymentProviders === undefined) {
      delete process.env.PAYMENT_PROVIDERS;
    } else {
      process.env.PAYMENT_PROVIDERS = originalPaymentProviders;
    }
    delete process.env.JAZZCASH_MERCHANT_ID;
    delete process.env.JAZZCASH_PASSWORD;
    delete process.env.JAZZCASH_INTEGRITY_SALT;
    delete process.env.JAZZCASH_RETURN_URL;
    delete process.env.JAZZCASH_SANDBOX;
  });

  const api = () => request(app.getHttpServer());

  /** Mirrors JazzCashProvider.sign(): HMAC-SHA256 over the salt and the non-empty pp_/ppmpf_ values (never pp_SecureHash itself), sorted by key. */
  function sign(fields: Record<string, string>): string {
    const message = [
      SALT,
      ...Object.keys(fields)
        .filter((key) => key !== 'pp_SecureHash' && (key.startsWith('pp_') || key.startsWith('ppmpf_')))
        .sort()
        .map((key) => fields[key])
        .filter((value) => value !== undefined && value !== ''),
    ].join('&');

    return createHmac('sha256', SALT).update(message).digest('hex');
  }

  it('offers jazzcash once it is on the allowlist', async () => {
    const response = await api().get('/api/v1/payments/methods').expect(200);
    const keys = response.body.map((method: { key: string }) => method.key);
    expect(keys).toContain('jazzcash');
  });

  it('hands the storefront a signed form to post to the JazzCash sandbox', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/v1/cart/items').send({ variantId: readyVariantId, quantity: 1 }).expect(201);

    const response = await agent
      .post('/api/v1/orders')
      .set('Idempotency-Key', randomUUID())
      .send({ shippingAddress: KARACHI, paymentMethod: 'jazzcash' })
      .expect(201);

    createdOrderIds.push(response.body.id);

    expect(response.body.payment.redirectUrl).toMatch(/sandbox\.jazzcash/);
    const fields = response.body.payment.meta.fields as Record<string, string>;
    expect(fields.pp_MerchantID).toBe('TEST-MERCHANT');
    expect(fields.pp_BillReference).toBe(response.body.number);
    expect(fields.pp_SecureHash).toBeTruthy();
    // The hash JazzCashProvider computed matches what a customer's browser
    // would submit if it posted these exact fields — proves initiate() built
    // a form the real gateway would accept, not just a plausible-looking one.
    expect(fields.pp_SecureHash).toBe(sign(fields));
  });

  it('confirms the order once JazzCash posts back a signed success', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/v1/cart/items').send({ variantId: readyVariantId, quantity: 1 }).expect(201);

    const placed = await agent
      .post('/api/v1/orders')
      .set('Idempotency-Key', randomUUID())
      .send({ shippingAddress: KARACHI, paymentMethod: 'jazzcash' })
      .expect(201);
    createdOrderIds.push(placed.body.id);

    const fields = placed.body.payment.meta.fields as Record<string, string>;

    // What JazzCash's return POST looks like: the same txn ref, a success
    // code, and a hash over ITS OWN fields — not a copy of the request's.
    const returnFields: Record<string, string> = {
      pp_TxnRefNo: fields.pp_TxnRefNo,
      pp_ResponseCode: '000',
      pp_ResponseMessage: 'Transaction Successful.',
      pp_RetreivalReferenceNo: '123456789012',
      pp_Amount: fields.pp_Amount,
    };
    returnFields.pp_SecureHash = sign(returnFields);

    const callback = await api()
      .post('/api/v1/payments/callback/jazzcash')
      .send(returnFields)
      .expect(201);

    expect(callback.body).toEqual({
      orderId: placed.body.id,
      orderNumber: placed.body.number,
      status: 'PAID',
    });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: placed.body.id } });
    expect(order.status).toBe('CONFIRMED');

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: placed.body.id } });
    expect(payment.status).toBe('PAID');
    expect(payment.providerRef).toBe('123456789012');
  });

  it('rejects a callback whose hash does not match, leaving the payment untouched', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/v1/cart/items').send({ variantId: readyVariantId, quantity: 1 }).expect(201);

    const placed = await agent
      .post('/api/v1/orders')
      .set('Idempotency-Key', randomUUID())
      .send({ shippingAddress: KARACHI, paymentMethod: 'jazzcash' })
      .expect(201);
    createdOrderIds.push(placed.body.id);

    const fields = placed.body.payment.meta.fields as Record<string, string>;

    await api()
      .post('/api/v1/payments/callback/jazzcash')
      .send({
        pp_TxnRefNo: fields.pp_TxnRefNo,
        pp_ResponseCode: '000',
        pp_SecureHash: 'not-a-real-hash',
      })
      .expect(403);

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: placed.body.id } });
    expect(payment.status).toBe('PENDING');
  });
});
