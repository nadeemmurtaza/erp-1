import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { EventBusService } from '../../../core/events/event-bus.service';
import { DomainEvent } from '../../../core/events/domain-events';
import { EmailChannel } from '../../../core/notifications/email.channel';
import { paginated, type PaginatedResult } from '../../../core/common/dto/pagination.dto';
import { CrmService } from '../crm.service';
import type { InboundEmail, Prisma } from '../../../core/prisma/client';

export interface IngestedMessage {
  messageId: string;
  inReplyTo: string | null;
  fromAddress: string;
  fromName: string | null;
  subject: string | null;
  bodyText: string | null;
  receivedAt: Date;
}

const inboundEmailInclude = {
  contact: { select: { id: true, name: true, phoneE164: true, email: true } },
  emailAccount: { select: { id: true, label: true, purpose: true } },
  _count: { select: { replies: true } },
} satisfies Prisma.InboundEmailInclude;

/** get() only — a list row has no reason to carry every reply's full body. */
const inboundEmailDetailInclude = {
  ...inboundEmailInclude,
  replies: {
    orderBy: { sentAt: 'asc' },
    include: { actor: { select: { id: true, firstName: true, lastName: true } } },
  },
} satisfies Prisma.InboundEmailInclude;

/**
 * Support Inbox: messages the mailbox poller (mailbox-poller.cron.ts) pulled
 * from a connected mailbox, plus the staff-facing triage actions (list,
 * inspect, link to a contact) on top of them.
 *
 * ingestMessage() is the one entry point that ever creates a row — the poller
 * calls it for every fetched message, and it is safe to call twice with the
 * same messageId (InboundEmail's unique constraint makes a re-ingest a
 * no-op), which is what makes an at-least-once IMAP poll safe.
 */
@Injectable()
export class EmailInboxService {
  private readonly logger = new Logger(EmailInboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
    private readonly eventBus: EventBusService,
    private readonly emailChannel: EmailChannel,
  ) {}

  async ingestMessage(
    emailAccountId: string,
    message: IngestedMessage,
  ): Promise<{ inboundEmail: InboundEmail; created: boolean }> {
    const existing = await this.prisma.inboundEmail.findUnique({
      where: { emailAccountId_messageId: { emailAccountId, messageId: message.messageId } },
    });
    if (existing) return { inboundEmail: existing, created: false };

    const contact = await this.crm.findContactByEmail(message.fromAddress);

    const inboundEmail = await this.prisma.$transaction(async (tx) => {
      const row = await tx.inboundEmail.create({
        data: {
          emailAccountId,
          messageId: message.messageId,
          inReplyTo: message.inReplyTo,
          fromAddress: message.fromAddress,
          fromName: message.fromName,
          subject: message.subject,
          bodyText: message.bodyText,
          receivedAt: message.receivedAt,
          contactId: contact?.id ?? null,
        },
      });

      let linked = row;
      if (contact) {
        const interaction = await tx.interaction.create({
          data: {
            contactId: contact.id,
            kind: 'EMAIL',
            body: summarize(message),
            actorId: null,
            occurredAt: message.receivedAt,
          },
        });
        linked = await tx.inboundEmail.update({
          where: { id: row.id },
          data: { interactionId: interaction.id },
        });
      }

      await this.eventBus.publish(
        DomainEvent.EmailReplyReceived,
        {
          inboundEmailId: linked.id,
          emailAccountId,
          contactId: contact?.id ?? null,
          fromAddress: message.fromAddress,
        },
        tx,
      );

      return linked;
    });

    if (contact) {
      this.logger.log(`Inbound email from ${message.fromAddress} auto-linked to contact ${contact.id}`);
    }
    return { inboundEmail, created: true };
  }

  async list(query: {
    page: number;
    pageSize: number;
    skip: number;
    take: number;
    linked?: boolean;
  }): Promise<PaginatedResult<unknown>> {
    const where: Prisma.InboundEmailWhereInput =
      query.linked === undefined ? {} : query.linked ? { contactId: { not: null } } : { contactId: null };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inboundEmail.findMany({
        where,
        include: inboundEmailInclude,
        orderBy: { receivedAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.inboundEmail.count({ where }),
    ]);

    return paginated(rows, total, query);
  }

  async get(id: string) {
    const row = await this.prisma.inboundEmail.findUnique({
      where: { id },
      include: inboundEmailDetailInclude,
    });
    if (!row) throw new NotFoundException('That message no longer exists.');
    return row;
  }

  /** Manually links an orphan message to a contact, creating the Interaction staff would otherwise log by hand. */
  async link(actorId: string, id: string, contactId: string) {
    const row = await this.findOrThrow(id);
    if (row.interactionId) return this.get(id);

    await this.prisma.$transaction(async (tx) => {
      const interaction = await tx.interaction.create({
        data: {
          contactId,
          kind: 'EMAIL',
          body: summarize(row),
          actorId,
          occurredAt: row.receivedAt,
        },
      });
      await tx.inboundEmail.update({
        where: { id },
        data: { contactId, interactionId: interaction.id },
      });
    });

    return this.get(id);
  }

  /**
   * Sends a staff reply over the same mailbox the message arrived at,
   * threaded back into the customer's existing conversation, and records it
   * — both as its own InboundEmailReply row (the inbox thread view) and, when
   * the sender is a known contact, as an Interaction on their timeline
   * (actorId set = staff-authored, matching how a customer's own inbound
   * message logs one with actorId null).
   */
  async reply(actorId: string, id: string, body: string) {
    const row = await this.findOrThrow(id);

    const subject = row.subject?.trim()
      ? /^re:/i.test(row.subject.trim())
        ? row.subject.trim()
        : `Re: ${row.subject.trim()}`
      : 'Re: your message';

    await this.emailChannel.sendReply(row.emailAccountId, {
      to: row.fromAddress,
      toName: row.fromName,
      subject,
      body,
      inReplyTo: row.messageId,
      references: [row.messageId],
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.inboundEmailReply.create({ data: { inboundEmailId: id, actorId, body } });
      if (row.contactId) {
        await tx.interaction.create({
          data: {
            contactId: row.contactId,
            kind: 'EMAIL',
            body: `Reply sent:\n\n${body}`,
            actorId,
            occurredAt: new Date(),
          },
        });
      }
    });

    this.logger.log(`Reply sent for inbound email ${id}`);
    return this.get(id);
  }

  private async findOrThrow(id: string): Promise<InboundEmail> {
    const row = await this.prisma.inboundEmail.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('That message no longer exists.');
    return row;
  }
}

function summarize(message: { subject: string | null; bodyText: string | null }): string {
  const subject = message.subject?.trim() || '(no subject)';
  const body = message.bodyText?.trim() ?? '';
  const excerpt = body.length > 500 ? `${body.slice(0, 500)}…` : body;
  return excerpt ? `${subject}\n\n${excerpt}` : subject;
}
