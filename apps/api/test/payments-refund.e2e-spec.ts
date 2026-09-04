import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';

/**
 * Staff marking a payment refunded — the real trigger behind the
 * "Refund Processed" email. Payment.refundedAt/refundAmount existed on the
 * schema with nothing setting them before this; these tests are the proof
 * that refund() actually does now.
 */
describe('Payment refunds (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  const orderIds: string[] = [];

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

    const signIn = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'admin@yaseen.pk', password: 'admin12345' })
      .expect(200);
    adminToken = signIn.body.accessToken;
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  async function seedPaidOrder(amount: number): Promise<{ orderId: string; paymentId: string }> {
    const order = await prisma.order.create({
      data: {
        number: `E2E-REFUND-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: 'CONFIRMED',
        guestName: 'Refund Test Customer',
        guestEmail: 'refund-e2e@example.com',
        guestPhone: '+923001234567',
        shippingAddress: { fullName: 'Refund Test Customer', line1: 'Test', city: 'Karachi' },
        itemsSubtotal: amount,
        grandTotal: amount,
      },
    });
    orderIds.push(order.id);

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'bank_transfer',
        status: 'PAID',
        amount,
        paidAt: new Date(),
      },
    });

    return { orderId: order.id, paymentId: payment.id };
  }

  it('refuses a refund for a payment that was never paid', async () => {
    const order = await prisma.order.create({
      data: {
        number: `E2E-REFUND-UNPAID-${Date.now()}`,
        shippingAddress: { fullName: 'X', line1: 'X', city: 'X' },
        itemsSubtotal: 1000,
        grandTotal: 1000,
      },
    });
    orderIds.push(order.id);
    const payment = await prisma.payment.create({
      data: { orderId: order.id, provider: 'cod', status: 'PENDING', amount: 1000 },
    });

    await api()
      .post(`/api/v1/admin/payments/${payment.id}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);
  });

  it('fully refunds a paid payment and queues the confirmation email', async () => {
    const { orderId, paymentId } = await seedPaidOrder(349900);

    const response = await api()
      .post(`/api/v1/admin/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'Customer changed their mind' })
      .expect(201);

    expect(response.body.status).toBe('REFUNDED');
    expect(response.body.refundAmount).toBe(349900);
    expect(response.body.refundedAt).not.toBeNull();

    const events = await prisma.outboxEvent.findMany({
      where: { name: 'payment.refunded' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const event = events.find((row) => (row.payload as { orderId?: string }).orderId === orderId);
    expect(event).toBeDefined();
    expect((event!.payload as { amount: number }).amount).toBe(349900);
  });

  it('will not refund the same payment twice', async () => {
    const { paymentId } = await seedPaidOrder(100000);

    await api()
      .post(`/api/v1/admin/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    await api()
      .post(`/api/v1/admin/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);
  });

  it('supports a partial refund, but never more than was paid', async () => {
    const { paymentId } = await seedPaidOrder(500000);

    await api()
      .post(`/api/v1/admin/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 600000 })
      .expect(400);

    const response = await api()
      .post(`/api/v1/admin/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 200000 })
      .expect(201);

    expect(response.body.refundAmount).toBe(200000);
    expect(response.body.status).toBe('REFUNDED');
  });

  it('refuses an anonymous refund request', async () => {
    const { paymentId } = await seedPaidOrder(150000);

    await api().post(`/api/v1/admin/payments/${paymentId}/refund`).send({}).expect(401);
  });
});
