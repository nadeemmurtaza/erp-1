import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { CreditNotesService } from './credit-notes.service';
import { DebitNotesService } from './debit-notes.service';
import { CreditTermsService } from './credit-terms.service';
import { DunningService } from './dunning.service';
import { StatementsService } from './statements.service';
import {
  CreateCreditNoteDto,
  ApplyCreditNoteDto,
  VoidNoteDto,
  CreateDebitNoteDto,
  SetCreditTermDto,
  CheckCreditAvailableDto,
  SetDunningPolicyDto,
} from './dto/receivables.dto';
import type { CreditDebitNoteStatus } from '../../core/prisma/client';

@ApiTags('Finance Admin — Credit Notes')
@Controller('admin/credit-notes')
export class CreditNotesController {
  constructor(private readonly creditNotes: CreditNotesService) {}

  @Get()
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'List credit notes' })
  async findAll(@Query('customerId') customerId?: string, @Query('status') status?: CreditDebitNoteStatus) {
    return { data: await this.creditNotes.findMany({ customerId, status }) };
  }

  @Get(':id')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Get a credit note' })
  async findOne(@Param('id') id: string) {
    return this.creditNotes.findOne(id);
  }

  @Post()
  @RequirePermission('finance.credit-notes.create')
  @ApiOperation({ summary: 'Draft a credit note against a customer, optionally citing the order it credits' })
  async create(@Body() dto: CreateCreditNoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.creditNotes.create(dto, user.id);
  }

  @Post(':id/approve')
  @RequirePermission('finance.credit-notes.approve')
  @ApiOperation({ summary: 'Approve a credit note above the approval threshold — never its own creator' })
  async approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.creditNotes.approve(id, user.id);
  }

  @Post(':id/issue')
  @RequirePermission('finance.credit-notes.create')
  @ApiOperation({ summary: 'Issue a DRAFT credit note — posts the ledger entry; above the threshold, requires a prior approval' })
  async issue(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.creditNotes.issue(id, user.id);
  }

  @Post(':id/apply')
  @RequirePermission('finance.credit-notes.create')
  @ApiOperation({ summary: 'Apply an ISSUED credit note to a different open order than the one it originally cited' })
  async apply(@Param('id') id: string, @Body() dto: ApplyCreditNoteDto) {
    return this.creditNotes.apply(id, dto);
  }

  @Post(':id/void')
  @RequirePermission('finance.credit-notes.approve')
  @ApiOperation({ summary: 'Void a credit note — reverses its posted ledger entry, never deletes the record' })
  async voidNote(@Param('id') id: string, @Body() dto: VoidNoteDto) {
    return this.creditNotes.voidCreditNote(id, dto.reason);
  }
}

@ApiTags('Finance Admin — Debit Notes')
@Controller('admin/debit-notes')
export class DebitNotesController {
  constructor(private readonly debitNotes: DebitNotesService) {}

  @Get()
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'List debit notes' })
  async findAll(@Query('supplierId') supplierId?: string, @Query('status') status?: CreditDebitNoteStatus) {
    return { data: await this.debitNotes.findMany({ supplierId, status }) };
  }

  @Get(':id')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Get a debit note' })
  async findOne(@Param('id') id: string) {
    return this.debitNotes.findOne(id);
  }

  @Post()
  @RequirePermission('finance.debit-notes.manage')
  @ApiOperation({ summary: 'Draft a debit note against a supplier, optionally citing the bill it corrects' })
  async create(@Body() dto: CreateDebitNoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.debitNotes.create(dto, user.id);
  }

  @Post(':id/issue')
  @RequirePermission('finance.debit-notes.manage')
  @ApiOperation({ summary: 'Issue a DRAFT debit note — posts the ledger entry' })
  async issue(@Param('id') id: string) {
    return this.debitNotes.issue(id);
  }

  @Post(':id/void')
  @RequirePermission('finance.debit-notes.manage')
  @ApiOperation({ summary: 'Void a debit note — reverses its posted ledger entry' })
  async voidNote(@Param('id') id: string, @Body() dto: VoidNoteDto) {
    return this.debitNotes.voidDebitNote(id, dto.reason);
  }
}

@ApiTags('Finance Admin — Credit Terms')
@Controller('admin/credit-terms')
export class CreditTermsController {
  constructor(private readonly creditTerms: CreditTermsService) {}

  @Get()
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'List customers with a credit term set — optionally only those on hold' })
  async findAll(@Query('onHold') onHold?: string) {
    return { data: await this.creditTerms.findMany({ isOnHold: onHold === 'true' ? true : undefined }) };
  }

  @Get(':customerId')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: "A customer's own credit term, or null if none is set" })
  async findOne(@Param('customerId') customerId: string) {
    return this.creditTerms.findOne(customerId);
  }

  @Put(':customerId')
  @RequirePermission('finance.credit-terms.manage')
  @ApiOperation({ summary: "Set a customer's credit limit, payment terms, and hold" })
  async set(@Param('customerId') customerId: string, @Body() dto: SetCreditTermDto, @CurrentUser() user: AuthenticatedUser) {
    return this.creditTerms.setTerm(customerId, dto, user.id);
  }

  @Post('check')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Preview whether an order of this amount would clear the customer\'s credit limit — a pure read, nothing is written' })
  async check(@Body() dto: CheckCreditAvailableDto) {
    if (dto.newOrderAmountMinor < 0) throw new BadRequestException('newOrderAmountMinor cannot be negative.');
    return this.creditTerms.checkCreditAvailable(dto.customerId, dto.newOrderAmountMinor);
  }
}

@ApiTags('Finance Admin — Dunning')
@Controller('admin/dunning')
export class DunningController {
  constructor(private readonly dunning: DunningService) {}

  @Get('policy')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'The current dunning policy — days-overdue steps and which template fires at each' })
  async getPolicy() {
    return this.dunning.getPolicy();
  }

  @Put('policy')
  @RequirePermission('finance.credit-terms.manage')
  @ApiOperation({ summary: 'Replace the dunning policy\'s steps' })
  async setPolicy(@Body() dto: SetDunningPolicyDto) {
    return this.dunning.setPolicy(dto);
  }

  @Get('events')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Dunning steps already sent for one order' })
  async listEvents(@Query('orderId') orderId?: string) {
    return { data: await this.dunning.listEvents(orderId) };
  }
}

@ApiTags('Finance Admin — Statements')
@Controller('admin/statements')
export class StatementsController {
  constructor(private readonly statements: StatementsService) {}

  @Get(':customerId')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: "A customer's statement of account over a period — invoices, payments and credit notes, chronologically" })
  async statement(
    @Param('customerId') customerId: string,
    @Query('periodStart') periodStart?: string,
    @Query('periodEnd') periodEnd?: string,
  ) {
    const end = periodEnd ? new Date(periodEnd) : new Date();
    const start = periodStart ? new Date(periodStart) : new Date(end.getFullYear(), end.getMonth() - 1, end.getDate());
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('periodStart/periodEnd must be valid dates.');
    }
    return this.statements.customerStatement(customerId, start, end);
  }
}
