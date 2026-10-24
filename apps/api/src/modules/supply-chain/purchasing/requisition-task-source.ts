import { Injectable, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { TaskSourceRegistry, type TaskSourceCreateInput } from '../../../core/extension-points/task-source.registry';
import { DomainEvent, type RequisitionCreatedPayload } from '../../../core/events/domain-events';

/**
 * WO-23.3's own real, single demonstration registration: `purchasing.
 * requisition_created` -> a task at the requester's own manager's post.
 *
 * Deliberately NOT a replacement for RequisitionService's existing
 * ApprovalService chain (`purchasing.requisitions.approve`) — that chain
 * lets ANYONE holding the permission decide the requisition, org-chart-
 * blind by design (152-purchase-requisition.md). This is a second,
 * complementary signal scoped by the ORG CHART specifically: "my own
 * manager sees I raised this," which the flat permission-based chain
 * cannot express on its own. Closing this task confers no approval
 * authority over the requisition itself — doc 23's own "the threshold
 * nobody approves alone" scope lens is explicit that a task which
 * *triggers* something is the trigger's problem, never this module's.
 *
 * Reads `Posting`/`Position` (hr's own tables) by a direct Prisma query,
 * never a TypeScript import of `hr` — the same cross-schema-read-not-a-
 * coupling pattern GrantService already establishes (DECISIONS.md
 * ADR-045). Degrades gracefully when hr/orgstructure hold no data for this
 * user (no open posting, or no reportsTo) — `toTask()` returns null and no
 * task is created, the "absent collaborator" shape doc 23's own scope
 * lenses name.
 */
@Injectable()
export class RequisitionTaskSource implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: TaskSourceRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      eventName: DomainEvent.RequisitionCreated,
      toTask: (payload) => this.toTask(payload as RequisitionCreatedPayload),
    });
  }

  private async toTask(payload: RequisitionCreatedPayload): Promise<TaskSourceCreateInput | null> {
    const posting = await this.prisma.posting.findFirst({
      where: { userId: payload.requestedById, isPrimary: true, endedOn: null },
      select: { position: { select: { id: true, reportsToId: true } } },
    });
    const managerPositionId = posting?.position.reportsToId;
    if (!managerPositionId) return null; // no posting, or the requester's own post reports to nobody — nothing to route to

    return {
      title: 'Review a purchase requisition',
      detail: `Requested by user ${payload.requestedById} for location ${payload.locationId}.`,
      positionId: managerPositionId,
      sourceType: 'purchasing',
      sourceId: payload.requisitionId,
      sourceRef: payload.requisitionId,
    };
  }
}
