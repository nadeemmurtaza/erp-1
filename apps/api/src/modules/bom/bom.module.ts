import { Module } from '@nestjs/common';
import { BomController } from './bom.controller';
import { BomListener } from './bom.listener';
import { BomService } from './bom.service';
import { RawMaterialService } from './raw-material.service';
import { RecipeService } from './recipe.service';

@Module({
  controllers: [BomController],
  providers: [BomService, RawMaterialService, RecipeService, BomListener],
})
export class BomModule {}
