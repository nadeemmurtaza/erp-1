import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { PermissionKey } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MetricRegistryService } from '../../core/metrics/metric-registry.service';
import { VOID_ORDER_STATUSES } from '../../core/common/sales-revenue';
import { FinanceService } from './finance.service';
import type { MetricContext, MetricProvider, MetricValue } from '../../core/metrics/metric-provider';

/**
 * The Expenses group's dashboard cards (10-admin-dashboard.md card
 * inventory, WO-A.4/D — wiring WO-B.4's already-built expense reporting
 * into Track A's registry, per ADR-025/ADR-019). Every figure here reuses
 * `FinanceService.summary()`, the one place expense totals are computed,
 * rather than a second aggregation query that could drift from it.
 */
@Injectable()
export class FinanceMetricsProvider implements MetricProvider, OnModuleInit {
  readonly id = 'finance.metrics';
  readonly keys = [
    'expenses.total',
    'expenses.largest_category_amount',
    'expenses.unpaid_count',
    'expenses.unpaid_amount',
    'expenses.direct_share_bps',
    'expenses.vs_revenue_bps',
    'expenses.recurring_due_count',
  ];
  readonly permissions: readonly PermissionKey[] = ['finance.view'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly metricRegistry: MetricRegistryService,
  ) {}

  onModuleInit(): void {
    this.metricRegistry.register(this);
  }

  async collect(ctx: MetricContext, wanted: readonly string[]): Promise<Record<string, MetricValue>> {
    const want = (key: string) => wanted.includes(key);
    const out: Record<string, MetricValue> = {};

    const [summary, previousSummary, revenue, previousRevenue, recurringDueCount] = await Promise.all([
      this.finance.summary({ from: ctx.from.toISOString(), to: ctx.to.toISOString() }),
      this.finance.summary({ from: ctx.prevFrom.toISOString(), to: ctx.prevTo.toISOString() }),
      this.revenueFor(ctx.from, ctx.to),
      this.revenueFor(ctx.prevFrom, ctx.prevTo),
      this.recurringDueCount(),
    ]);

    if (want('expenses.total')) {
      out['expenses.total'] = { value: summary.totals.amount, previous: previousSummary.totals.amount, unit: 'paisa' };
    }
    if (want('expenses.largest_category_amount')) {
      const top = summary.byCategory[0];
      out['expenses.largest_category_amount'] = {
        value: top?.amount ?? 0,
        previous: null,
        unit: 'paisa',
        label: top?.categoryName,
      };
    }
    if (want('expenses.unpaid_count')) {
      out['expenses.unpaid_count'] = { value: summary.totals.unpaidCount, previous: null, unit: 'count' };
    }
    if (want('expenses.unpaid_amount')) {
      out['expenses.unpaid_amount'] = { value: summary.totals.unpaidAmount, previous: null, unit: 'paisa' };
    }
    if (want('expenses.direct_share_bps')) {
      out['expenses.direct_share_bps'] = {
        value: bps(summary.totals.directAmount, summary.totals.amount),
        previous: bps(previousSummary.totals.directAmount, previousSummary.totals.amount),
        unit: 'bps',
      };
    }
    if (want('expenses.vs_revenue_bps')) {
      out['expenses.vs_revenue_bps'] = {
        value: bps(summary.totals.amount, revenue),
        previous: bps(previousSummary.totals.amount, previousRevenue),
        unit: 'bps',
      };
    }
    if (want('expenses.recurring_due_count')) {
      out['expenses.recurring_due_count'] = { value: recurringDueCount, previous: null, unit: 'count' };
    }
    return out;
  }

  /** Same "sales" reading `sales-revenue.ts` defines — kept in step with `sales.revenue` on purpose (D4's own worked example). */
  private async revenueFor(from: Date, to: Date): Promise<number> {
    const result = await this.prisma.order.aggregate({
      where: { placedAt: { gte: from, lt: to }, status: { notIn: VOID_ORDER_STATUSES } },
      _sum: { grandTotal: true },
    });
    return result._sum.grandTotal ?? 0;
  }

  /**
   * Active recurring templates with no generated instance for the CURRENT
   * calendar month. An approximation for a monthly cadence (the dominant
   * one) rather than a full replay of `generateRecurringInstances()`'s own
   * per-period walk — this card's job is "nudge someone to run the
   * recurring-expense cron," not a compliance-grade audit of every WEEKLY
   * or QUARTERLY schedule's exact due date.
   */
  private async recurringDueCount(): Promise<number> {
    const currentPeriod = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count FROM "Expense" template
      WHERE template."recurrence" != 'NONE' AND template."recurringFromId" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "Expense" instance
          WHERE instance."recurringFromId" = template."id" AND instance."recurringPeriod" = ${currentPeriod}
        )
    `;
    return Number(rows[0]?.count ?? 0);
  }
}

/** Basis points of `part` over `whole`, 0 when `whole` is 0. */
function bps(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 10000) : 0;
}
