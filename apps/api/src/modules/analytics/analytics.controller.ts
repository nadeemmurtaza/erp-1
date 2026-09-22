import { BadRequestException, Body, Controller, ForbiddenException, Get, ParseIntPipe, Patch, Query, DefaultValuePipe } from '@nestjs/common';
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

  @Get('orders/overview')
  @ApiOperation({ summary: 'Open orders right now — ageing buckets, the oldest worklist, by-city and by-payment' })
  ordersOverview() {
    return this.analytics.ordersOverview();
  }

  @Get('orders/fulfilment')
  @ApiOperation({ summary: 'Average and median time spent in each order-status transition' })
  ordersFulfilment(
    @Query('days', new DefaultValuePipe(90), ParseIntPipe) days: number,
  ) {
    return this.analytics.ordersFulfilment(Math.min(Math.max(days, 7), 365));
  }

  @Get('purchasing/spend')
  @ApiOperation({ summary: 'What was ordered, received, billed and is still owed to suppliers' })
  purchasingSpend(
    @Query('days', new DefaultValuePipe(90), ParseIntPipe) days: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Purchasing spend is domain-sensitive beyond the base analytics.view
    // the class decorator already requires — bom.controller.ts's
    // recipeCost()/seedCostPrice() are this repo's own precedent for a
    // hard, method-level second permission check rather than a class-level
    // decorator, for an endpoint whose whole payload is one domain's money.
    if (!user.permissions.includes('purchasing.manage')) {
      throw new ForbiddenException('You do not have access to purchasing spend.');
    }
    return this.analytics.purchasingSpend(Math.min(Math.max(days, 7), 365));
  }

  @Get('purchasing/suppliers')
  @ApiOperation({ summary: 'Spend, order count, on-time rate and lead time by supplier' })
  purchasingSuppliers(
    @Query('days', new DefaultValuePipe(90), ParseIntPipe) days: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!user.permissions.includes('purchasing.manage')) {
      throw new ForbiddenException('You do not have access to supplier spend.');
    }
    return this.analytics.purchasingSuppliers(Math.min(Math.max(days, 7), 365));
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
