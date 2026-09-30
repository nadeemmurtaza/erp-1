import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../../core/audit/audit.service';
import { PermissionsResolverService } from '../../../core/auth/permissions.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { AttendanceService } from './attendance.service';

/**
 * attendance-workforce/22-attendance-shifts-leave.md. "Record first,
 * reconcile after" — every classification reason gets its own spec, plus
 * the idempotent replay and the never-mutates-the-original adjustment.
 */
describe('AttendanceService', () => {
  let service: AttendanceService;
  let prisma: any;
  let audit: any;
  let settings: any;
  let permissions: any;

  const shift = (over: Partial<any> = {}) => ({
    orgUnitId: 'north',
    startsAt: new Date('2026-09-25T04:00:00.000Z'), // 09:00 PKT
    endsAt: new Date('2026-09-25T12:00:00.000Z'), // 17:00 PKT
    ...over,
  });

  const eventRow = (over: Partial<any> = {}) => ({
    id: 'e1',
    userId: 'u1',
    kind: 'IN',
    occurredAt: new Date('2026-09-25T04:00:00.000Z'),
    timezone: 'Asia/Karachi',
    orgUnitId: 'north',
    source: 'SELF',
    deviceId: null,
    correctsId: null,
    ...over,
  });

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) },
      orgUnit: { findUnique: jest.fn().mockResolvedValue({ id: 'north' }) },
      attendanceEvent: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      attendanceException: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      leaveRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      shift: { findMany: jest.fn().mockResolvedValue([]) },
      posting: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    audit = { recordEvidence: jest.fn() };
    settings = {
      getAttendanceDuplicateWindowMinutes: jest.fn().mockResolvedValue(2),
      getAttendanceShiftGraceMinutes: jest.fn().mockResolvedValue(15),
      getAttendanceMaxSelfAdjustMinutes: jest.fn().mockResolvedValue(30),
    };
    permissions = { resolveForUser: jest.fn().mockResolvedValue({ roles: [], permissions: ['hr.attendance.record'] }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: SettingsService, useValue: settings },
        { provide: PermissionsResolverService, useValue: permissions },
      ],
    }).compile();

    service = module.get(AttendanceService);
  });

  const input = (over: Partial<any> = {}) => ({
    userId: 'u1',
    kind: 'IN' as const,
    occurredAt: new Date('2026-09-25T04:00:00.000Z'), // 09:00 PKT
    timezone: 'Asia/Karachi',
    orgUnitId: 'north',
    source: 'SELF' as const,
    ...over,
  });

  describe('record — the unconditional path', () => {
    it('refuses only structurally invalid input — an unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.record(input(), null)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.attendanceEvent.create).not.toHaveBeenCalled();
    });

    it('refuses only structurally invalid input — an unknown org unit', async () => {
      prisma.orgUnit.findUnique.mockResolvedValue(null);
      await expect(service.record(input(), null)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('a punch matching an open shift at the right unit, in the roster window, links cleanly — no exception', async () => {
      prisma.attendanceEvent.create.mockResolvedValue(eventRow());
      prisma.shift.findMany.mockResolvedValue([shift()]);

      const result = await service.record(input(), null);

      expect(result.exception).toBeNull();
      expect(prisma.attendanceException.create).not.toHaveBeenCalled();
    });

    it('the row exists even with no shift at all — NO_MATCHING_SHIFT, never refused', async () => {
      prisma.attendanceEvent.create.mockResolvedValue(eventRow());
      prisma.shift.findMany.mockResolvedValue([]);
      prisma.attendanceException.create.mockResolvedValue({ id: 'x1', reason: 'NO_MATCHING_SHIFT' });

      const result = await service.record(input(), null);

      expect(result.event.id).toBe('e1');
      expect(result.exception).toEqual(expect.objectContaining({ reason: 'NO_MATCHING_SHIFT' }));
    });

    it('a shift exists but at a different unit — WRONG_UNIT, the row still exists', async () => {
      prisma.attendanceEvent.create.mockResolvedValue(eventRow({ orgUnitId: 'south' }));
      prisma.shift.findMany.mockResolvedValue([shift({ orgUnitId: 'north' })]);
      prisma.attendanceException.create.mockResolvedValue({ id: 'x1', reason: 'WRONG_UNIT' });

      const result = await service.record(input({ orgUnitId: 'south' }), null);

      expect(result.exception).toEqual(expect.objectContaining({ reason: 'WRONG_UNIT' }));
    });

    it('a shift exists at the right unit but the punch is far outside it — OUTSIDE_ROSTER', async () => {
      const farEarly = new Date('2026-09-24T20:00:00.000Z'); // 01:00 PKT, 8 hours before a 09:00 shift
      prisma.attendanceEvent.create.mockResolvedValue(eventRow({ occurredAt: farEarly }));
      prisma.shift.findMany.mockResolvedValue([shift()]);
      prisma.attendanceException.create.mockResolvedValue({ id: 'x1', reason: 'OUTSIDE_ROSTER' });

      const result = await service.record(input({ occurredAt: farEarly }), null);

      expect(result.exception).toEqual(expect.objectContaining({ reason: 'OUTSIDE_ROSTER' }));
    });

    it('an approved leave covering the date wins over every other reason — WHILE_ON_LEAVE', async () => {
      prisma.leaveRequest.findFirst.mockResolvedValue({ id: 'lr1' });
      prisma.attendanceEvent.create.mockResolvedValue(eventRow());
      prisma.attendanceException.create.mockResolvedValue({ id: 'x1', reason: 'WHILE_ON_LEAVE' });

      const result = await service.record(input(), null);

      expect(result.exception).toEqual(expect.objectContaining({ reason: 'WHILE_ON_LEAVE' }));
      expect(prisma.shift.findMany).not.toHaveBeenCalled();
    });

    it('two punches of the same kind inside the duplicate window — DUPLICATE_SUSPECTED', async () => {
      prisma.attendanceEvent.create.mockResolvedValue(eventRow());
      prisma.attendanceEvent.findFirst.mockResolvedValue({ id: 'earlier' });
      prisma.attendanceException.create.mockResolvedValue({ id: 'x1', reason: 'DUPLICATE_SUSPECTED' });

      const result = await service.record(input(), null);

      expect(result.exception).toEqual(expect.objectContaining({ reason: 'DUPLICATE_SUSPECTED' }));
    });

    it('an OUT with no preceding open IN — MISSING_COUNTERPART', async () => {
      prisma.attendanceEvent.create.mockResolvedValue(eventRow({ id: 'e2', kind: 'OUT' }));
      prisma.shift.findMany.mockResolvedValue([shift()]);
      // First findFirst call (duplicate check) -> null; second call (counterpart check) -> an OUT, not IN.
      prisma.attendanceEvent.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ kind: 'OUT' });
      prisma.attendanceException.create.mockResolvedValue({ id: 'x1', reason: 'MISSING_COUNTERPART' });

      const result = await service.record(input({ kind: 'OUT' }), null);

      expect(result.exception).toEqual(expect.objectContaining({ reason: 'MISSING_COUNTERPART' }));
    });

    it('an OUT following an open IN links cleanly', async () => {
      prisma.attendanceEvent.create.mockResolvedValue(eventRow({ id: 'e2', kind: 'OUT' }));
      prisma.shift.findMany.mockResolvedValue([shift()]);
      prisma.attendanceEvent.findFirst
        .mockResolvedValueOnce(null) // duplicate check
        .mockResolvedValueOnce({ kind: 'IN' }); // counterpart check

      const result = await service.record(input({ kind: 'OUT' }), null);

      expect(result.exception).toBeNull();
    });

    it('a replayed punch with the same externalRef is a no-op, not a second row', async () => {
      prisma.attendanceEvent.create.mockRejectedValue({ code: 'P2002' });
      prisma.attendanceEvent.findFirst.mockResolvedValue(eventRow({ externalRef: 'device-seq-1' }));

      const result = await service.record(input({ externalRef: 'device-seq-1' }), null);

      expect(result.event.id).toBe('e1');
      expect(result.exception).toBeNull();
      expect(prisma.attendanceException.create).not.toHaveBeenCalled();
    });
  });

  describe('reconcile', () => {
    it('throws NotFoundException for a missing exception', async () => {
      prisma.attendanceException.findUnique.mockResolvedValue(null);
      await expect(service.reconcile('missing', 'admin1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is idempotent — resolving an already-resolved exception does nothing further', async () => {
      prisma.attendanceException.findUnique.mockResolvedValue({ id: 'x1', resolvedAt: new Date('2026-09-01') });
      await service.reconcile('x1', 'admin1');
      expect(prisma.attendanceException.update).not.toHaveBeenCalled();
    });

    it('resolves an open exception and audits it', async () => {
      prisma.attendanceException.findUnique.mockResolvedValue({ id: 'x1', resolvedAt: null, reason: 'NO_MATCHING_SHIFT' });
      prisma.attendanceException.update.mockResolvedValue({ id: 'x1', resolvedAt: new Date() });

      await service.reconcile('x1', 'admin1', 'linked to the 9am shift');

      expect(audit.recordEvidence).toHaveBeenCalledWith(prisma, expect.objectContaining({ action: 'attendance_exception.resolved' }));
    });
  });

  describe('adjust / previewAdjust — never mutates the original row', () => {
    const adjustInput = (over: Partial<any> = {}) => ({
      originalEventId: 'e1',
      originalEventOccurredAt: new Date('2026-09-25T04:00:00.000Z'),
      newOccurredAt: new Date('2026-09-25T04:10:00.000Z'), // 10-minute correction
      newKind: 'IN' as const,
      reason: 'device clock was fast',
      ...over,
    });

    it('a small correction by someone other than the employee needs no approver', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.attendanceEvent.findUniqueOrThrow.mockResolvedValue(eventRow());
      prisma.attendanceEvent.create.mockResolvedValue(eventRow({ id: 'adj1', kind: 'ADJUSTMENT', correctsId: 'e1' }));

      const preview = await service.previewAdjust(adjustInput(), 'manager1');
      expect(preview.refusals).toEqual([]);

      const result = await service.adjust(adjustInput(), 'manager1');
      expect(result.correctsId).toBe('e1');
      expect(prisma.attendanceEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ kind: 'ADJUSTMENT', correctsId: 'e1' }) }),
      );
    });

    it('adjusting your OWN attendance always needs an approver, regardless of amount', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValue({ userId: 'self1' });

      const preview = await service.previewAdjust(adjustInput(), 'self1');
      expect(preview.refusals.map((r) => r.code)).toContain('NEEDS_APPROVER');

      await expect(service.adjust(adjustInput(), 'self1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('a correction beyond MAX_SELF_ADJUST_MINUTES needs an approver even for a manager', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValue({ userId: 'u1' });
      const bigAdjust = adjustInput({ newOccurredAt: new Date('2026-09-25T05:00:00.000Z') }); // 60-minute change

      const preview = await service.previewAdjust(bigAdjust, 'manager1');
      expect(preview.refusals.map((r) => r.code)).toContain('NEEDS_APPROVER');
    });

    it('refuses when the named approver does not outrank the employee', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValue({ userId: 'self1' });
      prisma.posting.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.userId === 'self1'
            ? [{ position: { rank: { level: 30 } } }]
            : [{ position: { rank: { level: 10 } } }],
        ),
      );

      const preview = await service.previewAdjust(adjustInput({ approverId: 'weaker' }), 'self1');
      expect(preview.refusals.map((r) => r.code)).toContain('APPROVER_DOES_NOT_OUTRANK');
    });

    it('allows a self-adjustment countersigned by someone who outranks the employee', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValue({ userId: 'self1' });
      prisma.posting.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.userId === 'self1'
            ? [{ position: { rank: { level: 10 } } }]
            : [{ position: { rank: { level: 30 } } }],
        ),
      );

      const preview = await service.previewAdjust(adjustInput({ approverId: 'stronger' }), 'self1');
      expect(preview.refusals).toEqual([]);
    });

    it('refuses when the original event does not exist', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValue(null);
      await expect(service.adjust(adjustInput(), 'manager1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a stranger adjusting someone else\'s attendance without hr.attendance.record', async () => {
      prisma.attendanceEvent.findUnique.mockResolvedValue({ userId: 'u1' });
      permissions.resolveForUser.mockResolvedValue({ roles: [], permissions: [] });

      const preview = await service.previewAdjust(adjustInput(), 'stranger1');
      expect(preview.refusals).toEqual([{ code: 'NOT_AUTHORIZED', message: 'You may only adjust your own attendance.' }]);

      await expect(service.adjust(adjustInput(), 'stranger1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.attendanceEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('minutesBetween', () => {
    it('delegates to the pure workedMinutesBetween function', () => {
      const start = { occurredAt: new Date('2026-09-25T09:00:00.000Z') } as any;
      const end = { occurredAt: new Date('2026-09-25T17:00:00.000Z') } as any;
      expect(service.minutesBetween(start, end)).toBe(480);
    });
  });
});
