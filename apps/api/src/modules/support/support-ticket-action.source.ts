import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { ActionHubRegistryService } from '../../core/action-hub/action-hub-registry.service';
import type { ActionHubSource, ActionItem } from '../../core/action-hub/action-hub-source';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { SettingsService } from '../../core/settings/settings.service';

/**
 * tasks-notifications-support/64-help-desk-support-ticketing.md (WO-64.4).
 * Registers into doc 44's own action-hub registry rather than a bespoke
 * SLA-breach mechanism. Two distinct things surface, to two distinct
 * audiences:
 *
 * 1. To a `support.tickets.handle` holder — every unassigned open ticket
 *    (something to grab), and every open ticket past the configured SLA
 *    window (something aging, assigned or not).
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

    const nameOf = async (userIds: string[]): Promise<void> => {
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

      await nameOf(openTickets.map((t) => t.raisedByUserId));

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

        await nameOf(orphaned.map((t) => t.raisedByUserId));

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
    }

    return items;
  }
}
