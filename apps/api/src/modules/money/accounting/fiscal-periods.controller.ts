import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../core/auth/decorators';
import { FiscalPeriodsService } from './fiscal-periods.service';
import { CreateFiscalPeriodDto, CreateFiscalYearDto } from './dto/fiscal-period.dto';

/**
 * Fiscal year/period administration (RETAIL-ERP.md R15, WO-19.5). Reads sit
 * behind `accounting.view` like the reports; every write — creating a year
 * or period, or moving one between statuses — sits behind the stronger
 * `accounting.manage_periods`, since a lock is irreversible.
 */
@ApiTags('admin/accounting/fiscal-periods')
@Controller('admin/accounting')
export class FiscalPeriodsController {
  constructor(private readonly fiscalPeriods: FiscalPeriodsService) {}

  @Get('fiscal-years')
  @RequirePermission('accounting.view')
  @ApiOperation({ summary: 'List fiscal years' })
  async listFiscalYears() {
    return { data: await this.fiscalPeriods.listFiscalYears() };
  }

  @Post('fiscal-years')
  @RequirePermission('accounting.manage_periods')
  @ApiOperation({ summary: 'Open a fiscal year' })
  async createFiscalYear(@Body() dto: CreateFiscalYearDto) {
    return this.fiscalPeriods.createFiscalYear(dto);
  }

  @Post('fiscal-years/:id/close')
  @RequirePermission('accounting.manage_periods')
  @ApiOperation({ summary: 'Year-end close — zeros INCOME/EXPENSE into Retained Earnings, permanent' })
  async closeFiscalYear(@Param('id') id: string) {
    return this.fiscalPeriods.closeFiscalYear(id);
  }

  @Get('fiscal-periods')
  @RequirePermission('accounting.view')
  @ApiOperation({ summary: 'List fiscal periods, optionally filtered by fiscal year' })
  async listPeriods(@Query('fiscalYearId') fiscalYearId?: string) {
    return { data: await this.fiscalPeriods.listPeriods(fiscalYearId) };
  }

  @Post('fiscal-periods')
  @RequirePermission('accounting.manage_periods')
  @ApiOperation({ summary: 'Open a period within a fiscal year — starts OPEN' })
  async createPeriod(@Body() dto: CreateFiscalPeriodDto) {
    return this.fiscalPeriods.createFiscalPeriod(dto);
  }

  @Post('fiscal-periods/:id/close')
  @RequirePermission('accounting.manage_periods')
  @ApiOperation({ summary: 'OPEN -> CLOSED — a soft boundary, reopenable' })
  async closePeriod(@Param('id') id: string) {
    return this.fiscalPeriods.closePeriod(id);
  }

  @Post('fiscal-periods/:id/reopen')
  @RequirePermission('accounting.manage_periods')
  @ApiOperation({ summary: 'CLOSED -> OPEN — refused once the period is LOCKED' })
  async reopenPeriod(@Param('id') id: string) {
    return this.fiscalPeriods.reopenPeriod(id);
  }

  @Post('fiscal-periods/:id/lock')
  @RequirePermission('accounting.manage_periods')
  @ApiOperation({ summary: 'CLOSED -> LOCKED — permanent, refuses every posting including a late fact' })
  async lockPeriod(@Param('id') id: string) {
    return this.fiscalPeriods.lockPeriod(id);
  }
}
