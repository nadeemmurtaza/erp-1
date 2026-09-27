import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma, SupportTicket, TicketMessage, TicketPriority, TicketStatus } from '../../core/prisma/client';
import { SupportHandlersService } from './support-handlers.service';

export interface CreateTicketInput {
  raisedByUserId: string;
  subject: string;
  category: string;
  priority?: TicketPriority;
}

/** A raw scalar `authorId`/`assignedToUserId` never reaches an admin screen unresolved — the same `withLabels()` discipline DECISIONS.md ADR-061 already applies to a bundle's component variant id. */
export interface TicketMessageView extends TicketMessage {
  authorName: string;
}

export interface TicketDetail extends SupportTicket {
  raisedByName: string;
  assignedToName: string | null;
  messages: TicketMessageView[];
}

/** WO-64.1's own state machine: forward-only, RESOLVED -> IN_PROGRESS the one allowed backward move. */
const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

/**
 * tasks-notifications-support/64-help-desk-support-ticketing.md (WO-64.2).
 * An in-app help desk — internal only (raisedByUserId/assignedToUserId/
 * TicketMessage.authorId are all `User`, never `Contact`/`Party`; the
 * external customer-facing portal is doc 148's own, separate work).
 * Reuses `NotificationsService` unchanged for the "new ticket" ping and
 * `AuditService` for every state change — no second delivery mechanism,
 * no second audit trail.
 */
@Injectable()
export class SupportTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly handlers: SupportHandlersService,
  ) {}

  async create(input: CreateTicketInput): Promise<SupportTicket> {
    if (!input.subject.trim()) throw new BadRequestException('A ticket needs a subject.');
    if (!input.category.trim()) throw new BadRequestException('A ticket needs a category.');

    const ticket = await this.prisma.supportTicket.create({
      data: {
        raisedByUserId: input.raisedByUserId,
        subject: input.subject,
        category: input.category,
        priority: input.priority ?? 'NORMAL',
      },
    });
    await this.audit.record({ actorId: input.raisedByUserId, action: 'support.ticket.raised', entity: 'SupportTicket', entityId: ticket.id });
    await this.handlers.notifyHandlers({
      ticketId: ticket.id,
      subject: ticket.subject,
      priorityLabel: ticket.priority.toLowerCase(),
      template: 'support.ticket_raised',
    });
    return ticket;
  }

  /** Same visibility rule `get()` and `list()` use: if you cannot see it, you cannot reply on it. */
  async reply(ticketId: string, body: string, actor: AuthenticatedUser): Promise<TicketMessage> {
    if (!body.trim()) throw new BadRequestException('A reply needs a body.');
    const ticket = await this.findVisible(ticketId, actor);
    return this.prisma.ticketMessage.create({ data: { ticketId: ticket.id, authorId: actor.id, body } });
  }

  /** Gated at the route by `support.tickets.reassign` — the caller's own authority to reassign at all. This only validates the TARGET holds `support.tickets.handle`, a data rule, not an authority check on the caller. */
  async assign(ticketId: string, assigneeUserId: string, actorId: string): Promise<SupportTicket> {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { assignedToUserId: true } });
    if (!ticket) throw new NotFoundException('Ticket not found.');

    const eligible = await this.handlers.holdsPermission(assigneeUserId, 'support.tickets.handle');
    if (!eligible) throw new BadRequestException('The assignee must hold support.tickets.handle.');

    const updated = await this.prisma.supportTicket.update({ where: { id: ticketId }, data: { assignedToUserId: assigneeUserId } });
    await this.audit.record({
      actorId,
      action: 'support.ticket.assigned',
      entity: 'SupportTicket',
      entityId: ticketId,
      data: { from: ticket.assignedToUserId, to: assigneeUserId },
    });
    return updated;
  }

  /**
   * Who may move a ticket: the current assignee, or anyone holding
   * `support.tickets.reassign` (the same broad override that may act on
   * any ticket) — and for the one backward move (RESOLVED -> IN_PROGRESS),
   * the requester too, since reopening because the issue recurred is
   * their own call to make.
   */
  async transition(ticketId: string, next: TicketStatus, actor: AuthenticatedUser): Promise<SupportTicket> {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found.');

    const allowed = ALLOWED_TRANSITIONS[ticket.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(`A ticket cannot move from ${ticket.status} to ${next}.`);
    }

    const isReopen = ticket.status === 'RESOLVED' && next === 'IN_PROGRESS';
    const canAct =
      actor.permissions.includes('support.tickets.reassign') ||
      ticket.assignedToUserId === actor.id ||
      (isReopen && ticket.raisedByUserId === actor.id);
    if (!canAct) {
      throw new ForbiddenException('Only the assignee, someone who can reassign tickets, or (to reopen) the requester may change this status.');
    }

    const data: Prisma.SupportTicketUpdateInput = { status: next };
    if (next === 'RESOLVED') data.resolvedAt = new Date();
    if (isReopen) data.resolvedAt = null;

    const updated = await this.prisma.supportTicket.update({ where: { id: ticketId }, data });
    await this.audit.record({
      actorId: actor.id,
      action: 'support.ticket.status_changed',
      entity: 'SupportTicket',
      entityId: ticketId,
      data: { from: ticket.status, to: next },
    });
    return updated;
  }

  /** `support.tickets.view_all` sees every ticket; everyone else sees only what they raised or were assigned. */
  async list(actor: AuthenticatedUser, options?: { status?: TicketStatus }): Promise<SupportTicket[]> {
    const where: Prisma.SupportTicketWhereInput = {
      ...(options?.status ? { status: options.status } : {}),
      ...(actor.permissions.includes('support.tickets.view_all')
        ? {}
        : { OR: [{ raisedByUserId: actor.id }, { assignedToUserId: actor.id }] }),
    };
    return this.prisma.supportTicket.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  /** 404 rather than 403 for a ticket outside the caller's own visibility, so its existence is never confirmed to someone outside it. Enriched with resolved names — `raisedByUserId`/`assignedToUserId`/`TicketMessage.authorId` are bare scalars, so a raw id never reaches the admin screen unresolved. */
  async get(ticketId: string, actor: AuthenticatedUser): Promise<TicketDetail> {
    const ticket = await this.findVisible(ticketId, actor);

    const userIds = new Set<string>([ticket.raisedByUserId, ...ticket.messages.map((m) => m.authorId)]);
    if (ticket.assignedToUserId) userIds.add(ticket.assignedToUserId);

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const nameOf = new Map(users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'Unknown']));

    return {
      ...ticket,
      raisedByName: nameOf.get(ticket.raisedByUserId) ?? 'Unknown',
      assignedToName: ticket.assignedToUserId ? (nameOf.get(ticket.assignedToUserId) ?? 'Unknown') : null,
      messages: ticket.messages.map((m) => ({ ...m, authorName: nameOf.get(m.authorId) ?? 'Unknown' })),
    };
  }

  /** The shared existence+visibility check `get()` and `reply()` both need — no name resolution, so a reply's own visibility check does not pay for a lookup it never uses. */
  private async findVisible(ticketId: string, actor: AuthenticatedUser): Promise<SupportTicket & { messages: TicketMessage[] }> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) throw new NotFoundException('Ticket not found.');

    const visible =
      ticket.raisedByUserId === actor.id ||
      ticket.assignedToUserId === actor.id ||
      actor.permissions.includes('support.tickets.view_all');
    if (!visible) throw new NotFoundException('Ticket not found.');

    return ticket;
  }

}
