import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { BomController } from './bom.controller';
import { BomListener } from './bom.listener';
import { BomMetricsService } from './bom.metrics';
import { BomService } from './bom.service';
import { ProductionService } from './production.service';
import { RawMaterialService } from './raw-material.service';
import { RecipeService } from './recipe.service';

@Module({
  imports: [InventoryModule],
  controllers: [BomController],
  providers: [BomService, RawMaterialService, RecipeService, BomListener, ProductionService, BomMetricsService],
})
export class BomModule {}
