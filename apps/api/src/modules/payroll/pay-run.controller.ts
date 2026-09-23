import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { BuildPayRunDto } from './dto/pay-run.dto';
import { PayRunService } from './pay-run.service';

/**
 * Pay-run build/approve/post (docs/implementation/19-payroll.md WO-19.4).
 * Every route here is cross-employee by nature, so all of them require
 * either payroll.view (reads) or payroll.manage (the lifecycle writes) —
 * no "own" variant, the way compensation and leave both have one.
 */
@ApiTags('admin/payroll')
@Controller('admin/payroll/runs')
export class PayRunController {
  constructor(private readonly payRuns: PayRunService) {}

  @Get()
  @RequirePermission('payroll.view')
  @ApiOperation({ summary: 'Every pay run, most recent period first.' })
  async list(@Query('status') status?: 'DRAFT' | 'APPROVED' | 'POSTED') {
    return this.payRuns.list(status);
  }

  @Get(':id')
  @RequirePermission('payroll.view')
  @ApiOperation({ summary: 'One pay run with every line.' })
  async get(@Param('id') id: string) {
    return this.payRuns.get(id);
  }

  @Post()
  @RequirePermission('payroll.manage')
  @ApiOperation({ summary: 'Build a new DRAFT pay run for a period.' })
  async build(@Body() dto: BuildPayRunDto, @CurrentUser() user: AuthenticatedUser) {
    return this.payRuns.build(new Date(dto.periodStart), new Date(dto.periodEnd), dto.scopeLevel, user.id);
  }

  @Patch(':id/rebuild')
  @RequirePermission('payroll.manage')
  @ApiOperation({ summary: 'Recompute every line on a still-DRAFT pay run, replacing them.' })
  async rebuild(@Param('id') id: string, @Body() dto: BuildPayRunDto, @CurrentUser() user: AuthenticatedUser) {
    return this.payRuns.build(new Date(dto.periodStart), new Date(dto.periodEnd), dto.scopeLevel, user.id, id);
  }

  @Patch(':id/approve')
  @RequirePermission('payroll.manage')
  @ApiOperation({ summary: 'DRAFT → APPROVED.' })
  async approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.payRuns.approve(id, user.id);
  }

  @Patch(':id/post')
  @RequirePermission('payroll.manage')
  @ApiOperation({ summary: 'APPROVED → POSTED. Fires payroll.run_posted.' })
  async post(@Param('id') id: string) {
    return this.payRuns.post(id);
  }
}
