import { Module } from '@nestjs/common';
import { CustomFieldsController } from './custom-fields.controller';
import { CustomFieldsService } from './custom-fields.service';

/**
 * architecture-patterns/104-jsonb-eav-extensibility.md — a narrow, bounded
 * JSONB overlay per entity type. Always on (like `settings`/`users`): this
 * is infrastructure, not a sector-specific pack, and `Supplier` (its own
 * `purchasing.manage`) is read/written directly through Prisma here, never
 * through a cross-module import of `PurchasingModule`.
 */
@Module({
  controllers: [CustomFieldsController],
  providers: [CustomFieldsService],
  exports: [CustomFieldsService],
})
export class CustomFieldsModule {}
