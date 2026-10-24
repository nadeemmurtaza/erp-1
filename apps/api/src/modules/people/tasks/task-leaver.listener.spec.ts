import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../../core/audit/audit.service';
import { TaskLeaverListener } from './task-leaver.listener';

/**
 * WO-23.4 — doc 23's own rule: "It does not silently reassign." Every open
 * task at the ended posting's own post, still held by that user, is
 * unclaimed — left at the post, never moved and never given to someone
 * else automatically.
 */
describe('TaskLeaverListener', () => {
  let listener: TaskLeaverListener;
  let prisma: any;
  let audit: any;

  const payload = { postingId: 'posting1', userId: 'u1', positionId: 'pos1', endedOn: '2026-03-01T00:00:00.000Z' };

  beforeEach(async () => {
    prisma = {
      task: { findMany: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    audit = { recordEvidence: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskLeaverListener, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    listener = module.get(TaskLeaverListener);
  });

  it('does nothing when the ended posting held no open tasks', async () => {
    prisma.task.findMany.mockResolvedValue([]);
    await listener.onPostingEnded(payload);
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
    expect(audit.recordEvidence).not.toHaveBeenCalled();
  });

  it('unclaims every OPEN/IN_PROGRESS/BLOCKED task assigned to that user at that post — never reassigns', async () => {
    prisma.task.findMany.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);

    await listener.onPostingEnded(payload);

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { positionId: 'pos1', assigneeUserId: 'u1', state: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] } },
      }),
    );
    expect(prisma.task.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['t1', 't2'] } }, data: { assigneeUserId: null } });
    // Never sets a NEW assigneeUserId — the write is exclusively a clear.
    expect(prisma.task.updateMany.mock.calls[0][0].data).toEqual({ assigneeUserId: null });
  });

  it('records an audit row per unclaimed task, naming the posting that ended', async () => {
    prisma.task.findMany.mockResolvedValue([{ id: 't1' }]);

    await listener.onPostingEnded(payload);

    expect(audit.recordEvidence).toHaveBeenCalledWith(prisma, [
      expect.objectContaining({
        action: 'task.unclaimed',
        entity: 'Task',
        entityId: 't1',
        data: { reason: 'posting_ended', postingId: 'posting1', previousAssigneeUserId: 'u1' },
      }),
    ]);
  });

  it('is idempotent on a redelivered PostingEnded — the second run finds nothing left to unclaim', async () => {
    prisma.task.findMany.mockResolvedValueOnce([{ id: 't1' }]).mockResolvedValueOnce([]); // already cleared by the first run
    await listener.onPostingEnded(payload);
    await listener.onPostingEnded(payload);
    expect(prisma.task.updateMany).toHaveBeenCalledTimes(1);
  });
});
