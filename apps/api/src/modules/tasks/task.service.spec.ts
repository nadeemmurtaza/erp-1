import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { TaskService, canTransitionTask, cycleTimeMs } from './task.service';

/**
 * tasks-notifications-support/23-tasks-allotment-tracking.md.
 * Same mocked-Prisma pattern as people.service.spec.ts.
 */
describe('canTransitionTask — PURE, no I/O (the exact function the UI calls to disable a button)', () => {
  it('allows every legal move the doc names', () => {
    expect(canTransitionTask('OPEN', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionTask('OPEN', 'CANCELLED')).toBe(true);
    expect(canTransitionTask('IN_PROGRESS', 'BLOCKED')).toBe(true);
    expect(canTransitionTask('IN_PROGRESS', 'DONE')).toBe(true);
    expect(canTransitionTask('IN_PROGRESS', 'CANCELLED')).toBe(true);
    expect(canTransitionTask('IN_PROGRESS', 'OPEN')).toBe(true);
    expect(canTransitionTask('BLOCKED', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionTask('BLOCKED', 'CANCELLED')).toBe(true);
    // "Reopening a DONE task is a new transition (automatic)" — doc 23's own undo fan-out.
    expect(canTransitionTask('DONE', 'OPEN')).toBe(true);
  });

  it('refuses every illegal move, exhaustively', () => {
    expect(canTransitionTask('OPEN', 'BLOCKED')).toBe(false);
    expect(canTransitionTask('OPEN', 'DONE')).toBe(false);
    expect(canTransitionTask('BLOCKED', 'DONE')).toBe(false);
    expect(canTransitionTask('BLOCKED', 'OPEN')).toBe(false);
    expect(canTransitionTask('DONE', 'IN_PROGRESS')).toBe(false);
    expect(canTransitionTask('DONE', 'BLOCKED')).toBe(false);
    expect(canTransitionTask('DONE', 'DONE')).toBe(false);
    expect(canTransitionTask('DONE', 'CANCELLED')).toBe(false);
  });

  it('CANCELLED is terminal — never moves again, not even to itself', () => {
    for (const to of ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'] as const) {
      expect(canTransitionTask('CANCELLED', to)).toBe(false);
    }
  });

  it('a same-state "transition" is legal only for IN_PROGRESS — a stage change, never a no-op self-loop elsewhere', () => {
    expect(canTransitionTask('IN_PROGRESS', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionTask('OPEN', 'OPEN')).toBe(false);
    expect(canTransitionTask('BLOCKED', 'BLOCKED')).toBe(false);
  });
});

describe('cycleTimeMs — cycle time reconstructed from TaskTransition ALONE, never Task.state (doc 23\'s own acceptance criterion)', () => {
  it('sums the time spent in each state across a full OPEN -> IN_PROGRESS -> BLOCKED -> IN_PROGRESS -> DONE lifecycle', () => {
    // Deliberately typed WITHOUT a `state` field anywhere in this input —
    // the function signature itself makes reading Task.state impossible.
    const transitions: { toState: any; occurredAt: Date }[] = [
      { toState: 'OPEN', occurredAt: new Date('2026-01-01T00:00:00Z') },
      { toState: 'IN_PROGRESS', occurredAt: new Date('2026-01-01T01:00:00Z') }, // 1h in OPEN
      { toState: 'BLOCKED', occurredAt: new Date('2026-01-01T03:00:00Z') }, // 2h in IN_PROGRESS
      { toState: 'IN_PROGRESS', occurredAt: new Date('2026-01-01T05:00:00Z') }, // 2h in BLOCKED
      { toState: 'DONE', occurredAt: new Date('2026-01-01T06:00:00Z') }, // 1h in IN_PROGRESS (second visit)
    ];
    const until = new Date('2026-01-01T08:00:00Z'); // 2h in DONE so far

    const totals = cycleTimeMs(transitions, until);

    expect(totals.OPEN).toBe(60 * 60 * 1000);
    expect(totals.IN_PROGRESS).toBe(3 * 60 * 60 * 1000); // 2h + 1h, the two separate visits summed
    expect(totals.BLOCKED).toBe(2 * 60 * 60 * 1000);
    expect(totals.DONE).toBe(2 * 60 * 60 * 1000);
    expect(totals.CANCELLED).toBe(0);
  });

  it('a brand-new task (one transition, still OPEN) reports all its age as OPEN time', () => {
    const totals = cycleTimeMs([{ toState: 'OPEN' as any, occurredAt: new Date('2026-01-01T00:00:00Z') }], new Date('2026-01-01T00:30:00Z'));
    expect(totals.OPEN).toBe(30 * 60 * 1000);
  });
});

describe('TaskService', () => {
  let service: TaskService;
  let prisma: any;
  let audit: any;

  const taskRow = (over: Partial<any> = {}) => ({
    id: 't1',
    reference: 'TASK-ABCDEF12',
    title: 'Do the thing',
    detail: null,
    positionId: 'pos1',
    assigneeUserId: null,
    orgUnitId: 'ou1',
    state: 'OPEN',
    stageId: null,
    priority: 0,
    dueAt: null,
    sourceType: null,
    sourceId: null,
    sourceRef: null,
    createdByUserId: 'u1',
    createdAt: new Date('2026-01-01'),
    closedAt: null,
    position: { title: 'Finance Manager' },
    ...over,
  });

  beforeEach(async () => {
    prisma = {
      task: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      taskTransition: { create: jest.fn(), findMany: jest.fn() },
      position: { findUnique: jest.fn(), findMany: jest.fn() },
      auditLog: { findFirst: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    audit = { recordEvidence: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(TaskService);
  });

  describe('create', () => {
    it('refuses an unknown position', async () => {
      prisma.position.findUnique.mockResolvedValue(null);
      await expect(service.create({ title: 'X', positionId: 'bad' }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates the task, its initial OPEN transition, and an audit row, deriving orgUnitId from the position', async () => {
      prisma.position.findUnique.mockResolvedValue({ id: 'pos1', orgUnitId: 'ou1' });
      prisma.task.create.mockResolvedValue(taskRow());
      prisma.task.update.mockResolvedValue(taskRow());

      await service.create({ title: 'Do the thing', positionId: 'pos1' }, 'u1');

      expect(prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ positionId: 'pos1', orgUnitId: 'ou1', createdByUserId: 'u1' }) }),
      );
      expect(prisma.taskTransition.create).toHaveBeenCalledWith({
        data: { taskId: 't1', fromState: null, toState: 'OPEN', byUserId: 'u1' },
      });
      expect(audit.recordEvidence).toHaveBeenCalledWith(prisma, expect.objectContaining({ action: 'task.created' }));
    });
  });

  describe('createFromSource — idempotent on a redelivered domain event', () => {
    const input = { title: 'Review it', positionId: 'pos1', sourceType: 'purchasing', sourceId: 'req1', sourceRef: 'req1' };

    it('creates exactly once for the first delivery', async () => {
      prisma.task.findUnique.mockResolvedValue(null); // no existing row for (sourceType, sourceRef)
      prisma.position.findUnique.mockResolvedValue({ id: 'pos1', orgUnitId: 'ou1' });
      prisma.task.create.mockResolvedValue(taskRow({ sourceType: 'purchasing', sourceId: 'req1', sourceRef: 'req1' }));
      prisma.task.update.mockResolvedValue(taskRow({ sourceType: 'purchasing', sourceId: 'req1', sourceRef: 'req1' }));

      await service.createFromSource(input);

      expect(prisma.task.create).toHaveBeenCalledTimes(1);
      expect(prisma.taskTransition.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ byUserId: null }) }),
      );
    });

    it('a REDELIVERED event (same sourceType/sourceRef) raises no second task — returns the existing row instead', async () => {
      prisma.task.findUnique.mockResolvedValue(taskRow({ sourceType: 'purchasing', sourceId: 'req1', sourceRef: 'req1' }));

      const result = await service.createFromSource(input);

      expect(prisma.task.create).not.toHaveBeenCalled();
      expect(result.sourceRef).toBe('req1');
    });

    it('a lost race against a concurrent redelivery (unique-violation on create) still returns the row rather than throwing', async () => {
      prisma.task.findUnique
        .mockResolvedValueOnce(null) // first check: nothing yet
        .mockResolvedValueOnce(taskRow({ sourceType: 'purchasing', sourceId: 'req1', sourceRef: 'req1' })); // re-read after the race
      prisma.position.findUnique.mockResolvedValue({ id: 'pos1', orgUnitId: 'ou1' });
      prisma.task.create.mockRejectedValue({ code: 'P2002' });

      const result = await service.createFromSource(input);
      expect(result.sourceRef).toBe('req1');
    });
  });

  describe('assign', () => {
    it('refuses to assign a cancelled task', async () => {
      prisma.task.findUnique.mockResolvedValue({ id: 't1', state: 'CANCELLED' });
      await expect(service.assign('t1', 'u2', 'admin1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sets assigneeUserId and records an audit row — never a TaskTransition (that table has no assignee column)', async () => {
      prisma.task.findUnique.mockResolvedValue({ id: 't1', state: 'OPEN' });
      prisma.task.update.mockResolvedValue(taskRow({ assigneeUserId: 'u2' }));

      await service.assign('t1', 'u2', 'admin1');

      expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { assigneeUserId: 'u2' }, select: expect.anything() });
      expect(audit.recordEvidence).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: 'task.assigned', data: { assigneeUserId: 'u2' } }),
      );
      expect(prisma.taskTransition.create).not.toHaveBeenCalled();
    });
  });

  describe('transition — the sole writer of Task.state', () => {
    it('refuses an illegal move (canTransitionTask says no) and writes nothing', async () => {
      prisma.task.findUnique.mockResolvedValue(taskRow({ state: 'OPEN' }));
      await expect(service.transition('t1', 'DONE', 'u1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.task.update).not.toHaveBeenCalled();
      expect(prisma.taskTransition.create).not.toHaveBeenCalled();
    });

    it('refuses a same-state, same-stage no-op', async () => {
      prisma.task.findUnique.mockResolvedValue(taskRow({ state: 'IN_PROGRESS', stageId: 'cutting' }));
      await expect(service.transition('t1', 'IN_PROGRESS', 'u1', { toStageId: 'cutting' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('writes the Task update AND a TaskTransition row for a legal move', async () => {
      prisma.task.findUnique.mockResolvedValue(taskRow({ state: 'OPEN' }));
      prisma.task.update.mockResolvedValue(taskRow({ state: 'IN_PROGRESS' }));

      await service.transition('t1', 'IN_PROGRESS', 'u1');

      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 't1' }, data: expect.objectContaining({ state: 'IN_PROGRESS' }) }),
      );
      expect(prisma.taskTransition.create).toHaveBeenCalledWith({
        data: { taskId: 't1', fromState: 'OPEN', toState: 'IN_PROGRESS', fromStageId: null, toStageId: null, byUserId: 'u1', reason: null },
      });
    });

    it('allows a stage change while staying IN_PROGRESS (same state, different stage)', async () => {
      prisma.task.findUnique.mockResolvedValue(taskRow({ state: 'IN_PROGRESS', stageId: 'cutting' }));
      prisma.task.update.mockResolvedValue(taskRow({ state: 'IN_PROGRESS', stageId: 'stitching' }));

      await service.transition('t1', 'IN_PROGRESS', 'u1', { toStageId: 'stitching' });

      expect(prisma.taskTransition.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ fromStageId: 'cutting', toStageId: 'stitching' }) }),
      );
    });

    it('reopening a DONE task clears closedAt', async () => {
      prisma.task.findUnique.mockResolvedValue(taskRow({ state: 'DONE', closedAt: new Date('2026-01-05') }));
      prisma.task.update.mockResolvedValue(taskRow({ state: 'OPEN', closedAt: null }));

      await service.transition('t1', 'OPEN', 'u1');

      expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ closedAt: null }) }));
    });
  });

  describe("close — the toxic-pair check (tasks.assign + tasks.close, DECISIONS.md ADR-049)", () => {
    it('an ordinary task (no sourceType) may be self-closed — the toxic pair does not apply', async () => {
      prisma.task.findUnique.mockResolvedValueOnce({ sourceType: null }).mockResolvedValueOnce(taskRow({ state: 'IN_PROGRESS' }));
      prisma.task.update.mockResolvedValue(taskRow({ state: 'DONE' }));

      await expect(service.close('t1', 'DONE', 'u1')).resolves.toBeDefined();
    });

    it('a non-money sourceType may be self-closed too', async () => {
      prisma.task.findUnique
        .mockResolvedValueOnce({ sourceType: 'stitching' })
        .mockResolvedValueOnce(taskRow({ state: 'IN_PROGRESS', sourceType: 'stitching' }));
      prisma.task.update.mockResolvedValue(taskRow({ state: 'DONE' }));
      prisma.auditLog.findFirst.mockResolvedValue({ data: { assigneeUserId: 'u1' } });

      await expect(service.close('t1', 'DONE', 'u1')).resolves.toBeDefined();
    });

    it('REFUSES a DONE close on a money-adjacent task when the actor is who it was assigned to', async () => {
      prisma.task.findUnique.mockResolvedValueOnce({ sourceType: 'finance' });
      prisma.auditLog.findFirst.mockResolvedValue({ data: { assigneeUserId: 'u1' } });

      await expect(service.close('t1', 'DONE', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('ALLOWS a DONE close on a money-adjacent task when a DIFFERENT user closes it', async () => {
      prisma.task.findUnique.mockResolvedValueOnce({ sourceType: 'finance' }).mockResolvedValueOnce(taskRow({ state: 'IN_PROGRESS', sourceType: 'finance' }));
      prisma.auditLog.findFirst.mockResolvedValue({ data: { assigneeUserId: 'u1' } });
      prisma.task.update.mockResolvedValue(taskRow({ state: 'DONE', sourceType: 'finance' }));

      await expect(service.close('t1', 'DONE', 'u2')).resolves.toBeDefined();
    });

    it("reads the ASSIGNMENT HISTORY, not the current assigneeUserId — the case a leaver's unclaim would otherwise hide", async () => {
      // The task is CURRENTLY unclaimed (assigneeUserId null, e.g. after WO-23.4's own unclaim),
      // but the last real 'task.assigned' audit row still names the original self-assigner.
      prisma.task.findUnique.mockResolvedValueOnce({ sourceType: 'accounting' });
      prisma.auditLog.findFirst.mockResolvedValue({ data: { assigneeUserId: 'original-assigner' } });

      await expect(service.close('t1', 'DONE', 'original-assigner')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('the toxic pair does not gate CANCELLED — only a DONE close', async () => {
      prisma.task.findUnique.mockResolvedValueOnce({ sourceType: 'finance' }).mockResolvedValueOnce(taskRow({ state: 'OPEN', sourceType: 'finance' }));
      prisma.task.update.mockResolvedValue(taskRow({ state: 'CANCELLED', sourceType: 'finance' }));

      await expect(service.close('t1', 'CANCELLED', 'u1')).resolves.toBeDefined();
      expect(prisma.auditLog.findFirst).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a missing task', async () => {
      prisma.task.findUnique.mockResolvedValue(null);
      await expect(service.close('missing', 'DONE', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('allowedTransitions on the view — the SAME function that refuses an illegal transition() call', () => {
    it('matches canTransitionTask exactly for every state, proving the UI\'s disable-button data and the server refusal share one implementation', async () => {
      for (const state of ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'] as const) {
        prisma.task.findUnique.mockResolvedValue(taskRow({ state }));
        prisma.taskTransition.findMany.mockResolvedValue([]);
        const { task } = await service.get('t1');

        const expected = (['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'] as const).filter((to) =>
          canTransitionTask(state, to),
        );
        expect(task.allowedTransitions).toEqual(expected);
      }
    });
  });

  describe('postQueue / myTasks / unclaimedForReports', () => {
    it('postQueue excludes DONE/CANCELLED by default', async () => {
      prisma.task.findMany.mockResolvedValue([]);
      await service.postQueue('pos1');
      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ positionId: 'pos1', state: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] } }) }),
      );
    });

    it('unclaimedForReports returns nothing when no post reports to this one', async () => {
      prisma.position.findMany.mockResolvedValue([]);
      expect(await service.unclaimedForReports('pos1')).toEqual([]);
      expect(prisma.task.findMany).not.toHaveBeenCalled();
    });

    it('unclaimedForReports only ever asks for unclaimed, non-terminal tasks at the reporting posts', async () => {
      prisma.position.findMany.mockResolvedValue([{ id: 'posA' }, { id: 'posB' }]);
      prisma.task.findMany.mockResolvedValue([]);
      await service.unclaimedForReports('manager-pos');
      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ positionId: { in: ['posA', 'posB'] }, assigneeUserId: null }),
        }),
      );
    });
  });
});
