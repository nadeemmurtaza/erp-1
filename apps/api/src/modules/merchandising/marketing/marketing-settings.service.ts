import { Injectable } from '@nestjs/common';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { SettingsService } from '../../../core/settings/settings.service';
import type { UpdateMarketingSettingsDto } from './dto/marketing-settings.dto';

export interface MarketingSettings {
  automationEnabled: boolean;
  abandonedCartReminderHours: number;
  abandonedCartIncentiveHours: number;
  reviewRequestDays: number;
  replenishmentReminderDays: number;
}

@Injectable()
export class MarketingSettingsService {
  constructor(private readonly settings: SettingsService) {}

  async get(): Promise<MarketingSettings> {
    const [
      automationEnabled,
      abandonedCartReminderHours,
      abandonedCartIncentiveHours,
      reviewRequestDays,
      replenishmentReminderDays,
    ] = await Promise.all([
      this.settings.get<boolean>(SettingKey.MarketingAutomationEnabled),
      this.settings.get<number>(SettingKey.MarketingAbandonedCartReminderHours),
      this.settings.get<number>(SettingKey.MarketingAbandonedCartIncentiveHours),
      this.settings.get<number>(SettingKey.MarketingReviewRequestDays),
      this.settings.get<number>(SettingKey.MarketingReplenishmentReminderDays),
    ]);
    return {
      automationEnabled,
      abandonedCartReminderHours,
      abandonedCartIncentiveHours,
      reviewRequestDays,
      replenishmentReminderDays,
    };
  }

  async update(dto: UpdateMarketingSettingsDto): Promise<MarketingSettings> {
    await Promise.all([
      dto.automationEnabled !== undefined
        ? this.settings.set(SettingKey.MarketingAutomationEnabled, dto.automationEnabled)
        : null,
      dto.abandonedCartReminderHours !== undefined
        ? this.settings.set(
            SettingKey.MarketingAbandonedCartReminderHours,
            dto.abandonedCartReminderHours,
          )
        : null,
      dto.abandonedCartIncentiveHours !== undefined
        ? this.settings.set(
            SettingKey.MarketingAbandonedCartIncentiveHours,
            dto.abandonedCartIncentiveHours,
          )
        : null,
      dto.reviewRequestDays !== undefined
        ? this.settings.set(SettingKey.MarketingReviewRequestDays, dto.reviewRequestDays)
        : null,
      dto.replenishmentReminderDays !== undefined
        ? this.settings.set(
            SettingKey.MarketingReplenishmentReminderDays,
            dto.replenishmentReminderDays,
          )
        : null,
    ]);
    return this.get();
  }
}
