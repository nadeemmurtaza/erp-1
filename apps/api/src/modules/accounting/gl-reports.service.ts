import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AccountType } from '../../core/prisma/client';
import { ACCOUNT_CODE } from './chart-of-accounts';
import { ageMovements, type AgingBuckets } from '../../core/common/aging';

export interface AccountBalance {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debitMinor: number;
  creditMinor: number;
}

/**
 * The five reports R15 names as the payoff of a real ledger — "expenses,
 * salaries, losses, profits, revenues and COGS become a query over one
 * ledger" (WO-19.4). Every one is a grouping over `JournalLine`, filtered by
 * date and (for trial balance/balance sheet/aged AR/AP) status POSTED —
 * never a second arithmetic path that could disagree with the trial
 * balance. No `AdminScope` narrowing yet: `organization` (R10) is off by
 * default and no posting rule sets `retailBrandId`/`branchNodeId` today, so
 * scoping these reports is additive work for whenever that changes, not
 * something to fake now.
 */
@Injectable()
export class GlReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every account's cumulative debit/credit from ledger inception through
   * `asOf`, POSTED entries only — the one query trial balance, balance
   * sheet and the retained-earnings figure all read from, so they can never
   * disagree with each other by construction.
   */
  private async balancesAsOf(asOf: Date): Promise<AccountBalance[]> {
    const sums = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { entry: { status: 'POSTED', date: { lte: asOf } } },
      _sum: { debitMinor: true, creditMinor: true },
    });
    if (sums.length === 0) return [];

    const accounts = await this.prisma.account.findMany({
      where: { id: { in: sums.map((s) => s.accountId) } },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));

    return sums
      .map((s) => {
        const account = byId.get(s.accountId);
        if (!account) return null;
        return {
          accountId: s.accountId,
          code: account.code,
          name: account.name,
          type: account.type,
          debitMinor: s._sum.debitMinor ?? 0,
          creditMinor: s._sum.creditMinor ?? 0,
        };
      })
      .filter((row): row is AccountBalance => row !== null)
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  /**
   * SUM(debit) = SUM(credit) across every account, as of a date — the same
   * invariant the database trigger enforces per entry, proven again here in
   * aggregate. A mismatch here would mean the trigger itself was bypassed
   * (a raw SQL write, a disabled trigger during a migration) — this report
   * is how that would actually be noticed.
   */
  async trialBalance(asOf: Date) {
    const rows = await this.balancesAsOf(asOf);
    const totalDebitMinor = rows.reduce((sum, r) => sum + r.debitMinor, 0);
    const totalCreditMinor = rows.reduce((sum, r) => sum + r.creditMinor, 0);

    return {
      asOf,
      rows,
      totalDebitMinor,
      totalCreditMinor,
      balanced: totalDebitMinor === totalCreditMinor,
    };
  }

  /**
   * Income and expense accounts only, for the date range — net income is the
   * difference. `accountId` rides along on each row so `FiscalPeriodsService
   * .closeFiscalYear()` (WO-19.5) can post a closing line straight back to
   * the account it came from, without a second lookup by code.
   */
  async profitAndLoss(from: Date, to: Date) {
    const sums = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { entry: { status: 'POSTED', date: { gte: from, lte: to } } },
      _sum: { debitMinor: true, creditMinor: true },
    });
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: sums.map((s) => s.accountId) }, type: { in: ['INCOME', 'EXPENSE'] } },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));

    const income: Array<{ accountId: string; code: string; name: string; amountMinor: number }> = [];
    const expense: Array<{ accountId: string; code: string; name: string; amountMinor: number }> = [];

    for (const s of sums) {
      const account = byId.get(s.accountId);
      if (!account) continue;
      const debit = s._sum.debitMinor ?? 0;
      const credit = s._sum.creditMinor ?? 0;
      if (account.type === 'INCOME') {
        income.push({ accountId: account.id, code: account.code, name: account.name, amountMinor: credit - debit });
      } else {
        expense.push({ accountId: account.id, code: account.code, name: account.name, amountMinor: debit - credit });
      }
    }
    income.sort((a, b) => a.code.localeCompare(b.code));
    expense.sort((a, b) => a.code.localeCompare(b.code));

    const totalIncomeMinor = income.reduce((sum, r) => sum + r.amountMinor, 0);
    const totalExpenseMinor = expense.reduce((sum, r) => sum + r.amountMinor, 0);

    return {
      from,
      to,
      income,
      expense,
      totalIncomeMinor,
      totalExpenseMinor,
      netIncomeMinor: totalIncomeMinor - totalExpenseMinor,
    };
  }

  /**
   * Asset/liability/equity balances as of a date, plus `retainedEarningsMinor`
   * — the income-minus-expense accumulated *since the last WO-19.5 year-end
   * close*, not yet folded into the `Retained Earnings` (3000) equity
   * account. `equity` already carries every prior year's closed profit,
   * since `FiscalPeriodsService.closeFiscalYear()` posts straight to that
   * account like any other entry; this field is only ever the open tail a
   * close hasn't swept up yet, which is why the two are shown, and summed,
   * separately rather than one replacing the other.
   */
  async balanceSheet(asOf: Date) {
    const rows = await this.balancesAsOf(asOf);

    const assets = rows
      .filter((r) => r.type === 'ASSET')
      .map((r) => ({ code: r.code, name: r.name, balanceMinor: r.debitMinor - r.creditMinor }));
    const liabilities = rows
      .filter((r) => r.type === 'LIABILITY')
      .map((r) => ({ code: r.code, name: r.name, balanceMinor: r.creditMinor - r.debitMinor }));
    const equity = rows
      .filter((r) => r.type === 'EQUITY')
      .map((r) => ({ code: r.code, name: r.name, balanceMinor: r.creditMinor - r.debitMinor }));

    const totalIncomeMinor = rows
      .filter((r) => r.type === 'INCOME')
      .reduce((sum, r) => sum + (r.creditMinor - r.debitMinor), 0);
    const totalExpenseMinor = rows
      .filter((r) => r.type === 'EXPENSE')
      .reduce((sum, r) => sum + (r.debitMinor - r.creditMinor), 0);
    const retainedEarningsMinor = totalIncomeMinor - totalExpenseMinor;

    const totalAssetsMinor = assets.reduce((sum, r) => sum + r.balanceMinor, 0);
    const totalLiabilitiesMinor = liabilities.reduce((sum, r) => sum + r.balanceMinor, 0);
    const totalEquityMinor = equity.reduce((sum, r) => sum + r.balanceMinor, 0);

    return {
      asOf,
      assets,
      liabilities,
      equity,
      retainedEarningsMinor,
      totalAssetsMinor,
      totalLiabilitiesMinor,
      totalEquityMinor,
      balanced: totalAssetsMinor === totalLiabilitiesMinor + totalEquityMinor + retainedEarningsMinor,
    };
  }

  /**
   * Direct-method movement on every `isBank` account for the date range —
   * "cash position ties to the ledger" (R24), the simplest true statement
   * of that fact. Not an indirect-method statement reconciled from net
   * income; nothing here needs the operating/investing/financing split R24
   * doesn't ask for either.
   */
  async cashFlow(from: Date, to: Date) {
    const sums = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { entry: { status: 'POSTED', date: { gte: from, lte: to } } },
      _sum: { debitMinor: true, creditMinor: true },
    });
    const bankAccounts = await this.prisma.account.findMany({
      where: { id: { in: sums.map((s) => s.accountId) }, isBank: true },
    });
    const byId = new Map(bankAccounts.map((a) => [a.id, a]));

    const accounts = sums
      .map((s) => {
        const account = byId.get(s.accountId);
        if (!account) return null;
        return {
          code: account.code,
          name: account.name,
          netChangeMinor: (s._sum.debitMinor ?? 0) - (s._sum.creditMinor ?? 0),
        };
      })
      .filter((row): row is { code: string; name: string; netChangeMinor: number } => row !== null)
      .sort((a, b) => a.code.localeCompare(b.code));

    return {
      from,
      to,
      accounts,
      netChangeMinor: accounts.reduce((sum, a) => sum + a.netChangeMinor, 0),
    };
  }

  /**
   * Outstanding customer balances as of a date, FIFO-aged into
   * 0-30/31-60/61-90/91+ buckets (see aging.ts). A debit on AR is the
   * origination (a sale); a credit is the settlement (a receipt).
   */
  async agedReceivables(asOf: Date) {
    const account = await this.prisma.account.findUnique({ where: { code: ACCOUNT_CODE.ACCOUNTS_RECEIVABLE } });
    if (!account) return { asOf, rows: [], totalMinor: 0 };

    const lines = await this.prisma.journalLine.findMany({
      where: { accountId: account.id, contactId: { not: null }, entry: { status: 'POSTED', date: { lte: asOf } } },
      select: { contactId: true, debitMinor: true, creditMinor: true, entry: { select: { date: true } } },
    });

    const movementsByCounterparty = new Map<string, Array<{ date: Date; amountMinor: number }>>();
    for (const line of lines) {
      const amountMinor = line.debitMinor > 0 ? line.debitMinor : -line.creditMinor;
      const list = movementsByCounterparty.get(line.contactId!) ?? [];
      list.push({ date: line.entry.date, amountMinor });
      movementsByCounterparty.set(line.contactId!, list);
    }

    return this.bucketByCounterparty(asOf, movementsByCounterparty, async (ids) => {
      const contacts = await this.prisma.contact.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      return new Map(contacts.map((c) => [c.id, c.name]));
    });
  }

  /**
   * Outstanding supplier balances as of a date, FIFO-aged the same way as
   * receivables — AP's natural balance side is opposite AR's: a credit is
   * the origination (a bill), a debit is the settlement (a payment).
   */
  async agedPayables(asOf: Date) {
    const account = await this.prisma.account.findUnique({ where: { code: ACCOUNT_CODE.ACCOUNTS_PAYABLE } });
    if (!account) return { asOf, rows: [], totalMinor: 0 };

    const lines = await this.prisma.journalLine.findMany({
      where: { accountId: account.id, supplierId: { not: null }, entry: { status: 'POSTED', date: { lte: asOf } } },
      select: { supplierId: true, debitMinor: true, creditMinor: true, entry: { select: { date: true } } },
    });

    const movementsByCounterparty = new Map<string, Array<{ date: Date; amountMinor: number }>>();
    for (const line of lines) {
      const amountMinor = line.creditMinor > 0 ? line.creditMinor : -line.debitMinor;
      const list = movementsByCounterparty.get(line.supplierId!) ?? [];
      list.push({ date: line.entry.date, amountMinor });
      movementsByCounterparty.set(line.supplierId!, list);
    }

    return this.bucketByCounterparty(asOf, movementsByCounterparty, async (ids) => {
      const suppliers = await this.prisma.supplier.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      return new Map(suppliers.map((s) => [s.id, s.name]));
    });
  }

  private async bucketByCounterparty(
    asOf: Date,
    movementsByCounterparty: Map<string, Array<{ date: Date; amountMinor: number }>>,
    lookupNames: (ids: string[]) => Promise<Map<string, string>>,
  ) {
    const names = await lookupNames([...movementsByCounterparty.keys()]);

    const rows: Array<{ id: string; name: string; buckets: AgingBuckets; totalMinor: number }> = [];
    for (const [id, movements] of movementsByCounterparty) {
      const buckets = ageMovements(movements, asOf);
      const totalMinor = buckets.current + buckets.days31to60 + buckets.days61to90 + buckets.over90;
      if (totalMinor === 0) continue; // fully settled — nothing outstanding to report
      rows.push({ id, name: names.get(id) ?? '(unknown)', buckets, totalMinor });
    }
    rows.sort((a, b) => b.totalMinor - a.totalMinor);

    return { asOf, rows, totalMinor: rows.reduce((sum, r) => sum + r.totalMinor, 0) };
  }
}
