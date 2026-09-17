import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

/** As-of a single date (trial balance, balance sheet, aged AR/AP) — everything POSTED on or before it. */
export class AsOfQueryDto {
  @ApiPropertyOptional({ example: '2026-03-31', description: 'Defaults to today.' })
  @IsOptional()
  @IsDateString()
  asOf?: string;
}

/** A date range (P&L, cash flow) — both bounds inclusive of the whole day. */
export class DateRangeQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01', description: 'Defaults to the start of the current fiscal year.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-03-31', description: 'Defaults to today.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
