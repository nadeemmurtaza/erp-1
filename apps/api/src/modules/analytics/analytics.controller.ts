import { BadRequestException, Body, Controller, Get, ParseIntPipe, Patch, Query, DefaultValuePipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { AnalyticsService } from './analytics.service';
import type { MetricBucket } from '../../core/time/metric-window';
import { SetMonthlyTargetDto } from './dto/analytics.dto';

const METRIC_BUCKETS: MetricBucket[] = ['day', 'week', 'month'];

@ApiTags('admin/analytics')
@Controller('admin/analytics')
@RequirePermission('analytics.view')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Everything the dashboard shows, in one request' })
  dashboard(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    // A year of daily points is the most a chart can usefully draw.
    return this.analytics.summary(Math.min(Math.max(days, 7), 365));
  }

  @Get('stitching')
  @ApiOperation({ summary: 'Which garments and style options drive the stitching business' })
  stitching(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.analytics.stitchingAnalytics(Math.min(Math.max(days, 7), 365));
  }

  @Get('extended')
  @ApiOperation({ summary: 'Funnel, geography, fulfilment and payment-mix metrics' })
  extended(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.analytics.extendedAnalytics(Math.min(Math.max(days, 7), 365));
  }

  @Get('visitors')
  @ApiOperation({ summary: 'Visitor counts, view-to-order funnel and traffic sources' })
  visitors(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.analytics.visitorAnalytics(Math.min(Math.max(days, 7), 365));
  }

  @Get('comparison')
  @ApiOperation({ summary: 'Sales, purchases and expenses side by side, bucketed by day, week or month' })
  comparison(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('bucket', new DefaultValuePipe('day')) bucket: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!METRIC_BUCKETS.includes(bucket as MetricBucket)) {
      throw new BadRequestException(`"bucket" must be one of ${METRIC_BUCKETS.join(', ')}.`);
    }
    // Cost data is inventory.view_cost's to gate, same as everywhere else
    // it's checked (cost-fields.ts) — grossProfit/net are null, not omitted,
    // when the current user doesn't hold it.
    const includeCost = user.permissions.includes('inventory.view_cost');
    return this.analytics.comparison(Math.min(Math.max(days, 7), 365), bucket as MetricBucket, includeCost);
  }

  @Patch('monthly-target')
  @ApiOperation({ summary: 'Set the monthly revenue target shown on the dashboard' })
  setMonthlyTarget(@Body() dto: SetMonthlyTargetDto) {
    return this.analytics.setMonthlyTarget(dto.targetAmount);
  }
}
