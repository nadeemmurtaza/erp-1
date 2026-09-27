import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { AuthenticatedOnly, CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { CreateMeetingDto, RespondMeetingDto } from './dto/notify.dto';
import { MeetingsService } from './meetings.service';

/**
 * tasks-notifications-support/24-internal-notifications-meetings-escalation.md
 * (WO-24.3). Calling a meeting needs `notify.send` (it addresses an
 * audience, same as a broadcast); responding to or viewing the shortfall
 * of one you were invited to needs only to hold that invitation — any
 * authenticated user.
 */
@ApiTags('admin/notify/meetings')
@Controller('admin/notify/meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Post()
  @RequirePermission('notify.send')
  @ApiOperation({ summary: 'Call a meeting, materialising invitations from the resolved audience' })
  create(@Body() dto: CreateMeetingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.meetings.create(
      {
        title: dto.title,
        detail: dto.detail,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        timezone: dto.timezone,
        location: dto.location,
        orgUnitId: dto.orgUnitId,
        audience: dto.audience,
      },
      user.id,
    );
  }

  @Post(':id/respond')
  @AuthenticatedOnly()
  @ApiOperation({ summary: "Answer your own invitation to a meeting" })
  respond(@Param('id') id: string, @Body() dto: RespondMeetingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.meetings.respond(id, user.id, dto.response);
  }

  @Get(':id/shortfall')
  @RequirePermission('notify.send')
  @ApiOperation({ summary: 'Required invitees who have not yet answered' })
  shortfall(@Param('id') id: string) {
    return this.meetings.shortfallReport(id);
  }

  @Post(':id/cancel')
  @RequirePermission('notify.send')
  @ApiOperation({ summary: 'Cancel a meeting — notifies every invitee, never deletes the record' })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.meetings.cancel(id, user.id);
  }
}
