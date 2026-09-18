import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../core/auth/decorators';
import { ConsolidationService } from './consolidation.service';
import { DateRangeQueryDto } from './dto/gl-reports.dto';

function parseRange(from?: string, to?: string): { from: Date; to: Date } {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getFullYear(), 0, 1);
  return { from: fromDate, to: toDate };
}

/**
 * Consolidation at the org tier (RETAIL-ERP.md R17, WO-20.6) — see
 * `ConsolidationService`'s own doc comment for what "eliminating a matched
 * pair" means and what it deliberately does not attempt.
 */
@ApiTags('admin/accounting/consolidation')
@Controller('admin/accounting/consolidation')
@RequirePermission('accounting.view')
export class ConsolidationController {
  constructor(private readonly consolidation: ConsolidationService) {}

  @Get('profit-and-loss')
  @ApiOperation({ summary: 'Group P&L across every brand, with matched intercompany pairs eliminated' })
  async groupProfitAndLoss(@Query() query: DateRangeQueryDto) {
    const { from, to } = parseRange(query.from, query.to);
    return this.consolidation.groupProfitAndLoss(from, to);
  }

  @Get('unmatched-intercompany')
  @ApiOperation({ summary: 'Brand pairs whose intercompany volume did not net to zero — the exception report R17 asks for' })
  async unmatchedIntercompany(@Query() query: DateRangeQueryDto) {
    const { from, to } = parseRange(query.from, query.to);
    return { data: await this.consolidation.unmatchedIntercompany(from, to) };
  }
}
