import { Module } from '@nestjs/common';
import { EntityAttributesController } from './entity-attributes.controller';
import { EntityAttributeService } from './entity-attributes.service';
import { EntityAttributeSupplierDeletedListener } from './supplier-deleted.listener';

/**
 * architecture-patterns/140-general-eav-extensibility-model.md — a general
 * EAV model, built by explicit owner override (ADR-026). Always on, like
 * `custom-fields`/`embeds`: infrastructure, not a sector-specific pack.
 * `EntityAttributeSupplierDeletedListener` subscribes to purchasing's own
 * `SupplierDeleted` event rather than this module being imported by
 * purchasing directly — the module-boundary rule reaches the other way.
 */
@Module({
  controllers: [EntityAttributesController],
  providers: [EntityAttributeService, EntityAttributeSupplierDeletedListener],
  exports: [EntityAttributeService],
})
export class EntityAttributesModule {}
