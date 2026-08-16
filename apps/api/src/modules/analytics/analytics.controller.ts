import { Controller, Get, ParseIntPipe, Query, DefaultValuePipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../core/auth/decorators';
import { AnalyticsService } from './analytics.service';

@ApiTags('admin/analytics')
@Controller('admin/analytics')
@Roles('ADMIN', 'STAFF')
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
}
