import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { AuditService } from '../../../core/audit/audit.service';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  CustomerSupportMessage,
  CustomerSupportTicket,
  CustomerTicketStatus,
  Prisma,
  TicketPriority,
} from '../../../core/prisma/client';
import { CrmService } from '../crm/crm.service';
import { SupportHandlersService } from './support-handlers.service';

export interface RaiseCustomerTicketInput {
  userId: string;
  subject: string;
  category: string;
  body: string;
  orderId?: string | null;
  priority?: TicketPriority;
}

export interface CustomerTicketMessageView extends CustomerSupportMessage {
  authorName: string;
}

export interface CustomerTicketDetail extends CustomerSupportTicket {
  contactName: string;
  assignedToName: string | null;
  messages: CustomerTicketMessageView[];
}

export interface CustomerTicketListRow extends CustomerSupportTicket {
  contactName: string;
}

/** The document's own state machine (§1): forward-only, RESOLVED -> IN_PROGRESS the one allowed backward move, plus AWAITING_CUSTOMER as the one extra holding state doc 64's internal ticket never needed. */
const ALLOWED_TRANSITIONS: Record<CustomerTicketStatus, CustomerTicketStatus[]> = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['AWAITING_CUSTOMER', 'RESOLVED'],
  AWAITING_CUSTOMER: ['IN_PROGRESS'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

/**
 * tasks-notifications-support/148-external-customer-support-portal.md
 * (WO-148.2). The requester is `Contact`, never `User` — resolved from
 * the authenticated customer's own session via `Contact.userId`, never a
 * separate customer principal. `raise()`/`replyAsCustomer()` are the
 * customer side of the trust boundary; `replyAsStaff()`/`assign()`/
 * `transition()` reuse doc 64's own staff permissions
 * (`support.tickets.handle`/`.view_all`/`.reassign`) unchanged, via the
 * shared `SupportHandlersService`.
 *
 * `reply()` is deliberately two methods, not the document's own single
 * sketched one — `replyAsCustomer()` and `replyAsStaff()` — since the two
 * sides of the trust boundary need genuinely different visibility checks
 * (contact ownership vs. staff assignment/permission), and one method
 * branching on `authorType` would blur that distinction rather than state
 * it. See DECISIONS.md ADR-065.
 */
@Injectable()
export class CustomerSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
    private readonly handlers: SupportHandlersService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Finds-or-creates the caller's own `Contact` (`CrmService.upsertContact()`,
   * the `support -> crm` coupling — same-transaction reasoning as
   * `purchasing -> parties`) and creates the ticket with its opening
   * message in one transaction, so a ticket never exists without its
   * Contact or its first message.
   */
  async raise(input: RaiseCustomerTicketInput): Promise<CustomerSupportTicket> {
    if (!input.subject.trim()) throw new BadRequestException('A ticket needs a subject.');
    if (!input.category.trim()) throw new BadRequestException('A ticket needs a category.');
    if (!input.body.trim()) throw new BadRequestException('A ticket needs an opening message.');

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { firstName: true, lastName: true, email: true, phone: true },
    });
    if (!user) throw new NotFoundException('Account not found.');

    const contact = await this.crm.upsertContact({
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Customer',
      email: user.email,
      phone: user.phone,
      userId: input.userId,
      source: 'support-portal',
    });

    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customerSupportTicket.create({
        data: {
          contactId: contact.id,
          orderId: input.orderId ?? null,
          subject: input.subject,
          category: input.category,
          priority: input.priority ?? 'NORMAL',
        },
      });
      await tx.customerSupportMessage.create({
        data: { ticketId: created.id, authorType: 'CUSTOMER', contactId: contact.id, body: input.body },
      });
      return created;
    });

    await this.audit.record({ actorId: input.userId, action: 'support.customer_ticket.raised', entity: 'CustomerSupportTicket', entityId: ticket.id });
    await this.handlers.notifyHandlers({
      ticketId: ticket.id,
      subject: ticket.subject,
      priorityLabel: ticket.priority.toLowerCase(),
      template: 'support.customer_ticket_raised',
    });
    return ticket;
  }

  /** A customer replying while AWAITING_CUSTOMER resumes the SLA clock automatically — their own answer is what that state was waiting for. */
  async replyAsCustomer(ticketId: string, userId: string, body: string): Promise<CustomerSupportMessage> {
    if (!body.trim()) throw new BadRequestException('A reply needs a body.');
    const contactId = await this.contactIdFor(userId);
    const ticket = await this.prisma.customerSupportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket || !contactId || ticket.contactId !== contactId) throw new NotFoundException('Ticket not found.');

    const message = await this.prisma.customerSupportMessage.create({
      data: { ticketId, authorType: 'CUSTOMER', contactId, body },
    });
    if (ticket.status === 'AWAITING_CUSTOMER') {
      await this.prisma.customerSupportTicket.update({ where: { id: ticketId }, data: { status: 'IN_PROGRESS' } });
    }
    return message;
  }

  /** Visible to the assignee or a `support.tickets.view_all` holder — same staff visibility rule as `assign()`/`transition()`. Notifies the customer through their own resolved contact channel, never a hardcoded address. */
  async replyAsStaff(ticketId: string, body: string, actor: AuthenticatedUser): Promise<CustomerSupportMessage> {
    if (!body.trim()) throw new BadRequestException('A reply needs a body.');
    const ticket = await this.findVisibleToStaff(ticketId, actor);

    const message = await this.prisma.customerSupportMessage.create({
      data: { ticketId, authorType: 'STAFF', userId: actor.id, body },
    });
    await this.notifyCustomer(ticket, body);
    return message;
  }

  /** Gated at the route by `support.tickets.reassign` — identical split to doc 64's own `assign()`. */
  async assign(ticketId: string, assigneeUserId: string, actorId: string): Promise<CustomerSupportTicket> {
    const ticket = await this.prisma.customerSupportTicket.findUnique({ where: { id: ticketId }, select: { assignedToUserId: true } });
    if (!ticket) throw new NotFoundException('Ticket not found.');

    const eligible = await this.handlers.holdsPermission(assigneeUserId, 'support.tickets.handle');
    if (!eligible) throw new BadRequestException('The assignee must hold support.tickets.handle.');

    const updated = await this.prisma.customerSupportTicket.update({ where: { id: ticketId }, data: { assignedToUserId: assigneeUserId } });
    await this.audit.record({
      actorId,
      action: 'support.customer_ticket.assigned',
      entity: 'CustomerSupportTicket',
      entityId: ticketId,
      data: { from: ticket.assignedToUserId, to: assigneeUserId },
    });
    return updated;
  }

  /** The assignee or a `support.tickets.reassign` holder may move a ticket forward; the customer themselves may also reopen (RESOLVED -> IN_PROGRESS) — the identical "the requester reopens because the issue recurred" reasoning doc 64 already establishes, extended to the customer side. */
  async transition(ticketId: string, next: CustomerTicketStatus, actor: AuthenticatedUser): Promise<CustomerSupportTicket> {
    const ticket = await this.prisma.customerSupportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found.');

    const allowed = ALLOWED_TRANSITIONS[ticket.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(`A ticket cannot move from ${ticket.status} to ${next}.`);
    }

    const isReopen = ticket.status === 'RESOLVED' && next === 'IN_PROGRESS';
    let canAct = actor.permissions.includes('support.tickets.reassign') || ticket.assignedToUserId === actor.id;
    if (!canAct && isReopen) {
      const contactId = await this.contactIdFor(actor.id);
      canAct = contactId !== null && contactId === ticket.contactId;
    }
    if (!canAct) {
      throw new ForbiddenException('Only the assignee, someone who can reassign tickets, or (to reopen) the customer who raised it may change this status.');
    }

    const data: Prisma.CustomerSupportTicketUpdateInput = { status: next };
    if (next === 'RESOLVED') data.resolvedAt = new Date();
    if (isReopen) data.resolvedAt = null;

    const updated = await this.prisma.customerSupportTicket.update({ where: { id: ticketId }, data });
    await this.audit.record({
      actorId: actor.id,
      action: 'support.customer_ticket.status_changed',
      entity: 'CustomerSupportTicket',
      entityId: ticketId,
      data: { from: ticket.status, to: next },
    });
    return updated;
  }

  /**
   * `support.tickets.view_all` sees every customer ticket; everyone else
   * sees only what is assigned to them — never "raised by," since staff
   * never raise a customer ticket. Batches the `Contact` name lookup for
   * every row in one query rather than one per ticket, so triaging a
   * hundred-row queue costs one extra round trip, not a hundred.
   */
  async listForStaff(actor: AuthenticatedUser, options?: { status?: CustomerTicketStatus }): Promise<CustomerTicketListRow[]> {
    const where: Prisma.CustomerSupportTicketWhereInput = {
      ...(options?.status ? { status: options.status } : {}),
      ...(actor.permissions.includes('support.tickets.view_all') ? {} : { assignedToUserId: actor.id }),
    };
    const tickets = await this.prisma.customerSupportTicket.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    if (tickets.length === 0) return [];

    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: [...new Set(tickets.map((t) => t.contactId))] } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(contacts.map((c) => [c.id, c.name]));
    return tickets.map((t) => ({ ...t, contactName: nameOf.get(t.contactId) ?? 'Unknown' }));
  }

  /** Every ticket the caller's own Contact raised — the opposite direction from the staff queue, `contactId`-scoped, never a broader organizational visibility rule. */
  async listMine(userId: string): Promise<CustomerSupportTicket[]> {
    const contactId = await this.contactIdFor(userId);
    if (!contactId) return [];
    return this.prisma.customerSupportTicket.findMany({ where: { contactId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async getForStaff(ticketId: string, actor: AuthenticatedUser): Promise<CustomerTicketDetail> {
    const ticket = await this.findVisibleToStaff(ticketId, actor);
    return this.enrich(ticket);
  }

  /** 404 rather than 403 for a ticket outside the caller's own Contact, so its existence is never confirmed to another customer. */
  async getForCustomer(ticketId: string, userId: string): Promise<CustomerTicketDetail> {
    const contactId = await this.contactIdFor(userId);
    const ticket = await this.prisma.customerSupportTicket.findUnique({
      where: { id: ticketId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket || !contactId || ticket.contactId !== contactId) throw new NotFoundException('Ticket not found.');
    return this.enrich(ticket);
  }

  private async findVisibleToStaff(
    ticketId: string,
    actor: AuthenticatedUser,
  ): Promise<CustomerSupportTicket & { messages: CustomerSupportMessage[] }> {
    const ticket = await this.prisma.customerSupportTicket.findUnique({
      where: { id: ticketId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) throw new NotFoundException('Ticket not found.');

    const visible = actor.permissions.includes('support.tickets.view_all') || ticket.assignedToUserId === actor.id;
    if (!visible) throw new NotFoundException('Ticket not found.');

    return ticket;
  }

  private async enrich(ticket: CustomerSupportTicket & { messages: CustomerSupportMessage[] }): Promise<CustomerTicketDetail> {
    const userIds = new Set<string>();
    if (ticket.assignedToUserId) userIds.add(ticket.assignedToUserId);
    for (const m of ticket.messages) if (m.userId) userIds.add(m.userId);

    const [contact, users] = await Promise.all([
      this.prisma.contact.findUnique({ where: { id: ticket.contactId }, select: { name: true } }),
      userIds.size > 0
        ? this.prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, firstName: true, lastName: true, email: true } })
        : Promise.resolve([]),
    ]);
    const userNameOf = new Map(users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'Unknown']));
    const contactName = contact?.name ?? 'Unknown';

    return {
      ...ticket,
      contactName,
      assignedToName: ticket.assignedToUserId ? (userNameOf.get(ticket.assignedToUserId) ?? 'Unknown') : null,
      messages: ticket.messages.map((m) => ({
        ...m,
        authorName: m.authorType === 'CUSTOMER' ? contactName : m.userId ? (userNameOf.get(m.userId) ?? 'Unknown') : 'Unknown',
      })),
    };
  }

  /** Whatever channel the customer's own contact preferences already specify (email/SMS/WhatsApp), resolved through `NotificationsService` unchanged — never a hardcoded address. Every Contact this service ever touches has `userId` set (raise() always passes one to `upsertContact()`), so this is the identical `userId`-keyed resolution any other staff-to-customer notification already uses. */
  private async notifyCustomer(ticket: CustomerSupportTicket, replyBody: string): Promise<void> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: ticket.contactId },
      select: { userId: true, email: true, phoneE164: true, name: true },
    });
    if (!contact) return;

    await this.notifications.send({
      template: 'support.customer_ticket_reply',
      recipient: { userId: contact.userId, email: contact.email, phone: contact.phoneE164, name: contact.name },
      subject: `Update on your ticket: ${ticket.subject}`,
      body: replyBody,
      data: { ticketId: ticket.id },
    });
  }

  private async contactIdFor(userId: string): Promise<string | null> {
    const contact = await this.prisma.contact.findUnique({ where: { userId } });
    return contact?.id ?? null;
  }
}
