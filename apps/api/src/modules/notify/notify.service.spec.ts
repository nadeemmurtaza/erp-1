import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApprovalService } from '../../core/approvals/approval.service';
import { AuditService } from '../../core/audit/audit.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AudienceService } from './audience.service';
import { NotifyService } from './notify.service';

describe('NotifyService', () => {
  let service: NotifyService;
  let prisma: any;
  let settings: any;
  let approvals: any;
  let notifications: any;
  let audit: any;
  let audienceResolve: jest.Mock;

  const recipients = [{ userId: 'r1', name: 'R One', email: 'r1@x.test', phone: null }];

  beforeEach(async () => {
    audienceResolve = jest.fn().mockResolvedValue({ recipients, requestedCount: 1, excludedCount: 0 });

    prisma = {
      audience: { create: jest.fn().mockResolvedValue({ id: 'aud1' }) },
      broadcastMessage: {
        create: jest.fn().mockResolvedValue({ id: 'msg1' }),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      posting: { findFirst: jest.fn() },
    };
    settings = { get: jest.fn() };
    approvals = { start: jest.fn(), decide: jest.fn(), getChain: jest.fn() };
    notifications = { send: jest.fn() };
    audit = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotifyService,
        { provide: PrismaService, useValue: prisma },
        { provide: AudienceService, useValue: { resolve: audienceResolve } },
        { provide: SettingsService, useValue: settings },
        { provide: ApprovalService, useValue: approvals },
        { provide: NotificationsService, useValue: notifications },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(NotifyService);
  });

  it('refuses an empty subject or body', async () => {
    await expect(service.send({ audience: {}, subject: '', body: 'x' }, 'sender1')).rejects.toThrow(BadRequestException);
  });

  it('sends immediately when the resolved recipient count is under the quorum', async () => {
    settings.get.mockResolvedValueOnce(30).mockResolvedValueOnce(50); // rank, quorum count — 1 recipient is under 50

    const result = await service.send({ audience: {}, subject: 'Hi', body: 'Body' }, 'sender1');

    expect(result.status).toBe('SENT');
    expect(notifications.send).toHaveBeenCalledTimes(1);
    expect(prisma.broadcastMessage.update).toHaveBeenCalledWith({ where: { id: 'msg1' }, data: { sentAt: expect.any(Date) } });
    expect(approvals.start).not.toHaveBeenCalled();
  });

  it('submits for countersignature when above the quorum, routed to the sender\'s own manager', async () => {
    audienceResolve.mockResolvedValue({ recipients: Array(100).fill(recipients[0]), requestedCount: 100, excludedCount: 0 });
    settings.get.mockResolvedValueOnce(30).mockResolvedValueOnce(50); // quorum count 50 < 100 recipients
    prisma.posting.findFirst
      .mockResolvedValueOnce({ position: { reportsToId: 'pos-manager' } }) // sender's own posting
      .mockResolvedValueOnce({ userId: 'manager1' }); // holder of the manager position
    approvals.start.mockResolvedValue({ id: 'chain1' });

    const result = await service.send({ audience: {}, subject: 'Hi', body: 'Body' }, 'sender1');

    expect(result.status).toBe('PENDING_APPROVAL');
    expect(approvals.start).toHaveBeenCalledWith('BROADCAST_MESSAGE', 'msg1', [{ approverUserId: 'manager1' }]);
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('refuses an above-quorum send when the sender has no manager post to route it to', async () => {
    audienceResolve.mockResolvedValue({ recipients: Array(100).fill(recipients[0]), requestedCount: 100, excludedCount: 0 });
    settings.get.mockResolvedValueOnce(30).mockResolvedValueOnce(50);
    prisma.posting.findFirst.mockResolvedValueOnce(null); // no posting at all

    await expect(service.send({ audience: {}, subject: 'Hi', body: 'Body' }, 'sender1')).rejects.toThrow(BadRequestException);
  });

  describe('decide', () => {
    const message = { id: 'msg1', approvalChainId: 'chain1', sentAt: null, senderId: 'sender1', audienceId: 'aud1', subject: 'S', body: 'B' };

    it('refuses the sender deciding their own broadcast', async () => {
      prisma.broadcastMessage.findUnique.mockResolvedValue(message);
      await expect(service.decide('msg1', 'APPROVE', 'sender1')).rejects.toThrow(ForbiddenException);
    });

    it("refuses anyone other than the step's own approver", async () => {
      prisma.broadcastMessage.findUnique.mockResolvedValue(message);
      approvals.getChain.mockResolvedValue({ id: 'chain1', steps: [{ id: 'step1', status: 'PENDING', approverUserId: 'manager1' }] });

      await expect(service.decide('msg1', 'APPROVE', 'someone-else')).rejects.toThrow(ForbiddenException);
    });

    it('refuses deciding an already-sent message', async () => {
      prisma.broadcastMessage.findUnique.mockResolvedValue({ ...message, sentAt: new Date() });
      await expect(service.decide('msg1', 'APPROVE', 'manager1')).rejects.toThrow(ConflictException);
    });

    it('a rejection never dispatches', async () => {
      prisma.broadcastMessage.findUnique.mockResolvedValue(message);
      approvals.getChain.mockResolvedValue({ id: 'chain1', steps: [{ id: 'step1', status: 'PENDING', approverUserId: 'manager1' }] });
      approvals.decide.mockResolvedValue({ status: 'REJECTED' });

      const result = await service.decide('msg1', 'REJECT', 'manager1');

      expect(result.status).toBe('REJECTED');
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('an approval re-resolves the original audience and dispatches', async () => {
      prisma.broadcastMessage.findUnique.mockResolvedValue(message);
      prisma.audience = {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ orgUnitId: null, includeDescendants: true, minRankLevel: null, positionIds: [] }),
      };
      approvals.getChain.mockResolvedValue({ id: 'chain1', steps: [{ id: 'step1', status: 'PENDING', approverUserId: 'manager1' }] });
      approvals.decide.mockResolvedValue({ status: 'APPROVED' });

      const result = await service.decide('msg1', 'APPROVE', 'manager1');

      expect(result.status).toBe('SENT');
      expect(notifications.send).toHaveBeenCalledTimes(1);
    });
  });
});
