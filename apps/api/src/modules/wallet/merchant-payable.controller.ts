import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { PaginationQueryDto } from '../../core/common/dto/pagination.dto';
import { MerchantPayableService } from './merchant-payable.service';
import type { MerchantPayableStatus } from '../../core/prisma/client';
import { DisputeMerchantPayableDto, ResolveMerchantPayableDisputeDto, SchedulePayoutRunDto } from './dto/wallet.dto';

/**
 * doc 155 (WO-155.5) — a merchant's own payable/payout screen, generalizing
 * doc 145's own supplier-bill-style screen (§3). Reachable only when
 * `wallet` is enabled in MODULES.
 */
@ApiTags('Wallet Admin — Merchant Payables')
@Controller('admin/merchant-payables')
export class MerchantPayableController {
  constructor(private readonly payables: MerchantPayableService) {}

  @Get('organizations/:organizationId')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: "A merchant's own payables — every orderId, gross/fee/net, status" })
  async findForMerchant(
    @Param('organizationId') organizationId: string,
    @Query() query: PaginationQueryDto,
    @Query('status') status?: MerchantPayableStatus,
  ) {
    return this.payables.findForMerchant(organizationId, { skip: query.skip, take: query.take, order: query.order, status });
  }

  @Get(':id')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'One merchant payable' })
  async findOne(@Param('id') id: string) {
    return this.payables.findOne(id);
  }

  @Get('organizations/:organizationId/payout-preview')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Dry run — what the next payout run would actually pay, with no write' })
  async preview(@Param('organizationId') organizationId: string) {
    return this.payables.previewPayoutRun(organizationId);
  }

  @Post('organizations/:organizationId/schedule-payout')
  @RequirePermission('finance.manage')
  @ApiOperation({ summary: 'Schedule OPEN payables into the next payout run — verified merchants immediately, unverified ones wait for delivery confirmation' })
  async schedule(@Param('organizationId') organizationId: string, @Body() dto: SchedulePayoutRunDto) {
    return this.payables.schedulePayoutRun(organizationId, dto.merchantOwnerUserId);
  }

  @Post('organizations/:organizationId/process-payout')
  @RequirePermission('finance.manage')
  @ApiOperation({ summary: 'Pay every SCHEDULED payable for this merchant — a real bank transfer batch, never per-order' })
  async processPayout(@Param('organizationId') organizationId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.payables.processPayoutRun(organizationId, user.id);
  }

  @Post(':id/dispute')
  @RequirePermission('finance.merchant-payables.dispute')
  @ApiOperation({ summary: 'Pull one payable from the next payout run, with a reason' })
  async dispute(@Param('id') id: string, @Body() dto: DisputeMerchantPayableDto, @CurrentUser() user: AuthenticatedUser) {
    return this.payables.dispute(id, user.id, dto.reason);
  }

  @Post(':id/resolve-dispute')
  @RequirePermission('finance.merchant-payables.dispute')
  @ApiOperation({ summary: 'Resolve a disputed payable — never its own disputer' })
  async resolveDispute(@Param('id') id: string, @Body() dto: ResolveMerchantPayableDisputeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.payables.resolveDispute(id, user.id, dto.resolution);
  }
}
