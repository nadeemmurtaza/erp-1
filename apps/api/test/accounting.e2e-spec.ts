/**
 * The general ledger's invariants (RETAIL-ERP.md R15, WO-19.1), proven
 * against a real database rather than a mocked PrismaService — a posted
 * entry's immutability and the balance check are both database triggers
 * (see the `add_accounting_ledger` migration), and a mock cannot fail a
 * write the way Postgres itself does. This is the "proven by a failing
 * write, not by convention" acceptance test the roadmap names.
 */
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { SettingsService } from '../src/core/settings/settings.service';
import { AccountingService } from '../src/modules/money/accounting/accounting.service';
import { FiscalPeriodsService } from '../src/modules/money/accounting/fiscal-periods.service';
import { GlReportsService } from '../src/modules/money/accounting/gl-reports.service';
import { ACCOUNT_CODE } from '../src/modules/money/accounting/chart-of-accounts';

describe('Accounting ledger invariants (integration)', () => {
  let prisma: PrismaService;
  let settings: SettingsService;
  let accounting: AccountingService;

  let cashAccountId: string;
  let revenueAccountId: string;
  let fiscalYearId: string;
  let wo195FiscalYearId: string | undefined;

  const createdEntryIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    // Only documentPrefix('journalEntry') is ever read — falls back to 'JE' with no Setting row.
    settings = { get: jest.fn().mockResolvedValue(undefined) } as unknown as SettingsService;
    accounting = new AccountingService(prisma, settings);

    const suffix = Date.now().toString(36);
    const [cash, revenue] = await Promise.all([
      prisma.account.create({ data: { code: `CASH-${suffix}`, name: 'Cash (test)', type: 'ASSET' } }),
      prisma.account.create({ data: { code: `REV-${suffix}`, name: 'Revenue (test)', type: 'INCOME' } }),
    ]);
    cashAccountId = cash.id;
    revenueAccountId = revenue.id;

    const now = new Date();
    const fiscalYear = await prisma.fiscalYear.create({
      data: {
        name: `FYTEST-${suffix}`,
        startsOn: new Date(now.getFullYear(), 0, 1),
        endsOn: new Date(now.getFullYear() + 1, 0, 1),
      },
    });
    fiscalYearId = fiscalYear.id;
    await prisma.fiscalPeriod.create({
      data: {
        fiscalYearId,
        name: 'P1',
        startsOn: new Date(now.getFullYear(), 0, 1),
        endsOn: new Date(now.getFullYear() + 1, 0, 1),
        status: 'OPEN',
      },
    });
  });

  afterAll(async () => {
    // The immutability triggers are the point of this suite, and they mean
    // exactly what they say: nothing, including this cleanup, can delete a
    // JournalEntry or JournalLine through the ORM. A real ledger never
    // deletes either — test fixtures are the one legitimate exception, and
    // only a superuser can grant it, by disabling the triggers for the
    // duration of the cleanup and switching them straight back on.
    await prisma.$executeRawUnsafe(`ALTER TABLE "JournalLine" DISABLE TRIGGER journal_line_immutable`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "JournalLine" DISABLE TRIGGER journal_line_balance_check`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "JournalEntry" DISABLE TRIGGER journal_entry_immutable`);
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "JournalLine" WHERE "entryId" = ANY($1::text[])`,
        createdEntryIds,
      );
      await prisma.$executeRawUnsafe(`DELETE FROM "JournalEntry" WHERE id = ANY($1::text[])`, createdEntryIds);
    } finally {
      await prisma.$executeRawUnsafe(`ALTER TABLE "JournalLine" ENABLE TRIGGER journal_line_immutable`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "JournalLine" ENABLE TRIGGER journal_line_balance_check`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "JournalEntry" ENABLE TRIGGER journal_entry_immutable`);
    }

    await prisma.journalEntryNumberCounter.deleteMany({ where: { fiscalYearId } }).catch(() => undefined);
    await prisma.fiscalPeriod.deleteMany({ where: { fiscalYearId } }).catch(() => undefined);
    await prisma.fiscalYear.delete({ where: { id: fiscalYearId } }).catch(() => undefined);
    // The WO-19.5 nested describe's own fiscal year, cleaned up here rather
    // than in its own afterAll — its FiscalPeriod rows are still referenced
    // by JournalEntry.periodId (onDelete: Restrict) until the entry cleanup
    // above has run, and nested afterAll blocks run before this one.
    if (wo195FiscalYearId) {
      await prisma.journalEntryNumberCounter.deleteMany({ where: { fiscalYearId: wo195FiscalYearId } }).catch(() => undefined);
      await prisma.fiscalPeriod.deleteMany({ where: { fiscalYearId: wo195FiscalYearId } }).catch(() => undefined);
      await prisma.fiscalYear.delete({ where: { id: wo195FiscalYearId } }).catch(() => undefined);
    }
    await prisma.account.deleteMany({ where: { id: { in: [cashAccountId, revenueAccountId] } } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('posts a balanced entry and numbers it gaplessly per fiscal year', async () => {
    const first = await accounting.postEntry({
      date: new Date(),
      source: 'test.sale',
      lines: [
        { accountId: cashAccountId, debitMinor: 5_000 },
        { accountId: revenueAccountId, creditMinor: 5_000 },
      ],
    });
    createdEntryIds.push(first.id);

    const second = await accounting.postEntry({
      date: new Date(),
      source: 'test.sale',
      lines: [
        { accountId: cashAccountId, debitMinor: 1_000 },
        { accountId: revenueAccountId, creditMinor: 1_000 },
      ],
    });
    createdEntryIds.push(second.id);

    expect(first.number.endsWith('-0001')).toBe(true);
    expect(second.number.endsWith('-0002')).toBe(true);
    expect(first.lines).toHaveLength(2);
  });

  it('refuses an unbalanced entry before it ever reaches the database', async () => {
    await expect(
      accounting.postEntry({
        date: new Date(),
        source: 'test.bad',
        lines: [{ accountId: cashAccountId, debitMinor: 500 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('the database itself refuses an unbalanced entry — a failing write, not application discipline', async () => {
    // Bypasses AccountingService.assertBalanced() entirely, going straight
    // at Prisma, to prove the CONSTRAINT TRIGGER is the real guarantee.
    const period = await prisma.fiscalPeriod.findFirstOrThrow({ where: { fiscalYearId } });

    await expect(
      prisma.journalEntry.create({
        data: {
          number: `TEST-UNBALANCED-${Date.now()}`,
          date: new Date(),
          periodId: period.id,
          source: 'test.raw',
          lines: {
            create: [{ accountId: cashAccountId, debitMinor: 100, creditMinor: 0, currency: 'PKR', baseAmountMinor: 100 }],
          },
        },
      }),
    ).rejects.toThrow(/not balanced/i);
  });

  it('a posted JournalLine cannot be updated', async () => {
    const entry = await accounting.postEntry({
      date: new Date(),
      source: 'test.immutable-line',
      lines: [
        { accountId: cashAccountId, debitMinor: 200 },
        { accountId: revenueAccountId, creditMinor: 200 },
      ],
    });
    createdEntryIds.push(entry.id);

    await expect(
      prisma.journalLine.update({ where: { id: entry.lines[0].id }, data: { debitMinor: 999 } }),
    ).rejects.toThrow(/immutable/i);
  });

  it('a posted JournalLine cannot be deleted', async () => {
    const entry = await accounting.postEntry({
      date: new Date(),
      source: 'test.immutable-line-delete',
      lines: [
        { accountId: cashAccountId, debitMinor: 150 },
        { accountId: revenueAccountId, creditMinor: 150 },
      ],
    });
    createdEntryIds.push(entry.id);

    await expect(prisma.journalLine.delete({ where: { id: entry.lines[0].id } })).rejects.toThrow(/immutable/i);
  });

  it('a JournalEntry cannot be deleted, and cannot have a non-status field edited', async () => {
    const entry = await accounting.postEntry({
      date: new Date(),
      source: 'test.immutable-entry',
      lines: [
        { accountId: cashAccountId, debitMinor: 300 },
        { accountId: revenueAccountId, creditMinor: 300 },
      ],
    });
    createdEntryIds.push(entry.id);

    await expect(prisma.journalEntry.delete({ where: { id: entry.id } })).rejects.toThrow(/immutable/i);
    await expect(
      prisma.journalEntry.update({ where: { id: entry.id }, data: { memo: 'edited after the fact' } }),
    ).rejects.toThrow(/immutable/i);
  });

  it('reverseEntry() mirrors every line and marks the original REVERSED, never editing it', async () => {
    const original = await accounting.postEntry({
      date: new Date(),
      source: 'test.reversal',
      lines: [
        { accountId: cashAccountId, debitMinor: 750 },
        { accountId: revenueAccountId, creditMinor: 750 },
      ],
    });
    createdEntryIds.push(original.id);

    const reversal = await accounting.reverseEntry(original.id);
    createdEntryIds.push(reversal.id);

    expect(reversal.reversalOfId).toBe(original.id);
    const reversalCashLine = reversal.lines.find((line) => line.accountId === cashAccountId)!;
    expect(reversalCashLine.creditMinor).toBe(750);
    expect(reversalCashLine.debitMinor).toBe(0);

    const refetchedOriginal = await prisma.journalEntry.findUniqueOrThrow({ where: { id: original.id } });
    expect(refetchedOriginal.status).toBe('REVERSED');
  });

  it('refuses to reverse an entry that is already REVERSED', async () => {
    const original = await accounting.postEntry({
      date: new Date(),
      source: 'test.double-reversal',
      lines: [
        { accountId: cashAccountId, debitMinor: 400 },
        { accountId: revenueAccountId, creditMinor: 400 },
      ],
    });
    createdEntryIds.push(original.id);

    const reversal = await accounting.reverseEntry(original.id);
    createdEntryIds.push(reversal.id);

    await expect(accounting.reverseEntry(original.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('the database refuses to move a REVERSED entry back to POSTED', async () => {
    const original = await accounting.postEntry({
      date: new Date(),
      source: 'test.no-un-reverse',
      lines: [
        { accountId: cashAccountId, debitMinor: 600 },
        { accountId: revenueAccountId, creditMinor: 600 },
      ],
    });
    createdEntryIds.push(original.id);

    const reversal = await accounting.reverseEntry(original.id);
    createdEntryIds.push(reversal.id);

    await expect(
      prisma.journalEntry.update({ where: { id: original.id }, data: { status: 'POSTED' } }),
    ).rejects.toThrow(/immutable/i);
  });

  it('a late fact posts into the currently open period, keeping its own original date', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const entry = await accounting.postEntry({
      date: threeDaysAgo,
      source: 'test.late-fact',
      lines: [
        { accountId: cashAccountId, debitMinor: 250 },
        { accountId: revenueAccountId, creditMinor: 250 },
      ],
    });
    createdEntryIds.push(entry.id);

    expect(entry.date.getTime()).toBe(threeDaysAgo.getTime());
    const period = await prisma.fiscalPeriod.findUniqueOrThrow({ where: { id: entry.periodId } });
    expect(period.status).toBe('OPEN');
  });

  describe('WO-19.5 — closing a period redirects a fact dated inside it to the next OPEN one', () => {
    let fiscalPeriods: FiscalPeriodsService;
    let closedPeriodId: string;
    let openPeriodId: string;

    beforeAll(async () => {
      fiscalPeriods = new FiscalPeriodsService(prisma, accounting, new GlReportsService(prisma));
      // A separate, future fiscal year — never overlaps the suite's own
      // current-year P1, so resolveOpenPeriod's global "most recently
      // opened OPEN period" fallback cannot ambiguously pick between them.
      const nextYear = new Date().getFullYear() + 5;
      const fiscalYear = await fiscalPeriods.createFiscalYear({
        name: `FYTEST-WO195-${Date.now().toString(36)}`,
        startsOn: new Date(nextYear, 0, 1).toISOString(),
        endsOn: new Date(nextYear + 1, 0, 1).toISOString(),
      });
      wo195FiscalYearId = fiscalYear.id;

      const closed = await fiscalPeriods.createFiscalPeriod({
        fiscalYearId: fiscalYear.id,
        name: 'Q1',
        startsOn: new Date(nextYear, 0, 1).toISOString(),
        endsOn: new Date(nextYear, 3, 1).toISOString(),
      });
      closedPeriodId = closed.id;

      const open = await fiscalPeriods.createFiscalPeriod({
        fiscalYearId: fiscalYear.id,
        name: 'Q2',
        startsOn: new Date(nextYear, 3, 1).toISOString(),
        endsOn: new Date(nextYear, 6, 1).toISOString(),
      });
      openPeriodId = open.id;

      await fiscalPeriods.closePeriod(closedPeriodId);
    });

    it('posts a fact dated inside the now-CLOSED Q1 into the still-OPEN Q2 instead, keeping Q1\'s own date', async () => {
      const dateInsideClosedQ1 = new Date(new Date().getFullYear() + 5, 1, 15); // mid-February, inside Q1

      const entry = await accounting.postEntry({
        date: dateInsideClosedQ1,
        source: 'test.wo195-late-fact',
        lines: [
          { accountId: cashAccountId, debitMinor: 99 },
          { accountId: revenueAccountId, creditMinor: 99 },
        ],
      });
      createdEntryIds.push(entry.id);

      expect(entry.periodId).toBe(openPeriodId);
      expect(entry.periodId).not.toBe(closedPeriodId);
      expect(entry.date.getTime()).toBe(dateInsideClosedQ1.getTime());
    });

    it('reopening Q1 lets a fact dated inside it post there again', async () => {
      await fiscalPeriods.reopenPeriod(closedPeriodId);

      const dateInsideQ1 = new Date(new Date().getFullYear() + 5, 1, 20);
      const entry = await accounting.postEntry({
        date: dateInsideQ1,
        source: 'test.wo195-reopened',
        lines: [
          { accountId: cashAccountId, debitMinor: 42 },
          { accountId: revenueAccountId, creditMinor: 42 },
        ],
      });
      createdEntryIds.push(entry.id);

      expect(entry.periodId).toBe(closedPeriodId);
    });

    it('locking a period refuses a later reopen — permanent', async () => {
      await fiscalPeriods.closePeriod(closedPeriodId);
      await fiscalPeriods.lockPeriod(closedPeriodId);

      await expect(fiscalPeriods.reopenPeriod(closedPeriodId)).rejects.toThrow(/never be reopened/i);

      const period = await prisma.fiscalPeriod.findUniqueOrThrow({ where: { id: closedPeriodId } });
      expect(period.status).toBe('LOCKED');
    });
  });

  describe('WO-19.5 — closeFiscalYear posts a real, database-balanced closing entry', () => {
    let fiscalPeriods: FiscalPeriodsService;
    let glReports: GlReportsService;
    let closeFyId: string;
    let closePeriodId: string;
    let expenseAccountId: string;
    let retainedEarningsId: string;

    beforeAll(async () => {
      glReports = new GlReportsService(prisma);
      fiscalPeriods = new FiscalPeriodsService(prisma, accounting, glReports);

      const retainedEarnings = await prisma.account.findUniqueOrThrow({
        where: { code: ACCOUNT_CODE.RETAINED_EARNINGS },
      });
      retainedEarningsId = retainedEarnings.id;

      const expenseSuffix = Date.now().toString(36);
      const expenseAccount = await prisma.account.create({
        data: { code: `EXP-${expenseSuffix}`, name: 'Expense (test)', type: 'EXPENSE' },
      });
      expenseAccountId = expenseAccount.id;

      const closeYear = new Date().getFullYear() + 6;
      const fiscalYear = await fiscalPeriods.createFiscalYear({
        name: `FYTEST-CLOSE-${Date.now().toString(36)}`,
        startsOn: new Date(closeYear, 0, 1).toISOString(),
        endsOn: new Date(closeYear + 1, 0, 1).toISOString(),
      });
      closeFyId = fiscalYear.id;

      const period = await fiscalPeriods.createFiscalPeriod({
        fiscalYearId: fiscalYear.id,
        name: 'Q1',
        startsOn: new Date(closeYear, 0, 1).toISOString(),
        endsOn: new Date(closeYear, 3, 1).toISOString(),
      });
      closePeriodId = period.id;

      // Rs 50 revenue, Rs 20 expense — Rs 30 net income to close to equity.
      const income = await accounting.postEntry({
        date: new Date(closeYear, 1, 1),
        source: 'test.wo195-close-income',
        lines: [
          { accountId: cashAccountId, debitMinor: 5000 },
          { accountId: revenueAccountId, creditMinor: 5000 },
        ],
      });
      createdEntryIds.push(income.id);
      const expense = await accounting.postEntry({
        date: new Date(closeYear, 1, 2),
        source: 'test.wo195-close-expense',
        lines: [
          { accountId: expenseAccountId, debitMinor: 2000 },
          { accountId: cashAccountId, creditMinor: 2000 },
        ],
      });
      createdEntryIds.push(expense.id);

      await fiscalPeriods.closePeriod(closePeriodId);
    });

    it('zeros the year\'s income/expense into Retained Earnings and marks the year closed', async () => {
      const before = await prisma.journalLine.aggregate({
        where: { accountId: retainedEarningsId },
        _sum: { creditMinor: true, debitMinor: true },
      });
      const beforeNet = (before._sum.creditMinor ?? 0) - (before._sum.debitMinor ?? 0);

      const closed = await fiscalPeriods.closeFiscalYear(closeFyId);
      expect(closed.closedAt).toBeInstanceOf(Date);

      const closingEntry = await prisma.journalEntry.findFirstOrThrow({
        where: { source: 'accounting.year_end_close', sourceRef: closeFyId },
        include: { lines: true },
      });
      createdEntryIds.push(closingEntry.id);

      const totalDebit = closingEntry.lines.reduce((sum, l) => sum + l.debitMinor, 0);
      const totalCredit = closingEntry.lines.reduce((sum, l) => sum + l.creditMinor, 0);
      expect(totalDebit).toBe(totalCredit); // the database trigger already proved this on insert.

      const retainedEarningsLine = closingEntry.lines.find((l) => l.accountId === retainedEarningsId);
      expect(retainedEarningsLine?.creditMinor).toBe(3000);

      const after = await prisma.journalLine.aggregate({
        where: { accountId: retainedEarningsId },
        _sum: { creditMinor: true, debitMinor: true },
      });
      const afterNet = (after._sum.creditMinor ?? 0) - (after._sum.debitMinor ?? 0);
      expect(afterNet - beforeNet).toBe(3000);
    });

    it('refuses to close the same fiscal year twice', async () => {
      await expect(fiscalPeriods.closeFiscalYear(closeFyId)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
