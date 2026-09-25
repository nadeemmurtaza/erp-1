import { Injectable, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ActionHubRegistryService } from '../../core/action-hub/action-hub-registry.service';
import type { ActionHubSource, ActionItem } from '../../core/action-hub/action-hub-source';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';

/**
 * The manager action hub's own worked example
 * (admin-platform/44-manager-action-hub.md WO-44.2) — the one source type
 * this codebase can register today, since every other named source
 * (timesheets, advances, expiring documents, support-access review) points
 * at a doc/model that does not exist yet (see `DECISIONS.md`'s
 * corresponding ADR). A `payroll.manage` holder sees every PENDING leave
 * request, exactly what `GET /admin/payroll/leave?status=PENDING` already
 * shows them today — the hub surfaces nothing new, only aggregates it.
 */
@Injectable()
export class LeaveRequestActionSource implements ActionHubSource, OnModuleInit {
  readonly id = 'payroll.leave-request';
  readonly kind = 'LEAVE_REQUEST';

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ActionHubRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async fetchFor(user: AuthenticatedUser): Promise<ActionItem[]> {
    if (!user.permissions.includes('payroll.manage')) return [];

    const requests = await this.prisma.leaveRequest.findMany({
      where: { status: 'PENDING' },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'asc' },
      take: 50, // per-source cap (44's own "a source over its cap paginates via its own href")
    });

    return requests.map((request) => {
      const name = [request.user.firstName, request.user.lastName].filter(Boolean).join(' ') || request.user.email || 'Unknown';
      return {
        id: `leave:${request.id}`,
        kind: this.kind,
        subjectEmployeeName: name,
        summary: `Leave request, ${request.days} day${request.days === 1 ? '' : 's'}, ${name}`,
        dueBy: request.startDate,
        href: '/admin/payroll/leave',
        permission: 'payroll.manage',
      };
    });
  }
}
