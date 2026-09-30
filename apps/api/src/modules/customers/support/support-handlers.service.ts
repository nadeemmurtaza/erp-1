import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { PrismaService } from '../../../core/prisma/prisma.service';

export interface NotifyHandlersInput {
  ticketId: string;
  subject: string;
  /** Already lower-cased/formatted for the message body — callers own their own wording. */
  priorityLabel: string;
  template: string;
}

/**
 * Shared between `SupportTicketsService` (doc 64, internal) and
 * `CustomerSupportService` (doc 148, external) — both need the identical
 * "audience is a capability" resolution ("every current holder of
 * `support.tickets.handle`") and the identical assignee-eligibility check
 * ("does this user still hold it"), so this is one implementation, not
 * two. Extracted out of `SupportTicketsService` when doc 148 needed the
 * same two operations, rather than duplicated a second time.
 */
@Injectable()
export class SupportHandlersService {
  private readonly logger = new Logger(SupportHandlersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Whether `userId` currently holds permission `key` — role-grants only, the same deliberately simple query `credit-terms.service.ts`'s own `notifyHoldApplied()` already established (no `OrgUnitGrant`/`UserPermission` override resolution). */
  async holdsPermission(userId: string, key: string): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: { id: userId, roleAssignments: { some: { role: { grants: { some: { permission: { key } } } } } } },
    });
    return count > 0;
  }

  /** "Audience is a capability, not an address" — every current holder of `support.tickets.handle`, resolved fresh, never a hardcoded support address. A small holder set: a direct notification, not a digest. */
  async notifyHandlers(input: NotifyHandlersInput): Promise<void> {
    const holders = await this.prisma.user.findMany({
      where: { roleAssignments: { some: { role: { grants: { some: { permission: { key: 'support.tickets.handle' } } } } } } },
      select: { id: true, email: true, phone: true, firstName: true, lastName: true },
    });
    if (holders.length === 0) {
      this.logger.warn(`Ticket ${input.ticketId} raised, but nobody holds support.tickets.handle — no one was notified.`);
      return;
    }

    await Promise.all(
      holders.map((holder) =>
        this.notifications.send({
          template: input.template,
          recipient: {
            userId: holder.id,
            email: holder.email,
            phone: holder.phone,
            name: [holder.firstName, holder.lastName].filter(Boolean).join(' ') || null,
          },
          subject: `New ${input.priorityLabel} priority ticket: ${input.subject}`,
          body: `A new support ticket was raised: ${input.subject}`,
          data: { ticketId: input.ticketId },
        }),
      ),
    );
  }
}
