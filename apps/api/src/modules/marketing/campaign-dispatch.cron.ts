import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SettingKey } from '../../core/settings/settings.defaults';
import { SettingsService } from '../../core/settings/settings.service';
import { CampaignsService } from './campaigns.service';

/**
 * WO-8.4. Runs every minute: materialises recipients for any SCHEDULED
 * campaign whose time has come, then sends up to
 * marketing.campaign_send_rate_per_minute PENDING recipients — the doc's own
 * "throttle per provider limits", spread across ticks rather than one burst.
 * A large segment drains over several minutes; a small one finishes in one.
 */
@Injectable()
export class CampaignDispatchCron {
  private readonly logger = new Logger(CampaignDispatchCron.name);

  constructor(
    private readonly campaigns: CampaignsService,
    private readonly settings: SettingsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    await this.campaigns.materializeScheduledCampaigns();

    const rate = await this.settings.get<number>(SettingKey.MarketingCampaignSendRatePerMinute);
    const sent = await this.campaigns.sendPendingBatch(rate);
    if (sent > 0) {
      this.logger.log(`Campaign dispatch: sent ${sent} message(s)`);
    }
  }
}
