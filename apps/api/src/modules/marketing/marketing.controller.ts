import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../core/auth/decorators';
import { UpdateMarketingSettingsDto } from './dto/marketing-settings.dto';
import { MarketingAutomationCron } from './marketing-automation.cron';
import { MarketingSettingsService } from './marketing-settings.service';

@ApiTags('Marketing Admin')
@Controller('admin/marketing')
export class MarketingController {
  constructor(
    private readonly settingsService: MarketingSettingsService,
    private readonly automation: MarketingAutomationCron,
  ) {}

  @Get('settings')
  @RequirePermission('marketing.manage')
  @ApiOperation({ summary: 'Automation on/off and its timing thresholds' })
  async getSettings() {
    return this.settingsService.get();
  }

  @Put('settings')
  @RequirePermission('marketing.manage')
  @ApiOperation({ summary: 'Turn automation on/off and/or change its timing' })
  async updateSettings(@Body() dto: UpdateMarketingSettingsDto) {
    return this.settingsService.update(dto);
  }

  @Get('recovered-revenue')
  @RequirePermission('marketing.manage')
  @ApiOperation({
    summary:
      'WO-8.5 — "the one marketing number that is unambiguous": revenue from orders whose cart had a marketing touch before it was placed, by stage.',
  })
  async recoveredRevenue(@Query('days') days = '30') {
    const since = new Date(Date.now() - (Number(days) || 30) * 24 * 60 * 60_000);
    return this.automation.recoveredRevenueReport(since);
  }
}
