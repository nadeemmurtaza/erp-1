import { Module } from '@nestjs/common';
import { MetadataFormsController } from './metadata-forms.controller';
import { MetadataFormsService } from './metadata-forms.service';

/**
 * architecture-patterns/141-general-metadata-driven-ui-engine.md — a
 * general metadata-driven UI engine, built by explicit owner override
 * (ADR-026). Always on, like `custom-fields`/`entity-attributes`:
 * infrastructure, not a sector-specific pack.
 */
@Module({
  controllers: [MetadataFormsController],
  providers: [MetadataFormsService],
  exports: [MetadataFormsService],
})
export class MetadataFormsModule {}
