import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { DomainEvent } from '../../core/events/domain-events';
import type { Position, Prisma, Rank } from '../../core/prisma/client';

export interface PostingView {
  id: string;
  userId: string;
  positionId: string;
  positionTitle: string;
  orgUnitId: string;
  rankLevel: number;
  rankLabel: string;
  isPrimary: boolean;
  startedOn: Date;
  endedOn: Date | null;
}

export interface PreviewAssignResult {
  /** Set when this assignment would be refused — the user already holds a different open primary posting. Reassigning is a deliberate, separate step: end the current posting first, per doc 20's own "needs a human" undo-fan-out answer — assign() never ends one on the caller's behalf. */
  blockedBy: { postingId: string; positionTitle: string } | null;
}

const POSTING_SELECT = {
  id: true,
  userId: true,
  positionId: true,
  isPrimary: true,
  startedOn: true,
  endedOn: true,
  position: { select: { title: true, orgUnitId: true, rank: { select: { level: true, label: true } } } },
} satisfies Prisma.PostingSelect;

type PostingRow = Prisma.PostingGetPayload<{ select: typeof POSTING_SELECT }>;

/**
 * `PostingService` (hr-people-org/20-people-positions-ranks.md, WO-20.2):
 * the sole writer of `Posting`. Every read here takes an `at` date,
 * defaulting to now — never "the current row" — so a report of last
 * quarter resolves against the org chart as it stood then (doc 20, "The
 * version stamp"). No `Employee` model: every method below takes a
 * `userId` directly (DECISIONS.md ADR-044).
 */
@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly eventBus: EventBusService,
  ) {}

  // ─── ranks ───────────────────────────────────────────────────────────────

  async listRanks(): Promise<Rank[]> {
    return this.prisma.rank.findMany({ orderBy: { level: 'asc' } });
  }

  async createRank(input: { key: string; label: string; level: number }): Promise<Rank> {
    const key = cleanRequired(input.key, 'a key');
    const label = cleanRequired(input.label, 'a label');
    const clash = await this.prisma.rank.findFirst({ where: { OR: [{ key }, { level: input.level }] } });
    if (clash) throw new ConflictException('A rank with that key or level already exists.');
    return this.prisma.rank.create({ data: { key, label, level: input.level } });
  }

  // ─── positions ───────────────────────────────────────────────────────────

  async listPositions(): Promise<Position[]> {
    return this.prisma.position.findMany({ orderBy: { title: 'asc' } });
  }

  async createPosition(input: { title: string; orgUnitId: string; rankId: string; reportsToId?: string | null }): Promise<Position> {
    const title = cleanRequired(input.title, 'a title');
    const orgUnit = await this.prisma.orgUnit.findUnique({ where: { id: input.orgUnitId } });
    if (!orgUnit) throw new BadRequestException('That org unit does not exist.');
    const rank = await this.prisma.rank.findUnique({ where: { id: input.rankId } });
    if (!rank) throw new BadRequestException('That rank does not exist.');

    return this.prisma.position.create({
      data: { title, orgUnitId: input.orgUnitId, rankId: input.rankId, reportsToId: input.reportsToId ?? null },
    });
  }

  // ─── postings ────────────────────────────────────────────────────────────

  async postingsFor(userId: string, at: Date = new Date()): Promise<PostingView[]> {
    const rows = await this.prisma.posting.findMany({
      where: { userId, startedOn: { lte: at }, OR: [{ endedOn: null }, { endedOn: { gt: at } }] },
      select: POSTING_SELECT,
      orderBy: { startedOn: 'desc' },
    });
    return rows.map(toView);
  }

  /** The primary posting held at `at` — the one payroll and the org chart use. Null if none. */
  async primaryFor(userId: string, at: Date = new Date()): Promise<PostingView | null> {
    const row = await this.prisma.posting.findFirst({
      where: { userId, isPrimary: true, startedOn: { lte: at }, OR: [{ endedOn: null }, { endedOn: { gt: at } }] },
      select: POSTING_SELECT,
      orderBy: { startedOn: 'desc' },
    });
    return row ? toView(row) : null;
  }

  /**
   * Every rank level across the user's open postings AT `at` — the maximum,
   * never the first-found (doc 20: "authority composes as the maximum").
   */
  async ranksOf(userId: string, at: Date = new Date()): Promise<number[]> {
    const postings = await this.postingsFor(userId, at);
    return postings.map((p) => p.rankLevel).sort((a, b) => b - a);
  }

  /** `outranks(a, b, at)` (WO-20.3) — a pure comparison over already-resolved rank levels, so an escalation can replay it without a fresh query. */
  outranks(ranksA: readonly number[], ranksB: readonly number[]): boolean {
    const maxA = ranksA.length > 0 ? Math.max(...ranksA) : -Infinity;
    const maxB = ranksB.length > 0 ? Math.max(...ranksB) : -Infinity;
    return maxA > maxB;
  }

  /** What `assign()` would do, without writing anything — including whether it would be refused. */
  async previewAssign(userId: string, positionId: string, isPrimary: boolean): Promise<PreviewAssignResult> {
    if (!isPrimary) return { blockedBy: null };
    const current = await this.primaryFor(userId);
    if (!current || current.positionId === positionId) return { blockedBy: null };
    return { blockedBy: { postingId: current.id, positionTitle: current.positionTitle } };
  }

  /**
   * The sole writer of `Posting`. Refuses a second open primary posting for
   * the same user rather than silently ending the current one — doc 20's
   * own acceptance criterion ("a second open primary posting... is
   * rejected") and its "undo fan-out" answer (reassignment "needs a human,"
   * named as its own step, never folded into this one). Ending the current
   * posting first is `end()`, called separately.
   */
  async assign(
    input: { userId: string; positionId: string; isPrimary: boolean; startedOn?: Date },
    actorId: string,
  ): Promise<PostingView> {
    const position = await this.prisma.position.findUnique({ where: { id: input.positionId }, select: { id: true } });
    if (!position) throw new BadRequestException('That position does not exist.');

    if (input.isPrimary) {
      const current = await this.primaryFor(input.userId);
      if (current && current.positionId !== input.positionId) {
        throw new ConflictException(
          `This person already holds an open primary posting (${current.positionTitle}). End it before assigning a new primary posting.`,
        );
      }
    }

    const startedOn = input.startedOn ?? new Date();

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.posting.create({
          data: { userId: input.userId, positionId: input.positionId, isPrimary: input.isPrimary, startedOn },
          select: POSTING_SELECT,
        });

        await this.audit.recordEvidence(tx, {
          actorId,
          action: 'posting.assigned',
          entity: 'Posting',
          entityId: row.id,
          data: { userId: input.userId, positionId: input.positionId, isPrimary: input.isPrimary },
        });

        return row;
      });

      return toView(created);
    } catch (error) {
      // The partial index (posting_one_primary_open) is the real enforcement
      // point — the pre-check above is a friendly-error fast path, not the
      // guarantee; a concurrent assign() can still race past it, and the
      // index is what actually stops a second open primary from existing.
      if (isUniqueViolation(error)) {
        throw new ConflictException('This person already holds an open primary posting. End it before assigning a new primary posting.');
      }
      throw error;
    }
  }

  /**
   * Ends a posting — REQUEST for a routine change; the write itself never
   * fails silently on "already ended" (idempotent: the early return below
   * means a retried call publishes PostingEnded at most once, never a
   * second time for the same posting — DECISIONS.md ADR-050).
   */
  async end(postingId: string, endedOn: Date | undefined, actorId: string): Promise<PostingView> {
    const existing = await this.prisma.posting.findUnique({ where: { id: postingId }, select: POSTING_SELECT });
    if (!existing) throw new NotFoundException('That posting does not exist.');
    if (existing.endedOn) return toView(existing);

    const at = endedOn ?? new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.posting.update({ where: { id: postingId }, data: { endedOn: at }, select: POSTING_SELECT });
      await this.audit.recordEvidence(tx, {
        actorId,
        action: 'posting.ended',
        entity: 'Posting',
        entityId: postingId,
        data: { endedOn: at },
      });
      // Published in the SAME transaction as the endedOn write (the
      // transactional outbox, EventBusService/OutboxDispatcher) — either
      // the posting is ended and the event is queued, or neither happens.
      // tasks/task-leaver.listener.ts is the intended subscriber
      // (ADR-050); nothing breaks if it is the only one.
      await this.eventBus.publish(
        DomainEvent.PostingEnded,
        { postingId, userId: row.userId, positionId: row.positionId, endedOn: at.toISOString() },
        tx,
      );
      return row;
    });

    return toView(updated);
  }

  async listPeople(): Promise<{ userId: string; name: string; email: string | null; primaryPosting: PostingView | null }[]> {
    const users = await this.prisma.user.findMany({
      where: { postings: { some: {} } },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { firstName: 'asc' },
    });

    return Promise.all(
      users.map(async (user) => ({
        userId: user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user.id,
        email: user.email,
        primaryPosting: await this.primaryFor(user.id),
      })),
    );
  }
}

function toView(row: PostingRow): PostingView {
  return {
    id: row.id,
    userId: row.userId,
    positionId: row.positionId,
    positionTitle: row.position.title,
    orgUnitId: row.position.orgUnitId,
    rankLevel: row.position.rank.level,
    rankLabel: row.position.rank.label,
    isPrimary: row.isPrimary,
    startedOn: row.startedOn,
    endedOn: row.endedOn,
  };
}

function cleanRequired(raw: string, what: string): string {
  const value = raw.trim();
  if (!value) throw new BadRequestException(`Enter ${what}.`);
  return value;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
