import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { EscalationRule } from '../../core/prisma/client';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002';
}

/**
 * tasks-notifications-support/24-internal-notifications-meetings-escalation.md
 * (WO-24.4). The timer that makes a stalled task visible. Watches Task
 * rows (tasks.prisma) by Task.sourceType — the identical (type, id)
 * convention doc 23 already uses for its own event intake — so this
 * module imports no module it escalates for and no module imports this
 * one; the relation is a bare `taskId` scalar, never a Prisma relation.
 *
 * Two rules, per the document's own text: it climbs POSTS, not people (a
 * vacant post costs no step, it is skipped for free to its own
 * reportsTo — the leaver case, handled by construction); and every rule
 * has a ceiling and a fire count, so escalation cannot become a nightly
 * page to an executive who has learned to filter it.
 */
@Injectable()
export class EscalationCron {
  private readonly logger = new Logger(EscalationCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('*/10 * * * *')
  async run(): Promise<void> {
    const rules = await this.prisma.escalationRule.findMany();
    for (const rule of rules) {
      await this.processRule(rule);
    }
  }

  private async processRule(rule: EscalationRule): Promise<void> {
    const tasks = await this.prisma.task.findMany({
      where: { sourceType: rule.sourceType, state: { notIn: ['DONE', 'CANCELLED'] } },
      include: { transitions: { orderBy: { occurredAt: 'desc' }, take: 1 } },
    });

    for (const task of tasks) {
      const lastFire = await this.prisma.escalationFire.findFirst({
        where: { taskId: task.id },
        orderBy: { fireNumber: 'desc' },
      });
      const fireNumber = (lastFire?.fireNumber ?? 0) + 1;
      if (fireNumber > rule.maxFires) continue;

      const referenceTime = lastFire?.firedAt ?? task.transitions[0]?.occurredAt ?? task.createdAt;
      const staleMs = Date.now() - referenceTime.getTime();
      if (staleMs < rule.afterMinutes * 60_000) continue;

      const targetPositionId = await this.climb(task.positionId, rule.stepsPerFire, rule.ceilingRankLevel);
      if (!targetPositionId) continue;

      try {
        await this.prisma.escalationFire.create({
          data: { taskId: task.id, ruleId: rule.id, fireNumber, climbedToPositionId: targetPositionId },
        });
      } catch (error) {
        if (isUniqueViolation(error)) continue; // another tick already fired this one
        throw error;
      }

      await this.notifyHolder(targetPositionId, task.id, task.title, fireNumber);
      this.logger.log(`Escalated task ${task.id} (fire ${fireNumber}/${rule.maxFires}) to position ${targetPositionId}`);
    }
  }

  /**
   * Climbs `steps` rungs of Position.reportsTo, skipping a vacant post for
   * free (it costs no step) and stopping — returning null — at the root
   * with no reportsTo left, or the moment a rung's own rank exceeds the
   * ceiling. Returns the position actually reached, whether or not it is
   * itself held (the caller resolves the current holder separately).
   */
  private async climb(startPositionId: string, steps: number, ceilingRankLevel: number | null): Promise<string | null> {
    let currentId = startPositionId;
    let satisfied = 0;

    while (satisfied < steps) {
      const current = await this.prisma.position.findUnique({
        where: { id: currentId },
        select: { reportsToId: true },
      });
      if (!current?.reportsToId) return null;
      currentId = current.reportsToId;

      if (ceilingRankLevel != null) {
        const target = await this.prisma.position.findUnique({ where: { id: currentId }, select: { rank: { select: { level: true } } } });
        if (target && target.rank.level > ceilingRankLevel) return null;
      }

      const holder = await this.prisma.posting.findFirst({ where: { positionId: currentId, endedOn: null } });
      if (holder) satisfied += 1;
    }

    return currentId;
  }

  private async notifyHolder(positionId: string, taskId: string, taskTitle: string, fireNumber: number): Promise<void> {
    const holder = await this.prisma.posting.findFirst({
      where: { positionId, endedOn: null },
      select: { userId: true },
    });
    if (!holder) return; // climb() already requires a held post to count a step, but the post could have just been vacated

    const user = await this.prisma.user.findUnique({
      where: { id: holder.userId },
      select: { firstName: true, lastName: true, email: true, phone: true },
    });
    if (!user) return;

    await this.notifications.send({
      template: 'notify.escalation',
      recipient: {
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
        email: user.email,
        phone: user.phone,
        userId: holder.userId,
      },
      subject: `Escalation: "${taskTitle}" needs attention`,
      body: `A task assigned below you has had no update and has been escalated to you (escalation ${fireNumber}). This message was sent automatically.`,
      data: { taskId, fireNumber },
    });
  }
}
