import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import type { BankFacilityStatus } from '../../core/prisma/client';
import { BankFacilitiesService } from './bankfacilities.service';
import { CreateBankDto, CreateBankFacilityDto, RecordDrawdownDto, RecordRepaymentDto } from './dto/bank-facility.dto';

/**
 * 167-bank-facility-management.md — reads and the routine register/
 * drawdown/repayment actions sit behind `finance.facilities.manage`;
 * approving an above-threshold drawdown is gated separately by
 * `finance.facilities.approve_drawdown`, checked again inside
 * `BankFacilitiesService.postDrawdown()` itself (never trusted from the
 * route decorator alone).
 */
@ApiTags('admin/bank-facilities')
@Controller('admin/bank-facilities')
@RequirePermission('finance.facilities.manage')
export class BankFacilitiesController {
  constructor(private readonly facilities: BankFacilitiesService) {}

  @Get('banks')
  @RequirePermission('finance.facilities.view', 'finance.facilities.manage')
  @ApiOperation({ summary: 'Every registered lending institution' })
  async listBanks() {
    return { data: await this.facilities.listBanks() };
  }

  @Post('banks')
  @ApiOperation({ summary: 'Register a lending institution' })
  async createBank(@Body() dto: CreateBankDto) {
    return this.facilities.createBank(dto);
  }

  @Get()
  @RequirePermission('finance.facilities.view', 'finance.facilities.manage')
  @ApiOperation({ summary: 'Every bank facility, optionally filtered by status, each with its own computed utilization' })
  async listFacilities(@Query('status') status?: BankFacilityStatus) {
    return { data: await this.facilities.listFacilities(status) };
  }

  @Get('renewals')
  @RequirePermission('finance.facilities.view', 'finance.facilities.manage')
  @ApiOperation({ summary: 'Active facilities maturing within the configured renewal-alert window' })
  async listUpcomingRenewals() {
    return { data: await this.facilities.listUpcomingRenewals() };
  }

  @Get(':id')
  @RequirePermission('finance.facilities.view', 'finance.facilities.manage')
  @ApiOperation({ summary: "One facility's detail, with every drawdown, repayment and markup accrual" })
  async getFacility(@Param('id') id: string) {
    return this.facilities.getFacility(id);
  }

  @Post()
  @ApiOperation({ summary: 'Register a bank facility — its limit, markup rate, tenor and maturity' })
  async createFacility(@Body() dto: CreateBankFacilityDto) {
    return this.facilities.createFacility(dto);
  }

  @Post(':id/drawdowns')
  @ApiOperation({ summary: 'Record a drawdown — refused if it would breach the facility limit; posts immediately at or below the approval threshold' })
  async recordDrawdown(@Param('id') id: string, @Body() dto: RecordDrawdownDto, @CurrentUser() user: AuthenticatedUser) {
    return this.facilities.recordDrawdown(id, dto, user.id);
  }

  @Post('drawdowns/:drawdownId/approve')
  @RequirePermission('finance.facilities.approve_drawdown')
  @ApiOperation({ summary: 'Approve an above-threshold drawdown — never the requester\'s own' })
  async approveDrawdown(@Param('drawdownId') drawdownId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.facilities.approveDrawdown(drawdownId, user.id);
  }

  @Post('drawdowns/:drawdownId/post')
  @ApiOperation({ summary: 'Post an approved drawdown to the general ledger' })
  async postDrawdown(@Param('drawdownId') drawdownId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.facilities.postDrawdown(drawdownId, user.id);
  }

  @Post(':id/repayments')
  @ApiOperation({ summary: 'Record a repayment against principal, accrued markup, or both' })
  async recordRepayment(@Param('id') id: string, @Body() dto: RecordRepaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.facilities.recordRepayment(id, dto, user.id);
  }
}
