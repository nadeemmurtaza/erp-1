import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { DomainEvent, type PostingEndedPayload } from '../../core/events/domain-events';

/**
 * WO-23.4 — doc 23's own rule: "It does not silently reassign." A posting
 * ending means a User stops holding a Position; every OPEN/IN_PROGRESS/
 * BLOCKED task still assigned to that user AT THAT post is left at the
 * post — never moved, never deleted — and simply marked unclaimed
 * (`assigneeUserId: null`). A human picks it up from there (TaskService's
 * own `unclaimedForReports()`, the screen for the post's `reportsTo`).
 *
 * Idempotent on a redelivered PostingEnded by construction, not by a
 * dedup table: the `where` clause below only ever matches tasks still
 * assigned to the ended posting's own user, so a retry after a successful
 * run finds nothing left to unclaim and no-ops.
 */
@Injectable()
export class TaskLeaverListener {
  private readonly logger = new Logger(TaskLeaverListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @OnDomainEvent(DomainEvent.PostingEnded)
  async onPostingEnded(payload: PostingEndedPayload): Promise<void> {
    const openTasks = await this.prisma.task.findMany({
      where: {
        positionId: payload.positionId,
        assigneeUserId: payload.userId,
        state: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] },
      },
      select: { id: true },
    });
    if (openTasks.length === 0) return;

    const taskIds = openTasks.map((t) => t.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.task.updateMany({ where: { id: { in: taskIds } }, data: { assigneeUserId: null } });
      await this.audit.recordEvidence(
        tx,
        taskIds.map((taskId) => ({
          actorId: null,
          action: 'task.unclaimed',
          entity: 'Task',
          entityId: taskId,
          data: { reason: 'posting_ended', postingId: payload.postingId, previousAssigneeUserId: payload.userId },
        })),
      );
    });

    this.logger.log(
      `Unclaimed ${taskIds.length} open task(s) at position ${payload.positionId} — posting ${payload.postingId} (user ${payload.userId}) ended.`,
    );
  }
}
