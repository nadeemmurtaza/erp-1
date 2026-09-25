import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import type { SettlementBatchStatus } from '../../core/prisma/client';
import { SettlementsService } from './settlements.service';
import { CreateExpectedBatchDto, RequestWriteoffDto } from './dto/settlement.dto';

/**
 * 49-financial-institution-settlement-partnerships.md — reads and the
 * routine reconcile/request-writeoff actions sit behind
 * `finance.settlement.reconcile`; approving a write-off is gated
 * separately by `finance.settlement.approve_writeoff`, checked again
 * inside `SettlementsService.approveWriteoff()`/`writeOffShortfall()`
 * itself (never trusted from the route decorator alone).
 */
@ApiTags('admin/settlements')
@Controller('admin/settlements')
@RequirePermission('finance.settlement.reconcile')
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get('providers')
  @RequirePermission('finance.settlement.view', 'finance.settlement.reconcile')
  @ApiOperation({ summary: 'Every registered settlement provider' })
  async listProviders() {
    return { data: await this.settlements.listProviders() };
  }

  @Get('batches')
  @RequirePermission('finance.settlement.view', 'finance.settlement.reconcile')
  @ApiOperation({ summary: 'Every settlement batch, optionally filtered by status' })
  async listBatches(@Query('status') status?: SettlementBatchStatus) {
    return { data: await this.settlements.listBatches(status) };
  }

  @Get('batches/:id')
  @RequirePermission('finance.settlement.view', 'finance.settlement.reconcile')
  @ApiOperation({ summary: "One batch's detail, with every Payment line it covers" })
  async getBatch(@Param('id') id: string) {
    return this.settlements.getBatch(id);
  }

  @Post('batches')
  @ApiOperation({ summary: 'Record which of our own payments a settlement batch is expected to cover' })
  async createExpectedBatch(@Body() dto: CreateExpectedBatchDto) {
    return this.settlements.createExpectedBatch(dto);
  }

  @Post('batches/:id/reconcile')
  @ApiOperation({ summary: "Ask the batch's own connector to confirm what actually settled" })
  async reconcile(@Param('id') id: string) {
    return this.settlements.reconcile(id);
  }

  @Post('batches/:id/request-writeoff')
  @ApiOperation({ summary: 'Request writing off a SHORT batch — the maker half of the maker-checker pair' })
  async requestWriteoff(
    @Param('id') id: string,
    @Body() dto: RequestWriteoffDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settlements.requestWriteoff(id, user.id, dto.note);
  }

  @Post('batches/:id/approve-writeoff')
  @RequirePermission('finance.settlement.approve_writeoff')
  @ApiOperation({ summary: 'Approve a requested write-off — the checker half, never the same person as the request' })
  async approveWriteoff(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.settlements.approveWriteoff(id, user.id);
  }

  @Post('batches/:id/write-off')
  @ApiOperation({ summary: 'Post the write-off — refused above the configured threshold without a prior, different approver' })
  async writeOff(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.settlements.writeOffShortfall(id, user.id);
  }
}
