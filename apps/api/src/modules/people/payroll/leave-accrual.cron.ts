import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { LeaveService, accrualPeriodKey } from './leave.service';

/**
 * WO-19.3's monthly accrual job. Daily tick, gated by PayrollAccrualRunDay/
 * PayrollAccrualRunHour — same configurable-slot idiom as FinanceCron's
 * FinanceRecurringRunHour, just with a day-of-month added since this runs
 * monthly rather than hourly. accrue() is idempotent per (leaveTypeId,
 * period) so a missed or repeated tick is harmless.
 */
@Injectable()
export class LeaveAccrualCron {
  private readonly logger = new Logger(LeaveAccrualCron.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly leave: LeaveService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('0 * * * *')
  async run(): Promise<void> {
    const now = new Date();
    const [runDay, runHour] = await Promise.all([
      this.settings.get<number>(SettingKey.PayrollAccrualRunDay),
      this.settings.get<number>(SettingKey.PayrollAccrualRunHour),
    ]);
    if (now.getDate() !== runDay || now.getHours() !== runHour) return;

    const period = accrualPeriodKey(now);
    const types = await this.prisma.leaveType.findMany({ where: { isActive: true, accrualDaysPerRun: { gt: 0 } } });

    let totalCredited = 0;
    for (const type of types) {
      const { credited } = await this.leave.accrue(type.id, period);
      totalCredited += credited;
    }
    this.logger.log(`Leave accrual for ${period}: ${totalCredited} balance(s) credited across ${types.length} type(s)`);
  }
}
