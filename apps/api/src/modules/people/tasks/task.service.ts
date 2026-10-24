import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../../core/audit/audit.service';
import type { Prisma, Task, TaskState, TaskTransition } from '../../../core/prisma/client';
import type { TaskSourceCreateInput } from '../../../core/extension-points/task-source.registry';

/**
 * sourceType values naming a money-adjacent module — the modules.registry.ts
 * names already used for finance-adjacent work (see KNOWN_MODULE_COUPLINGS'
 * own finance-adjacent entries and AiFeature's budget-gated set for the same
 * kind of list). This is the ONLY scope the tasks.assign/tasks.close toxic
 * pair applies to (DECISIONS.md ADR-050) — most STAFF legitimately holds
 * both keys and self-closes an ordinary task constantly.
 */
const MONEY_ADJACENT_SOURCE_TYPES: ReadonlySet<string> = new Set([
  'finance',
  'accounting',
  'receivables',
  'payments',
  'wallet',
  'settlements',
]);

const NON_TERMINAL_STATES: readonly TaskState[] = ['OPEN', 'IN_PROGRESS', 'BLOCKED'];

/** `TaskState -> TaskState` legal moves. Terminal states: DONE reopens to OPEN (the undo fan-out's own "automatic" reopening); CANCELLED never moves again — this file's own "reversal document, not a flag" reasoning. */
const TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
  OPEN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['BLOCKED', 'DONE', 'CANCELLED', 'OPEN'],
  BLOCKED: ['IN_PROGRESS', 'CANCELLED'],
  DONE: ['OPEN'],
  CANCELLED: [],
};

/**
 * PURE — no `prisma.` call, no `publish(`, holds no state (CLAUDE.md's own
 * "Dry run before live" lens). This is the single legality rule for
 * Task.state: TaskService.transition() calls it before writing, and every
 * task-view response calls it again (readonly, see toView()'s
 * `allowedTransitions`) so the UI disables exactly the buttons this
 * function refuses — one implementation, two callers, per doc 23's own
 * acceptance criterion.
 */
export function canTransitionTask(from: TaskState, to: TaskState): boolean {
  if (from === to) {
    // The only same-state "transition" is a stage change while IN_PROGRESS
    // (doc 23: stages exist "inside IN_PROGRESS"). Any other self-loop is a
    // no-op, refused by transition() itself for carrying no real change.
    return from === 'IN_PROGRESS';
  }
  return TRANSITIONS[from].includes(to);
}

/**
 * "How long did this sit in BLOCKED" — doc 23's own acceptance criterion:
 * "Cycle time in each state is computable from TaskTransition alone,
 * proven by a spec that reconstructs it without reading Task.state." PURE:
 * takes only the transition rows (ordered ascending by `occurredAt`, the
 * first one always the initial `fromState: null` row `create()` writes)
 * plus an `until` boundary for whatever state the task is CURRENTLY in —
 * never a `Task` row, so nothing here could accidentally read `.state`.
 */
export function cycleTimeMs(
  transitions: readonly { toState: TaskState; occurredAt: Date }[],
  until: Date,
): Record<TaskState, number> {
  const totals: Record<TaskState, number> = { OPEN: 0, IN_PROGRESS: 0, BLOCKED: 0, DONE: 0, CANCELLED: 0 };
  for (let i = 0; i < transitions.length; i++) {
    const start = transitions[i].occurredAt;
    const end = i + 1 < transitions.length ? transitions[i + 1].occurredAt : until;
    totals[transitions[i].toState] += end.getTime() - start.getTime();
  }
  return totals;
}

export interface TaskView {
  id: string;
  reference: string;
  title: string;
  detail: string | null;
  positionId: string;
  positionTitle: string;
  assigneeUserId: string | null;
  orgUnitId: string;
  state: TaskState;
  stageId: string | null;
  priority: number;
  dueAt: Date | null;
  sourceType: string | null;
  sourceId: string | null;
  sourceRef: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  closedAt: Date | null;
  /** Computed by canTransitionTask() for every possible target — the UI's own disable-button data. */
  allowedTransitions: TaskState[];
}

type TaskRow = Task & { position: { title: string } };

const TASK_SELECT = {
  id: true,
  reference: true,
  title: true,
  detail: true,
  positionId: true,
  assigneeUserId: true,
  orgUnitId: true,
  state: true,
  stageId: true,
  priority: true,
  dueAt: true,
  sourceType: true,
  sourceId: true,
  sourceRef: true,
  createdByUserId: true,
  createdAt: true,
  closedAt: true,
  position: { select: { title: true } },
} satisfies Prisma.TaskSelect;

/**
 * The sole writer of `Task`/`TaskTransition`
 * (tasks-notifications-support/23-tasks-allotment-tracking.md, WO-23.2).
 * Every state change goes through `transition()` — no other method in this
 * class, and nothing outside it, writes `Task.state` directly.
 */
@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── reads ───────────────────────────────────────────────────────────────

  async get(taskId: string): Promise<{ task: TaskView; transitions: TaskTransition[] }> {
    const row = await this.prisma.task.findUnique({ where: { id: taskId }, select: TASK_SELECT });
    if (!row) throw new NotFoundException('That task does not exist.');
    const transitions = await this.prisma.taskTransition.findMany({
      where: { taskId },
      orderBy: { occurredAt: 'asc' },
    });
    return { task: toView(row), transitions };
  }

  /** Tasks currently assigned to `userId` — "my work" — never DONE/CANCELLED. */
  async myTasks(userId: string): Promise<TaskView[]> {
    const rows = await this.prisma.task.findMany({
      where: { assigneeUserId: userId, state: { in: [...NON_TERMINAL_STATES] } },
      select: TASK_SELECT,
      orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
    });
    return rows.map(toView);
  }

  /** Every task at a post — for whoever holds it, or is deciding whether to pick it up. */
  async postQueue(positionId: string, includeClosed = false): Promise<TaskView[]> {
    const rows = await this.prisma.task.findMany({
      where: { positionId, ...(includeClosed ? {} : { state: { in: [...NON_TERMINAL_STATES] } }) },
      select: TASK_SELECT,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toView);
  }

  /**
   * The leaver-handling screen (WO-23.4): every unclaimed, open task at a
   * post that reports to `managerPositionId` — the org-chart escalation
   * doc 23 itself names ("surfaced ... to the post's reportsTo"), not a
   * literal address.
   */
  async unclaimedForReports(managerPositionId: string): Promise<TaskView[]> {
    const reports = await this.prisma.position.findMany({
      where: { reportsToId: managerPositionId },
      select: { id: true },
    });
    if (reports.length === 0) return [];

    const rows = await this.prisma.task.findMany({
      where: {
        positionId: { in: reports.map((r) => r.id) },
        assigneeUserId: null,
        state: { in: [...NON_TERMINAL_STATES] },
      },
      select: TASK_SELECT,
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(toView);
  }

  // ─── writes ──────────────────────────────────────────────────────────────

  /** Human-initiated creation — gated by `tasks.assign` at the controller. */
  async create(
    input: { title: string; detail?: string | null; positionId: string; priority?: number; dueAt?: Date | null },
    actorId: string | null,
  ): Promise<TaskView> {
    const title = cleanRequired(input.title, 'a title');
    const position = await this.prisma.position.findUnique({ where: { id: input.positionId }, select: { id: true, orgUnitId: true } });
    if (!position) throw new BadRequestException('That position does not exist.');

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          reference: '', // set below once we have the id — see referenceFor()
          title,
          detail: input.detail ?? null,
          positionId: position.id,
          // Copied at write time from the position's OWN orgUnit (never a
          // caller-supplied value, never a default() function) — a later
          // re-parent of the position does not move this task's history.
          orgUnitId: position.orgUnitId,
          priority: input.priority ?? 0,
          dueAt: input.dueAt ?? null,
          createdByUserId: actorId,
        },
        select: TASK_SELECT,
      });
      const withReference = await tx.task.update({
        where: { id: created.id },
        data: { reference: referenceFor(created.id) },
        select: TASK_SELECT,
      });
      await tx.taskTransition.create({
        data: { taskId: created.id, fromState: null, toState: 'OPEN', byUserId: actorId },
      });
      await this.audit.recordEvidence(tx, {
        actorId,
        action: 'task.created',
        entity: 'Task',
        entityId: created.id,
        data: { positionId: position.id, title },
      });
      return withReference;
    });

    return toView(row);
  }

  /**
   * Machine-created, from a registered TaskSourceRegistry mapping (WO-23.3).
   * `createdByUserId`/the initial transition's `byUserId` are both NULL —
   * the "principal with no permission key" lens's own answer for telling
   * machine from human. Idempotent: a redelivered domain event resolves to
   * the SAME (sourceType, sourceRef) and the unique constraint below makes
   * the second attempt a no-op that returns the existing row, never a
   * thrown duplicate error the outbox would retry forever.
   */
  async createFromSource(input: TaskSourceCreateInput): Promise<TaskView> {
    const existing = await this.prisma.task.findUnique({
      where: { sourceType_sourceRef: { sourceType: input.sourceType, sourceRef: input.sourceRef } },
      select: TASK_SELECT,
    });
    if (existing) return toView(existing);

    const position = await this.prisma.position.findUnique({ where: { id: input.positionId }, select: { id: true, orgUnitId: true } });
    if (!position) {
      throw new BadRequestException(`Task source "${input.sourceType}" named a position that does not exist: ${input.positionId}`);
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.task.create({
          data: {
            reference: '',
            title: cleanRequired(input.title, 'a title'),
            detail: input.detail ?? null,
            positionId: position.id,
            orgUnitId: position.orgUnitId,
            priority: input.priority ?? 0,
            dueAt: input.dueAt ?? null,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            sourceRef: input.sourceRef,
            createdByUserId: null,
          },
          select: TASK_SELECT,
        });
        const withReference = await tx.task.update({
          where: { id: created.id },
          data: { reference: referenceFor(created.id) },
          select: TASK_SELECT,
        });
        await tx.taskTransition.create({
          data: { taskId: created.id, fromState: null, toState: 'OPEN', byUserId: null },
        });
        await this.audit.recordEvidence(tx, {
          actorId: null,
          action: 'task.created',
          entity: 'Task',
          entityId: created.id,
          data: { positionId: position.id, sourceType: input.sourceType, sourceId: input.sourceId },
        });
        return withReference;
      });
      return toView(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Lost a race against a concurrent redelivery of the same event —
        // the row now exists; return it rather than throwing.
        const race = await this.prisma.task.findUnique({
          where: { sourceType_sourceRef: { sourceType: input.sourceType, sourceRef: input.sourceRef } },
          select: TASK_SELECT,
        });
        if (race) return toView(race);
      }
      throw error;
    }
  }

  /**
   * Sets who currently holds the task. Never writes a TaskTransition —
   * that table's columns (fromState/toState/fromStageId/toStageId) are
   * about Task.state, never about who holds it (doc 23's own schema has no
   * assignee column on TaskTransition). Recorded instead as an AuditLog
   * evidence row, action 'task.assigned' — the cross-cutting "AuditService
   * records ... reassigned" requirement, and ALSO the exact record
   * TaskService.close()'s own toxic-pair check reads to find "who this was
   * assigned to," since Task.assigneeUserId alone can be cleared later
   * (WO-23.4's own unclaim) and would then answer the wrong question.
   */
  async assign(taskId: string, assigneeUserId: string | null, actorId: string): Promise<TaskView> {
    const existing = await this.prisma.task.findUnique({ where: { id: taskId }, select: { id: true, state: true } });
    if (!existing) throw new NotFoundException('That task does not exist.');
    if (existing.state === 'CANCELLED') throw new BadRequestException('This task is cancelled — it cannot be assigned.');

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({ where: { id: taskId }, data: { assigneeUserId }, select: TASK_SELECT });
      await this.audit.recordEvidence(tx, {
        actorId,
        action: 'task.assigned',
        entity: 'Task',
        entityId: taskId,
        data: { assigneeUserId },
      });
      return updated;
    });

    return toView(row);
  }

  /**
   * The sole writer of `Task.state`. Refuses an illegal move with the SAME
   * function (`canTransitionTask`) a task view's `allowedTransitions`
   * exposes to the UI. `actorId` NULL means the system moved it (a cron, an
   * escalation) — not used yet in this build, carried for a future one.
   */
  async transition(
    taskId: string,
    to: TaskState,
    actorId: string | null,
    opts: { toStageId?: string | null; reason?: string } = {},
  ): Promise<TaskView> {
    const existing = await this.prisma.task.findUnique({ where: { id: taskId }, select: TASK_SELECT });
    if (!existing) throw new NotFoundException('That task does not exist.');

    if (!canTransitionTask(existing.state, to)) {
      throw new BadRequestException(`Cannot move a task from ${existing.state} to ${to}.`);
    }
    const toStageId = opts.toStageId ?? existing.stageId;
    if (existing.state === to && toStageId === existing.stageId) {
      throw new BadRequestException('Nothing to change — same state, same stage.');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          state: to,
          stageId: toStageId,
          closedAt: to === 'DONE' || to === 'CANCELLED' ? new Date() : to === 'OPEN' ? null : undefined,
        },
        select: TASK_SELECT,
      });
      await tx.taskTransition.create({
        data: {
          taskId,
          fromState: existing.state,
          toState: to,
          fromStageId: existing.stageId,
          toStageId,
          byUserId: actorId,
          reason: opts.reason ?? null,
        },
      });
      await this.audit.recordEvidence(tx, {
        actorId,
        action: 'task.transitioned',
        entity: 'Task',
        entityId: taskId,
        data: { fromState: existing.state, toState: to },
      });
      return updated;
    });

    return toView(row);
  }

  /**
   * Reaching DONE or CANCELLED — gated by `tasks.close` at the controller.
   * The toxic-pair check (DECISIONS.md ADR-050): for a task whose
   * `sourceType` names a money-adjacent module, refuse a DONE close whose
   * actor is the same user the task was most recently assigned to — "who
   * assigned it" is read from AuditLog ('task.assigned'), NOT from the
   * current Task.assigneeUserId, because that column can already have been
   * cleared (WO-23.4's own leaver unclaim) by the time this runs, which
   * would otherwise let the original self-assigner slip the check. Mirrors
   * `PosShiftsService.closeShift()`'s own actor-vs-stored-id shape
   * (CLAUDE.md's own house style for this class of check).
   */
  async close(taskId: string, to: 'DONE' | 'CANCELLED', actorId: string, reason?: string): Promise<TaskView> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { sourceType: true } });
    if (!task) throw new NotFoundException('That task does not exist.');

    if (to === 'DONE' && task.sourceType && MONEY_ADJACENT_SOURCE_TYPES.has(task.sourceType)) {
      const lastAssignment = await this.prisma.auditLog.findFirst({
        where: { entity: 'Task', entityId: taskId, action: 'task.assigned' },
        orderBy: { createdAt: 'desc' },
        select: { data: true },
      });
      const assignedTo = (lastAssignment?.data as { assigneeUserId?: string | null } | null)?.assigneeUserId ?? null;
      if (assignedTo && assignedTo === actorId) {
        throw new ForbiddenException(
          'This task belongs to a money-adjacent module — the person it was assigned to may not also close it. Have someone else close it.',
        );
      }
    }

    return this.transition(taskId, to, actorId, { reason });
  }
}

function toView(row: TaskRow): TaskView {
  const allowedTransitions = (['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'] as const).filter((state) =>
    canTransitionTask(row.state, state),
  );
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    detail: row.detail,
    positionId: row.positionId,
    positionTitle: row.position.title,
    assigneeUserId: row.assigneeUserId,
    orgUnitId: row.orgUnitId,
    state: row.state,
    stageId: row.stageId,
    priority: row.priority,
    dueAt: row.dueAt,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    sourceRef: row.sourceRef,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    closedAt: row.closedAt,
    allowedTransitions,
  };
}

/**
 * Derived straight from the row's own `id` — see tasks.prisma's own header
 * comment for why this, and not a shared max()+1 counter, is what CLAUDE.md's
 * "adoption test" lens requires here (safe for two branch nodes creating
 * tasks offline to never collide).
 */
function referenceFor(id: string): string {
  return `TASK-${id.slice(-8).toUpperCase()}`;
}

function cleanRequired(raw: string, what: string): string {
  const value = raw.trim();
  if (!value) throw new BadRequestException(`Enter ${what}.`);
  return value;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002';
}
