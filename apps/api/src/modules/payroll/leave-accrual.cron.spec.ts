import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { LeaveAccrualCron } from './leave-accrual.cron';
import { LeaveService } from './leave.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';

describe('LeaveAccrualCron', () => {
  let cron: LeaveAccrualCron;
  let settings: { get: jest.Mock };
  let leave: { accrue: jest.Mock };
  let prisma: { leaveType: { findMany: jest.Mock } };

  beforeEach(async () => {
    settings = { get: jest.fn() };
    leave = { accrue: jest.fn().mockResolvedValue({ credited: 0 }) };
    prisma = { leaveType: { findMany: jest.fn().mockResolvedValue([{ id: 'lt1' }, { id: 'lt2' }]) } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveAccrualCron,
        { provide: SettingsService, useValue: settings },
        { provide: LeaveService, useValue: leave },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    cron = module.get(LeaveAccrualCron);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function at(day: number, hour: number): Date {
    const now = new Date();
    now.setDate(day);
    now.setHours(hour, 20, 0, 0);
    return now;
  }

  it('accrues every active leave type when the day and hour both match', async () => {
    jest.useFakeTimers().setSystemTime(at(1, 4));
    settings.get.mockImplementation((key: string) => (key.includes('run_day') ? 1 : 4));

    await cron.run();

    expect(leave.accrue).toHaveBeenCalledTimes(2);
    expect(leave.accrue).toHaveBeenCalledWith('lt1', expect.any(String));
    expect(leave.accrue).toHaveBeenCalledWith('lt2', expect.any(String));
  });

  it('no-ops on the right day but the wrong hour', async () => {
    jest.useFakeTimers().setSystemTime(at(1, 9));
    settings.get.mockImplementation((key: string) => (key.includes('run_day') ? 1 : 4));

    await cron.run();

    expect(leave.accrue).not.toHaveBeenCalled();
  });

  it('no-ops on the right hour but the wrong day', async () => {
    jest.useFakeTimers().setSystemTime(at(15, 4));
    settings.get.mockImplementation((key: string) => (key.includes('run_day') ? 1 : 4));

    await cron.run();

    expect(leave.accrue).not.toHaveBeenCalled();
  });
});
