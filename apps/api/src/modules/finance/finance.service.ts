import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { paginated, type PaginatedResult } from '../../core/common/dto/pagination.dto';
import { DomainEvent } from '../../core/events/domain-events';
import { EventBusService } from '../../core/events/event-bus.service';
import { Prisma, type Expense, type ExpenseCategory } from '../../core/prisma/client';
import type {
  CreateExpenseCategoryDto,
  UpdateExpenseCategoryDto,
} from './dto/expense-category.dto';
import type { CreateExpenseDto, ExpenseQueryDto, ExpenseSummaryQueryDto, UpdateExpenseDto } from './dto/expense.dto';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
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
}
