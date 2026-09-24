import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DecideLeaveDto, RequestLeaveDto } from './dto/leave.dto';
import { LeaveService } from './leave.service';

/**
 * Leave types, balances and requests (docs/implementation/payroll/19-payroll.md
 * WO-19.3). "Own record" routes act on @CurrentUser() only, same shape as
 * PayrollController's compensation/me.
 */
@ApiTags('admin/payroll')
@Controller('admin/payroll/leave')
export class LeaveController {
  constructor(
    private readonly leave: LeaveService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('types')
  @RequirePermission('payroll.view_own')
  @ApiOperation({ summary: 'Every active leave type — needed by anyone filing a request.' })
  async types() {
    return this.leave.listTypes();
  }

  @Get('me')
  @RequirePermission('payroll.view_own')
  @ApiOperation({ summary: "The caller's own leave balances and request history." })
  async mine(@CurrentUser() user: AuthenticatedUser) {
    const [balances, requests] = await Promise.all([this.leave.balances(user.id), this.leave.requests(user.id)]);
    return { balances, requests };
  }

  @Post('me')
  @RequirePermission('payroll.view_own')
  @ApiOperation({ summary: 'File a leave request for the caller.' })
  async request(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestLeaveDto) {
    return this.leave.requestLeave(user.id, dto.leaveTypeId, new Date(dto.startDate), new Date(dto.endDate), dto.reason);
  }

  @Post('me/:requestId/cancel')
  @RequirePermission('payroll.view_own')
  @ApiOperation({ summary: "Cancel the caller's own pending leave request." })
  async cancelOwn(@CurrentUser() user: AuthenticatedUser, @Param('requestId') requestId: string) {
    return this.leave.cancel(requestId, user.id);
  }

  @Get()
  @RequirePermission('payroll.view')
  @ApiOperation({ summary: 'Every leave request across every employee, newest first.' })
  async all(@Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED') {
    return this.prisma.leaveRequest.findMany({
      where: status ? { status } : {},
      include: { leaveType: true, user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':userId')
  @RequirePermission('payroll.view')
  @ApiOperation({ summary: "One employee's leave balances and request history." })
  async forUser(@Param('userId') userId: string) {
    const [balances, requests] = await Promise.all([this.leave.balances(userId), this.leave.requests(userId)]);
    return { balances, requests };
  }

  @Patch(':requestId/decide')
  @RequirePermission('payroll.manage')
  @ApiOperation({ summary: 'Approve or reject a pending leave request.' })
  async decide(
    @Param('requestId') requestId: string,
    @Body() dto: DecideLeaveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leave.decide(requestId, user.id, dto.status, dto.note);
  }
}
