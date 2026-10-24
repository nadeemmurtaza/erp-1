import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { toMinor } from '@newax/shared';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { OutboxDispatcher } from '../src/core/events/outbox.dispatcher';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { SettingKey } from '../src/core/settings/settings.defaults';
import { SettingsService } from '../src/core/settings/settings.service';
import { shopDayKey } from '../src/core/time/shop-time';
import { CrmService } from '../src/modules/crm/crm.service';
import { setVariantStock } from './support/stock';

/**
 * The CRM.
 *
 * Two things here matter more than the rest: that one customer stays one
 * record however they reach the shop, and that their lifetime value is right
 * even when the same event is delivered twice — outbox delivery is
 * at-least-once, and a double-counted order quietly misleads the shop forever.
 */
describe('CRM (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let outbox: OutboxDispatcher;
  let crm: CrmService;
  let adminToken: string;
  let readyVariantId: string;
  let seededStock = 0;
  let todayLabel: string;

  const PHONE = '03331234567';
  const createdOrderIds: string[] = [];
  const createdContactIds: string[] = [];

  const ADDRESS = {
    fullName: 'Fatima Ali',
    phone: PHONE,
    line1: 'Plot 7, Gulberg',
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
    crm = app.get(CrmService);

    adminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'admin@yaseen.pk', password: 'admin12345' })
    ).body.accessToken;

    const variant = (
      await prisma.product.findFirstOrThrow({
        where: { slug: 'ready-kurta-white-cotton' },
        include: { variants: { orderBy: { order: 'asc' } } },
      })
    ).variants[0]!;
    readyVariantId = variant.id;
    seededStock = variant.stock;

    await setVariantStock(prisma, readyVariantId, 200);

    // The dashboard labels "today" in the shop's timezone (analytics.service.ts),
    // never UTC — see core/time/shop-time.ts. Matching that here, rather than
    // `new Date().toISOString()`, is what keeps this assertion correct
    // regardless of what UTC hour the suite happens to run at.
    const timeZone = await app.get(SettingsService).get<string>(SettingKey.StoreTimezone);
    todayLabel = shopDayKey(new Date(), timeZone);
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    // Deleting orders leaves the contacts' rollups overstated; put them right
    // so the development database is not left lying about its customers.
    for (const contact of await prisma.contact.findMany({ select: { id: true } })) {
      await crm.refreshOrderRollups(contact.id);
    }
    await prisma.contact.deleteMany({ where: { id: { in: createdContactIds } } });
    await prisma.contact.deleteMany({ where: { phoneE164: '+923331234567' } });
    await setVariantStock(prisma, readyVariantId, seededStock);
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  /** Places an order and drains the outbox so subscribers have run. */
  async function placeOrder(overrides: Partial<typeof ADDRESS> = {}) {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/cart/items')
      .send({ variantId: readyVariantId, quantity: 1 })
      .expect(201);

    const order = await agent
      .post('/api/v1/orders')
      .send({ shippingAddress: { ...ADDRESS, ...overrides }, paymentMethod: 'cod' })
      .expect(201);

    createdOrderIds.push(order.body.id);

    // The subscriber runs off the outbox, not inline with the request.
    await outbox.processBatch();
    return order.body;
  }

  describe('contacts from orders', () => {
    it('creates a contact the first time someone orders', async () => {
      const order = await placeOrder();

      const contact = await prisma.contact.findUnique({
        where: { phoneE164: '+923331234567' },
      });

      expect(contact).toBeTruthy();
      expect(contact!.name).toBe('Fatima Ali');
      expect(contact!.city).toBe('Lahore');
      expect(contact!.orderCount).toBe(1);
      expect(contact!.lifetimeValue).toBe(order.grandTotal);
      expect(contact!.status).toBe('ACTIVE');
    });

    it('collapses a differently written phone number onto the same record', async () => {
      // Same person, typed with spaces and the +92 prefix.
      await placeOrder({ phone: '+92 333 1234567' });

      const contacts = await prisma.contact.findMany({
        where: { phoneE164: '+923331234567' },
      });

      expect(contacts).toHaveLength(1);
      expect(contacts[0]!.orderCount).toBe(2);
      // Two orders makes them a repeat customer.
      expect(contacts[0]!.status).toBe('REPEAT');
    });

    it('sums lifetime value across their orders', async () => {
      const contact = await prisma.contact.findUniqueOrThrow({
        where: { phoneE164: '+923331234567' },
      });

      const orders = await prisma.order.findMany({
        where: { contactId: contact.id, status: { notIn: ['CANCELLED', 'RETURNED'] } },
      });
      const expected = orders.reduce((sum, order) => sum + order.grandTotal, 0);

      expect(contact.lifetimeValue).toBe(expected);
      expect(contact.avgOrderValue).toBe(Math.round(expected / orders.length));
    });

    it('does not double-count when the same event is delivered twice', async () => {
      const before = await prisma.contact.findUniqueOrThrow({
        where: { phoneE164: '+923331234567' },
      });

      // Replay every order.placed event for this contact, as a retry would.
      const events = await prisma.outboxEvent.findMany({
        where: { name: 'order.placed' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      await prisma.outboxEvent.updateMany({
        where: { id: { in: events.map((event) => event.id) } },
        data: { status: 'PENDING', availableAt: new Date() },
      });
      await outbox.processBatch();

      const after = await prisma.contact.findUniqueOrThrow({
        where: { phoneE164: '+923331234567' },
      });

      expect(after.orderCount).toBe(before.orderCount);
      expect(after.lifetimeValue).toBe(before.lifetimeValue);
    });

    it('drops a cancelled order out of the lifetime value', async () => {
      const order = await placeOrder();
      const contact = await prisma.contact.findUniqueOrThrow({
        where: { phoneE164: '+923331234567' },
      });
      const beforeValue = contact.lifetimeValue;

      await api()
        .post(`/api/v1/admin/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CANCELLED', note: 'Test cancellation' })
        .expect(201);
      await outbox.processBatch();

      const after = await prisma.contact.findUniqueOrThrow({
        where: { phoneE164: '+923331234567' },
      });
      expect(after.lifetimeValue).toBe(beforeValue - order.grandTotal);
    });
  });

  describe('contact records', () => {
    let contactId: string;

    beforeAll(async () => {
      contactId = (
        await prisma.contact.findUniqueOrThrow({ where: { phoneE164: '+923331234567' } })
      ).id;
    });

    it('lists contacts for staff and refuses customers', async () => {
      const customer = (
        await api()
          .post('/api/v1/auth/login')
          .send({ identifier: 'ayesha@example.com', password: 'customer12345' })
      ).body.accessToken;

      await api()
        .get('/api/v1/admin/crm/contacts')
        .set('Authorization', `Bearer ${customer}`)
        .expect(403);

      const response = await api()
        .get('/api/v1/admin/crm/contacts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('searches by phone number however it is typed', async () => {
      const response = await api()
        .get('/api/v1/admin/crm/contacts?q=333 1234567')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.map((row: { id: string }) => row.id)).toContain(contactId);
    });

    it('filters to repeat buyers', async () => {
      const response = await api()
        .get('/api/v1/admin/crm/contacts?minOrders=2')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      for (const contact of response.body.data) {
        expect(contact.orderCount).toBeGreaterThanOrEqual(2);
      }
    });

    it('shows the order history and lets staff log an interaction', async () => {
      const detail = await api()
        .get(`/api/v1/admin/crm/contacts/${contactId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(detail.body.orders.length).toBeGreaterThan(0);

      await api()
        .post('/api/v1/admin/crm/interactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          contactId,
          kind: 'WHATSAPP',
          body: 'Sent the new lawn catalogue.',
        })
        .expect(201);

      const withInteraction = await api()
        .get(`/api/v1/admin/crm/contacts/${contactId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(withInteraction.body.interactions[0].kind).toBe('WHATSAPP');
      expect(withInteraction.body.interactions[0].actor).toBeTruthy();
    });

    it('schedules a follow-up and surfaces it once it is due', async () => {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString();

      const created = await api()
        .post('/api/v1/admin/crm/follow-ups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contactId, note: 'Call about the bridal order', dueAt: yesterday })
        .expect(201);

      const due = await api()
        .get('/api/v1/admin/crm/follow-ups/due')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(due.body.map((task: { id: string }) => task.id)).toContain(created.body.id);

      await api()
        .post(`/api/v1/admin/crm/follow-ups/${created.body.id}/done`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      const after = await api()
        .get('/api/v1/admin/crm/follow-ups/due')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(after.body.map((task: { id: string }) => task.id)).not.toContain(
        created.body.id,
      );
    });

    it('tags a contact and filters by the tag', async () => {
      await api()
        .post(`/api/v1/admin/crm/contacts/${contactId}/tags`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bridal' })
        .expect(201);

      const filtered = await api()
        .get('/api/v1/admin/crm/contacts?tag=bridal')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(filtered.body.data.map((row: { id: string }) => row.id)).toContain(contactId);
    });

    it('exports the filtered list as CSV', async () => {
      const response = await api()
        .get('/api/v1/admin/crm/contacts/export?tag=bridal')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('name,phone,email');
      expect(response.text).toContain('+923331234567');
      // Rupees in the export, not paisa — people read this file.
      expect(response.text).not.toContain('00000');
    });
  });

  describe('leads', () => {
    it('takes a contact-form enquiry without an account', async () => {
      const response = await api()
        .post('/api/v1/crm/enquiries')
        .send({
          name: 'Hina Malik',
          phone: '03219998877',
          message: 'Do you stitch bridal lehengas?',
          source: 'contact_form',
        })
        .expect(201);

      expect(response.body.status).toBe('NEW');
      expect(response.body.phone).toBe('+923219998877');
    });

    it('attaches an enquiry from an existing customer to their record', async () => {
      const response = await api()
        .post('/api/v1/crm/enquiries')
        .send({ name: 'Fatima Ali', phone: PHONE, message: 'Any new khaddar?' })
        .expect(201);

      const contact = await prisma.contact.findUniqueOrThrow({
        where: { phoneE164: '+923331234567' },
      });
      expect(response.body.contactId).toBe(contact.id);
    });

    it('moves a lead through the pipeline', async () => {
      const lead = await api()
        .post('/api/v1/crm/enquiries')
        .send({ name: 'Pipeline Test', phone: '03005556666' })
        .expect(201);

      await api()
        .patch(`/api/v1/admin/crm/leads/${lead.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'QUOTED', quotedValue: toMinor(8500) })
        .expect(200);

      const quoted = await api()
        .get('/api/v1/admin/crm/leads?status=QUOTED')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const found = quoted.body.find((row: { id: string }) => row.id === lead.body.id);
      expect(found.quotedValue).toBe(toMinor(8500));

      await prisma.lead.delete({ where: { id: lead.body.id } });
    });
  });

  describe('dashboard', () => {
    it('reports sales, attention items and a continuous chart series', async () => {
      const response = await api()
        .get('/api/v1/admin/analytics/dashboard?days=30')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body;

      expect(body.month.orders).toBeGreaterThan(0);
      expect(body.month.revenue).toBeGreaterThan(0);
      expect(body.customers.total).toBeGreaterThan(0);
      expect(body.catalogue.live).toBeGreaterThan(0);

      // One point per day, even on days with no orders.
      expect(body.salesSeries).toHaveLength(30);
      expect(body.salesSeries[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(body.salesSeries.at(-1).date).toBe(todayLabel);

      expect(body.topProducts.length).toBeGreaterThan(0);
      expect(typeof body.needsAttention.pendingOrders).toBe('number');
    });

    it('refuses a customer', async () => {
      const customer = (
        await api()
          .post('/api/v1/auth/login')
          .send({ identifier: 'ayesha@example.com', password: 'customer12345' })
      ).body.accessToken;

      await api()
        .get('/api/v1/admin/analytics/dashboard')
        .set('Authorization', `Bearer ${customer}`)
        .expect(403);
    });
  });

  describe('backfill', () => {
    it('attaches orders that predate the CRM and is safe to re-run', async () => {
      const order = await placeOrder({ phone: '03216667777', fullName: 'Backfill Test' });

      // Pretend this order was placed before the CRM existed.
      await prisma.order.update({
        where: { id: order.id },
        data: { contactId: null },
      });

      const first = await api()
        .post('/api/v1/admin/crm/backfill')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      expect(first.body.linked).toBeGreaterThanOrEqual(1);

      const linked = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(linked.contactId).toBeTruthy();
      createdContactIds.push(linked.contactId!);

      // Running it again finds nothing left to link.
      const second = await api()
        .post('/api/v1/admin/crm/backfill')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      expect(second.body.linked).toBe(0);
    });

    it('repairs a rollup left stale by orders removed outside the app', async () => {
      const order = await placeOrder({ phone: '03217778888', fullName: 'Stale Rollup' });
      const contact = await prisma.contact.findFirstOrThrow({
        where: { phoneE164: '+923217778888' },
      });
      createdContactIds.push(contact.id);
      expect(contact.orderCount).toBe(1);

      // Delete the order directly, as a database cleanup would. The app itself
      // cancels orders rather than deleting them, and cancelling refreshes.
      await prisma.order.delete({ where: { id: order.id } });

      await api()
        .post('/api/v1/admin/crm/backfill')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      const repaired = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
      expect(repaired.orderCount).toBe(0);
      expect(repaired.lifetimeValue).toBe(0);
    });
  });
});
