import { createHmac } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WhatsAppAssistantService } from './whatsapp-assistant.service';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { AppConfigService } from '../../../../core/config/app-config.service';
import { AiService } from '../../../../core/ai/ai.service';
import { WhatsAppChannel } from '../../../../core/notifications/whatsapp.channel';
import { CrmService } from '../crm.service';

const SECRET = 'test-secret';
const CONTACT = { id: 'contact1', name: 'Sana', phoneE164: '+923001234567' };
const CONVERSATION = {
  id: 'conv1',
  contactId: CONTACT.id,
  phoneE164: CONTACT.phoneE164,
  handedOffToHuman: false,
  handoffReason: null,
  handedOffAt: null,
};

function sign(rawBody: string, timestamp: string): string {
  return createHmac('sha256', SECRET).update(`${timestamp}.${rawBody}`).digest('hex');
}

describe('WhatsAppAssistantService', () => {
  let service: WhatsAppAssistantService;
  let prisma: any;
  let config: any;
  let crm: any;
  let ai: any;
  let whatsapp: any;

  beforeEach(async () => {
    prisma = {
      whatsAppMessage: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({}) },
      whatsAppConversation: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg())),
    };

    config = { get: jest.fn((key: string) => (key === 'WHATSAPP_WEBHOOK_SECRET' ? SECRET : 'http://shop.test')) };
    crm = { findContactByPhone: jest.fn() };
    ai = { isAvailable: jest.fn().mockReturnValue(true), complete: jest.fn() };
    whatsapp = { send: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppAssistantService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: config },
        { provide: CrmService, useValue: crm },
        { provide: AiService, useValue: ai },
        { provide: WhatsAppChannel, useValue: whatsapp },
      ],
    }).compile();

    service = module.get(WhatsAppAssistantService);
  });

  describe('verifyWebhookSignature', () => {
    it('accepts a correctly signed body', () => {
      const timestamp = '1700000000';
      const body = '{"from":"+923001234567","body":"hi"}';
      expect(service.verifyWebhookSignature(body, timestamp, sign(body, timestamp))).toBe(true);
    });

    it('rejects a tampered body', () => {
      const timestamp = '1700000000';
      const body = '{"from":"+923001234567","body":"hi"}';
      const badSignature = sign('{"from":"+923001234567","body":"bye"}', timestamp);
      expect(service.verifyWebhookSignature(body, timestamp, badSignature)).toBe(false);
    });

    it('fails closed when WHATSAPP_WEBHOOK_SECRET is not configured', () => {
      config.get.mockReturnValue(undefined);
      expect(service.verifyWebhookSignature('{}', '123', 'anything')).toBe(false);
    });

    it('rejects a missing timestamp or signature', () => {
      expect(service.verifyWebhookSignature('{}', undefined, 'sig')).toBe(false);
      expect(service.verifyWebhookSignature('{}', '123', undefined)).toBe(false);
    });
  });

  describe('handleInbound — identity', () => {
    it('never touches the database for an unrecognised phone number, and sends only the fixed generic reply', async () => {
      crm.findContactByPhone.mockResolvedValue(null);

      await service.handleInbound({ from: '+923001234567', body: 'Where is my order?' });

      expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
      expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
      expect(whatsapp.send).toHaveBeenCalledTimes(1);
      expect(whatsapp.send).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'whatsapp.assistant_unrecognised' }),
      );
      expect(ai.complete).not.toHaveBeenCalled();
    });

    it('drops a message from an unparseable phone number without calling the AI or the CRM', async () => {
      await service.handleInbound({ from: 'not-a-phone', body: 'hi' });

      expect(crm.findContactByPhone).not.toHaveBeenCalled();
      expect(whatsapp.send).not.toHaveBeenCalled();
    });
  });

  describe('handleInbound — idempotency', () => {
    it('is a no-op when the externalMessageId was already logged (redelivered webhook)', async () => {
      crm.findContactByPhone.mockResolvedValue(CONTACT);
      prisma.whatsAppMessage.findUnique.mockResolvedValue({ id: 'already-logged' });

      await service.handleInbound({ from: CONTACT.phoneE164, body: 'hi', externalMessageId: 'wamid.123' });

      expect(prisma.whatsAppConversation.findFirst).not.toHaveBeenCalled();
      expect(whatsapp.send).not.toHaveBeenCalled();
    });
  });

  describe('handleInbound — deterministic handoff triggers', () => {
    beforeEach(() => {
      crm.findContactByPhone.mockResolvedValue(CONTACT);
      prisma.whatsAppConversation.findFirst.mockResolvedValue(CONVERSATION);
    });

    it.each(['I want a refund', 'yeh complaint hai', 'can I talk to a human', 'please cancel my order', 'can I get a discount'])(
      'hands off on "%s" without ever calling the AI',
      async (body) => {
        await service.handleInbound({ from: CONTACT.phoneE164, body });

        expect(ai.complete).not.toHaveBeenCalled();
        expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ handedOffToHuman: true }) }),
        );
        expect(whatsapp.send).toHaveBeenCalledWith(
          expect.objectContaining({ template: 'whatsapp.assistant_handoff' }),
        );
      },
    );
  });

  describe('handleInbound — already handed off', () => {
    it('logs the message but never auto-replies once a conversation is handed off', async () => {
      crm.findContactByPhone.mockResolvedValue(CONTACT);
      prisma.whatsAppConversation.findFirst.mockResolvedValue({ ...CONVERSATION, handedOffToHuman: true });

      await service.handleInbound({ from: CONTACT.phoneE164, body: 'Any update?' });

      expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ direction: 'INBOUND' }) }),
      );
      expect(ai.complete).not.toHaveBeenCalled();
      expect(whatsapp.send).not.toHaveBeenCalled();
    });
  });

  describe('handleInbound — AI degradation', () => {
    beforeEach(() => {
      crm.findContactByPhone.mockResolvedValue(CONTACT);
      prisma.whatsAppConversation.findFirst.mockResolvedValue(CONVERSATION);
    });

    it('hands off when no AI provider is available', async () => {
      ai.isAvailable.mockReturnValue(false);

      await service.handleInbound({ from: CONTACT.phoneE164, body: 'What is the status of my order?' });

      expect(ai.complete).not.toHaveBeenCalled();
      expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ handedOffToHuman: true }) }),
      );
    });

    it('hands off when the AI call itself fails (returns null)', async () => {
      ai.complete.mockResolvedValue(null);

      await service.handleInbound({ from: CONTACT.phoneE164, body: 'What is the status of my order?' });

      expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ handedOffToHuman: true }) }),
      );
    });

    it('hands off when the model asks to hand off', async () => {
      ai.complete.mockResolvedValue({
        text: JSON.stringify({ reply: '', handoff: true, handoffReason: 'Customer is upset about quality.' }),
        inputTokens: 10,
        outputTokens: 5,
        model: 'test',
      });

      await service.handleInbound({ from: CONTACT.phoneE164, body: 'This is terrible quality' });

      expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ handedOffToHuman: true }) }),
      );
      expect(whatsapp.send).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'whatsapp.assistant_handoff' }),
      );
    });

    it('hands off on unparseable model output rather than forwarding it verbatim', async () => {
      ai.complete.mockResolvedValue({ text: 'Sure thing! Here you go.', inputTokens: 10, outputTokens: 5, model: 'test' });

      await service.handleInbound({ from: CONTACT.phoneE164, body: 'What is the status of my order?' });

      expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ handedOffToHuman: true }) }),
      );
      expect(whatsapp.send).not.toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('Sure thing') }),
      );
    });

    it('sends the assistant reply and logs it as AI-generated when the model answers safely', async () => {
      ai.complete.mockResolvedValue({
        text: JSON.stringify({ reply: 'Your order YSN-2026-0001 is out for delivery.', handoff: false, handoffReason: null }),
        inputTokens: 10,
        outputTokens: 5,
        model: 'test',
      });

      await service.handleInbound({ from: CONTACT.phoneE164, body: 'Where is my order?' });

      expect(prisma.whatsAppConversation.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ handedOffToHuman: true }) }),
      );
      expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ direction: 'OUTBOUND', aiGenerated: true }),
        }),
      );
      expect(whatsapp.send).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'whatsapp.assistant_reply', body: 'Your order YSN-2026-0001 is out for delivery.' }),
      );
    });

    it('extracts a JSON object even when the model wraps it in prose', async () => {
      ai.complete.mockResolvedValue({
        text: 'Here is my answer:\n{"reply":"On its way!","handoff":false,"handoffReason":null}\nHope that helps.',
        inputTokens: 10,
        outputTokens: 5,
        model: 'test',
      });

      await service.handleInbound({ from: CONTACT.phoneE164, body: 'Where is my order?' });

      expect(whatsapp.send).toHaveBeenCalledWith(expect.objectContaining({ body: 'On its way!' }));
    });
  });

  describe('grounding — never fetches another contact', () => {
    it('scopes the order lookup to exactly this contact', async () => {
      crm.findContactByPhone.mockResolvedValue(CONTACT);
      prisma.whatsAppConversation.findFirst.mockResolvedValue(CONVERSATION);
      ai.complete.mockResolvedValue({
        text: JSON.stringify({ reply: 'ok', handoff: false, handoffReason: null }),
        inputTokens: 1,
        outputTokens: 1,
        model: 'test',
      });

      await service.handleInbound({ from: CONTACT.phoneE164, body: 'status?' });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { contactId: CONTACT.id } }),
      );
    });
  });

  describe('staffReply', () => {
    it('hands the conversation off and sends over the WhatsApp channel', async () => {
      prisma.whatsAppConversation.findUnique.mockResolvedValue({ ...CONVERSATION, messages: [] });

      await service.staffReply('conv1', 'Refund processed, sorry for the trouble.');

      expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ handedOffToHuman: true }) }),
      );
      expect(whatsapp.send).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'whatsapp.staff_reply', recipient: { phone: CONTACT.phoneE164 } }),
      );
    });

    it('throws for a conversation that does not exist', async () => {
      prisma.whatsAppConversation.findUnique.mockResolvedValue(null);
      await expect(service.staffReply('missing', 'hi')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reopen', () => {
    it('clears the handoff so the assistant can resume', async () => {
      prisma.whatsAppConversation.findUnique.mockResolvedValue({ ...CONVERSATION, handedOffToHuman: true, messages: [] });

      await service.reopen('conv1');

      expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith({
        where: { id: 'conv1' },
        data: { handedOffToHuman: false, handoffReason: null, handedOffAt: null },
      });
    });
  });
});
