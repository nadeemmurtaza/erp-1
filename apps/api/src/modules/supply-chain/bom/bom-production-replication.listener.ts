import { Injectable, type OnModuleInit } from '@nestjs/common';
import { OnDomainEvent } from '../../../core/events/on-domain-event.decorator';
import { DomainEvent, type BomProductionCompletedPayload } from '../../../core/events/domain-events';
import { ReplicationRegistry } from '../../../core/replication/replication.registry';
import { ReplicationLogService } from '../../../core/replication/replication-log.service';

const SCHEMA_VERSION = 1;

/**
 * WO-23.3c/e (RETAIL-ERP.md R13, ADR-021) — `BomProductionRun` registers
 * FACT/UP, exactly like `OrderReplicationListener` registers `Order`: no
 * `BrandPolicy` switch governs branch-local manufacturing today (R9 names
 * four switches; none is "allow branch production"), so `apply()` draws no
 * policy distinction — it always quarantines via the existing apply-failure
 * path until chain-wide production consolidation is built (the same
 * unresolved `recipeId`/`variantId`-against-a-parent-database dependency
 * `GoodsReceiptReplicationListener`'s own comment explains for purchasing).
 */
@Injectable()
export class BomProductionReplicationListener implements OnModuleInit {
  constructor(
    private readonly registry: ReplicationRegistry,
    private readonly log: ReplicationLogService,
  ) {}

  onModuleInit(): void {
    this.registry.register('BomProductionRun', {
      dataClass: 'FACT',
      direction: 'UP',
      apply: () => {
        throw new Error(
          'Chain-wide production consolidation is not built yet (RETAIL-ERP.md WO-23.3, analogous to WO-20.6) — this fact is held, not lost.',
        );
      },
    });
  }

  @OnDomainEvent(DomainEvent.BomProductionCompleted)
  async onBomProductionCompleted(payload: BomProductionCompletedPayload): Promise<void> {
    await this.log.append(
      'BomProductionRun',
      payload.runId,
      'UPSERT',
      payload,
      SCHEMA_VERSION,
      new Date(payload.producedAtIso),
    );
  }
}
