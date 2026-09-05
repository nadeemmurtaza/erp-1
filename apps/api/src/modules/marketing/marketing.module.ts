import { Module } from '@nestjs/common';
import { MarketingController } from './marketing.controller';
import { MarketingAutomationCron } from './marketing-automation.cron';
import { MarketingSettingsService } from './marketing-settings.service';

@Module({
  controllers: [MarketingController],
  providers: [MarketingSettingsService, MarketingAutomationCron],
})
export class MarketingModule {}
