import { ExpenseReplicationListener } from './expense-replication.listener';
import { ReplicationRegistry } from '../../core/replication/replication.registry';
import { ReplicationLogService } from '../../core/replication/replication-log.service';

describe('ExpenseReplicationListener — WO-23.3c/e, ADR-021', () => {
  let listener: ExpenseReplicationListener;
  let registry: any;
  let log: any;

  beforeEach(() => {
    registry = { register: jest.fn() };
    log = { append: jest.fn().mockResolvedValue(undefined) };
    listener = new ExpenseReplicationListener(registry as ReplicationRegistry, log as ReplicationLogService);
  });

  describe('onModuleInit', () => {
    it('registers Expense as a FACT entity flowing UP', () => {
      listener.onModuleInit();

      expect(registry.register).toHaveBeenCalledWith(
        'Expense',
        expect.objectContaining({ dataClass: 'FACT', direction: 'UP', apply: expect.any(Function) }),
      );
    });

    it('quarantines every incoming expense — no BrandPolicy switch governs branch-local expenses, and chain-wide consolidation is not built yet', () => {
      listener.onModuleInit();
      const descriptor = registry.register.mock.calls[0][1];

      expect(() => descriptor.apply()).toThrow(/not built yet/);
    });
  });

  describe('onExpenseRecorded', () => {
    it('logs the payload ExpenseRecorded already published, unchanged, dated at when the cost was incurred', async () => {
      const payload = {
        expenseId: 'e1',
        categoryKey: 'rent',
        isDirect: false,
        amountMinor: 5000,
        incurredAt: '2026-01-15T00:00:00.000Z',
        paidAtIso: null,
        supplierId: null,
        scopeLevel: 'BRAND' as const,
        originNodeId: null,
      };

      await listener.onExpenseRecorded(payload);

      expect(log.append).toHaveBeenCalledWith(
        'Expense',
        'e1',
        'UPSERT',
        payload,
        1,
        new Date('2026-01-15T00:00:00.000Z'),
      );
    });
  });
});
