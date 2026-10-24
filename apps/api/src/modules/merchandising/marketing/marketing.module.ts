import { Module } from '@nestjs/common';
import { CampaignDispatchCron } from './campaign-dispatch.cron';
import { CampaignsAdminController, CampaignTrackingController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { MarketingController } from './marketing.controller';
import { MarketingAutomationCron } from './marketing-automation.cron';
import { MarketingSettingsService } from './marketing-settings.service';

@Module({
  controllers: [MarketingController, CampaignsAdminController, CampaignTrackingController],
  providers: [MarketingSettingsService, MarketingAutomationCron, CampaignsService, CampaignDispatchCron],
})
export class MarketingModule {}
