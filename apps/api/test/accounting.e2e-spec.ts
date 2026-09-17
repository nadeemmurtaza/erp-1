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
import { AccountingService } from '../src/modules/accounting/accounting.service';

describe('Accounting ledger invariants (integration)', () => {
  let prisma: PrismaService;
  let settings: SettingsService;
  let accounting: AccountingService;

  let cashAccountId: string;
  let revenueAccountId: string;
  let fiscalYearId: string;

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
});
