import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AccountingService } from './accounting.service';
import { ACCOUNT_CODE } from './chart-of-accounts';
import {
  AssetDepreciationService,
  endOfMonthUTC,
  monthKey,
  monthlyDepreciation,
  monthsBetweenUTC,
  startOfMonthUTC,
} from './asset-depreciation.service';

const ACCOUNT_ID: Record<string, string> = {
  [ACCOUNT_CODE.DEPRECIATION_EXPENSE]: 'acc-depr-expense',
  [ACCOUNT_CODE.ACCUMULATED_DEPRECIATION]: 'acc-accum-depr',
  [ACCOUNT_CODE.CASH_AND_BANK]: 'acc-bank',
  [ACCOUNT_CODE.GAIN_ON_DISPOSAL]: 'acc-gain',
  [ACCOUNT_CODE.LOSS_ON_DISPOSAL]: 'acc-loss',
};

/**
 * WO-147.2/147.3/147.4 (finance-accounting/147-fixed-asset-depreciation.md).
 * `PrismaService`/`AccountingService` mocked, same idiom
 * `posting-rules.subscriber.spec.ts` already uses in this exact module —
 * this service's job is the depreciation math and the idempotency/disposal
 * decisions, not re-proving `AccountingService.postEntry()` itself.
 */
describe('monthlyDepreciation — pure', () => {
  it('STRAIGHT_LINE: a flat amount every month, 0 once the useful life ends', () => {
    const schedule = {
      method: 'STRAIGHT_LINE' as const,
      acquisitionCostMinor: 120_000,
      salvageValueMinor: 0,
      usefulLifeMonths: 12,
      decliningRateBps: null,
    };

    expect(monthlyDepreciation(schedule, 0, 0)).toBe(10_000);
    expect(monthlyDepreciation(schedule, 6, 60_000)).toBe(10_000);
    expect(monthlyDepreciation(schedule, 12, 120_000)).toBe(0);
  });

  it('never returns an amount that would drop book value below salvageValueMinor', () => {
    // 100 depreciable over 3 months = 33/mo, leaving a 1-unit remainder at
    // month 3 that a naive flat amount would over-post past salvage.
    const schedule = {
      method: 'STRAIGHT_LINE' as const,
      acquisitionCostMinor: 1_100,
      salvageValueMinor: 100,
      usefulLifeMonths: 3,
      decliningRateBps: null,
    };

    const m0 = monthlyDepreciation(schedule, 0, 0);
    const m1 = monthlyDepreciation(schedule, 1, m0);
    const m2 = monthlyDepreciation(schedule, 2, m0 + m1);

    const totalPosted = m0 + m1 + m2;
    expect(schedule.acquisitionCostMinor - totalPosted).toBeGreaterThanOrEqual(schedule.salvageValueMinor);
  });

  it('DECLINING_BALANCE: proportional to remaining book value, clamped at the salvage floor', () => {
    const schedule = {
      method: 'DECLINING_BALANCE' as const,
      acquisitionCostMinor: 100_000,
      salvageValueMinor: 10_000,
      usefulLifeMonths: 24,
      decliningRateBps: 2000, // 20%
    };

    const m0 = monthlyDepreciation(schedule, 0, 0);
    expect(m0).toBe(20_000); // 20% of 100,000

    const m1 = monthlyDepreciation(schedule, 1, m0);
    expect(m1).toBe(16_000); // 20% of the remaining 80,000

    // Posting far past the point remaining value nears salvage — never
    // undercuts it.
    const nearFloor = monthlyDepreciation(schedule, 20, 89_500);
    expect(nearFloor).toBeLessThanOrEqual(500);
  });

  it('returns 0 once fully depreciated, never negative', () => {
    const schedule = {
      method: 'STRAIGHT_LINE' as const,
      acquisitionCostMinor: 10_000,
      salvageValueMinor: 0,
      usefulLifeMonths: 10,
      decliningRateBps: null,
    };

    expect(monthlyDepreciation(schedule, 5, 10_000)).toBe(0);
  });
});

describe('date helpers', () => {
  it('monthKey formats UTC year-month', () => {
    expect(monthKey(new Date('2026-09-25T21:00:00Z'))).toBe('2026-09');
  });

  it('startOfMonthUTC/endOfMonthUTC bound the same month', () => {
    const start = startOfMonthUTC(new Date('2026-02-15T10:00:00Z'));
    const end = endOfMonthUTC(new Date('2026-02-15T10:00:00Z'));
    expect(start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(end.getUTCMonth()).toBe(1); // February, 0-indexed
  });

  it('monthsBetweenUTC counts whole calendar months', () => {
    expect(monthsBetweenUTC(new Date('2026-01-01T00:00:00Z'), new Date('2026-04-01T00:00:00Z'))).toBe(3);
    expect(monthsBetweenUTC(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'))).toBe(0);
  });
});

describe('AssetDepreciationService', () => {
  let service: AssetDepreciationService;
  let prisma: any;
  let accounting: any;

  beforeEach(async () => {
    prisma = {
      asset: { findUnique: jest.fn(), update: jest.fn() },
      assetDepreciationSchedule: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      assetDepreciationPosting: { create: jest.fn() },
      assetAssignment: { updateMany: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    accounting = {
      findPostedEntry: jest.fn().mockResolvedValue(null),
      accountIdsByCode: jest.fn().mockImplementation((codes: string[]) => {
        const map = new Map<string, string>();
        for (const code of codes) if (ACCOUNT_ID[code]) map.set(code, ACCOUNT_ID[code]);
        return Promise.resolve(map);
      }),
      postEntry: jest.fn().mockResolvedValue({ id: 'entry1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetDepreciationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountingService, useValue: accounting },
      ],
    }).compile();

    service = module.get(AssetDepreciationService);
  });

  describe('createSchedule', () => {
    it('throws NotFoundException for a missing asset', async () => {
      prisma.asset.findUnique.mockResolvedValue(null);
      await expect(
        service.createSchedule('a1', { method: 'STRAIGHT_LINE', usefulLifeMonths: 12, startDate: '2026-01-01' } as any, 'u1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a second active schedule for the same asset', async () => {
      prisma.asset.findUnique.mockResolvedValue({ id: 'a1', purchaseCostMinor: 10_000 });
      prisma.assetDepreciationSchedule.findUnique.mockResolvedValue({ id: 's1', closedAt: null });

      await expect(
        service.createSchedule('a1', { method: 'STRAIGHT_LINE', usefulLifeMonths: 12, startDate: '2026-01-01' } as any, 'u1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows a new schedule once the previous one is closed', async () => {
      prisma.asset.findUnique.mockResolvedValue({ id: 'a1', purchaseCostMinor: 10_000 });
      prisma.assetDepreciationSchedule.findUnique.mockResolvedValue({ id: 's1', closedAt: new Date() });
      prisma.assetDepreciationSchedule.create.mockResolvedValue({ id: 's2' });

      await service.createSchedule('a1', { method: 'STRAIGHT_LINE', usefulLifeMonths: 12, startDate: '2026-01-01' } as any, 'u1');
      expect(prisma.assetDepreciationSchedule.create).toHaveBeenCalled();
    });

    it('defaults acquisitionCostMinor from the asset’s own purchaseCostMinor', async () => {
      prisma.asset.findUnique.mockResolvedValue({ id: 'a1', purchaseCostMinor: 55_000 });
      prisma.assetDepreciationSchedule.findUnique.mockResolvedValue(null);
      prisma.assetDepreciationSchedule.create.mockResolvedValue({ id: 's1' });

      await service.createSchedule('a1', { method: 'STRAIGHT_LINE', usefulLifeMonths: 12, startDate: '2026-01-01' } as any, 'u1');

      expect(prisma.assetDepreciationSchedule.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ acquisitionCostMinor: 55_000 }) }),
      );
    });

    it('refuses when the asset has no purchase cost and none was given explicitly', async () => {
      prisma.asset.findUnique.mockResolvedValue({ id: 'a1', purchaseCostMinor: null });
      prisma.assetDepreciationSchedule.findUnique.mockResolvedValue(null);

      await expect(
        service.createSchedule('a1', { method: 'STRAIGHT_LINE', usefulLifeMonths: 12, startDate: '2026-01-01' } as any, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses salvageValueMinor greater than acquisitionCostMinor', async () => {
      prisma.asset.findUnique.mockResolvedValue({ id: 'a1', purchaseCostMinor: 1_000 });
      prisma.assetDepreciationSchedule.findUnique.mockResolvedValue(null);

      await expect(
        service.createSchedule(
          'a1',
          { method: 'STRAIGHT_LINE', usefulLifeMonths: 12, salvageValueMinor: 2_000, startDate: '2026-01-01' } as any,
          'u1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires decliningRateBps for DECLINING_BALANCE', async () => {
      prisma.asset.findUnique.mockResolvedValue({ id: 'a1', purchaseCostMinor: 1_000 });
      prisma.assetDepreciationSchedule.findUnique.mockResolvedValue(null);

      await expect(
        service.createSchedule('a1', { method: 'DECLINING_BALANCE', usefulLifeMonths: 12, startDate: '2026-01-01' } as any, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('postMonthlyDepreciation — WO-147.3 acceptance: a re-run posts nothing further', () => {
    const SCHEDULE = {
      id: 's1',
      assetId: 'a1',
      method: 'STRAIGHT_LINE',
      acquisitionCostMinor: 120_000,
      salvageValueMinor: 0,
      usefulLifeMonths: 12,
      decliningRateBps: null,
      startDate: new Date('2026-01-01'),
      closedAt: null,
      postings: [],
    };

    it('posts a Dr Depreciation Expense / Cr Accumulated Depreciation entry for an active schedule', async () => {
      prisma.assetDepreciationSchedule.findMany.mockResolvedValue([SCHEDULE]);

      const result = await service.postMonthlyDepreciation();

      expect(result.posted).toBe(1);
      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'AssetDepreciation',
          lines: [
            { accountId: 'acc-depr-expense', debitMinor: 10_000 },
            { accountId: 'acc-accum-depr', creditMinor: 10_000 },
          ],
        }),
        prisma,
      );
      expect(prisma.assetDepreciationPosting.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ scheduleId: 's1', amountMinor: 10_000 }) }),
      );
    });

    it('skips a schedule already posted this month — the idempotency guard', async () => {
      prisma.assetDepreciationSchedule.findMany.mockResolvedValue([SCHEDULE]);
      accounting.findPostedEntry.mockResolvedValue({ id: 'existing-entry' });

      const result = await service.postMonthlyDepreciation();

      expect(result.posted).toBe(0);
      expect(result.skipped).toBe(1);
      expect(accounting.postEntry).not.toHaveBeenCalled();
    });

    it('skips (and does not post) a fully-depreciated schedule', async () => {
      prisma.assetDepreciationSchedule.findMany.mockResolvedValue([
        { ...SCHEDULE, postings: [{ amountMinor: 120_000 }] },
      ]);

      const result = await service.postMonthlyDepreciation();

      expect(result.posted).toBe(0);
      expect(accounting.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('disposeAsset', () => {
    const ASSET = { id: 'a1', assetTag: 'LT-001', status: 'AVAILABLE' };
    const SCHEDULE = {
      id: 's1',
      assetId: 'a1',
      acquisitionCostMinor: 120_000,
      closedAt: null,
      postings: [{ amountMinor: 30_000 }],
    };

    beforeEach(() => {
      prisma.asset.findUnique.mockResolvedValue(ASSET);
      prisma.assetDepreciationSchedule.findUnique.mockResolvedValue(SCHEDULE);
      prisma.asset.update.mockResolvedValue({ ...ASSET, status: 'RETIRED' });
    });

    it('throws NotFoundException for a missing asset', async () => {
      prisma.asset.findUnique.mockResolvedValue(null);
      await expect(service.disposeAsset('a1', new Date(), 0, 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses an asset that is already RETIRED or LOST', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET, status: 'LOST' });
      await expect(service.disposeAsset('a1', new Date(), 0, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an asset with no active depreciation schedule', async () => {
      prisma.assetDepreciationSchedule.findUnique.mockResolvedValue(null);
      await expect(service.disposeAsset('a1', new Date(), 0, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('posts the remaining book value as a single loss when there are no sale proceeds', async () => {
      const result = await service.disposeAsset('a1', new Date('2026-06-01'), 0, 'u1');

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'AssetDisposal',
          lines: [
            { accountId: 'acc-loss', debitMinor: 90_000 },
            { accountId: 'acc-accum-depr', creditMinor: 90_000 },
          ],
        }),
        prisma,
      );
      expect(result.lossMinor).toBe(90_000);
      expect(result.gainMinor).toBe(0);
    });

    it('posts sale proceeds as a gain alongside the remaining book value as a loss', async () => {
      await service.disposeAsset('a1', new Date('2026-06-01'), 15_000, 'u1');

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            { accountId: 'acc-loss', debitMinor: 90_000 },
            { accountId: 'acc-accum-depr', creditMinor: 90_000 },
            { accountId: 'acc-bank', debitMinor: 15_000 },
            { accountId: 'acc-gain', creditMinor: 15_000 },
          ],
        }),
        prisma,
      );
    });

    it('posts nothing when the asset is fully depreciated and there are no proceeds', async () => {
      prisma.assetDepreciationSchedule.findUnique.mockResolvedValue({
        ...SCHEDULE,
        postings: [{ amountMinor: 120_000 }],
      });

      await service.disposeAsset('a1', new Date('2026-06-01'), 0, 'u1');

      expect(accounting.postEntry).not.toHaveBeenCalled();
    });

    it('closes the schedule, retires the asset, and closes any open assignment', async () => {
      await service.disposeAsset('a1', new Date('2026-06-01'), 0, 'u1');

      expect(prisma.assetDepreciationSchedule.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 's1' }, data: expect.objectContaining({ closedAt: expect.any(Date) }) }),
      );
      expect(prisma.assetAssignment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { assetId: 'a1', returnedAt: null },
          data: expect.objectContaining({ returnedById: 'u1' }),
        }),
      );
      expect(prisma.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'a1' }, data: { status: 'RETIRED' } }),
      );
    });
  });
});
