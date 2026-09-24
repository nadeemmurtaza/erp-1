import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { paginated, type PaginatedResult } from '../../core/common/dto/pagination.dto';
import { AppConfigService } from '../../core/config/app-config.service';
import { DomainEvent } from '../../core/events/domain-events';
import { EventBusService } from '../../core/events/event-bus.service';
import { StorageService } from '../../core/storage/storage.service';
import { VOID_ORDER_STATUSES } from '../../core/common/sales-revenue';
import { Prisma, type Expense, type ExpenseCategory, type ExpenseRecurrence } from '../../core/prisma/client';
import type {
  CreateExpenseCategoryDto,
  UpdateExpenseCategoryDto,
} from './dto/expense-category.dto';
import type { CreateExpenseDto, ExpenseQueryDto, ExpenseSummaryQueryDto, UpdateExpenseDto } from './dto/expense.dto';

/**
 * Period math for recurring expenses (WO-B.2). Not a calendar library — just
 * enough to turn "MONTHLY since 2026-06-15" into a list of due period keys,
 * each one unique and monotonically increasing so
 * `@@unique([recurringFromId, recurringPeriod])` can do its job.
 */
function addPeriod(date: Date, recurrence: ExpenseRecurrence, count: number): Date {
  if (recurrence === 'WEEKLY') {
    return new Date(date.getTime() + count * 7 * 24 * 60 * 60 * 1000);
  }
  const months = recurrence === 'MONTHLY' ? count : recurrence === 'QUARTERLY' ? count * 3 : count * 12;
  const day = date.getUTCDate();
  const shifted = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDayOfMonth = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(day, lastDayOfMonth));
  return shifted;
}

/**
 * A stable, collision-free key per period — not a calendar-standard ISO week
 * number, which this doesn't need to be; it only has to never repeat and
 * never skip, since it exists purely to make the unique constraint work.
 */
function periodKey(date: Date, recurrence: ExpenseRecurrence): string {
  const year = date.getUTCFullYear();
  switch (recurrence) {
    case 'WEEKLY':
      return `${year}-W${Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000))}`;
    case 'MONTHLY':
      return `${year}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    case 'QUARTERLY':
      return `${year}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    case 'YEARLY':
      return `${year}`;
    default:
      throw new Error(`periodKey() called with recurrence "${recurrence}" — NONE is never a template.`);
  }
}

export interface ExpenseSummary {
  totals: {
    amount: number;
    count: number;
    directAmount: number;
    operatingAmount: number;
    unpaidAmount: number;
    unpaidCount: number;
  };
  byCategory: Array<{ categoryId: string; categoryName: string; isDirect: boolean; amount: number; count: number }>;
  /** One point per day with at least one expense — the comparative chart (WO-B.5) reads this directly. */
  series: Array<{ date: string; amount: number }>;
}

export interface ExpenseByCategoryRow {
  categoryId: string;
  key: string;
  name: string;
  isDirect: boolean;
  amount: number;
  /** This row's share of `total`, in basis points (Rule 5) — 0 when `total` is 0. */
  shareBps: number;
  count: number;
  /**
   * Change vs. the immediately preceding period of equal length, in basis
   * points. Null when the previous period had no spend in this category at
   * all — "infinite growth" is not a number, and reporting 0 would say
   * "unchanged" when the truth is "new."
   */
  changeBps: number | null;
}

export interface ExpenseByCategoryResult {
  total: number;
  /**
   * total ÷ sales revenue for the same window, in basis points — WO-B.4's
   * acceptance criterion that this figure and `sales.revenue` never disagree
   * is why the revenue definition lives in one shared place
   * (core/common/sales-revenue.ts) rather than a second copy here.
   */
  vsRevenueBps: number;
  rows: ExpenseByCategoryRow[];
}

export interface ExpenseTrendPoint {
  /** Bucket start — an ISO date ("2026-08-14") or an ISO month ("2026-08"), matching `bucket`. */
  t: string;
  total: number;
  direct: number;
  operating: number;
  byCategory: Record<string, number>;
}

export interface ExpenseTrendResult {
  series: ExpenseTrendPoint[];
  bucket: 'day' | 'month';
}

/**
 * Finance: operational expenses (RETAIL-ERP.md Tranche 6, WO-23.1 — building
 * `10-admin-dashboard.md` WO-B.1 as written). OrderEconomics (WO-B.3) is a
 * later work order in the same tranche; this file is expenses only.
 *
 * Deliberately not double-entry (see finance.prisma's own header). The GL
 * posting this tranche adds is a side effect published as a domain event —
 * `posting-rules.subscriber.ts`'s `onExpenseRecorded` — so this service
 * never imports AccountingService and works identically whether or not
 * `accounting` is in MODULES (R15: "accounting couples to nothing").
 */
@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly storage: StorageService,
    private readonly config: AppConfigService,
  ) {}

  async listCategories(): Promise<Array<ExpenseCategory & { expenseCount: number }>> {
    const categories = await this.prisma.expenseCategory.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { expenses: true } } },
    });
    return categories.map(({ _count, ...category }) => ({ ...category, expenseCount: _count.expenses }));
  }

  async createCategory(dto: CreateExpenseCategoryDto): Promise<ExpenseCategory> {
    const existing = await this.prisma.expenseCategory.findUnique({ where: { key: dto.key } });
    if (existing) throw new ConflictException('An expense category with that key already exists.');

    return this.prisma.expenseCategory.create({
      data: {
        key: dto.key,
        name: dto.name,
        isDirect: dto.isDirect ?? false,
        isActive: dto.isActive ?? true,
        order: dto.order ?? 0,
      },
    });
  }

  async updateCategory(id: string, dto: UpdateExpenseCategoryDto): Promise<ExpenseCategory> {
    await this.getCategory(id);
    return this.prisma.expenseCategory.update({
      where: { id },
      data: {
        name: dto.name,
        isDirect: dto.isDirect,
        isActive: dto.isActive,
        order: dto.order,
      },
    });
  }

  async deleteCategory(id: string): Promise<void> {
    await this.getCategory(id);
    const expenseCount = await this.prisma.expense.count({ where: { categoryId: id } });
    if (expenseCount > 0) {
      throw new ConflictException(
        `${expenseCount} expense(s) still use this category. Deactivate it instead of deleting it.`,
      );
    }
    await this.prisma.expenseCategory.delete({ where: { id } });
  }

  private async getCategory(id: string): Promise<ExpenseCategory> {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('That expense category no longer exists.');
    return category;
  }

  async listExpenses(query: ExpenseQueryDto): Promise<PaginatedResult<Expense>> {
    const where = this.expenseWhere(query);
    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: { category: true },
        orderBy: { incurredAt: query.order ?? 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  private expenseWhere(query: ExpenseQueryDto | ExpenseSummaryQueryDto): Prisma.ExpenseWhereInput {
    const where: Prisma.ExpenseWhereInput = {};
    if (query.from || query.to) {
      where.incurredAt = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }
    if ('categoryId' in query && query.categoryId) where.categoryId = query.categoryId;
    if ('supplierId' in query && query.supplierId) where.supplierId = query.supplierId;
    if ('paid' in query && query.paid !== undefined) {
      where.paidAt = query.paid ? { not: null } : null;
    }
    if ('q' in query && query.q) {
      where.OR = [
        { description: { contains: query.q, mode: 'insensitive' } },
        { payee: { contains: query.q, mode: 'insensitive' } },
        { reference: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  async createExpense(dto: CreateExpenseDto, actorId: string | null): Promise<Expense> {
    const category = await this.getCategory(dto.categoryId);

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          categoryId: dto.categoryId,
          amount: dto.amount,
          currency: dto.currency ?? 'PKR',
          description: dto.description,
          incurredAt: new Date(dto.incurredAt),
          paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
          payee: dto.payee,
          supplierId: dto.supplierId,
          reference: dto.reference,
          recurrence: dto.recurrence ?? 'NONE',
          createdById: actorId ?? undefined,
          scopeLevel: dto.scopeLevel ?? 'BRAND',
          originNodeId: this.config.nodeId,
        },
      });

      // Published inside the create transaction with `tx` — same idiom
      // `PurchasingService`'s SupplierBillRaised uses — so the event never
      // fires for a row that then rolls back.
      await this.events.publish(
        DomainEvent.ExpenseRecorded,
        {
          expenseId: expense.id,
          categoryKey: category.key,
          isDirect: category.isDirect,
          amountMinor: expense.amount,
          incurredAt: expense.incurredAt.toISOString(),
          paidAtIso: expense.paidAt ? expense.paidAt.toISOString() : null,
          supplierId: expense.supplierId,
          scopeLevel: expense.scopeLevel,
          originNodeId: expense.originNodeId,
        },
        tx,
      );

      return expense;
    });
  }

  async updateExpense(id: string, dto: UpdateExpenseDto): Promise<Expense> {
    await this.getExpense(id);
    if (dto.categoryId) await this.getCategory(dto.categoryId);

    // Editing an already-posted expense never rewrites its journal entry —
    // the same "a posted fact is immutable" rule every other posting rule
    // in this codebase already follows. A correction is a new expense (a
    // credit-note-shaped follow-up is WO-B.2+'s, not this one's).
    return this.prisma.expense.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
        amount: dto.amount,
        currency: dto.currency,
        description: dto.description,
        incurredAt: dto.incurredAt ? new Date(dto.incurredAt) : undefined,
        paidAt: dto.paidAt === undefined ? undefined : dto.paidAt ? new Date(dto.paidAt) : null,
        payee: dto.payee,
        supplierId: dto.supplierId,
        reference: dto.reference,
        recurrence: dto.recurrence,
      },
    });
  }

  async deleteExpense(id: string): Promise<void> {
    await this.getExpense(id);
    await this.prisma.expense.delete({ where: { id } });
  }

  /** A photo of a receipt or a PDF a supplier emailed — WO-B.2. */
  async attachReceipt(
    id: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ): Promise<Expense> {
    await this.getExpense(id);
    const stored = await this.storage.putDocument({
      folder: 'receipts',
      filename: file.originalname,
      contentType: file.mimetype,
      body: file.buffer,
    });
    return this.prisma.expense.update({ where: { id }, data: { receiptUrl: stored.url } });
  }

  private async getExpense(id: string): Promise<Expense> {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('That expense no longer exists.');
    return expense;
  }

  async summary(query: ExpenseSummaryQueryDto): Promise<ExpenseSummary> {
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new BadRequestException('"from" must not be after "to".');
    }

    const where = this.expenseWhere(query);
    const expenses = await this.prisma.expense.findMany({
      where,
      include: { category: true },
    });

    const totals = { amount: 0, count: 0, directAmount: 0, operatingAmount: 0, unpaidAmount: 0, unpaidCount: 0 };
    const byCategory = new Map<string, { categoryId: string; categoryName: string; isDirect: boolean; amount: number; count: number }>();
    const byDay = new Map<string, number>();

    for (const expense of expenses) {
      totals.amount += expense.amount;
      totals.count += 1;
      if (expense.category.isDirect) totals.directAmount += expense.amount;
      else totals.operatingAmount += expense.amount;
      if (!expense.paidAt) {
        totals.unpaidAmount += expense.amount;
        totals.unpaidCount += 1;
      }

      const entry = byCategory.get(expense.categoryId) ?? {
        categoryId: expense.categoryId,
        categoryName: expense.category.name,
        isDirect: expense.category.isDirect,
        amount: 0,
        count: 0,
      };
      entry.amount += expense.amount;
      entry.count += 1;
      byCategory.set(expense.categoryId, entry);

      const day = expense.incurredAt.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + expense.amount);
    }

    return {
      totals,
      byCategory: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
      series: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount })),
    };
  }

  /** `from`/`to`, defaulted to a trailing window ending now when either is omitted — never an unbounded scan of the whole table. */
  private resolveWindow(query: ExpenseSummaryQueryDto, defaultDays: number): { from: Date; to: Date } {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - defaultDays * 24 * 60 * 60 * 1000);
    if (from > to) throw new BadRequestException('"from" must not be after "to".');
    return { from, to };
  }

  /**
   * WO-B.4: totals by category for the window, each with its share of the
   * total, its change vs. the immediately preceding window of equal length,
   * and the window's total expressed against sales revenue for the same
   * window — see ExpenseByCategoryResult's own note on why that revenue
   * figure can never quietly drift from `sales.revenue`.
   */
  async byCategory(query: ExpenseSummaryQueryDto): Promise<ExpenseByCategoryResult> {
    const { from, to } = this.resolveWindow(query, 30);
    const periodMs = to.getTime() - from.getTime();
    const previousTo = new Date(from.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - periodMs);

    const [expenses, previousExpenses, revenue] = await Promise.all([
      this.prisma.expense.findMany({
        where: { incurredAt: { gte: from, lte: to } },
        include: { category: true },
      }),
      this.prisma.expense.findMany({
        where: { incurredAt: { gte: previousFrom, lte: previousTo } },
        select: { categoryId: true, amount: true },
      }),
      this.prisma.order.aggregate({
        where: { status: { notIn: VOID_ORDER_STATUSES }, placedAt: { gte: from, lte: to } },
        _sum: { grandTotal: true },
      }),
    ]);

    const previousByCategory = new Map<string, number>();
    for (const expense of previousExpenses) {
      previousByCategory.set(expense.categoryId, (previousByCategory.get(expense.categoryId) ?? 0) + expense.amount);
    }

    const byCategory = new Map<string, Omit<ExpenseByCategoryRow, 'shareBps' | 'changeBps'>>();
    let total = 0;
    for (const expense of expenses) {
      total += expense.amount;
      const row = byCategory.get(expense.categoryId) ?? {
        categoryId: expense.categoryId,
        key: expense.category.key,
        name: expense.category.name,
        isDirect: expense.category.isDirect,
        amount: 0,
        count: 0,
      };
      row.amount += expense.amount;
      row.count += 1;
      byCategory.set(expense.categoryId, row);
    }

    const rows: ExpenseByCategoryRow[] = [...byCategory.values()]
      .map((row) => {
        const previousAmount = previousByCategory.get(row.categoryId) ?? 0;
        const changeBps =
          previousAmount > 0
            ? Math.round(((row.amount - previousAmount) * 10_000) / previousAmount)
            : row.amount > 0
              ? null
              : 0;
        return {
          ...row,
          shareBps: total > 0 ? Math.round((row.amount * 10_000) / total) : 0,
          changeBps,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    const revenueAmount = revenue._sum.grandTotal ?? 0;
    const vsRevenueBps = revenueAmount > 0 ? Math.round((total * 10_000) / revenueAmount) : 0;

    return { total, vsRevenueBps, rows };
  }

  /**
   * WO-B.4: expense totals over time, bucketed by day for a window of up to
   * 62 days and by month for anything wider — a year of daily points is a
   * chart nobody can read, and a week of monthly points is one bar.
   */
  async trend(query: ExpenseSummaryQueryDto): Promise<ExpenseTrendResult> {
    const { from, to } = this.resolveWindow(query, 365);
    const bucket: 'day' | 'month' = to.getTime() - from.getTime() <= 62 * 24 * 60 * 60 * 1000 ? 'day' : 'month';

    const expenses = await this.prisma.expense.findMany({
      where: { incurredAt: { gte: from, lte: to } },
      include: { category: true },
    });

    const points = new Map<string, ExpenseTrendPoint>();
    for (const expense of expenses) {
      const key =
        bucket === 'day' ? expense.incurredAt.toISOString().slice(0, 10) : expense.incurredAt.toISOString().slice(0, 7);
      const point = points.get(key) ?? { t: key, total: 0, direct: 0, operating: 0, byCategory: {} };
      point.total += expense.amount;
      if (expense.category.isDirect) point.direct += expense.amount;
      else point.operating += expense.amount;
      point.byCategory[expense.categoryId] = (point.byCategory[expense.categoryId] ?? 0) + expense.amount;
      points.set(key, point);
    }

    return {
      series: [...points.values()].sort((a, b) => a.t.localeCompare(b.t)),
      bucket,
    };
  }

  /**
   * WO-4.2/4.3's "the number the shop actually needs" (04-finance.md) —
   * margin by product, category or variant. Sourced from `OrderItem`'s own
   * snapshot fields (`lineTotal`, `unitCost`, `quantity`), scoped to orders
   * that have a non-zero-revenue `OrderEconomics` row — a returned order
   * zeroes `OrderEconomics.revenue`/`cogs` (WO-4.2's own "reverses both,
   * never revenue alone" rule), so excluding it here means a return's items
   * never contribute a phantom margin. Deliberately NOT sourced from the
   * general ledger (RETAIL-ERP.md R15) — the GL posts one aggregate line per
   * order, not a per-product/variant breakdown, which is exactly the
   * granularity `OrderEconomics` and `OrderItem` exist to keep.
   */
  async marginBy(groupBy: 'product' | 'category' | 'variant', query: ExpenseSummaryQueryDto) {
    const { from, to } = this.resolveWindow(query, 365);

    const economics = await this.prisma.orderEconomics.findMany({
      where: { computedAt: { gte: from, lte: to }, revenue: { gt: 0 } },
      select: { orderId: true },
    });
    const orderIds = economics.map((e) => e.orderId);
    if (orderIds.length === 0) return { groupBy, rows: [] };

    const items = await this.prisma.orderItem.findMany({
      where: { orderId: { in: orderIds } },
      select: {
        productId: true,
        variantId: true,
        nameEn: true,
        variantLabel: true,
        lineTotal: true,
        unitCost: true,
        quantity: true,
        product: { select: { categoryId: true, category: { select: { translations: { where: { locale: 'en' }, take: 1 } } } } },
      },
    });

    const rows = new Map<string, { key: string; label: string; revenue: number; cogs: number; quantity: number }>();
    for (const item of items) {
      const key =
        groupBy === 'variant' ? (item.variantId ?? `product:${item.productId}`)
        : groupBy === 'product' ? (item.productId ?? 'unknown')
        : (item.product?.categoryId ?? 'uncategorised');
      const label =
        groupBy === 'variant' ? `${item.nameEn}${item.variantLabel ? ` / ${item.variantLabel}` : ''}`
        : groupBy === 'product' ? item.nameEn
        : item.product?.category?.translations[0]?.name ?? 'Uncategorised';

      const entry = rows.get(key) ?? { key, label, revenue: 0, cogs: 0, quantity: 0 };
      entry.revenue += item.lineTotal;
      entry.cogs += item.unitCost * item.quantity;
      entry.quantity += item.quantity;
      rows.set(key, entry);
    }

    return {
      groupBy,
      rows: [...rows.values()]
        .map((row) => ({
          ...row,
          marginAmount: row.revenue - row.cogs,
          marginPercent: row.revenue > 0 ? Math.round(((row.revenue - row.cogs) / row.revenue) * 1000) / 10 : 0,
        }))
        .sort((a, b) => a.marginAmount - b.marginAmount),
    };
  }

  /**
   * WO-4.2's own unit economics: contribution per order, paginated, plus the
   * average by product/category "on top of this table" the doc asks for.
   */
  async unitEconomics(query: ExpenseSummaryQueryDto & { page?: number; pageSize?: number }) {
    const { from, to } = this.resolveWindow(query, 90);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);

    const [rows, total, aggregate] = await Promise.all([
      this.prisma.orderEconomics.findMany({
        where: { computedAt: { gte: from, lte: to } },
        orderBy: { computedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { order: { select: { number: true, placedAt: true, status: true } } },
      }),
      this.prisma.orderEconomics.count({ where: { computedAt: { gte: from, lte: to } } }),
      this.prisma.orderEconomics.aggregate({
        where: { computedAt: { gte: from, lte: to } },
        _avg: { contribution: true, revenue: true },
        _count: true,
      }),
    ]);

    return {
      ...paginated(
        rows.map((row) => ({
          orderId: row.orderId,
          orderNumber: row.order.number,
          placedAt: row.order.placedAt,
          status: row.order.status,
          revenue: row.revenue,
          cogs: row.cogs,
          contribution: row.contribution,
        })),
        total,
        { page, pageSize },
      ),
      averages: {
        contribution: Math.round(aggregate._avg.contribution ?? 0),
        revenue: Math.round(aggregate._avg.revenue ?? 0),
        orderCount: aggregate._count,
      },
    };
  }

  /**
   * WO-B.2's daily job: for every recurring TEMPLATE (recurrence != NONE,
   * recurringFromId null — a generated instance is created with recurrence
   * forced to NONE below precisely so it never becomes a template itself),
   * create one instance per period due since its incurredAt that doesn't
   * already exist. `@@unique([recurringFromId, recurringPeriod])` is the
   * real guarantee: a re-run, a retry, or a race between two ticks all land
   * on the same P2002 for a period already generated, caught here and
   * counted as skipped rather than crashing the job — a missing catch would
   * turn "this ran twice" into "this shop's rent is now double-booked."
   * Each instance is unpaid (paidAt null — cash flow is the only consumer)
   * and posts to the GL exactly like a hand-entered expense, via the same
   * ExpenseRecorded event `createExpense` publishes.
   */
  async generateRecurringInstances(now: Date = new Date()): Promise<{ created: number; skipped: number }> {
    const templates = await this.prisma.expense.findMany({
      where: { recurrence: { not: 'NONE' }, recurringFromId: null },
      include: { category: true },
    });

    let created = 0;
    let skipped = 0;

    for (const template of templates) {
      for (let i = 1; ; i += 1) {
        const periodStart = addPeriod(template.incurredAt, template.recurrence, i);
        if (periodStart > now) break;
        const period = periodKey(periodStart, template.recurrence);

        try {
          await this.prisma.$transaction(async (tx) => {
            const instance = await tx.expense.create({
              data: {
                categoryId: template.categoryId,
                amount: template.amount,
                currency: template.currency,
                description: template.description,
                incurredAt: periodStart,
                payee: template.payee,
                supplierId: template.supplierId,
                reference: template.reference,
                recurrence: 'NONE',
                recurringFromId: template.id,
                recurringPeriod: period,
                scopeLevel: template.scopeLevel,
                originNodeId: template.originNodeId,
              },
            });

            await this.events.publish(
              DomainEvent.ExpenseRecorded,
              {
                expenseId: instance.id,
                categoryKey: template.category.key,
                isDirect: template.category.isDirect,
                amountMinor: instance.amount,
                incurredAt: instance.incurredAt.toISOString(),
                paidAtIso: null,
                supplierId: instance.supplierId,
                scopeLevel: instance.scopeLevel,
                originNodeId: instance.originNodeId,
              },
              tx,
            );
          });
          created += 1;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            skipped += 1;
            this.logger.warn(`Recurring expense ${template.id} period ${period} was already generated — skipped.`);
          } else {
            throw error;
          }
        }
      }
    }

    return { created, skipped };
  }
}
