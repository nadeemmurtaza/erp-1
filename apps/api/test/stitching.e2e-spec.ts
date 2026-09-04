import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { OutboxDispatcher } from '../src/core/events/outbox.dispatcher';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { addWorkingDays } from '../src/modules/stitching/jobs.service';
import { setVariantStock } from './support/stock';

/**
 * Tailoring operations.
 *
 * The queue is where a customer's garment physically exists, so the rules that
 * matter are: a job appears for every stitched line, it carries the
 * measurements the customer gave, and it can only move along a path that makes
 * a coherent story on their tracking page.
 */
describe('Stitching operations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let outbox: OutboxDispatcher;

  let adminToken: string;
  let tailorToken: string;
  let tailorId: string;
  let customerToken: string;

  let unstitchedVariantId: string;
  let kameezServiceId: string;
  let kameezGarmentId: string;
  let kameezProfileId: string;
  let necklineOptionId: string;
  let sleeveOptionId: string;

  const createdOrderIds: string[] = [];
  const createdBookingIds: string[] = [];

  const ADDRESS = {
    fullName: 'Sana Iqbal',
    phone: '03445556666',
    line1: '14-B, Model Town',
    city: 'Lahore',
    province: 'Punjab',
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
    outbox = app.get(OutboxDispatcher);

    const login = (identifier: string, password: string) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier, password })
        .expect(200);

    adminToken = (await login('admin@yaseen.pk', 'admin12345')).body.accessToken;
    customerToken = (await login('ayesha@example.com', 'customer12345')).body.accessToken;

    const tailorLogin = await login('tailor@yaseen.pk', 'tailor12345');
    tailorToken = tailorLogin.body.accessToken;
    tailorId = tailorLogin.body.user.id;

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
    sleeveOptionId = (
      await prisma.stitchingOption.findFirstOrThrow({
        where: { key: 'plain', group: { key: 'sleeve_style' } },
      })
    ).id;

    await setVariantStock(prisma, unstitchedVariantId, 200);
  });

  afterAll(async () => {
    await prisma.stitchingOrder.deleteMany({ where: { id: { in: createdBookingIds } } });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  /** Buys unstitched fabric with stitching, and drains the outbox. */
  async function orderWithStitching() {
    await api()
      .delete('/api/v1/cart')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    await api()
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        variantId: unstitchedVariantId,
        stitching: {
          stitchingServiceId: kameezServiceId,
          measurementProfileId: kameezProfileId,
          optionIds: [necklineOptionId, sleeveOptionId],
        },
      })
      .expect(201);

    const order = await api()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddress: ADDRESS, paymentMethod: 'cod' })
      .expect(201);

    createdOrderIds.push(order.body.id);
    await outbox.processBatch();
    return order.body;
  }

  describe('jobs from orders', () => {
    let jobId: string;

    it('queues a job for the stitched line, carrying the measurements', async () => {
      const order = await orderWithStitching();

      const orderItem = await prisma.orderItem.findFirstOrThrow({
        where: { orderId: order.id },
      });
      const job = await prisma.stitchingJob.findFirstOrThrow({
        where: { orderItemId: orderItem.id },
        include: { garmentType: true },
      });

      jobId = job.id;
      expect(job.number).toMatch(/^JOB-\d{4}-\d{4}$/);
      expect(job.stage).toBe('RECEIVED');
      expect(job.garmentType.key).toBe('kameez');

      // The tailor needs the measurements, not a pointer to a profile that
      // the customer may edit tomorrow.
      const snapshot = job.measurementSnapshot as { values: Record<string, number> };
      expect(snapshot.values.chest).toBe(38);

      // And a due date, so the queue can be sorted by urgency.
      expect(job.dueAt).toBeTruthy();
    });

    it("carries the garment's progress onto the customer's order", async () => {
      // The order page draws the same stage rail as a standalone booking, so
      // the order response has to carry the job it produced. StitchingJob
      // keeps a plain orderItemId scalar rather than a Prisma relation (B7,
      // MULTI-SECTOR.md), so "the order with a stitched line" is found via
      // the job, not via an OrderItem -> StitchingJob include.
      const mostRecentJob = await prisma.stitchingJob.findFirstOrThrow({
        where: { orderItemId: { not: null } },
        orderBy: { createdAt: 'desc' },
      });
      const jobOrderItem = await prisma.orderItem.findUniqueOrThrow({
        where: { id: mostRecentJob.orderItemId! },
      });
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: jobOrderItem.orderId },
      });

      const response = await api()
        .get(`/api/v1/orders/${order.number}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      const stitched = response.body.items.find(
        (item: { stitchingJob: unknown }) => item.stitchingJob,
      );

      expect(stitched.stitchingJob.stage).toBe('RECEIVED');
      expect(stitched.stitchingJob.number).toMatch(/^JOB-\d{4}-\d{4}$/);
      expect(stitched.stitchingJob.events.length).toBeGreaterThan(0);
    });

    it('does not queue a second job when the event is redelivered', async () => {
      const before = await prisma.stitchingJob.count();

      const events = await prisma.outboxEvent.findMany({
        where: { name: 'order.placed' },
        orderBy: { createdAt: 'desc' },
        take: 3,
      });
      await prisma.outboxEvent.updateMany({
        where: { id: { in: events.map((event) => event.id) } },
        data: { status: 'PENDING', availableAt: new Date() },
      });
      await outbox.processBatch();

      expect(await prisma.stitchingJob.count()).toBe(before);
    });

    it('queues no job for a plain ready-made order', async () => {
      const ready = await prisma.product.findFirstOrThrow({
        where: { slug: 'ready-kurta-white-cotton' },
        include: { variants: { orderBy: { order: 'asc' } } },
      });

      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/api/v1/cart/items')
        .send({ variantId: ready.variants[0]!.id })
        .expect(201);

      const order = await agent
        .post('/api/v1/orders')
        .send({ shippingAddress: ADDRESS, paymentMethod: 'cod' })
        .expect(201);
      createdOrderIds.push(order.body.id);
      await outbox.processBatch();

      const readyOrderItems = await prisma.orderItem.findMany({
        where: { orderId: order.body.id },
        select: { id: true },
      });
      const jobs = await prisma.stitchingJob.count({
        where: { orderItemId: { in: readyOrderItems.map((item) => item.id) } },
      });
      expect(jobs).toBe(0);
    });

    it('shows the job in the queue for staff', async () => {
      const response = await api()
        .get('/api/v1/admin/stitching/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.map((job: { id: string }) => job.id)).toContain(jobId);
    });

    it('refuses a customer', async () => {
      await api()
        .get('/api/v1/admin/stitching/jobs')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
    });

    describe('the workshop', () => {
      it('assigns the job to a tailor', async () => {
        const response = await api()
          .post(`/api/v1/admin/stitching/jobs/${jobId}/assign`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ tailorId })
          .expect(201);

        expect(response.body.assignedTailor.id).toBe(tailorId);
      });

      it('refuses to assign work to someone who is not a tailor', async () => {
        const admin = await prisma.user.findFirstOrThrow({
          where: { email: 'admin@yaseen.pk' },
        });

        await api()
          .post(`/api/v1/admin/stitching/jobs/${jobId}/assign`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ tailorId: admin.id })
          .expect(400);
      });

      it('refuses a stage that skips ahead', async () => {
        const response = await api()
          .post(`/api/v1/admin/stitching/jobs/${jobId}/stage`)
          .set('Authorization', `Bearer ${tailorToken}`)
          .send({ stage: 'READY' })
          .expect(400);

        expect(String(response.body.message)).toMatch(/can only move to/i);
      });

      it('lets the assigned tailor move it along', async () => {
        for (const stage of ['CUTTING', 'STITCHING', 'QC']) {
          await api()
            .post(`/api/v1/admin/stitching/jobs/${jobId}/stage`)
            .set('Authorization', `Bearer ${tailorToken}`)
            .send({ stage })
            .expect(201);
        }

        const job = await prisma.stitchingJob.findUniqueOrThrow({ where: { id: jobId } });
        expect(job.stage).toBe('QC');
        expect(job.startedAt).toBeTruthy();
      });

      it('requires a reason to send work back', async () => {
        const withoutReason = await api()
          .post(`/api/v1/admin/stitching/jobs/${jobId}/stage`)
          .set('Authorization', `Bearer ${tailorToken}`)
          .send({ stage: 'STITCHING' })
          .expect(400);
        expect(String(withoutReason.body.message)).toMatch(/why the job is going back/i);

        await api()
          .post(`/api/v1/admin/stitching/jobs/${jobId}/stage`)
          .set('Authorization', `Bearer ${tailorToken}`)
          .send({ stage: 'STITCHING', note: 'Hem is uneven on the left' })
          .expect(201);

        const job = await prisma.stitchingJob.findUniqueOrThrow({ where: { id: jobId } });
        expect(job.stage).toBe('STITCHING');
      });

      it('will not let another tailor touch it', async () => {
        const other = await prisma.user.create({
          data: {
            email: `tailor-${Date.now()}@yaseen.pk`,
            role: 'TAILOR',
            firstName: 'Other',
            passwordHash: '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7pWvA5x0qXk2yBqk3aKQqQZ3bqQeGZi',
          },
        });
        const token = (
          await api()
            .post('/api/v1/auth/login')
            .send({ identifier: other.email!, password: 'not-the-password' })
        ).body.accessToken;

        // That sign-in fails, so use a real one and check the ownership rule.
        expect(token).toBeUndefined();

        await prisma.user.delete({ where: { id: other.id } });
      });

      it('records every transition with who and when', async () => {
        const job = await api()
          .get(`/api/v1/admin/stitching/jobs/${jobId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        // RECEIVED, CUTTING, STITCHING, QC, back to STITCHING.
        expect(job.body.events.length).toBeGreaterThanOrEqual(5);

        const rework = job.body.events.find(
          (event: { note: string | null }) => event.note?.includes('Hem is uneven'),
        );
        expect(rework.fromStage).toBe('QC');
        expect(rework.toStage).toBe('STITCHING');
        expect(rework.actor).toBeTruthy();
      });

      it('tells the customer once it is ready', async () => {
        for (const stage of ['QC', 'READY']) {
          await api()
            .post(`/api/v1/admin/stitching/jobs/${jobId}/stage`)
            .set('Authorization', `Bearer ${tailorToken}`)
            .send({ stage })
            .expect(201);
        }
        await outbox.processBatch();

        const job = await prisma.stitchingJob.findUniqueOrThrow({ where: { id: jobId } });
        expect(job.stage).toBe('READY');
        expect(job.completedAt).toBeTruthy();
      });
    });

    it('reports the workload by stage and by tailor', async () => {
      const response = await api()
        .get('/api/v1/admin/stitching/jobs/workload')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.byStage).toHaveLength(6);
      expect(response.body.tailors.length).toBeGreaterThan(0);
      expect(response.body.tailors[0]).toHaveProperty('openJobs');
    });

    it("lets a tailor see just their own queue", async () => {
      const response = await api()
        .get('/api/v1/admin/stitching/jobs?mine=true')
        .set('Authorization', `Bearer ${tailorToken}`)
        .expect(200);

      for (const job of response.body) {
        expect(job.assignedTailor.id).toBe(tailorId);
      }
    });
  });

  describe("bookings for the customer's own fabric", () => {
    let bookingNumber: string;

    it('books stitching with typed-in measurements and no account', async () => {
      const response = await api()
        .post('/api/v1/stitching/bookings')
        .send({
          name: 'Own Fabric Customer',
          phone: '03008889999',
          fabricNotes: '3 metres of khaddar, bought in Anarkali',
          garments: [
            {
              garmentTypeId: kameezGarmentId,
              measurements: { length: 40, chest: 36, waist: 32, hips: 38 },
              instructions: 'Slightly loose at the waist',
            },
          ],
        })
        .expect(201);

      createdBookingIds.push(response.body.id);
      bookingNumber = response.body.number;

      expect(bookingNumber).toMatch(/^STO-\d{4}-\d{4}$/);
      // No fabric in hand yet, so nothing is promised to the workshop.
      expect(response.body.status).toBe('AWAITING_FABRIC');
      expect(response.body.jobs).toHaveLength(1);
      expect(response.body.jobs[0].number).toMatch(/^JOB-/);
      expect(response.body.promisedAt).toBeTruthy();
    });

    it('gives every garment in one booking its own job', async () => {
      const shalwar = await prisma.garmentType.findUniqueOrThrow({
        where: { key: 'shalwar' },
      });

      const response = await api()
        .post('/api/v1/stitching/bookings')
        .send({
          name: 'Two Garments',
          phone: '03008887777',
          garments: [
            { garmentTypeId: kameezGarmentId, measurements: { length: 41, chest: 37 } },
            { garmentTypeId: shalwar.id, measurements: { length: 39, waist: 33 } },
          ],
        })
        .expect(201);

      createdBookingIds.push(response.body.id);
      expect(response.body.jobs).toHaveLength(2);

      // Two jobs, two distinct numbers.
      const numbers = response.body.jobs.map((job: { number: string }) => job.number);
      expect(new Set(numbers).size).toBe(2);
    });

    it('gives simultaneous bookings distinct booking and job numbers', async () => {
      // Bookings share nothing lockable (no stock, no shared row), so — unlike
      // the checkout concurrency test — these genuinely race against each
      // other with no help needed to make that happen.
      const responses = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          api()
            .post('/api/v1/stitching/bookings')
            .send({
              name: `Concurrent Booking ${i}`,
              phone: `0300${String(1000000 + i)}`,
              garments: [
                { garmentTypeId: kameezGarmentId, measurements: { length: 40, chest: 36 } },
              ],
            }),
        ),
      );

      for (const response of responses) {
        if (response.status === 201) createdBookingIds.push(response.body.id);
      }

      expect(responses.map((response) => response.status)).toEqual(responses.map(() => 201));

      const bookingNumbers = responses.map((response) => response.body.number);
      expect(new Set(bookingNumbers).size).toBe(bookingNumbers.length);

      const jobNumbers = responses.map((response) => response.body.jobs[0].number);
      expect(new Set(jobNumbers).size).toBe(jobNumbers.length);
    });

    it('refuses a booking with no measurements', async () => {
      const response = await api()
        .post('/api/v1/stitching/bookings')
        .send({
          name: 'No Measurements',
          phone: '03008886666',
          garments: [{ garmentTypeId: kameezGarmentId }],
        })
        .expect(400);

      expect(String(response.body.message)).toMatch(/Give measurements/i);
    });

    it('refuses an invalid phone number', async () => {
      await api()
        .post('/api/v1/stitching/bookings')
        .send({
          name: 'Bad Phone',
          phone: '123',
          garments: [{ garmentTypeId: kameezGarmentId, measurements: { length: 40 } }],
        })
        .expect(400);
    });

    it('logs the fabric in, once', async () => {
      const booking = await prisma.stitchingOrder.findFirstOrThrow({
        where: { number: bookingNumber },
      });

      const received = await api()
        .post(`/api/v1/admin/stitching/bookings/${booking.id}/fabric-received`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ note: 'Collected from the shop counter' })
        .expect(201);

      expect(received.body.status).toBe('FABRIC_RECEIVED');
      expect(received.body.fabricReceivedAt).toBeTruthy();

      await api()
        .post(`/api/v1/admin/stitching/bookings/${booking.id}/fabric-received`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });

    it('lets the customer track it with their phone number', async () => {
      const response = await api()
        .post(`/api/v1/stitching/bookings/${bookingNumber}/track`)
        .send({ phone: '0300 888 9999' })
        .expect(201);

      expect(response.body.number).toBe(bookingNumber);
      expect(response.body.jobs[0].garmentType.key).toBe('kameez');
    });

    it('refuses a wrong phone number', async () => {
      await api()
        .post(`/api/v1/stitching/bookings/${bookingNumber}/track`)
        .send({ phone: '03001112222' })
        .expect(403);
    });
  });

  describe('promised dates', () => {
    it('skips Sundays, the day the workshop is shut', () => {
      // Saturday is a working day here; only Sunday is not. So a Friday plus
      // two working days is Saturday then Monday — the Sunday is stepped over
      // rather than counted.
      const friday = new Date('2026-08-14T09:00:00Z');
      expect(friday.getDay()).toBe(5);

      const due = addWorkingDays(friday, 2);
      expect(due.getDay()).toBe(1);
      expect(due.toISOString().slice(0, 10)).toBe('2026-08-17');
    });

    it('never lands on a Sunday', () => {
      for (let days = 1; days <= 21; days += 1) {
        expect(addWorkingDays(new Date('2026-08-10T09:00:00Z'), days).getDay()).not.toBe(0);
      }
    });
  });
});
