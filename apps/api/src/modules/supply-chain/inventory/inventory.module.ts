import { Module } from '@nestjs/common';
import { InventoryAdminController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryCron } from './inventory.cron';
import { InventoryListener } from './inventory.listener';
import { InventoryMetricsProvider, InventoryValuationMetricsProvider } from './inventory.metrics';
import { MarkdownSuggestionsController } from './markdown-suggestions.controller';
import { MarkdownSuggestionsService } from './markdown-suggestions.service';

import { StockCountController } from './stock-count.controller';
import { StockCountService } from './stock-count.service';
import { StockVarianceController } from './stock-variance.controller';
import { StockVarianceService } from './stock-variance.service';
import { SpotCheckController, SpotCheckPolicyController } from './spot-check.controller';
import { SpotCheckService } from './spot-check.service';
import { SuspiciousTrafficController } from './suspicious-traffic.controller';
import { SuspiciousTrafficService } from './suspicious-traffic.service';
import { LotsController } from './lots.controller';
import { LotsService } from './lots.service';
import { SerializedUnitsController, SerializedUnitsPublicController } from './serialized-units.controller';
import { SerializedUnitsService } from './serialized-units.service';

@Module({
  controllers: [
    InventoryAdminController,
    StockCountController,
    StockVarianceController,
    SpotCheckController,
    SpotCheckPolicyController,
    SuspiciousTrafficController,
    MarkdownSuggestionsController,
    LotsController,
    SerializedUnitsController,
    SerializedUnitsPublicController,
  ],
  providers: [
    InventoryService,
    InventoryCron,
    InventoryListener,
    StockCountService,
    StockVarianceService,
    InventoryMetricsProvider,
    InventoryValuationMetricsProvider,
    SpotCheckService,
    SuspiciousTrafficService,
    MarkdownSuggestionsService,
    LotsService,
    SerializedUnitsService,
  ],
  exports: [InventoryService, LotsService, SerializedUnitsService],
})
export class InventoryModule {}
