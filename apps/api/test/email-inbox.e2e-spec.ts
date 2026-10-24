import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { EmailInboxService } from '../src/modules/customers/crm/email-inbox/email-inbox.service';

/**
 * The Support Inbox: what the mailbox poller writes when it pulls a reply
 * from a connected mailbox (mailbox-poller.cron.ts), and what staff see in
 * the admin screen built on top of it.
 *
 * The poller itself needs a live IMAP server, so it is not exercised here —
 * ingestMessage() is the part that matters and is IMAP-agnostic, taking an
 * already-parsed message. That is what these tests call directly.
 */
describe('Email inbox (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let inbox: EmailInboxService;
  let adminToken: string;
  let emailAccountId: string;
  let contactId: string;

  const createdInboundEmailIds: string[] = [];

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
    inbox = app.get(EmailInboxService);

    adminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'admin@yaseen.pk', password: 'admin12345' })
    ).body.accessToken;

    const account = await prisma.emailAccount.create({
      data: {
        label: 'Test inbox account',
        purpose: 'SUPPORT',
        fromName: 'Yaseen Support',
        fromEmail: 'support@yaseen.test',
        smtpHost: 'smtp.example.test',
        smtpPort: 587,
        smtpUser: 'support@yaseen.test',
        smtpPasswordEncrypted: 'unused:unused:unused',
        imapHost: 'imap.example.test',
        imapPort: 993,
        imapUser: 'support@yaseen.test',
        imapPasswordEncrypted: 'unused:unused:unused',
      },
    });
    emailAccountId = account.id;

    const contact = await prisma.contact.create({
      data: { name: 'Reply Test Customer', email: 'reply-test-customer@example.com' },
    });
    contactId = contact.id;
  });

  afterAll(async () => {
    await prisma.inboundEmail.deleteMany({ where: { emailAccountId } });
    await prisma.interaction.deleteMany({ where: { contactId } });
    await prisma.contact.delete({ where: { id: contactId } });
    await prisma.emailAccount.delete({ where: { id: emailAccountId } });
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  function message(overrides: Partial<Parameters<EmailInboxService['ingestMessage']>[1]> = {}) {
    return {
      messageId: `<msg-${Math.random().toString(36).slice(2)}@example.test>`,
      inReplyTo: null,
      fromAddress: 'reply-test-customer@example.com',
      fromName: 'Reply Test Customer',
      subject: 'Re: your order',
      bodyText: 'Where is my order?',
      receivedAt: new Date(),
      ...overrides,
    };
  }

  describe('ingestMessage', () => {
    it('auto-links a message from a known contact and logs an interaction', async () => {
      const msg = message();
      const { inboundEmail, created } = await inbox.ingestMessage(emailAccountId, msg);
      createdInboundEmailIds.push(inboundEmail.id);

      expect(created).toBe(true);
      expect(inboundEmail.contactId).toBe(contactId);
      expect(inboundEmail.interactionId).toBeTruthy();

      const interaction = await prisma.interaction.findUnique({
        where: { id: inboundEmail.interactionId! },
      });
      expect(interaction).toBeTruthy();
      expect(interaction!.kind).toBe('EMAIL');
      expect(interaction!.actorId).toBeNull();
      expect(interaction!.body).toContain('Where is my order?');
    });

    it('is a no-op the second time the same message is ingested', async () => {
      const msg = message();
      const first = await inbox.ingestMessage(emailAccountId, msg);
      createdInboundEmailIds.push(first.inboundEmail.id);

      const second = await inbox.ingestMessage(emailAccountId, msg);

      expect(second.created).toBe(false);
      expect(second.inboundEmail.id).toBe(first.inboundEmail.id);

      const rows = await prisma.inboundEmail.findMany({
        where: { emailAccountId, messageId: msg.messageId },
      });
      expect(rows).toHaveLength(1);
    });

    it('stores a message from an unrecognised sender unlinked, without creating a contact', async () => {
      const msg = message({
        fromAddress: 'stranger@example.com',
        fromName: 'Stranger',
      });
      const { inboundEmail } = await inbox.ingestMessage(emailAccountId, msg);
      createdInboundEmailIds.push(inboundEmail.id);

      expect(inboundEmail.contactId).toBeNull();
      expect(inboundEmail.interactionId).toBeNull();

      const contact = await prisma.contact.findUnique({ where: { email: 'stranger@example.com' } });
      expect(contact).toBeNull();
    });
  });

  describe('admin API', () => {
    it('refuses a customer', async () => {
      const customer = (
        await api()
          .post('/api/v1/auth/login')
          .send({ identifier: 'ayesha@example.com', password: 'customer12345' })
      ).body.accessToken;

      await api()
        .get('/api/v1/admin/crm/inbox')
        .set('Authorization', `Bearer ${customer}`)
        .expect(403);
    });

    it('lists messages and filters to unlinked ones', async () => {
      const stranger = message({ fromAddress: 'unlinked-list-test@example.com' });
      const { inboundEmail: unlinked } = await inbox.ingestMessage(emailAccountId, stranger);
      createdInboundEmailIds.push(unlinked.id);

      const all = await api()
        .get('/api/v1/admin/crm/inbox')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(all.body.data.map((row: { id: string }) => row.id)).toContain(unlinked.id);

      const unlinkedOnly = await api()
        .get('/api/v1/admin/crm/inbox?linked=false')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(unlinkedOnly.body.data.map((row: { id: string }) => row.id)).toContain(unlinked.id);
      for (const row of unlinkedOnly.body.data) {
        expect(row.contact).toBeNull();
      }

      const linkedOnly = await api()
        .get('/api/v1/admin/crm/inbox?linked=true')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(linkedOnly.body.data.map((row: { id: string }) => row.id)).not.toContain(unlinked.id);
    });

    it('fetches one message by id', async () => {
      const msg = message();
      const { inboundEmail } = await inbox.ingestMessage(emailAccountId, msg);
      createdInboundEmailIds.push(inboundEmail.id);

      const response = await api()
        .get(`/api/v1/admin/crm/inbox/${inboundEmail.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.subject).toBe(msg.subject);
    });

    it('lets staff link an unrecognised sender to a contact', async () => {
      const msg = message({ fromAddress: 'link-me@example.com' });
      const { inboundEmail } = await inbox.ingestMessage(emailAccountId, msg);
      createdInboundEmailIds.push(inboundEmail.id);
      expect(inboundEmail.contactId).toBeNull();

      const linked = await api()
        .post(`/api/v1/admin/crm/inbox/${inboundEmail.id}/link`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contactId })
        .expect(201);

      expect(linked.body.contact.id).toBe(contactId);

      const interaction = await prisma.interaction.findUnique({
        where: { id: linked.body.interactionId },
      });
      expect(interaction).toBeTruthy();
      expect(interaction!.contactId).toBe(contactId);
    });
  });
});
