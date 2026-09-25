import { Module } from '@nestjs/common';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';
import { SettlementsCron } from './settlements.cron';

/**
 * Financial institution settlement partnerships
 * (finance-accounting/49-financial-institution-settlement-partnerships.md).
 * Off by default (modules.registry.ts) — a Solo shop with no reconciled
 * settlement partner must not see this concept at all. Imports no other
 * module: `SettlementsService` reaches `Payment` by its bare Prisma model
 * (core, not a module import) and reaches `accounting`'s posting only by
 * publishing `SettlementShortfallWrittenOff`, which `posting-rules.
 * subscriber.ts` subscribes to — the identical decoupling every other
 * posting rule in this repository already uses.
 */
@Module({
  controllers: [SettlementsController],
  providers: [SettlementsService, SettlementsCron],
  exports: [SettlementsService],
})
export class SettlementsModule {}
