import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { ActionHubRegistryService } from '../../../core/action-hub/action-hub-registry.service';
import type { ActionHubSource, ActionItem } from '../../../core/action-hub/action-hub-source';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { SettingsService } from '../../../core/settings/settings.service';

/**
 * tasks-notifications-support/64-help-desk-support-ticketing.md (WO-64.4),
 * extended by tasks-notifications-support/148-external-customer-support-
 * portal.md's own "failure path" lens ("reusing doc 64's own registered
 * source rather than a second SLA mechanism") to also cover
 * `CustomerSupportTicket`. Registers into doc 44's own action-hub registry
 * rather than a bespoke SLA-breach mechanism. Two distinct things surface,
 * to two distinct audiences, across BOTH ticket kinds (tagged per item —
 * `kind: 'SUPPORT_TICKET'` vs `'CUSTOMER_SUPPORT_TICKET'` — so a queue
 * screen can filter by ticket type without a second source):
 *
 * 1. To a `support.tickets.handle` holder — every unassigned open ticket
 *    (something to grab), and every open ticket past the configured SLA
 *    window (something aging, assigned or not). A `CustomerSupportTicket`
 *    in `AWAITING_CUSTOMER` is never counted stale here — that clock is on
 *    the customer, not staff.
 * 2. To a `support.tickets.reassign` holder — every open ticket assigned
 *    to someone who no longer holds `support.tickets.handle` (the "grant
 *    that ends itself" lens: a deactivated or role-changed handler's open
 *    tickets are never left silently orphaned on them).
 */
@Injectable()
export class SupportTicketActionSource implements ActionHubSource, OnModuleInit {
  readonly id = 'support.tickets';
  readonly kind = 'SUPPORT_TICKET';

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly registry: ActionHubRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async fetchFor(user: AuthenticatedUser): Promise<ActionItem[]> {
    const items: ActionItem[] = [];
    const raiserNames = new Map<string, string>();
    const contactNames = new Map<string, string>();

    const nameOfUsers = async (userIds: string[]): Promise<void> => {
      const missing = userIds.filter((id) => !raiserNames.has(id));
      if (missing.length === 0) return;
      const users = await this.prisma.user.findMany({
        where: { id: { in: missing } },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      for (const u of users) {
        raiserNames.set(u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'Unknown');
      }
    };

    const nameOfContacts = async (contactIds: string[]): Promise<void> => {
      const missing = contactIds.filter((id) => !contactNames.has(id));
      if (missing.length === 0) return;
      const contacts = await this.prisma.contact.findMany({ where: { id: { in: missing } }, select: { id: true, name: true } });
      for (const c of contacts) contactNames.set(c.id, c.name);
    };

    if (user.permissions.includes('support.tickets.handle')) {
      const slaMinutes = await this.settings.get<number>(SettingKey.SupportTicketSlaMinutes);
      const staleBefore = new Date(Date.now() - slaMinutes * 60_000);

      const openTickets = await this.prisma.supportTicket.findMany({
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          OR: [{ assignedToUserId: null }, { createdAt: { lt: staleBefore } }],
        },
        orderBy: { createdAt: 'asc' },
        take: 50, // per-source cap (44's own "a source over its cap paginates via its own href")
      });

      await nameOfUsers(openTickets.map((t) => t.raisedByUserId));

      for (const ticket of openTickets) {
        const breaching = ticket.createdAt < staleBefore;
        items.push({
          id: `ticket:${ticket.id}`,
          kind: this.kind,
          subjectEmployeeName: raiserNames.get(ticket.raisedByUserId) ?? 'Unknown',
          summary: breaching
            ? `SLA breach — ${ticket.subject}`
            : `Unassigned — ${ticket.subject}`,
          dueBy: breaching ? ticket.createdAt : null,
          href: `/admin/support/tickets/${ticket.id}`,
          permission: 'support.tickets.handle',
        });
      }

      const openCustomerTickets = await this.prisma.customerSupportTicket.findMany({
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          OR: [{ assignedToUserId: null }, { createdAt: { lt: staleBefore } }],
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });

      await nameOfContacts(openCustomerTickets.map((t) => t.contactId));

      for (const ticket of openCustomerTickets) {
        const breaching = ticket.createdAt < staleBefore;
        items.push({
          id: `customer-ticket:${ticket.id}`,
          kind: 'CUSTOMER_SUPPORT_TICKET',
          subjectEmployeeName: contactNames.get(ticket.contactId) ?? 'Unknown',
          summary: breaching
            ? `SLA breach (customer) — ${ticket.subject}`
            : `Unassigned (customer) — ${ticket.subject}`,
          dueBy: breaching ? ticket.createdAt : null,
          href: `/admin/support/customer-tickets/${ticket.id}`,
          permission: 'support.tickets.handle',
        });
      }
    }

    if (user.permissions.includes('support.tickets.reassign')) {
      const assignedOpen = await this.prisma.supportTicket.findMany({
        where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, assignedToUserId: { not: null } },
        select: { id: true, subject: true, assignedToUserId: true, createdAt: true, raisedByUserId: true },
      });

      if (assignedOpen.length > 0) {
        const assigneeIds = [...new Set(assignedOpen.map((t) => t.assignedToUserId!))];
        const stillHandlers = await this.prisma.user.findMany({
          where: {
            id: { in: assigneeIds },
            roleAssignments: { some: { role: { grants: { some: { permission: { key: 'support.tickets.handle' } } } } } },
          },
          select: { id: true },
        });
        const stillHandlerIds = new Set(stillHandlers.map((u) => u.id));
        const orphaned = assignedOpen.filter((t) => !stillHandlerIds.has(t.assignedToUserId!)).slice(0, 50);

        await nameOfUsers(orphaned.map((t) => t.raisedByUserId));

        for (const ticket of orphaned) {
          items.push({
            id: `ticket-reassign:${ticket.id}`,
            kind: this.kind,
            subjectEmployeeName: raiserNames.get(ticket.raisedByUserId) ?? 'Unknown',
            summary: `Needs reassignment — ${ticket.subject}`,
            dueBy: ticket.createdAt,
            href: `/admin/support/tickets/${ticket.id}`,
            permission: 'support.tickets.reassign',
          });
        }
      }

      const assignedOpenCustomer = await this.prisma.customerSupportTicket.findMany({
        where: { status: { in: ['OPEN', 'IN_PROGRESS', 'AWAITING_CUSTOMER'] }, assignedToUserId: { not: null } },
        select: { id: true, subject: true, assignedToUserId: true, createdAt: true, contactId: true },
      });

      if (assignedOpenCustomer.length > 0) {
        const assigneeIds = [...new Set(assignedOpenCustomer.map((t) => t.assignedToUserId!))];
        const stillHandlers = await this.prisma.user.findMany({
          where: {
            id: { in: assigneeIds },
            roleAssignments: { some: { role: { grants: { some: { permission: { key: 'support.tickets.handle' } } } } } },
          },
          select: { id: true },
        });
        const stillHandlerIds = new Set(stillHandlers.map((u) => u.id));
        const orphaned = assignedOpenCustomer.filter((t) => !stillHandlerIds.has(t.assignedToUserId!)).slice(0, 50);

        await nameOfContacts(orphaned.map((t) => t.contactId));

        for (const ticket of orphaned) {
          items.push({
            id: `customer-ticket-reassign:${ticket.id}`,
            kind: 'CUSTOMER_SUPPORT_TICKET',
            subjectEmployeeName: contactNames.get(ticket.contactId) ?? 'Unknown',
            summary: `Needs reassignment (customer) — ${ticket.subject}`,
            dueBy: ticket.createdAt,
            href: `/admin/support/customer-tickets/${ticket.id}`,
            permission: 'support.tickets.reassign',
          });
        }
      }
    }

    return items;
  }
}
