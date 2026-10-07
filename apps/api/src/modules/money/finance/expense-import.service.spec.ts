import { ExpenseImportService } from './expense-import.service';

/**
 * admin-platform/72-fragmented-tool-consolidation-import.md WO-72.2/72.3 —
 * every imported row must resolve a real category and route through
 * `FinanceService.createExpense()` unchanged; dry-run must write nothing.
 */
describe('ExpenseImportService', () => {
  function makeService() {
    const prisma = {
      expenseCategory: {
        findMany: jest.fn().mockResolvedValue([{ id: 'cat1', key: 'rent' }]),
      },
    };
    const finance = { createExpense: jest.fn().mockResolvedValue({ id: 'e1' }) };
    const service = new ExpenseImportService(prisma as any, finance as any);
    return { service, prisma, finance };
  }

  const header = 'date,category,amount,description,vendor\n';

  it('creates an expense for a valid row, resolving the category by key', async () => {
    const { service, finance } = makeService();
    const csv = header + '2026-08-01,rent,50000,August rent,Landlord\n';

    const summary = await service.import('actor1', csv);

    expect(summary.created).toBe(1);
    expect(finance.createExpense).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 'cat1', description: 'August rent', payee: 'Landlord' }),
      'actor1',
    );
  });

  it('skips a row whose category does not match any known key', async () => {
    const { service, finance } = makeService();
    const csv = header + '2026-08-01,unknown-category,50000,August rent,Landlord\n';

    const summary = await service.import('actor1', csv);

    expect(summary.skipped).toBe(1);
    expect(summary.results[0]!.message).toMatch(/unknown category/);
    expect(finance.createExpense).not.toHaveBeenCalled();
  });

  it('skips a row with a non-positive amount', async () => {
    const { service, finance } = makeService();
    const csv = header + '2026-08-01,rent,0,August rent,Landlord\n';

    const summary = await service.import('actor1', csv);

    expect(summary.skipped).toBe(1);
    expect(finance.createExpense).not.toHaveBeenCalled();
  });

  it('writes nothing when dryRun is true', async () => {
    const { service, finance } = makeService();
    const csv = header + '2026-08-01,rent,50000,August rent,Landlord\n';

    const summary = await service.import('actor1', csv, { dryRun: true });

    expect(summary.created).toBe(1);
    expect(finance.createExpense).not.toHaveBeenCalled();
  });

  it('rejects a file over the shared row cap before processing any row', async () => {
    const { service, finance } = makeService();
    const rows = Array.from({ length: 5001 }, () => '2026-08-01,rent,100,Row,Vendor').join('\n');
    const csv = header + rows + '\n';

    await expect(service.import('actor1', csv)).rejects.toThrow(/at most 5000 rows/);
    expect(finance.createExpense).not.toHaveBeenCalled();
  });
});
