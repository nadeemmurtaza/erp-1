import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { SettingsService } from '../../core/settings/settings.service';
import { ReportsService } from './reports.service';

/**
 * WO-4.6's four CSV exports (04-finance.md) — the P&L and payables ones read
 * `JournalLine` directly (the same rows GlReportsService's on-screen JSON
 * reads, see reports.service.ts's own comment on why that is not the
 * "revenue reported N ways" hazard RETAIL-ERP.md R15 exists to prevent).
 */
describe('ReportsService finance exports', () => {
  let service: ReportsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ReportsService,
        PrismaService,
        SettingsService,
        // Settings' shared L2 is not under test here: Redis reads as not connected, so every read is Postgres's.
        { provide: RedisService, useValue: { isReady: () => false } },
      ],
    }).compile();

    service = module.get(ReportsService);
    prisma = module.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.expense.deleteMany({ where: { description: { startsWith: 'reports-export-spec ' } } });
  });

  it('profitAndLossCsv returns a header and a NET row', async () => {
    const csv = await service.profitAndLossCsv();
    expect(csv.header).toEqual(['Period', 'Type', 'Code', 'Account', 'Amount (Rs)']);
    expect(csv.rows.some((row) => row[1] === 'NET')).toBe(true);
  });

  it('payablesCsv returns the aged-payables header even with nothing outstanding', async () => {
    const csv = await service.payablesCsv('2020-01-01');
    expect(csv.header).toEqual(['As Of', 'Supplier', 'Current (Rs)', '31-60 (Rs)', '61-90 (Rs)', '91+ (Rs)', 'Total (Rs)']);
    expect(Array.isArray(csv.rows)).toBe(true);
  });

  it('expenseRegisterCsv includes an expense recorded in the range', async () => {
    const category = await prisma.expenseCategory.findFirstOrThrow();
    const incurredAt = new Date();
    await prisma.expense.create({
      data: {
        categoryId: category.id,
        amount: 5000,
        description: 'reports-export-spec test expense',
        incurredAt,
      },
    });

    const from = new Date(incurredAt.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = new Date(incurredAt.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const csv = await service.expenseRegisterCsv(from, to);

    expect(csv.rows.some((row) => row[3] === 'reports-export-spec test expense')).toBe(true);
  });

  it('salesRegisterCsv returns the expected header shape', async () => {
    const csv = await service.salesRegisterCsv();
    expect(csv.header).toEqual(['Order', 'Placed', 'Status', 'Revenue (Rs)', 'COGS (Rs)', 'Gross Margin (Rs)', 'Contribution (Rs)']);
  });
});
