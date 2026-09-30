import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

/** Both bounds are calendar dates (YYYY-MM-DD), inclusive of the whole day. */
export class ReportDateRangeQueryDto {
  @ApiPropertyOptional({ example: '2026-07-24', description: 'Defaults to 30 days before `to`' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-22', description: 'Defaults to today' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

/** A single as-of date (payables export) — everything posted on or before it. */
export class AsOfReportQueryDto {
  @ApiPropertyOptional({ example: '2026-03-31', description: 'Defaults to today.' })
  @IsOptional()
  @IsDateString()
  asOf?: string;
}

export class StockReportQueryDto {
  @ApiPropertyOptional({
    description: "'true' to only include variants at or below their low-stock threshold",
  })
  @IsOptional()
  @IsString()
  lowStockOnly?: string;
}
