import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

export interface AudienceSpec {
  orgUnitId?: string | null;
  includeDescendants?: boolean;
  minRankLevel?: number | null;
  positionIds?: string[];
}

export interface ResolvedRecipient {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface AudienceResolution {
  recipients: ResolvedRecipient[];
  /** How many the requested audience would have reached before the sender's own reach narrowed it. */
  requestedCount: number;
  /** requestedCount - recipients.length — what the sender's own reach excluded. */
  excludedCount: number;
}

/**
 * tasks-notifications-support/24-internal-notifications-meetings-escalation.md
 * (WO-24.1). Resolution is one function, called by both the compose
 * screen's own preview and the real send, so a "who will receive this"
 * preview and the actual send can never disagree — the same discipline
 * `GrantService.previewIssue()`/`issue()` already establish for org-tree
 * grants (access-control-identity/21-access-over-the-org-tree.md).
 *
 * Reads `Posting`/`Position`/`Rank`/`OrgUnit` directly by Prisma query —
 * same pack (core), no cross-module service import — the identical
 * no-coupling shape `AttendanceService`'s own header comment already
 * documents for reading `hr`'s tables.
 */
@Injectable()
export class AudienceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The sender's own OrgUnit reach — the union of subtrees rooted at every
   * open Posting they hold. No posting at all is unrestricted (null),
   * matching `GrantService.reachOf()`'s own reasoning: the one account
   * that exists on a fresh deployment (ADMIN) holds no posting, and an
   * "empty reach by default" reading would make it unable to ever send.
   */
  private async reachOf(userId: string): Promise<string[] | null> {
    const postings = await this.prisma.posting.findMany({
      where: { userId, endedOn: null },
      select: { position: { select: { orgUnitId: true } } },
    });
    if (postings.length === 0) return null;
    return [...new Set(postings.map((p) => p.position.orgUnitId))];
  }

  /** Every OrgUnit id the spec names, before the sender's own reach narrows it. */
  private async requestedUnitIds(spec: AudienceSpec): Promise<string[] | null> {
    if (!spec.orgUnitId) return null; // whole organization
    if (spec.includeDescendants === false) return [spec.orgUnitId];
    const units = await this.prisma.orgUnit.findMany({
      where: { path: { has: spec.orgUnitId } },
      select: { id: true },
    });
    return units.map((u) => u.id);
  }

  async resolve(spec: AudienceSpec, senderId: string): Promise<AudienceResolution> {
    const reach = await this.reachOf(senderId);
    const requestedUnitIds = await this.requestedUnitIds(spec);

    // Every active posting the spec's own position/unit/rank filters match,
    // BEFORE reach narrows it — this is what "requestedCount" reports.
    const requested = await this.prisma.posting.findMany({
      where: {
        endedOn: null,
        position: {
          ...(requestedUnitIds ? { orgUnitId: { in: requestedUnitIds } } : {}),
          ...(spec.positionIds?.length ? { id: { in: spec.positionIds } } : {}),
          ...(spec.minRankLevel != null ? { rank: { level: { gte: spec.minRankLevel } } } : {}),
        },
      },
      select: {
        userId: true,
        position: { select: { orgUnitId: true } },
        user: { select: { firstName: true, lastName: true, email: true, phone: true } },
      },
    });

    const inReach = reach === null ? requested : requested.filter((p) => reach.includes(p.position.orgUnitId));

    const byUser = new Map<string, ResolvedRecipient>();
    for (const p of inReach) {
      if (byUser.has(p.userId)) continue;
      const name = [p.user.firstName, p.user.lastName].filter(Boolean).join(' ') || null;
      byUser.set(p.userId, { userId: p.userId, name, email: p.user.email, phone: p.user.phone });
    }

    const requestedUserCount = new Set(requested.map((p) => p.userId)).size;
    return {
      recipients: [...byUser.values()],
      requestedCount: requestedUserCount,
      excludedCount: Math.max(0, requestedUserCount - byUser.size),
    };
  }
}
