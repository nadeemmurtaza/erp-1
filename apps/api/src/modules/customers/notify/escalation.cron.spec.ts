import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { EscalationCron } from './escalation.cron';

/**
 * tasks-notifications-support/24-internal-notifications-meetings-escalation.md
 * (WO-24.4) — "It climbs posts, not people" (a vacant post costs no step)
 * and "it has a ceiling and a fire count" are this document's own two
 * rules; every test here proves one of them directly.
 */
describe('EscalationCron', () => {
  let cron: EscalationCron;
  let prisma: any;
  let notifications: any;

  const rule = { id: 'rule1', sourceType: 'requisition', afterMinutes: 60, stepsPerFire: 1, ceilingRankLevel: null, maxFires: 3 };
  const oldEnough = new Date(Date.now() - 61 * 60_000);
  const tooRecent = new Date(Date.now() - 5 * 60_000);

  beforeEach(async () => {
    prisma = {
      escalationRule: { findMany: jest.fn().mockResolvedValue([rule]) },
      task: { findMany: jest.fn() },
      escalationFire: { findFirst: jest.fn(), create: jest.fn() },
      position: { findUnique: jest.fn() },
      posting: { findFirst: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    notifications = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [EscalationCron, { provide: PrismaService, useValue: prisma }, { provide: NotificationsService, useValue: notifications }],
    }).compile();

    cron = module.get(EscalationCron);
  });

  it('does not fire before afterMinutes has actually elapsed', async () => {
    prisma.task.findMany.mockResolvedValue([{ id: 't1', positionId: 'posA', title: 'T', createdAt: tooRecent, transitions: [] }]);
    prisma.escalationFire.findFirst.mockResolvedValue(null);

    await cron.run();

    expect(prisma.escalationFire.create).not.toHaveBeenCalled();
  });

  it('never fires past the rule\'s own maxFires', async () => {
    prisma.task.findMany.mockResolvedValue([{ id: 't1', positionId: 'posA', title: 'T', createdAt: oldEnough, transitions: [] }]);
    prisma.escalationFire.findFirst.mockResolvedValue({ fireNumber: 3 }); // already at maxFires (3)

    await cron.run();

    expect(prisma.escalationFire.create).not.toHaveBeenCalled();
    expect(prisma.position.findUnique).not.toHaveBeenCalled();
  });

  it('skips a vacant post for free — it costs no step of stepsPerFire', async () => {
    prisma.task.findMany.mockResolvedValue([{ id: 't1', positionId: 'posA', title: 'T', createdAt: oldEnough, transitions: [] }]);
    prisma.escalationFire.findFirst.mockResolvedValue(null);
    prisma.position.findUnique
      .mockResolvedValueOnce({ reportsToId: 'posB' }) // posA -> posB
      .mockResolvedValueOnce({ reportsToId: 'posC' }); // posB -> posC (climbing on, since posB is vacant)
    prisma.posting.findFirst
      .mockResolvedValueOnce(null) // posB has no active holder — vacant, skipped for free
      .mockResolvedValueOnce({ userId: 'holderC' }) // posC IS held — satisfies the one required step
      .mockResolvedValueOnce({ userId: 'holderC' }); // notifyHolder()'s own lookup
    prisma.user.findUnique.mockResolvedValue({ firstName: 'C', lastName: 'Holder', email: 'c@x.test', phone: null });

    await cron.run();

    expect(prisma.escalationFire.create).toHaveBeenCalledWith({
      data: { taskId: 't1', ruleId: 'rule1', fireNumber: 1, climbedToPositionId: 'posC' },
    });
    expect(notifications.send).toHaveBeenCalledTimes(1);
  });

  it('stops at the ceiling before reaching a rank above it, firing nothing', async () => {
    const ceilingRule = { ...rule, ceilingRankLevel: 20 };
    prisma.escalationRule.findMany.mockResolvedValue([ceilingRule]);
    prisma.task.findMany.mockResolvedValue([{ id: 't1', positionId: 'posA', title: 'T', createdAt: oldEnough, transitions: [] }]);
    prisma.escalationFire.findFirst.mockResolvedValue(null);
    prisma.position.findUnique
      .mockResolvedValueOnce({ reportsToId: 'posB' }) // posA -> posB
      .mockResolvedValueOnce({ rank: { level: 30 } }); // posB's own rank exceeds the ceiling (20)

    await cron.run();

    expect(prisma.posting.findFirst).not.toHaveBeenCalled();
    expect(prisma.escalationFire.create).not.toHaveBeenCalled();
  });

  it('a duplicate fire from an overlapping tick is a no-op, never a thrown error', async () => {
    prisma.task.findMany.mockResolvedValue([{ id: 't1', positionId: 'posA', title: 'T', createdAt: oldEnough, transitions: [] }]);
    prisma.escalationFire.findFirst.mockResolvedValue(null);
    prisma.position.findUnique.mockResolvedValueOnce({ reportsToId: 'posB' });
    prisma.posting.findFirst.mockResolvedValueOnce({ userId: 'holderB' });
    prisma.escalationFire.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));

    await expect(cron.run()).resolves.toBeUndefined();
    expect(notifications.send).not.toHaveBeenCalled();
  });
});
