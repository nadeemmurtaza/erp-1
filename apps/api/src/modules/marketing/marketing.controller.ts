import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../core/auth/decorators';
import { UpdateMarketingSettingsDto } from './dto/marketing-settings.dto';
import { MarketingSettingsService } from './marketing-settings.service';

@ApiTags('Marketing Admin')
@Controller('admin/marketing')
export class MarketingController {
  constructor(private readonly settingsService: MarketingSettingsService) {}

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
}
