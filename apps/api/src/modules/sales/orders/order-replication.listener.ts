import { Injectable, type OnModuleInit } from '@nestjs/common';
import { OnDomainEvent } from '../../../core/events/on-domain-event.decorator';
import { DomainEvent, type OrderPlacedPayload } from '../../../core/events/domain-events';
import { ReplicationRegistry } from '../../../core/replication/replication.registry';
import { ReplicationLogService } from '../../../core/replication/replication-log.service';

const SCHEMA_VERSION = 1;

/**
 * WO-20.4's first real FACT entity — R2's own first example is "a sale".
 * Registers 'Order' with `ReplicationRegistry` from its own
 * `onModuleInit()` and logs a placed order by subscribing to the
 * `OrderPlaced` event `OrdersService` already publishes (consumed today by
 * `notification.subscriber.ts` and accounting's posting rules) — zero
 * changes to that service, the same "reuse an event nothing new had to be
 * added for" shape as `ProductReplicationListener` (WO-20.3).
 *
 * The receiving (parent) side is intentionally not built here.
 * `OrderPlacedPayload` is a summary — customer name/total, not the order's
 * items, addresses or tax lines — because that is all `notification
 * .subscriber.ts` and the GL posting rules have ever needed; it is not
 * enough to construct a compliant `Order` row at a parent tier, and a
 * chain-wide consolidated view of orders across branches (RETAIL-ERP.md
 * R17, WO-20.6) is a separate, later work order with its own schema, not
 * something to half-build here by inventing placeholder field values.
 * Every incoming 'Order' fact quarantines until then — held, not dropped,
 * exactly what quarantine (WO-20.1) exists for.
 */
@Injectable()
export class OrderReplicationListener implements OnModuleInit {
  constructor(
    private readonly registry: ReplicationRegistry,
    private readonly log: ReplicationLogService,
  ) {}

  onModuleInit(): void {
    this.registry.register('Order', {
      dataClass: 'FACT',
      direction: 'UP',
      apply: () => {
        throw new Error(
          'Chain-wide order consolidation is not built yet (RETAIL-ERP.md WO-20.6) — this fact is held, not lost.',
        );
      },
    });
  }

  @OnDomainEvent(DomainEvent.OrderPlaced)
  async onOrderPlaced(payload: OrderPlacedPayload): Promise<void> {
    await this.log.append('Order', payload.orderId, 'UPSERT', payload, SCHEMA_VERSION, new Date(payload.placedAt));
  }
}
