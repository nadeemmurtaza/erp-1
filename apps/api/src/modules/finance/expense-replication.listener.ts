import { Injectable, type OnModuleInit } from '@nestjs/common';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { DomainEvent, type ExpenseRecordedPayload } from '../../core/events/domain-events';
import { ReplicationRegistry } from '../../core/replication/replication.registry';
import { ReplicationLogService } from '../../core/replication/replication-log.service';

const SCHEMA_VERSION = 1;

/**
 * WO-23.3c/e (RETAIL-ERP.md R2/R13, ADR-021) — `Expense` is R2's own other
 * named FACT example ("expense"), registered UP exactly like `Order` and
 * `GoodsReceipt`. No `BrandPolicy` switch governs branch-local expenses
 * today (R9 names four switches; none is "allow branch expenses"), so
 * `apply()` draws no policy distinction — it always quarantines via the
 * existing apply-failure path until chain-wide expense consolidation is
 * built (the same unresolved `categoryId`-against-a-parent-database
 * dependency `GoodsReceiptReplicationListener`'s own comment explains).
 */
@Injectable()
export class ExpenseReplicationListener implements OnModuleInit {
  constructor(
    private readonly registry: ReplicationRegistry,
    private readonly log: ReplicationLogService,
  ) {}

  onModuleInit(): void {
    this.registry.register('Expense', {
      dataClass: 'FACT',
      direction: 'UP',
      apply: () => {
        throw new Error(
          'Chain-wide expense consolidation is not built yet (RETAIL-ERP.md WO-23.3, analogous to WO-20.6) — this fact is held, not lost.',
        );
      },
    });
  }

  @OnDomainEvent(DomainEvent.ExpenseRecorded)
  async onExpenseRecorded(payload: ExpenseRecordedPayload): Promise<void> {
    await this.log.append(
      'Expense',
      payload.expenseId,
      'UPSERT',
      payload,
      SCHEMA_VERSION,
      new Date(payload.incurredAt),
    );
  }
}
