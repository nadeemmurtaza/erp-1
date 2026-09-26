import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../core/audit/audit.service';
import { PermissionsResolverService } from '../../core/auth/permissions.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import type { AttendanceExceptionReason, AttendanceKind, AttendanceSource, Prisma, Shift } from '../../core/prisma/client';
import { workedMinutesBetween } from './attendance-time';

export interface RecordPunchInput {
  userId: string;
  kind: AttendanceKind;
  occurredAt: Date;
  timezone: string;
  orgUnitId: string;
  source: AttendanceSource;
  deviceId?: string;
  externalRef?: string;
}

export interface AttendanceEventView {
  id: string;
  userId: string;
  kind: AttendanceKind;
  occurredAt: Date;
  timezone: string;
  orgUnitId: string;
  source: AttendanceSource;
  deviceId: string | null;
  correctsId: string | null;
}

export interface AttendanceExceptionView {
  id: string;
  eventId: string;
  eventOccurredAt: Date;
  userId: string;
  orgUnitId: string;
  reason: AttendanceExceptionReason;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
  note: string | null;
}

export type ShiftView = Shift;

export interface RecordPunchResult {
  event: AttendanceEventView;
  /** Non-null only on the write that actually raised it — a replayed punch never raises a second one. */
  exception: AttendanceExceptionView | null;
}

export type AdjustRefusalCode = 'ORIGINAL_NOT_FOUND' | 'NOT_AUTHORIZED' | 'NEEDS_APPROVER' | 'APPROVER_DOES_NOT_OUTRANK';

export interface AdjustRefusal {
  code: AdjustRefusalCode;
  message: string;
}

export interface AdjustInput {
  originalEventId: string;
  originalEventOccurredAt: Date;
  newOccurredAt: Date;
  newKind: AttendanceKind;
  reason: string;
  approverId?: string;
}

export interface PreviewAdjustResult {
  refusals: AdjustRefusal[];
}

const EVENT_SELECT = {
  id: true,
  userId: true,
  kind: true,
  occurredAt: true,
  timezone: true,
  orgUnitId: true,
  source: true,
  deviceId: true,
  correctsId: true,
} satisfies Prisma.AttendanceEventSelect;

type EventRow = Prisma.AttendanceEventGetPayload<{ select: typeof EVENT_SELECT }>;

const EXCEPTION_SELECT = {
  id: true,
  eventId: true,
  eventOccurredAt: true,
  userId: true,
  orgUnitId: true,
  reason: true,
  resolvedAt: true,
  resolvedByUserId: true,
  note: true,
} satisfies Prisma.AttendanceExceptionSelect;

type ExceptionRow = Prisma.AttendanceExceptionGetPayload<{ select: typeof EXCEPTION_SELECT }>;

/**
 * attendance-workforce/22-attendance-shifts-leave.md — record first,
 * reconcile after (RETAIL-ERP.md R5 applied to people). `record()` never
 * refuses a structurally valid punch (a real user, a real unit): whatever
 * does not fit becomes an `AttendanceException`, queued for a human, never
 * dropped and never silently coerced onto the nearest shift.
 *
 * `WHILE_ON_LEAVE` is produced by querying `hr`'s payroll module's own
 * `LeaveRequest` table directly (a Prisma read, no TS import of any
 * `payroll` service) — the identical "cross-schema query, no module
 * coupling" pattern `GrantService` (doc 21) already establishes for reading
 * `Posting`/`Rank` from a different module's tables.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly permissions: PermissionsResolverService,
  ) {}

  async record(input: RecordPunchInput, actorId: string | null): Promise<RecordPunchResult> {
    const user = await this.prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
    if (!user) throw new BadRequestException('That user does not exist.');
    const orgUnit = await this.prisma.orgUnit.findUnique({ where: { id: input.orgUnitId }, select: { id: true } });
    if (!orgUnit) throw new BadRequestException('That org unit does not exist.');

    let event: EventRow;
    try {
      event = await this.prisma.attendanceEvent.create({
        data: {
          userId: input.userId,
          kind: input.kind,
          occurredAt: input.occurredAt,
          timezone: input.timezone,
          orgUnitId: input.orgUnitId,
          source: input.source,
          deviceId: input.deviceId,
          externalRef: input.externalRef,
        },
        select: EVENT_SELECT,
      });
    } catch (error) {
      if (isUniqueViolation(error) && input.externalRef) {
        const existing = await this.prisma.attendanceEvent.findFirst({
          where: { userId: input.userId, source: input.source, externalRef: input.externalRef, occurredAt: input.occurredAt },
          select: EVENT_SELECT,
        });
        if (existing) return { event: toEventView(existing), exception: null };
      }
      throw error;
    }

    const reason = await this.classify(event);
    if (!reason) {
      return { event: toEventView(event), exception: null };
    }

    const createdException = await this.prisma.$transaction(async (tx) => {
      const row = await tx.attendanceException.create({
        data: {
          eventId: event.id,
          eventOccurredAt: event.occurredAt,
          userId: event.userId,
          orgUnitId: event.orgUnitId,
          reason,
        },
        select: EXCEPTION_SELECT,
      });
      await this.audit.recordEvidence(tx, {
        actorId: actorId ?? event.userId,
        action: 'attendance_exception.raised',
        entity: 'AttendanceException',
        entityId: row.id,
        data: { reason, eventId: event.id, occurredAt: event.occurredAt },
      });
      return row;
    });

    return { event: toEventView(event), exception: toExceptionView(createdException) };
  }

  /** Read-only: what `record()`'s classification would return for an already-written event, and payroll's own preview (doc 25) can replay a whole month with nothing written. */
  async previewClassify(eventId: string, eventOccurredAt: Date): Promise<AttendanceExceptionReason | null> {
    const event = await this.prisma.attendanceEvent.findUnique({
      where: { id_occurredAt: { id: eventId, occurredAt: eventOccurredAt } },
      select: EVENT_SELECT,
    });
    if (!event) throw new NotFoundException('That attendance event does not exist.');
    return this.classify(event);
  }

  async listEvents(userId: string, from: Date, to: Date): Promise<AttendanceEventView[]> {
    const rows = await this.prisma.attendanceEvent.findMany({
      where: { userId, occurredAt: { gte: from, lte: to } },
      select: EVENT_SELECT,
      orderBy: { occurredAt: 'asc' },
    });
    return rows.map(toEventView);
  }

  async listShifts(userId: string): Promise<ShiftView[]> {
    return this.prisma.shift.findMany({ where: { userId }, orderBy: { startsAt: 'asc' } });
  }

  /** Rostering is deliberately thin (this document's own words) — a shift is a window and a unit, nothing more. */
  async createShift(input: { userId: string; orgUnitId: string; startsAt: Date; endsAt: Date; timezone: string }): Promise<ShiftView> {
    const user = await this.prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
    if (!user) throw new BadRequestException('That user does not exist.');
    const orgUnit = await this.prisma.orgUnit.findUnique({ where: { id: input.orgUnitId }, select: { id: true } });
    if (!orgUnit) throw new BadRequestException('That org unit does not exist.');
    if (input.endsAt.getTime() <= input.startsAt.getTime()) {
      throw new BadRequestException('A shift must end after it starts.');
    }

    return this.prisma.shift.create({
      data: {
        userId: input.userId,
        orgUnitId: input.orgUnitId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timezone: input.timezone,
      },
    });
  }

  async listExceptions(filter: { orgUnitId?: string; resolved?: boolean }): Promise<AttendanceExceptionView[]> {
    const rows = await this.prisma.attendanceException.findMany({
      where: {
        orgUnitId: filter.orgUnitId,
        resolvedAt: filter.resolved === undefined ? undefined : filter.resolved ? { not: null } : null,
      },
      select: EXCEPTION_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toExceptionView);
  }

  /**
   * Clears an exception — links it to a shift the reconciler judges correct,
   * or simply accepts the punch as-is. Never mutates or removes the
   * original `AttendanceEvent`. Idempotent — resolving an already-resolved
   * exception does nothing further.
   */
  async reconcile(exceptionId: string, actorId: string, note?: string): Promise<AttendanceExceptionView> {
    const existing = await this.prisma.attendanceException.findUnique({ where: { id: exceptionId }, select: EXCEPTION_SELECT });
    if (!existing) throw new NotFoundException('That exception does not exist.');
    if (existing.resolvedAt) return toExceptionView(existing);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.attendanceException.update({
        where: { id: exceptionId },
        data: { resolvedAt: new Date(), resolvedByUserId: actorId, note },
        select: EXCEPTION_SELECT,
      });
      await this.audit.recordEvidence(tx, {
        actorId,
        action: 'attendance_exception.resolved',
        entity: 'AttendanceException',
        entityId: exceptionId,
        data: { reason: existing.reason, note: note ?? null },
      });
      return row;
    });

    return toExceptionView(updated);
  }

  /**
   * "An ADJUSTMENT that adds more than MAX_SELF_ADJUST_MINUTES needs a
   * second approver who outranks the employee; adjusting your own
   * attendance always does, regardless of amount" — this document's own
   * "threshold nobody approves alone" lens. Reads `Posting`/`Position`/
   * `Rank` (the `hr` module's tables) directly by Prisma query, the same
   * "cross-schema read, no TS coupling" pattern `GrantService` (doc 21)
   * already establishes; the rank-maximum comparison itself is doc 20's
   * `outranks()` rule restated as a private helper here rather than
   * imported, for the identical module-independence reason `GrantService`'s
   * own header comment gives.
   */
  async previewAdjust(input: AdjustInput, actorId: string): Promise<PreviewAdjustResult> {
    return { refusals: await this.checkAdjustRefusals(input, actorId) };
  }

  /** Never mutates or removes the original row — a new AttendanceEvent of kind ADJUSTMENT, referencing it via correctsId. */
  async adjust(input: AdjustInput, actorId: string): Promise<AttendanceEventView> {
    const refusals = await this.checkAdjustRefusals(input, actorId);
    if (refusals.length > 0) {
      const first = refusals[0]!;
      if (first.code === 'ORIGINAL_NOT_FOUND') throw new NotFoundException(first.message);
      throw new ForbiddenException(first.message);
    }

    const original = await this.prisma.attendanceEvent.findUniqueOrThrow({
      where: { id_occurredAt: { id: input.originalEventId, occurredAt: input.originalEventOccurredAt } },
      select: EVENT_SELECT,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.attendanceEvent.create({
        data: {
          userId: original.userId,
          kind: 'ADJUSTMENT',
          occurredAt: input.newOccurredAt,
          timezone: original.timezone,
          orgUnitId: original.orgUnitId,
          source: 'MANAGER',
          correctsId: original.id,
        },
        select: EVENT_SELECT,
      });
      await this.audit.recordEvidence(tx, {
        actorId,
        action: 'attendance_event.adjusted',
        entity: 'AttendanceEvent',
        entityId: row.id,
        data: {
          correctsId: original.id,
          from: { occurredAt: original.occurredAt, kind: original.kind },
          to: { occurredAt: input.newOccurredAt, kind: input.newKind },
          reason: input.reason,
          approverId: input.approverId ?? null,
        },
      });
      return row;
    });

    return toEventView(created);
  }

  private async checkAdjustRefusals(input: AdjustInput, actorId: string): Promise<AdjustRefusal[]> {
    const refusals: AdjustRefusal[] = [];

    const original = await this.prisma.attendanceEvent.findUnique({
      where: { id_occurredAt: { id: input.originalEventId, occurredAt: input.originalEventOccurredAt } },
      select: { userId: true },
    });
    if (!original) {
      return [{ code: 'ORIGINAL_NOT_FOUND', message: 'That attendance event does not exist.' }];
    }

    const isSelf = actorId === original.userId;
    if (!isSelf) {
      const actorPermissions = await this.permissions.resolveForUser(actorId);
      if (!actorPermissions.permissions.includes('hr.attendance.record')) {
        return [{ code: 'NOT_AUTHORIZED', message: 'You may only adjust your own attendance.' }];
      }
    }
    const deltaMinutes = Math.abs(workedMinutesBetween(input.originalEventOccurredAt, input.newOccurredAt));
    const maxSelfAdjustMinutes = await this.settings.getAttendanceMaxSelfAdjustMinutes();
    const needsApprover = isSelf || deltaMinutes > maxSelfAdjustMinutes;

    if (!needsApprover) return refusals;

    if (!input.approverId) {
      refusals.push({
        code: 'NEEDS_APPROVER',
        message: isSelf
          ? 'Adjusting your own attendance always needs a second approver who outranks you.'
          : `An adjustment of more than ${maxSelfAdjustMinutes} minutes needs a second approver who outranks the employee.`,
      });
      return refusals;
    }

    const [employeeRanks, approverRanks] = await Promise.all([
      this.openPostingRankLevels(original.userId),
      this.openPostingRankLevels(input.approverId),
    ]);
    if (maxRank(approverRanks) <= maxRank(employeeRanks)) {
      refusals.push({ code: 'APPROVER_DOES_NOT_OUTRANK', message: 'The approver does not outrank the employee.' });
    }

    return refusals;
  }

  private async openPostingRankLevels(userId: string): Promise<number[]> {
    const rows = await this.prisma.posting.findMany({
      where: { userId, endedOn: null },
      select: { position: { select: { rank: { select: { level: true } } } } },
    });
    return rows.map((row) => row.position.rank.level);
  }

  /**
   * The pure duration between two already-loaded events — a thin wrapper so
   * callers never reach for `occurredAt.getTime()` subtraction themselves;
   * see `attendance-time.ts` for why this is the only correct way.
   */
  minutesBetween(start: AttendanceEventView, end: AttendanceEventView): number {
    return workedMinutesBetween(start.occurredAt, end.occurredAt);
  }

  /**
   * Classification, checked in priority order, stopping at the first match
   * — `AttendanceException.reason` is singular, and a punch is either
   * WHILE_ON_LEAVE or it is judged against the roster, never both at once.
   */
  private async classify(event: EventRow): Promise<AttendanceExceptionReason | null> {
    const onLeave = await this.prisma.leaveRequest.findFirst({
      where: {
        userId: event.userId,
        status: 'APPROVED',
        startDate: { lte: event.occurredAt },
        endDate: { gte: event.occurredAt },
      },
      select: { id: true },
    });
    if (onLeave) return 'WHILE_ON_LEAVE';

    const duplicateWindowMinutes = await this.settings.getAttendanceDuplicateWindowMinutes();
    const windowStart = new Date(event.occurredAt.getTime() - duplicateWindowMinutes * 60_000);
    const recentSameKind = await this.prisma.attendanceEvent.findFirst({
      where: {
        userId: event.userId,
        kind: event.kind,
        occurredAt: { gte: windowStart, lt: event.occurredAt },
      },
      select: { id: true },
    });
    if (recentSameKind) return 'DUPLICATE_SUSPECTED';

    const graceMinutes = await this.settings.getAttendanceShiftGraceMinutes();
    const graceMs = graceMinutes * 60_000;
    const searchWindowMs = 24 * 60 * 60_000;

    const nearbyShifts = await this.prisma.shift.findMany({
      where: {
        userId: event.userId,
        startsAt: { lte: new Date(event.occurredAt.getTime() + searchWindowMs) },
        endsAt: { gte: new Date(event.occurredAt.getTime() - searchWindowMs) },
      },
      select: { orgUnitId: true, startsAt: true, endsAt: true },
    });

    if (nearbyShifts.length === 0) return 'NO_MATCHING_SHIFT';

    const nearest = nearbyShifts.reduce((best, shift) =>
      distanceToRange(event.occurredAt, shift.startsAt, shift.endsAt) < distanceToRange(event.occurredAt, best.startsAt, best.endsAt)
        ? shift
        : best,
    );

    if (nearest.orgUnitId !== event.orgUnitId) return 'WRONG_UNIT';

    const withinRoster =
      event.occurredAt.getTime() >= nearest.startsAt.getTime() - graceMs &&
      event.occurredAt.getTime() <= nearest.endsAt.getTime() + graceMs;
    if (!withinRoster) return 'OUTSIDE_ROSTER';

    if (event.kind === 'OUT' || event.kind === 'BREAK_END') {
      const counterpartKind = event.kind === 'OUT' ? 'IN' : 'BREAK_START';
      const previous = await this.prisma.attendanceEvent.findFirst({
        where: { userId: event.userId, occurredAt: { lt: event.occurredAt } },
        orderBy: { occurredAt: 'desc' },
        select: { kind: true },
      });
      if (!previous || previous.kind !== counterpartKind) return 'MISSING_COUNTERPART';
    }

    return null;
  }
}

/** Doc 20's own `outranks()` rule restated: the maximum, never the first-found; an empty array is unrankable. */
function maxRank(levels: readonly number[]): number {
  return levels.length === 0 ? -Infinity : Math.max(...levels);
}

function distanceToRange(point: Date, start: Date, end: Date): number {
  const t = point.getTime();
  if (t < start.getTime()) return start.getTime() - t;
  if (t > end.getTime()) return t - end.getTime();
  return 0;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002';
}

function toEventView(row: EventRow): AttendanceEventView {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    occurredAt: row.occurredAt,
    timezone: row.timezone,
    orgUnitId: row.orgUnitId,
    source: row.source,
    deviceId: row.deviceId,
    correctsId: row.correctsId,
  };
}

function toExceptionView(row: ExceptionRow): AttendanceExceptionView {
  return {
    id: row.id,
    eventId: row.eventId,
    eventOccurredAt: row.eventOccurredAt,
    userId: row.userId,
    orgUnitId: row.orgUnitId,
    reason: row.reason,
    resolvedAt: row.resolvedAt,
    resolvedByUserId: row.resolvedByUserId,
    note: row.note,
  };
}
