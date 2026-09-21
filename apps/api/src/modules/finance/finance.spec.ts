import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { StorageService } from '../../core/storage/storage.service';
import { DomainEvent } from '../../core/events/domain-events';
import { FinanceService } from './finance.service';

/**
 * WO-23.1 (10-admin-dashboard.md WO-B.1) and WO-23.1's WO-B.2 follow-up
 * (recurring expenses, receipt upload). Real PrismaService against the
 * seeded test database — same idiom as stock-count.service.spec.ts — with
 * EventBusService and StorageService mocked: GL posting is
 * posting-rules.subscriber.spec.ts's own concern, and file storage is
 * storage.service.spec.ts's own concern, not this service's.
 */
describe('FinanceService', () => {
  let service: FinanceService;
  let prisma: PrismaService;
  let events: { publish: jest.Mock };
  let storage: { putDocument: jest.Mock };

  beforeAll(async () => {
    events = { publish: jest.fn() };
    storage = {
      putDocument: jest.fn().mockResolvedValue({
        key: 'receipts/receipt.pdf',
        url: 'http://stored/receipt.pdf',
        size: 10,
        contentType: 'application/pdf',
      }),
    };
    const module = await Test.createTestingModule({
      providers: [
        FinanceService,
        PrismaService,
        { provide: EventBusService, useValue: events },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    service = module.get(FinanceService);
    prisma = module.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.expense.deleteMany({ where: { description: { startsWith: 'finance.spec ' } } });
  });

  async function seededCategory(key: string) {
    const category = await prisma.expenseCategory.findUnique({ where: { key } });
    if (!category) throw new Error(`Expected the seed to have created ExpenseCategory "${key}"`);
    return category;
  }

  it('stores amount as the exact integer paisa it was given, never a float', async () => {
    const rent = await seededCategory('rent');

    const expense = await service.createExpense(
      {
        categoryId: rent.id,
        amount: 1500,
        description: 'finance.spec integer amount',
        incurredAt: '2026-10-05T00:00:00.000Z',
      },
      null,
    );

    expect(expense.amount).toBe(1500);
    expect(Number.isInteger(expense.amount)).toBe(true);
  });

  it('publishes ExpenseRecorded with the category’s isDirect flag and paidAtIso null when unpaid', async () => {
    const rent = await seededCategory('rent');

    const expense = await service.createExpense(
      {
        categoryId: rent.id,
        amount: 5000,
        description: 'finance.spec unpaid publish',
        incurredAt: '2026-10-05T00:00:00.000Z',
      },
      null,
    );

    expect(events.publish).toHaveBeenCalledWith(
      DomainEvent.ExpenseRecorded,
      expect.objectContaining({
        expenseId: expense.id,
        categoryKey: 'rent',
        isDirect: false,
        amountMinor: 5000,
        paidAtIso: null,
      }),
      expect.anything(),
    );
  });

  it('publishes a non-null paidAtIso when paidAt is set at creation', async () => {
    const packaging = await seededCategory('packaging');

    await service.createExpense(
      {
        categoryId: packaging.id,
        amount: 2000,
        description: 'finance.spec paid publish',
        incurredAt: '2026-10-05T00:00:00.000Z',
        paidAt: '2026-10-06T00:00:00.000Z',
      },
      null,
    );

    expect(events.publish).toHaveBeenCalledWith(
      DomainEvent.ExpenseRecorded,
      expect.objectContaining({ isDirect: true, paidAtIso: '2026-10-06T00:00:00.000Z' }),
      expect.anything(),
    );
  });

  it('groups an expense into the month it was INCURRED, not the month it was PAID', async () => {
    const rent = await seededCategory('rent');

    await service.createExpense(
      {
        categoryId: rent.id,
        amount: 10_000,
        description: 'finance.spec october incurred november paid',
        incurredAt: '2026-10-05T00:00:00.000Z',
        paidAt: '2026-11-20T00:00:00.000Z',
      },
      null,
    );

    const october = await service.summary({ from: '2026-10-01', to: '2026-10-31' });
    const november = await service.summary({ from: '2026-11-01', to: '2026-11-30' });

    expect(october.totals.amount).toBeGreaterThanOrEqual(10_000);
    const octoberHasIt = october.byCategory.some((c) => c.categoryId === rent.id);
    const novemberHasIt = november.byCategory.some((c) => c.categoryId === rent.id && c.amount >= 10_000);
    expect(octoberHasIt).toBe(true);
    expect(novemberHasIt).toBe(false);
  });

  it('splits totals into direct vs operating by the category’s own isDirect flag', async () => {
    const rent = await seededCategory('rent'); // isDirect: false
    const packaging = await seededCategory('packaging'); // isDirect: true

    await service.createExpense(
      { categoryId: rent.id, amount: 3000, description: 'finance.spec split operating', incurredAt: '2026-08-01T00:00:00.000Z' },
      null,
    );
    await service.createExpense(
      { categoryId: packaging.id, amount: 7000, description: 'finance.spec split direct', incurredAt: '2026-08-01T00:00:00.000Z' },
      null,
    );

    const summary = await service.summary({ from: '2026-08-01', to: '2026-08-31' });
    expect(summary.totals.directAmount).toBeGreaterThanOrEqual(7000);
    expect(summary.totals.operatingAmount).toBeGreaterThanOrEqual(3000);
  });

  it('refuses to delete a category that still has expenses against it', async () => {
    const rent = await seededCategory('rent');
    await service.createExpense(
      { categoryId: rent.id, amount: 100, description: 'finance.spec category in use', incurredAt: '2026-08-01T00:00:00.000Z' },
      null,
    );

    await expect(service.deleteCategory(rent.id)).rejects.toThrow(ConflictException);
  });

  it('refuses a duplicate category key', async () => {
    await expect(service.createCategory({ key: 'rent', name: 'Rent again' })).rejects.toThrow(ConflictException);
  });

  it('filters the expense list by paid status', async () => {
    const rent = await seededCategory('rent');
    await service.createExpense(
      { categoryId: rent.id, amount: 100, description: 'finance.spec unpaid filter', incurredAt: '2026-08-15T00:00:00.000Z' },
      null,
    );

    const unpaid = await service.listExpenses({
      page: 1,
      pageSize: 50,
      order: 'desc',
      paid: false,
      q: 'finance.spec unpaid filter',
      get skip() {
        return 0;
      },
      get take() {
        return 50;
      },
    });

    expect(unpaid.data.every((expense) => expense.paidAt === null)).toBe(true);
    expect(unpaid.data.some((expense) => expense.description === 'finance.spec unpaid filter')).toBe(true);
  });

  describe('generateRecurringInstances — WO-B.2', () => {
    it('creates exactly one instance per elapsed period since incurredAt, unpaid and non-recurring', async () => {
      const rent = await seededCategory('rent');
      const template = await prisma.expense.create({
        data: {
          categoryId: rent.id,
          amount: 5000,
          description: 'finance.spec recurring monthly template',
          incurredAt: new Date('2026-06-15T00:00:00.000Z'),
          recurrence: 'MONTHLY',
        },
      });

      const result = await service.generateRecurringInstances(new Date('2026-09-21T00:00:00.000Z'));
      expect(result.created).toBe(3);

      const generated = await prisma.expense.findMany({ where: { recurringFromId: template.id } });
      expect(generated.length).toBe(3);
      expect(generated.every((e) => e.recurrence === 'NONE')).toBe(true);
      expect(generated.every((e) => e.paidAt === null)).toBe(true);
      expect(generated.every((e) => e.amount === 5000)).toBe(true);
    });

    it('running twice creates the instances once — the second run only skips', async () => {
      const rent = await seededCategory('rent');
      await prisma.expense.create({
        data: {
          categoryId: rent.id,
          amount: 1500,
          description: 'finance.spec recurring idempotent template',
          incurredAt: new Date('2026-07-01T00:00:00.000Z'),
          recurrence: 'MONTHLY',
        },
      });
      const now = new Date('2026-09-21T00:00:00.000Z');

      const first = await service.generateRecurringInstances(now);
      expect(first.created).toBe(2);

      const second = await service.generateRecurringInstances(now);
      expect(second.created).toBe(0);
      expect(second.skipped).toBe(2);
    });

    it('deleting a template leaves its generated instances (recurringFromId set null, history not rewritten)', async () => {
      const rent = await seededCategory('rent');
      const template = await prisma.expense.create({
        data: {
          categoryId: rent.id,
          amount: 1000,
          description: 'finance.spec recurring delete template',
          incurredAt: new Date('2026-07-01T00:00:00.000Z'),
          recurrence: 'MONTHLY',
        },
      });
      await service.generateRecurringInstances(new Date('2026-09-21T00:00:00.000Z'));
      const before = await prisma.expense.findMany({ where: { recurringFromId: template.id } });
      expect(before.length).toBeGreaterThan(0);

      await prisma.expense.delete({ where: { id: template.id } });

      const after = await prisma.expense.findMany({ where: { id: { in: before.map((e) => e.id) } } });
      expect(after).toHaveLength(before.length);
      expect(after.every((e) => e.recurringFromId === null)).toBe(true);
    });
  });

  describe('attachReceipt — WO-B.2', () => {
    it('stores the file via StorageService.putDocument and sets receiptUrl', async () => {
      const rent = await seededCategory('rent');
      const expense = await service.createExpense(
        { categoryId: rent.id, amount: 100, description: 'finance.spec receipt attach', incurredAt: '2026-08-01T00:00:00.000Z' },
        null,
      );

      const updated = await service.attachReceipt(expense.id, {
        buffer: Buffer.from('fake pdf bytes'),
        originalname: 'receipt.pdf',
        mimetype: 'application/pdf',
      });

      expect(storage.putDocument).toHaveBeenCalledWith(
        expect.objectContaining({ folder: 'receipts', filename: 'receipt.pdf', contentType: 'application/pdf' }),
      );
      expect(updated.receiptUrl).toBe('http://stored/receipt.pdf');
    });

    it('refuses to attach a receipt to an expense that no longer exists', async () => {
      await expect(
        service.attachReceipt('does-not-exist', {
          buffer: Buffer.from('x'),
          originalname: 'r.pdf',
          mimetype: 'application/pdf',
        }),
      ).rejects.toThrow();
    });
  });
});
