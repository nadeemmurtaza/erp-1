import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

export interface ScheduledCashEvent {
  date: Date;
  amountMinor: number;
  source: 'AR' | 'AP' | 'Payroll';
}

export interface LiquidityForecast {
  currentCashMinor: number;
  scheduledInflows: ScheduledCashEvent[];
  scheduledOutflows: ScheduledCashEvent[];
  /** DIO + DSO - DPO, every term from the ledger + stock ledger (R24). Null when trailing revenue/COGS is zero (a brand-new deployment). */
  cashConversionCycleDays: number | null;
}

/** '4000'/'5000' — Sales Revenue / Cost of Goods Sold, the same codes `accounting/chart-of-accounts.ts`'s own `ACCOUNT_CODE` names; read by bare code here (never importing that module's own file) because a `.ts` constant is not a module's public surface — `.module`/`.service` files are (scripts/check-module-boundaries.mjs). */
const SALES_REVENUE_CODE = '4000';
const COGS_CODE = '5000';

/**
 * R24 — liquidity is a ledger query plus a schedule, never a new forecast
 * model. No new schema: every figure below is a read composed entirely
 * from tables this repository already writes for their own reasons.
 * AR reuses `Invoice`/`dueDate`/`status` — the identical source doc 56's
 * own overdue-invoices counter already reads, never a second AR model.
 */
@Injectable()
export class LiquidityForecastService {
  constructor(private readonly prisma: PrismaService) {}

  async forecast(horizonDays: number): Promise<LiquidityForecast> {
    const horizonEnd = new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000);
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    const [bankLines, invoices, bills, payRuns, revenueLines, cogsLines, stock, openInvoices, openBills] = await Promise.all([
      this.prisma.journalLine.findMany({
        where: { account: { isBank: true } },
        select: { debitMinor: true, creditMinor: true },
      }),
      this.prisma.invoice.findMany({
        where: { status: 'ISSUED', dueDate: { lte: horizonEnd } },
        select: { dueDate: true, totalMinor: true },
      }),
      this.prisma.supplierBill.findMany({
        where: { dueAt: { lte: horizonEnd } },
        select: { dueAt: true, amount: true, amountPaid: true },
      }),
      this.prisma.payRun.findMany({
        where: { status: 'APPROVED', periodEnd: { lte: horizonEnd } },
        select: { periodEnd: true, lines: { select: { grossMinor: true } } },
      }),
      this.prisma.journalLine.findMany({
        where: { account: { code: SALES_REVENUE_CODE }, entry: { date: { gte: yearAgo } } },
        select: { creditMinor: true, debitMinor: true },
      }),
      this.prisma.journalLine.findMany({
        where: { account: { code: COGS_CODE }, entry: { date: { gte: yearAgo } } },
        select: { creditMinor: true, debitMinor: true },
      }),
      this.prisma.variantLocationStock.findMany({
        select: { quantity: true, variant: { select: { costPrice: true } } },
      }),
      this.prisma.invoice.findMany({ where: { status: 'ISSUED' }, select: { totalMinor: true } }),
      this.prisma.supplierBill.findMany({ select: { amount: true, amountPaid: true } }),
    ]);

    const currentCashMinor = bankLines.reduce((sum, l) => sum + l.debitMinor - l.creditMinor, 0);

    const scheduledInflows: ScheduledCashEvent[] = invoices
      .filter((inv) => inv.dueDate)
      .map((inv) => ({ date: inv.dueDate as Date, amountMinor: inv.totalMinor, source: 'AR' as const }));

    const scheduledOutflows: ScheduledCashEvent[] = [
      ...bills
        .filter((b) => b.dueAt && b.amountPaid < b.amount)
        .map((b) => ({ date: b.dueAt as Date, amountMinor: b.amount - b.amountPaid, source: 'AP' as const })),
      ...payRuns.map((p) => ({
        date: p.periodEnd,
        amountMinor: p.lines.reduce((sum, l) => sum + l.grossMinor, 0),
        source: 'Payroll' as const,
      })),
    ];

    const trailingRevenueMinor = revenueLines.reduce((sum, l) => sum + l.creditMinor - l.debitMinor, 0);
    const trailingCogsMinor = cogsLines.reduce((sum, l) => sum + l.debitMinor - l.creditMinor, 0);
    const averageInventoryMinor = stock.reduce((sum, s) => sum + s.quantity * s.variant.costPrice, 0);
    const averageArMinor = openInvoices.reduce((sum, inv) => sum + inv.totalMinor, 0);
    const averageApMinor = openBills.reduce((sum, b) => sum + Math.max(0, b.amount - b.amountPaid), 0);

    let cashConversionCycleDays: number | null = null;
    if (trailingRevenueMinor > 0 && trailingCogsMinor > 0) {
      const dio = (averageInventoryMinor / trailingCogsMinor) * 365;
      const dso = (averageArMinor / trailingRevenueMinor) * 365;
      const dpo = (averageApMinor / trailingCogsMinor) * 365;
      cashConversionCycleDays = dio + dso - dpo;
    }

    return { currentCashMinor, scheduledInflows, scheduledOutflows, cashConversionCycleDays };
  }
}
