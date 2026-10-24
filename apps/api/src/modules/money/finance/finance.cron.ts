import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { FinanceService } from './finance.service';

/**
 * WO-B.2's recurring-expense job. Hourly, not a fixed daily slot — the
 * FinanceRecurringRunHour setting decides which hour actually does the work,
 * same idiom PurchasingCron uses for its own enable flag, so ops can move
 * the run without a deploy. A missed tick (container down at the configured
 * hour) is not retried until the same hour next day — identical recovery
 * behaviour to a fixed `@Cron('0 3 * * *')`, just with a configurable hour.
 * generateRecurringInstances() itself is idempotent (the unique constraint
 * on recurringFromId+recurringPeriod), so an accidental double-fire within
 * the hour is harmless.
 */
@Injectable()
export class FinanceCron {
  private readonly logger = new Logger(FinanceCron.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly finance: FinanceService,
  ) {}

  @Cron('0 * * * *')
  async generateRecurringExpenses(): Promise<void> {
    const runHour = await this.settings.get<number>(SettingKey.FinanceRecurringRunHour);
    if (new Date().getHours() !== runHour) return;

    const { created, skipped } = await this.finance.generateRecurringInstances();
    this.logger.log(`Recurring expenses: ${created} instance(s) created, ${skipped} already existed`);
  }
}
