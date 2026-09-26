import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { DomainEvent, type SupplierDeletedPayload } from '../../core/events/domain-events';
import { EntityAttributeService } from './entity-attributes.service';

/**
 * architecture-patterns/140-general-eav-extensibility-model.md (WO-140.3).
 * `EntityAttribute` rows carry no real foreign key to `Supplier` (`entityId`
 * varies by `entityType`), so nothing cascades them when a supplier is
 * deleted. Purchasing publishes `SupplierDeleted` rather than this module
 * being imported directly by `purchasing` — `entity-attributes` reaches
 * across the module boundary through a domain event, never the reverse
 * (`check-module-boundaries.mjs`). At-least-once delivery makes this safe
 * to run twice: `deleteAll()` is a plain `deleteMany`, a no-op the second
 * time.
 */
@Injectable()
export class EntityAttributeSupplierDeletedListener {
  private readonly logger = new Logger(EntityAttributeSupplierDeletedListener.name);

  constructor(private readonly entityAttributes: EntityAttributeService) {}

  @OnDomainEvent(DomainEvent.SupplierDeleted)
  async onSupplierDeleted(payload: SupplierDeletedPayload): Promise<void> {
    await this.entityAttributes.deleteAll('Supplier', payload.supplierId);
    this.logger.debug(`cleared entity attributes for deleted Supplier ${payload.supplierId}`);
  }
}
