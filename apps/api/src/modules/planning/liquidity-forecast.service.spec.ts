import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { LiquidityForecastService } from './liquidity-forecast.service';

describe('LiquidityForecastService', () => {
  let service: LiquidityForecastService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      journalLine: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      supplierBill: { findMany: jest.fn().mockResolvedValue([]) },
      payRun: { findMany: jest.fn().mockResolvedValue([]) },
      variantLocationStock: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [LiquidityForecastService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(LiquidityForecastService);
  });

  it('sums bank-account journal lines as current cash', async () => {
    prisma.journalLine.mockClear?.();
    prisma.journalLine.findMany.mockResolvedValueOnce([
      { debitMinor: 10_000, creditMinor: 0 },
      { debitMinor: 0, creditMinor: 3_000 },
    ]);
    const result = await service.forecast(30);
    expect(result.currentCashMinor).toBe(7_000);
  });

  it('lists an open, due invoice as an AR inflow', async () => {
    prisma.invoice.findMany.mockResolvedValue([{ dueDate: new Date(), totalMinor: 5_000 }]);
    const result = await service.forecast(30);
    expect(result.scheduledInflows).toEqual([expect.objectContaining({ amountMinor: 5_000, source: 'AR' })]);
  });

  it('lists only the outstanding balance of a partially-paid supplier bill as an AP outflow', async () => {
    prisma.supplierBill.findMany
      .mockResolvedValueOnce([{ dueAt: new Date(), amount: 10_000, amountPaid: 4_000 }])
      .mockResolvedValueOnce([]);
    const result = await service.forecast(30);
    expect(result.scheduledOutflows).toEqual([expect.objectContaining({ amountMinor: 6_000, source: 'AP' })]);
  });

  it('sums PayRunLine gross across an approved pay run as a Payroll outflow', async () => {
    prisma.payRun.findMany.mockResolvedValue([
      { periodEnd: new Date(), lines: [{ grossMinor: 50_000 }, { grossMinor: 30_000 }] },
    ]);
    const result = await service.forecast(30);
    expect(result.scheduledOutflows).toContainEqual(expect.objectContaining({ amountMinor: 80_000, source: 'Payroll' }));
  });

  it('returns a null cash conversion cycle when there is no trailing revenue or COGS yet', async () => {
    const result = await service.forecast(30);
    expect(result.cashConversionCycleDays).toBeNull();
  });
});
