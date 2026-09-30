import { Injectable, type OnModuleInit } from '@nestjs/common';
import { OnDomainEvent } from '../../../core/events/on-domain-event.decorator';
import {
  DomainEvent,
  type ProductPriceChangedPayload,
  type ProductPublishedPayload,
} from '../../../core/events/domain-events';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ReplicationRegistry } from '../../../core/replication/replication.registry';
import { ReplicationLogService } from '../../../core/replication/replication-log.service';
import type { ReplicationApplyInput } from '../../../core/replication/replication.types';

const SCHEMA_VERSION = 1;

/**
 * WO-20.3's first real POLICY entity — "product" and "price" are both
 * named in R2's own examples. Registers 'Product' with `ReplicationRegistry`
 * from its own `onModuleInit()`, the same pattern `InventoryService`
 * already uses for `StockIntakeRegistry`, and logs a change by subscribing
 * to the domain events `ProductAdminService` already publishes — no change
 * to that service at all, and a second, independent subscriber
 * (`ProductAlertsListener`, tradingpartners) already proves one event
 * safely fans out to more than one listener.
 *
 * The write side of this is deliberately narrow: a lower tier's cache of a
 * product's price (R2 — "the owning tier always wins... lower tiers hold a
 * read-only cache"), never a full catalog replica. `applyIncoming()` only
 * ever updates `basePrice` on a product that already exists locally;
 * creating one from a policy record would need slug/category/variant setup
 * this deployment's own catalog does not do here, and pretending to
 * replicate a whole product from one price event would be worse than not
 * applying it — it quarantines instead, honestly, for a later work order.
 */
@Injectable()
export class ProductReplicationListener implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ReplicationRegistry,
    private readonly log: ReplicationLogService,
  ) {}

  onModuleInit(): void {
    this.registry.register('Product', {
      dataClass: 'POLICY',
      direction: 'DOWN',
      apply: (input) => this.applyIncoming(input),
    });
  }

  @OnDomainEvent(DomainEvent.ProductPublished)
  async onProductPublished(payload: ProductPublishedPayload): Promise<void> {
    await this.log.append('Product', payload.productId, 'UPSERT', payload, SCHEMA_VERSION, new Date());
  }

  @OnDomainEvent(DomainEvent.ProductPriceChanged)
  async onProductPriceChanged(payload: ProductPriceChangedPayload): Promise<void> {
    await this.log.append('Product', payload.productId, 'UPSERT', payload, SCHEMA_VERSION, new Date());
  }

  private async applyIncoming(input: ReplicationApplyInput): Promise<void> {
    const payload = input.payload as Partial<ProductPublishedPayload & ProductPriceChangedPayload>;
    const basePrice = payload.newPriceMinor ?? payload.basePriceMinor;
    if (basePrice === undefined) {
      throw new Error('Product policy record carries no price to apply.');
    }

    const existing = await this.prisma.product.findUnique({ where: { id: input.entityId }, select: { id: true } });
    if (!existing) {
      throw new Error(
        'Product not yet known locally — replicating a new product is not built yet, only a price update on an existing one.',
      );
    }

    await this.prisma.product.update({ where: { id: input.entityId }, data: { basePrice } });
  }
}
