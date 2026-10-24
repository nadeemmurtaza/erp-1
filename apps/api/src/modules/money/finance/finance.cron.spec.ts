import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { FinanceCron } from './finance.cron';
import { FinanceService } from './finance.service';
import { SettingsService } from '../../../core/settings/settings.service';

describe('FinanceCron', () => {
  let cron: FinanceCron;
  let settings: { get: jest.Mock };
  let finance: { generateRecurringInstances: jest.Mock };

  beforeEach(async () => {
    settings = { get: jest.fn().mockResolvedValue(3) };
    finance = { generateRecurringInstances: jest.fn().mockResolvedValue({ created: 0, skipped: 0 }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceCron,
        { provide: SettingsService, useValue: settings },
        { provide: FinanceService, useValue: finance },
      ],
    }).compile();

    cron = module.get(FinanceCron);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Sets the fake clock's LOCAL hour — avoids any assumption about the runner's TZ. */
  function atLocalHour(hour: number): Date {
    const now = new Date();
    now.setHours(hour, 15, 0, 0);
    return now;
  }

  it('runs the generator when the current hour matches FinanceRecurringRunHour', async () => {
    jest.useFakeTimers().setSystemTime(atLocalHour(3));
    settings.get.mockResolvedValue(3);

    await cron.generateRecurringExpenses();

    expect(finance.generateRecurringInstances).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('no-ops on every other hour of the day', async () => {
    jest.useFakeTimers().setSystemTime(atLocalHour(9));
    settings.get.mockResolvedValue(3);

    await cron.generateRecurringExpenses();

    expect(finance.generateRecurringInstances).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('respects a run hour moved by an admin without a deploy', async () => {
    jest.useFakeTimers().setSystemTime(atLocalHour(14));
    settings.get.mockResolvedValue(14);

    await cron.generateRecurringExpenses();

    expect(finance.generateRecurringInstances).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
