import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { AuthenticatedOnly, CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { AttendanceService } from './attendance.service';
import { AdjustDto, CreateShiftDto, ManagerPunchDto, PunchDto, ResolveExceptionDto } from './dto/attendance.dto';

/**
 * attendance-workforce/22-attendance-shifts-leave.md. Self-punch and
 * reading your own history need no capability beyond being signed in
 * (`@AuthenticatedOnly()`) — this document's own "Solo: self punch on one
 * screen, no devices, no roster" silhouette. Recording on someone else's
 * behalf, importing, and reconciling each need their own permission,
 * checked again inside `AttendanceService` where a check depends on who the
 * caller is (adjust's own authorisation), never trusted from the route
 * decorator alone.
 */
@ApiTags('admin/attendance')
@Controller('admin/attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('punch')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Punch yourself in/out — never refused' })
  punch(@Body() dto: PunchDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.record(
      {
        userId: user.id,
        kind: dto.kind,
        occurredAt: new Date(dto.occurredAt),
        timezone: dto.timezone,
        orgUnitId: dto.orgUnitId,
        source: 'SELF',
        externalRef: dto.externalRef,
      },
      user.id,
    );
  }

  @Post('punch/manager')
  @RequirePermission('hr.attendance.record')
  @ApiOperation({ summary: 'Record a punch on someone else’s behalf — never refused' })
  punchManager(@Body() dto: ManagerPunchDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.record(
      {
        userId: dto.userId,
        kind: dto.kind,
        occurredAt: new Date(dto.occurredAt),
        timezone: dto.timezone,
        orgUnitId: dto.orgUnitId,
        source: 'MANAGER',
        externalRef: dto.externalRef,
      },
      user.id,
    );
  }

  @Get('events')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Your own attendance events in a date range' })
  listOwnEvents(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.listEvents(user.id, new Date(from), new Date(to));
  }

  @Get('events/:userId')
  @RequirePermission('hr.attendance.view', 'hr.attendance.reconcile')
  @ApiOperation({ summary: "Someone else's attendance events in a date range" })
  listEvents(@Param('userId') userId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.attendance.listEvents(userId, new Date(from), new Date(to));
  }

  @Get('exceptions')
  @RequirePermission('hr.attendance.view', 'hr.attendance.reconcile')
  @ApiOperation({ summary: 'Attendance exceptions — the reconcile queue' })
  listExceptions(@Query('orgUnitId') orgUnitId?: string, @Query('resolved') resolved?: string) {
    return this.attendance.listExceptions({
      orgUnitId,
      resolved: resolved === undefined ? undefined : resolved === 'true',
    });
  }

  @Post('exceptions/:id/resolve')
  @RequirePermission('hr.attendance.reconcile')
  @ApiOperation({ summary: 'Clear an exception' })
  resolve(@Param('id') id: string, @Body() dto: ResolveExceptionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.reconcile(id, user.id, dto.note);
  }

  @Post('adjust/preview')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Which refusals an adjustment would hit, without writing anything' })
  previewAdjust(@Body() dto: AdjustDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.previewAdjust(
      { ...dto, originalEventOccurredAt: new Date(dto.originalEventOccurredAt), newOccurredAt: new Date(dto.newOccurredAt) },
      user.id,
    );
  }

  @Post('adjust')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Correct an event — never mutates the original row' })
  adjust(@Body() dto: AdjustDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.adjust(
      { ...dto, originalEventOccurredAt: new Date(dto.originalEventOccurredAt), newOccurredAt: new Date(dto.newOccurredAt) },
      user.id,
    );
  }

  @Get('shifts')
  @RequirePermission('hr.attendance.view', 'hr.attendance.record', 'hr.attendance.reconcile')
  @ApiOperation({ summary: 'Shifts for one person' })
  listShifts(@Query('userId') userId: string) {
    return this.attendance.listShifts(userId);
  }

  @Post('shifts')
  @RequirePermission('hr.attendance.record')
  @ApiOperation({ summary: 'Create a planned shift' })
  createShift(@Body() dto: CreateShiftDto) {
    return this.attendance.createShift({
      userId: dto.userId,
      orgUnitId: dto.orgUnitId,
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
      timezone: dto.timezone,
    });
  }
}
