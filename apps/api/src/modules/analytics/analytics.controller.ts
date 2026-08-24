import { Body, Controller, Get, ParseIntPipe, Patch, Query, DefaultValuePipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../core/auth/decorators';
import { AnalyticsService } from './analytics.service';
import { SetMonthlyTargetDto } from './dto/analytics.dto';

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

  @Patch('monthly-target')
  @ApiOperation({ summary: 'Set the monthly revenue target shown on the dashboard' })
  setMonthlyTarget(@Body() dto: SetMonthlyTargetDto) {
    return this.analytics.setMonthlyTarget(dto.targetAmount);
  }
}
