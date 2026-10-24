import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../../core/audit/audit.service';
import { DomainEvent } from '../../../core/events/domain-events';
import { EventBusService } from '../../../core/events/event-bus.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { Bulletin, BulletinCategory } from '../../../core/prisma/client';
import { AudienceService } from './audience.service';

export interface PublishBulletinInput {
  authorId: string;
  title: string;
  bodyMarkdown: string;
  category: BulletinCategory;
  /** NULL means the whole organization. */
  audienceOrgUnitId?: string | null;
  expiresAt?: Date | null;
  requiresAcknowledgement?: boolean;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002';
}

/**
 * tasks-notifications-support/61-policy-communications-bulletin.md
 * (WO-61.2). A `Bulletin` is a persistent, browsable RECORD — the piece
 * doc 24's own push notifications never provided. Delivery is not
 * rebuilt: `publish()` only writes the row and queues
 * `DomainEvent.BulletinPublished` through the same transactional outbox
 * every other write in this codebase uses; `BulletinNotificationListener`
 * is the only thing that ever calls `NotificationsService`.
 */
@Injectable()
export class BulletinsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: AudienceService,
    private readonly eventBus: EventBusService,
    private readonly audit: AuditService,
  ) {}

  /**
   * "Authority and blast radius" (the doc's own scope lens): a publisher
   * bound to a reach (holds at least one open Posting) may only address a
   * unit they are posted at directly — the identical exact-match reach
   * `AudienceService.resolve()` already enforces for a broadcast send, not
   * a bulletin-specific rule. An unrestricted publisher (no posting at
   * all, e.g. a fresh deployment's ADMIN) may address the whole
   * organization (`audienceOrgUnitId: null`).
   */
  async publish(input: PublishBulletinInput): Promise<Bulletin> {
    const reach = await this.audience.reachOf(input.authorId);
    if (reach !== null && (!input.audienceOrgUnitId || !reach.includes(input.audienceOrgUnitId))) {
      throw new ForbiddenException('You may only publish to a unit you hold a posting at directly.');
    }

    return this.prisma.$transaction(async (tx) => {
      const bulletin = await tx.bulletin.create({
        data: {
          authorId: input.authorId,
          title: input.title,
          bodyMarkdown: input.bodyMarkdown,
          category: input.category,
          audienceOrgUnitId: input.audienceOrgUnitId ?? null,
          expiresAt: input.expiresAt ?? null,
          requiresAcknowledgement: input.requiresAcknowledgement ?? false,
        },
      });
      await this.eventBus.publish(
        DomainEvent.BulletinPublished,
        { bulletinId: bulletin.id, audienceOrgUnitId: bulletin.audienceOrgUnitId },
        tx,
      );
      await this.audit.record({ actorId: input.authorId, action: 'bulletin.published', entity: 'Bulletin', entityId: bulletin.id });
      return bulletin;
    });
  }

  /**
   * Every active, unexpired notice the caller's own org-tree membership
   * reaches — "Whose rows, and which columns": a bulletin addressed to a
   * unit, or any ancestor of a unit the caller is posted at, is visible; a
   * bulletin addressed to an unrelated unit is not. A caller with no
   * posting at all sees everything, matching `AudienceService.reachOf()`'s
   * own unrestricted-when-no-posting reasoning.
   */
  async list(userId: string, options?: { includeExpired?: boolean }): Promise<Bulletin[]> {
    const eligibleIds = await this.eligibleAudienceIds(userId);
    const now = new Date();
    return this.prisma.bulletin.findMany({
      where: {
        archivedAt: null,
        AND: [
          options?.includeExpired ? {} : { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          eligibleIds === null ? {} : { OR: [{ audienceOrgUnitId: null }, { audienceOrgUnitId: { in: eligibleIds } }] },
        ],
      },
      orderBy: { publishedAt: 'desc' },
    });
  }

  /** Same visibility rule as `list()`, for the detail screen — 404 rather than 403 for an out-of-scope bulletin, so its existence is never confirmed to someone outside its audience. */
  async get(bulletinId: string, userId: string): Promise<Bulletin> {
    const bulletin = await this.prisma.bulletin.findUnique({ where: { id: bulletinId } });
    if (!bulletin) throw new NotFoundException('Bulletin not found.');
    if (bulletin.audienceOrgUnitId) {
      const eligibleIds = await this.eligibleAudienceIds(userId);
      if (eligibleIds !== null && !eligibleIds.includes(bulletin.audienceOrgUnitId)) {
        throw new NotFoundException('Bulletin not found.');
      }
    }
    return bulletin;
  }

  /** A double-click of "acknowledge" is a P2002 this swallows — `@@unique([bulletinId, userId])` is the whole mechanism, never a duplicate row. */
  async acknowledge(bulletinId: string, userId: string): Promise<void> {
    const bulletin = await this.prisma.bulletin.findUnique({ where: { id: bulletinId }, select: { id: true } });
    if (!bulletin) throw new NotFoundException('Bulletin not found.');
    try {
      await this.prisma.bulletinAcknowledgement.create({ data: { bulletinId, userId } });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  /** Retraction, never deletion — "the reversal document" lens: the row and its acknowledgement trail stay, only `archivedAt` changes. Idempotent — retracting twice is a no-op. */
  async retract(bulletinId: string, actorId: string): Promise<void> {
    const bulletin = await this.prisma.bulletin.findUnique({ where: { id: bulletinId }, select: { archivedAt: true } });
    if (!bulletin) throw new NotFoundException('Bulletin not found.');
    if (bulletin.archivedAt) return;
    await this.prisma.bulletin.update({ where: { id: bulletinId }, data: { archivedAt: new Date() } });
    await this.audit.record({ actorId, action: 'bulletin.retracted', entity: 'Bulletin', entityId: bulletinId });
  }

  /**
   * Every OrgUnit id whose subtree reaches the caller — the flattened
   * union of every unit-on-the-path-to-root for every open Posting they
   * hold. Distinct from `AudienceService.reachOf()` (that computes a
   * SENDER's exact posting units, to narrow a requested recipient list);
   * this computes a READER's whole ancestor closure, so a notice addressed
   * to "North" reaches someone posted at "North / Store 5" underneath it.
   */
  private async eligibleAudienceIds(userId: string): Promise<string[] | null> {
    const postings = await this.prisma.posting.findMany({
      where: { userId, endedOn: null },
      select: { position: { select: { orgUnitId: true } } },
    });
    if (postings.length === 0) return null;
    const unitIds = [...new Set(postings.map((p) => p.position.orgUnitId))];
    const units = await this.prisma.orgUnit.findMany({ where: { id: { in: unitIds } }, select: { path: true } });
    return [...new Set(units.flatMap((u) => u.path))];
  }
}
