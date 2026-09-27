import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { PlanningController } from './planning.controller';
import { PlanningService } from './planning.service';
import { DependencyGraphService } from './dependency-graph';
import { NarrationService } from './narration.service';
import { LiquidityForecastService } from './liquidity-forecast.service';
import { SupplierResilienceService } from './supplier-resilience.service';
import { OnlineStockService } from './online-stock.service';
import { GoodsReceivedLeadTimeListener } from './goods-received-lead-time.listener';

/**
 * resilience-scalability/144-supply-chain-resilience-planning-engine.md —
 * R20-R26. Always on (modules.registry.ts): a pure read/recommendation
 * engine over rows every other module already writes, with no schema
 * toggle implications beyond the one additive
 * `SupplierLeadTimeObservation` table — there is no reason for a
 * deployment to run without it, the same posture `settings`/`users`
 * already take. Imports `InventoryModule` directly (the one write path,
 * `assignFulfillingBranch()`) — `planning -> inventory` in
 * `KNOWN_MODULE_COUPLINGS`, the same same-transaction-write exception
 * `orders -> inventory` already uses. Every other read reaches another
 * module's Prisma model by its bare scalar, never by importing that
 * module's own service — `DependencyGraphService`'s own header comment.
 */
@Module({
  imports: [InventoryModule],
  controllers: [PlanningController],
  providers: [
    PlanningService,
    DependencyGraphService,
    NarrationService,
    LiquidityForecastService,
    SupplierResilienceService,
    OnlineStockService,
    GoodsReceivedLeadTimeListener,
  ],
  exports: [PlanningService],
})
export class PlanningModule {}
