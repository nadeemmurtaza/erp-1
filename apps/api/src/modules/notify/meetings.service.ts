import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { InviteResponse } from '../../core/prisma/client';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AudienceService, type AudienceSpec } from './audience.service';

export interface CreateMeetingInput {
  title: string;
  detail?: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  location?: string;
  orgUnitId: string;
  audience: AudienceSpec;
}

export interface MeetingShortfallReport {
  requiredCount: number;
  answeredCount: number;
  shortfallCount: number;
  shortfallUserIds: string[];
}

/**
 * tasks-notifications-support/24-internal-notifications-meetings-escalation.md
 * (WO-24.3). A meeting is a notification with three additions: a time, a
 * place, and a required response — never a new transport. Invitations are
 * materialised at send time (resolved once from the Audience, then fixed)
 * so a person invited Monday can still answer Tuesday after being moved to
 * another department.
 */
@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: AudienceService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(input: CreateMeetingInput, calledByUserId: string) {
    if (input.endsAt <= input.startsAt) {
      throw new BadRequestException('A meeting must end after it starts.');
    }

    const resolution = await this.audience.resolve(input.audience, calledByUserId);

    return this.prisma.$transaction(async (tx) => {
      const audienceRow = await tx.audience.create({
        data: {
          orgUnitId: input.audience.orgUnitId ?? null,
          includeDescendants: input.audience.includeDescendants ?? true,
          minRankLevel: input.audience.minRankLevel ?? null,
          positionIds: input.audience.positionIds ?? [],
          createdByUserId: calledByUserId,
        },
      });

      const meeting = await tx.meeting.create({
        data: {
          title: input.title,
          detail: input.detail,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          timezone: input.timezone,
          location: input.location,
          orgUnitId: input.orgUnitId,
          calledByUserId,
          audienceId: audienceRow.id,
          invitations: {
            create: resolution.recipients.map((r) => ({ userId: r.userId, required: true })),
          },
        },
        include: { invitations: true },
      });

      for (const recipient of resolution.recipients) {
        await this.notifications.send({
          template: 'notify.meeting_invite',
          recipient: { name: recipient.name, email: recipient.email, phone: recipient.phone, userId: recipient.userId },
          subject: `Meeting: ${input.title}`,
          body: `You are invited to "${input.title}" at ${input.startsAt.toISOString()} (${input.timezone}).`,
          data: { meetingId: meeting.id },
        });
      }

      return meeting;
    });
  }

  async respond(meetingId: string, userId: string, response: InviteResponse) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found.');
    if (meeting.cancelledAt) throw new ConflictException('This meeting was cancelled.');

    const invitation = await this.prisma.meetingInvitation.findUnique({
      where: { meetingId_userId: { meetingId, userId } },
    });
    if (!invitation) throw new ForbiddenException('You were not invited to this meeting.');

    return this.prisma.meetingInvitation.update({
      where: { id: invitation.id },
      data: { response, respondedAt: new Date() },
    });
  }

  /** Required invitees who have not answered — "Required means the meeting reports a shortfall when this person does not answer" (doc 24's own words: a decline is an answer, only silence counts). */
  async shortfallReport(meetingId: string): Promise<MeetingShortfallReport> {
    const required = await this.prisma.meetingInvitation.findMany({
      where: { meetingId, required: true },
      select: { userId: true, response: true },
    });
    const nonResponders = required.filter((r) => r.response === 'NO_RESPONSE');
    return {
      requiredCount: required.length,
      answeredCount: required.length - nonResponders.length,
      shortfallCount: nonResponders.length,
      shortfallUserIds: nonResponders.map((r) => r.userId),
    };
  }

  async cancel(meetingId: string, actorId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found.');
    if (meeting.cancelledAt) throw new ConflictException('This meeting is already cancelled.');
    if (meeting.calledByUserId !== actorId) {
      throw new ForbiddenException('Only the person who called this meeting can cancel it.');
    }

    const invitations = await this.prisma.meetingInvitation.findMany({ where: { meetingId }, select: { userId: true } });
    const users = await this.prisma.user.findMany({
      where: { id: { in: invitations.map((i) => i.userId) } },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    });

    const updated = await this.prisma.meeting.update({ where: { id: meetingId }, data: { cancelledAt: new Date() } });

    for (const user of users) {
      await this.notifications.send({
        template: 'notify.meeting_cancelled',
        recipient: {
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
          email: user.email,
          phone: user.phone,
          userId: user.id,
        },
        subject: `Cancelled: ${meeting.title}`,
        body: `"${meeting.title}" scheduled for ${meeting.startsAt.toISOString()} has been cancelled.`,
        data: { meetingId },
      });
    }

    return updated;
  }
}
