import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { PosShiftsService } from './pos-shifts.service';
import { CloseShiftDto, OpenShiftDto, RecordCashMovementDto } from './dto/pos-shift.dto';

/**
 * Shift and cash-drawer operations (WO-21.2) — day-to-day cashier work, so
 * gated by `pos.operate` (medium sensitivity, handles money), not
 * `pos.manage` (high — issuing a terminal's own device credential). Staff
 * hold both by default; a terminal registration is a setup task, not
 * something a cashier does between customers.
 */
@ApiTags('admin/pos/shifts')
@Controller('admin/pos/shifts')
@RequirePermission('pos.operate')
export class PosShiftsController {
  constructor(private readonly shifts: PosShiftsService) {}

  @Post('open')
  @ApiOperation({ summary: 'Open a shift on a terminal with an opening cash float' })
  async openShift(@Body() dto: OpenShiftDto, @CurrentUser() user: AuthenticatedUser) {
    return this.shifts.openShift(dto.terminalId, user.id, dto.openingCashMinor);
  }

  @Post(':id/close')
  @ApiOperation({ summary: "Close a shift with the cashier's own physical cash count" })
  async closeShift(@Param('id') id: string, @Body() dto: CloseShiftDto, @CurrentUser() user: AuthenticatedUser) {
    return this.shifts.closeShift(id, user.id, dto.closingCashMinor);
  }

  @Post(':id/cash-movements')
  @ApiOperation({ summary: 'Record cash in/out, a drop, or a paid-out against an open shift' })
  async recordCashMovement(
    @Param('id') id: string,
    @Body() dto: RecordCashMovementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shifts.recordCashMovement(id, dto.type, dto.amountMinor, dto.reason, user.id);
  }

  @Get(':id/x-report')
  @ApiOperation({ summary: 'A mid-shift cash snapshot — never closes or mutates the shift' })
  async xReport(@Param('id') id: string) {
    return this.shifts.xReport(id);
  }

  @Get(':id/z-report')
  @ApiOperation({ summary: 'The end-of-shift cash figure — only once the shift is closed' })
  async zReport(@Param('id') id: string) {
    return this.shifts.zReport(id);
  }
}
