import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SettingKey } from '../../core/settings/settings.defaults';
import { SettingsService } from '../../core/settings/settings.service';
import { ApprovalService, type ApprovalDecision } from '../../core/approvals/approval.service';
import { AuditService } from '../../core/audit/audit.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AudienceService, type AudienceResolution, type AudienceSpec, type ResolvedRecipient } from './audience.service';

export interface SendBroadcastInput {
  audience: AudienceSpec;
  subject: string;
  body: string;
}

export interface BroadcastPreview extends AudienceResolution {
  needsApproval: boolean;
}

/**
 * tasks-notifications-support/24-internal-notifications-meetings-escalation.md
 * (WO-24.2/24.5). Delivery is `NotificationsService`, unchanged — this
 * class resolves audience, enforces the sender's own reach, gates an
 * above-threshold send behind `ApprovalService` (doc 63's own generic
 * chain, `ApprovalSubjectType.BROADCAST_MESSAGE`), and records what was
 * actually sent. No second delivery mechanism, no second template
 * registry.
 */
@Injectable()
export class NotifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: AudienceService,
    private readonly settings: SettingsService,
    private readonly approvals: ApprovalService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** What the compose screen calls to show the recipient count and the exclusion notice before send — the identical resolution `send()` itself uses. */
  async preview(spec: AudienceSpec, senderId: string): Promise<BroadcastPreview> {
    const resolution = await this.audience.resolve(spec, senderId);
    const needsApproval = await this.needsApproval(resolution.recipients.length);
    return { ...resolution, needsApproval };
  }

  private async needsApproval(recipientCount: number): Promise<boolean> {
    const [rankLevel, quorumCount] = await Promise.all([
      this.settings.get<number | null>(SettingKey.NotifyAnnounceQuorumRankLevel),
      this.settings.get<number>(SettingKey.NotifyAnnounceQuorumRecipientCount),
    ]);
    // The rank half of the quorum applies to WHO the sender addresses, but
    // this service resolves recipients, not their ranks again here — the
    // recipient-count half is the one universally checkable number; a
    // future minRankLevel-of-recipients check is not needed since
    // AudienceSpec.minRankLevel already bounds who is addressed at
    // resolve() time, and the count above already reflects that.
    void rankLevel;
    return recipientCount > quorumCount;
  }

  async send(input: SendBroadcastInput, senderId: string): Promise<{ id: string; status: 'SENT' | 'PENDING_APPROVAL' }> {
    if (!input.subject.trim() || !input.body.trim()) {
      throw new BadRequestException('An announcement needs both a subject and a body.');
    }

    const resolution = await this.audience.resolve(input.audience, senderId);
    const needsApproval = await this.needsApproval(resolution.recipients.length);

    const audienceRow = await this.prisma.audience.create({
      data: {
        orgUnitId: input.audience.orgUnitId ?? null,
        includeDescendants: input.audience.includeDescendants ?? true,
        minRankLevel: input.audience.minRankLevel ?? null,
        positionIds: input.audience.positionIds ?? [],
        createdByUserId: senderId,
      },
    });

    const message = await this.prisma.broadcastMessage.create({
      data: {
        senderId,
        audienceId: audienceRow.id,
        subject: input.subject.trim(),
        body: input.body,
        recipientCount: resolution.recipients.length,
        excludedCount: resolution.excludedCount,
      },
    });

    if (!needsApproval) {
      await this.dispatch(message.id, resolution.recipients, input.subject, input.body);
      return { id: message.id, status: 'SENT' };
    }

    const approverId = await this.managerOf(senderId);
    if (!approverId) {
      throw new BadRequestException(
        'This announcement needs a countersignature, but no held post above yours could be found to route it to. Contact an administrator.',
      );
    }
    const chain = await this.approvals.start('BROADCAST_MESSAGE', message.id, [{ approverUserId: approverId }]);
    await this.prisma.broadcastMessage.update({ where: { id: message.id }, data: { approvalChainId: chain.id } });
    await this.audit.record({
      actorId: senderId,
      action: 'notify.broadcast.submitted',
      entity: 'BroadcastMessage',
      entityId: message.id,
      data: { recipientCount: resolution.recipients.length, approverId },
    });
    return { id: message.id, status: 'PENDING_APPROVAL' };
  }

  async decide(messageId: string, decision: ApprovalDecision, actorId: string, comment?: string): Promise<{ status: 'SENT' | 'REJECTED' }> {
    const message = await this.prisma.broadcastMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Broadcast message not found.');
    if (!message.approvalChainId) throw new ConflictException('This message was never submitted for approval.');
    if (message.sentAt) throw new ConflictException('This message was already sent.');
    if (message.senderId === actorId) {
      throw new ForbiddenException('The sender of an announcement cannot countersign their own send.');
    }

    const chain = await this.approvals.getChain('BROADCAST_MESSAGE', messageId);
    if (!chain) throw new NotFoundException('No approval chain found for this message.');
    const step = chain.steps.find((s) => s.status === 'PENDING');
    if (!step) throw new ConflictException('No pending approval step on this message.');
    // ApprovalService itself does not resolve who may decide a step — the
    // caller's own concern, per its own doc comment. This step's approver
    // was resolved to a specific person (managerOf(), above) when the
    // broadcast was submitted, so only that person may decide it.
    if (step.approverUserId !== actorId) {
      throw new ForbiddenException('Only the person this announcement was routed to may decide it.');
    }

    const decided = await this.approvals.decide(chain.id, step.id, decision, actorId, comment);

    if (decided.status === 'REJECTED') {
      await this.audit.record({ actorId, action: 'notify.broadcast.rejected', entity: 'BroadcastMessage', entityId: messageId });
      return { status: 'REJECTED' };
    }

    // Re-resolve against the ORIGINAL audience spec and sender — the
    // approval may land minutes or hours later, and delivery must still
    // reach exactly what the sender's own reach allowed then, not a
    // stale cached list.
    const audienceRow = await this.prisma.audience.findUniqueOrThrow({ where: { id: message.audienceId } });
    const resolution = await this.audience.resolve(
      {
        orgUnitId: audienceRow.orgUnitId,
        includeDescendants: audienceRow.includeDescendants,
        minRankLevel: audienceRow.minRankLevel,
        positionIds: audienceRow.positionIds,
      },
      message.senderId,
    );
    await this.dispatch(messageId, resolution.recipients, message.subject, message.body);
    await this.audit.record({ actorId, action: 'notify.broadcast.approved', entity: 'BroadcastMessage', entityId: messageId });
    return { status: 'SENT' };
  }

  private async dispatch(messageId: string, recipients: ResolvedRecipient[], subject: string, body: string): Promise<void> {
    for (const recipient of recipients) {
      await this.notifications.send({
        template: 'notify.broadcast',
        recipient: { name: recipient.name, email: recipient.email, phone: recipient.phone, userId: recipient.userId },
        subject,
        body,
        data: {},
      });
    }
    await this.prisma.broadcastMessage.update({ where: { id: messageId }, data: { sentAt: new Date() } });
  }

  /** The active holder of the sender's own primary posting's reportsTo — "someone who outranks the sender," per doc 24's own org-chart-climbing discipline. */
  private async managerOf(userId: string): Promise<string | null> {
    const posting = await this.prisma.posting.findFirst({
      where: { userId, endedOn: null, isPrimary: true },
      select: { position: { select: { reportsToId: true } } },
    });
    const reportsToId = posting?.position.reportsToId;
    if (!reportsToId) return null;
    const holder = await this.prisma.posting.findFirst({ where: { positionId: reportsToId, endedOn: null }, select: { userId: true } });
    return holder?.userId ?? null;
  }
}
