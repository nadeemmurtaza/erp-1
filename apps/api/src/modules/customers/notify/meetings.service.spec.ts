import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AudienceService } from './audience.service';
import { MeetingsService } from './meetings.service';

describe('MeetingsService', () => {
  let service: MeetingsService;
  let prisma: any;
  let notifications: any;

  beforeEach(async () => {
    prisma = {
      audience: { create: jest.fn() },
      meeting: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      meetingInvitation: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      user: { findMany: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    notifications = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeetingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AudienceService, useValue: { resolve: jest.fn().mockResolvedValue({ recipients: [], requestedCount: 0, excludedCount: 0 }) } },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(MeetingsService);
  });

  it('refuses a meeting that ends before it starts', async () => {
    await expect(
      service.create(
        { title: 'T', startsAt: new Date('2026-01-01T10:00:00Z'), endsAt: new Date('2026-01-01T09:00:00Z'), timezone: 'Asia/Karachi', orgUnitId: 'u1', audience: {} },
        'caller1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  describe('shortfallReport', () => {
    it('counts only required invitees who have NOT answered — a decline is an answer, not a shortfall', async () => {
      prisma.meetingInvitation.findMany.mockResolvedValue([
        { userId: 'u1', response: 'NO_RESPONSE' },
        { userId: 'u2', response: 'DECLINED' },
        { userId: 'u3', response: 'ACCEPTED' },
      ]);

      const report = await service.shortfallReport('m1');

      expect(report.requiredCount).toBe(3);
      expect(report.shortfallCount).toBe(1);
      expect(report.shortfallUserIds).toEqual(['u1']);
    });
  });

  describe('respond', () => {
    it('refuses a user who was never invited', async () => {
      prisma.meeting.findUnique.mockResolvedValue({ id: 'm1', cancelledAt: null });
      prisma.meetingInvitation.findUnique.mockResolvedValue(null);

      await expect(service.respond('m1', 'stranger', 'ACCEPTED')).rejects.toThrow(ForbiddenException);
    });

    it('refuses responding to a cancelled meeting', async () => {
      prisma.meeting.findUnique.mockResolvedValue({ id: 'm1', cancelledAt: new Date() });

      await expect(service.respond('m1', 'u1', 'ACCEPTED')).rejects.toThrow(ConflictException);
    });
  });

  describe('cancel', () => {
    it('only the meeting\'s own caller may cancel it', async () => {
      prisma.meeting.findUnique.mockResolvedValue({ id: 'm1', cancelledAt: null, calledByUserId: 'caller1' });

      await expect(service.cancel('m1', 'someone-else')).rejects.toThrow(ForbiddenException);
    });

    it('notifies every invitee and marks cancelledAt, never deletes the meeting', async () => {
      prisma.meeting.findUnique.mockResolvedValue({ id: 'm1', cancelledAt: null, calledByUserId: 'caller1', title: 'Standup', startsAt: new Date() });
      prisma.meetingInvitation.findMany.mockResolvedValue([{ userId: 'u1' }]);
      prisma.user.findMany.mockResolvedValue([{ id: 'u1', firstName: 'A', lastName: 'B', email: 'a@x.test', phone: null }]);
      prisma.meeting.update.mockResolvedValue({ id: 'm1', cancelledAt: new Date() });

      await service.cancel('m1', 'caller1');

      expect(prisma.meeting.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { cancelledAt: expect.any(Date) } });
      expect(notifications.send).toHaveBeenCalledTimes(1);
    });
  });
});
