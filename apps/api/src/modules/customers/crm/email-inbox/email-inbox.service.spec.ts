import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EmailInboxService } from './email-inbox.service';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { EventBusService } from '../../../../core/events/event-bus.service';
import { EmailChannel } from '../../../../core/notifications/email.channel';
import { CrmService } from '../crm.service';

describe('EmailInboxService', () => {
  let service: EmailInboxService;
  let prisma: any;
  let crm: any;
  let eventBus: any;
  let emailChannel: any;

  const row = (overrides: Partial<any> = {}) => ({
    id: 'msg1',
    emailAccountId: 'acct1',
    messageId: '<abc@mail>',
    inReplyTo: null,
    fromAddress: 'customer@example.com',
    fromName: 'Sana',
    subject: 'Where is my order?',
    bodyText: 'Hi, any update?',
    receivedAt: new Date(),
    contactId: null,
    interactionId: null,
    ...overrides,
  });

  beforeEach(async () => {
    const tx = {
      inboundEmailReply: { create: jest.fn().mockResolvedValue({}) },
      interaction: { create: jest.fn().mockResolvedValue({ id: 'int1' }) },
    };

    prisma = {
      inboundEmail: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (arg: any) => {
        if (typeof arg === 'function') return arg(tx);
        return Promise.all(arg);
      }),
      __tx: tx,
    };

    crm = { findContactByEmail: jest.fn() };
    eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
    emailChannel = { sendReply: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailInboxService,
        { provide: PrismaService, useValue: prisma },
        { provide: CrmService, useValue: crm },
        { provide: EventBusService, useValue: eventBus },
        { provide: EmailChannel, useValue: emailChannel },
      ],
    }).compile();

    service = module.get<EmailInboxService>(EmailInboxService);
    jest.spyOn(service, 'get').mockResolvedValue({ id: 'msg1' } as any);
  });

  describe('reply', () => {
    it('sends via the exact emailAccountId the message arrived at', async () => {
      prisma.inboundEmail.findUnique.mockResolvedValue(row());

      await service.reply('staff1', 'msg1', 'On its way!');

      expect(emailChannel.sendReply).toHaveBeenCalledWith(
        'acct1',
        expect.objectContaining({
          to: 'customer@example.com',
          toName: 'Sana',
          inReplyTo: '<abc@mail>',
          references: ['<abc@mail>'],
        }),
      );
    });

    it('creates an InboundEmailReply row', async () => {
      prisma.inboundEmail.findUnique.mockResolvedValue(row());

      await service.reply('staff1', 'msg1', 'On its way!');

      expect(prisma.__tx.inboundEmailReply.create).toHaveBeenCalledWith({
        data: { inboundEmailId: 'msg1', actorId: 'staff1', body: 'On its way!' },
      });
    });

    it('creates an Interaction only when contactId is set', async () => {
      prisma.inboundEmail.findUnique.mockResolvedValue(row({ contactId: null }));

      await service.reply('staff1', 'msg1', 'On its way!');

      expect(prisma.__tx.interaction.create).not.toHaveBeenCalled();
    });

    it('creates an Interaction on the linked contact when contactId is set', async () => {
      prisma.inboundEmail.findUnique.mockResolvedValue(row({ contactId: 'contact1' }));

      await service.reply('staff1', 'msg1', 'On its way!');

      expect(prisma.__tx.interaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ contactId: 'contact1', actorId: 'staff1', kind: 'EMAIL' }),
      });
    });

    it('prefixes the subject with Re: when not already a reply', async () => {
      prisma.inboundEmail.findUnique.mockResolvedValue(row({ subject: 'Where is my order?' }));

      await service.reply('staff1', 'msg1', 'On its way!');

      expect(emailChannel.sendReply).toHaveBeenCalledWith(
        'acct1',
        expect.objectContaining({ subject: 'Re: Where is my order?' }),
      );
    });

    it('does not double-prefix a subject that already starts with Re:', async () => {
      prisma.inboundEmail.findUnique.mockResolvedValue(row({ subject: 'Re: Where is my order?' }));

      await service.reply('staff1', 'msg1', 'On its way!');

      expect(emailChannel.sendReply).toHaveBeenCalledWith(
        'acct1',
        expect.objectContaining({ subject: 'Re: Where is my order?' }),
      );
    });

    it('throws NotFoundException for a message that does not exist', async () => {
      prisma.inboundEmail.findUnique.mockResolvedValue(null);

      await expect(service.reply('staff1', 'missing', 'body')).rejects.toThrow(NotFoundException);
      expect(emailChannel.sendReply).not.toHaveBeenCalled();
    });
  });
});
