import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { FragmentsController } from './fragments.controller';
import { FragmentsService } from './fragments.service';

/**
 * architecture-patterns/143-micro-frontend-architecture.md — micro-frontend
 * fragments, built by explicit owner override (ADR-026). Always on, like
 * `custom-fields`/`embeds`/`entity-attributes`: infrastructure, not a
 * sector-specific pack.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [FragmentsController],
  providers: [FragmentsService],
  exports: [FragmentsService],
})
export class FragmentsModule {}
