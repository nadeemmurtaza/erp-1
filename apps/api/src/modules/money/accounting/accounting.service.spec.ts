import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccountingService } from './accounting.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';

describe('AccountingService — WO-19.1', () => {
  let service: AccountingService;
  let prisma: any;
  let tx: any;

  const PERIOD = { id: 'p1', fiscalYearId: 'fy1', status: 'OPEN', startsOn: new Date('2026-01-01'), endsOn: new Date('2027-01-01') };

  beforeEach(async () => {
    tx = {
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([{ counter: 1 }]),
      fiscalYear: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'FY2026' }) },
      journalEntry: { create: jest.fn().mockResolvedValue({ id: 'je1', lines: [] }) },
    };
    prisma = {
      fiscalPeriod: { findFirst: jest.fn().mockResolvedValue(PERIOD) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: { get: jest.fn().mockResolvedValue(null) } },
      ],
    }).compile();

    service = module.get(AccountingService);
  });

  describe('postEntry', () => {
    const BALANCED_INPUT = {
      date: new Date('2026-06-01'),
      source: 'test',
      lines: [
        { accountId: 'a1', debitMinor: 1000 },
        { accountId: 'a2', creditMinor: 1000 },
      ],
    };

    it('refuses an unbalanced entry without touching the database', async () => {
      await expect(
        service.postEntry({ date: new Date(), source: 'test', lines: [{ accountId: 'a1', debitMinor: 1000 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses an entry with no lines', async () => {
      await expect(service.postEntry({ date: new Date(), source: 'test', lines: [] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses when there is no open period to post into', async () => {
      prisma.fiscalPeriod.findFirst.mockResolvedValue(null);

      await expect(service.postEntry(BALANCED_INPUT)).rejects.toThrow(/No open fiscal period/);
    });

    it('wraps its own transaction when none is given', async () => {
      const result = await service.postEntry(BALANCED_INPUT);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.journalEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ periodId: 'p1', status: 'POSTED' }) }),
      );
      expect(result.id).toBe('je1');
    });

    it('runs directly on a caller-supplied transaction instead of opening its own', async () => {
      const callerTx: any = {
        $executeRaw: jest.fn(),
        $queryRaw: jest.fn().mockResolvedValue([{ counter: 1 }]),
        fiscalYear: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'FY2026' }) },
        journalEntry: { create: jest.fn().mockResolvedValue({ id: 'je-caller', lines: [] }) },
      };

      const result = await service.postEntry(BALANCED_INPUT, callerTx);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(callerTx.journalEntry.create).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('je-caller');
    });
  });
});
