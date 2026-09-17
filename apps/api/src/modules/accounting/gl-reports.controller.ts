import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../core/auth/decorators';
import { GlReportsService } from './gl-reports.service';
import { AsOfQueryDto, DateRangeQueryDto } from './dto/gl-reports.dto';

function parseAsOf(asOf?: string): Date {
  return asOf ? new Date(asOf) : new Date();
}

function parseRange(from?: string, to?: string): { from: Date; to: Date } {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getFullYear(), 0, 1);
  return { from: fromDate, to: toDate };
}

/**
 * The general ledger's read side (RETAIL-ERP.md R15, WO-19.4) — every route
 * a grouping over `JournalLine`, gated by `accounting.view` rather than
 * `reports.view`: this is the ledger itself, not a CSV export of another
 * module's tables (that stays `ReportsController`, `admin/reports`).
 */
@ApiTags('admin/accounting/reports')
@Controller('admin/accounting/reports')
@RequirePermission('accounting.view')
export class GlReportsController {
  constructor(private readonly reports: GlReportsService) {}

  @Get('trial-balance')
  @ApiOperation({ summary: 'Every account, cumulative debit/credit as of a date — SUM(debit) = SUM(credit) or something is wrong' })
  async trialBalance(@Query() query: AsOfQueryDto) {
    return this.reports.trialBalance(parseAsOf(query.asOf));
  }

  @Get('profit-and-loss')
  @ApiOperation({ summary: 'Income and expense for a date range, and the net' })
  async profitAndLoss(@Query() query: DateRangeQueryDto) {
    const { from, to } = parseRange(query.from, query.to);
    return this.reports.profitAndLoss(from, to);
  }

  @Get('balance-sheet')
  @ApiOperation({ summary: 'Assets, liabilities and equity as of a date, plus unclosed retained earnings' })
  async balanceSheet(@Query() query: AsOfQueryDto) {
    return this.reports.balanceSheet(parseAsOf(query.asOf));
  }

  @Get('cash-flow')
  @ApiOperation({ summary: 'Net movement on every bank/cash account for a date range' })
  async cashFlow(@Query() query: DateRangeQueryDto) {
    const { from, to } = parseRange(query.from, query.to);
    return this.reports.cashFlow(from, to);
  }

  @Get('aged-receivables')
  @ApiOperation({ summary: 'Outstanding customer balances as of a date, FIFO-aged into 0-30/31-60/61-90/91+ buckets' })
  async agedReceivables(@Query() query: AsOfQueryDto) {
    return this.reports.agedReceivables(parseAsOf(query.asOf));
  }

  @Get('aged-payables')
  @ApiOperation({ summary: 'Outstanding supplier balances as of a date, FIFO-aged the same way as receivables' })
  async agedPayables(@Query() query: AsOfQueryDto) {
    return this.reports.agedPayables(parseAsOf(query.asOf));
  }
}
