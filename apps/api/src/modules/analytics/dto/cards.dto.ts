import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { MetricBucket } from '../../../core/time/metric-window';

/** `GET /admin/analytics/cards` (10-admin-dashboard.md D2, WO-A.4). */
export class DashboardCardsQueryDto {
  @ApiPropertyOptional({ description: 'Window length in days, 7-365. Defaults to AnalyticsDefaultRangeDays.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  days?: number;

  @ApiPropertyOptional({ description: 'Comma-separated DASHBOARD_GROUPS keys to compute cards for.' })
  @IsOptional()
  @IsString()
  groups?: string;

  @ApiPropertyOptional({ description: 'Comma-separated sparkline series keys to compute.' })
  @IsOptional()
  @IsString()
  series?: string;

  @ApiPropertyOptional({ enum: ['day', 'week', 'month'] })
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  bucket?: MetricBucket;
}

/** The response shape D2 pins — every key the caller may see AND whose module is enabled. */
export interface DashboardCardsResponse {
  days: number;
  from: string;
  to: string;
  generatedAt: string;
  metrics: Record<
    string,
    { value: number; previous: number | null; unit: 'paisa' | 'count' | 'bps' | 'days'; label?: string }
  >;
  series: Record<string, Array<{ t: string; v: number }>>;
}
