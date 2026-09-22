import { Module } from '@nestjs/common';
import { BomController } from './bom.controller';
import { BomService } from './bom.service';
import { RawMaterialService } from './raw-material.service';

@Module({
  controllers: [BomController],
  providers: [BomService, RawMaterialService],
})
export class BomModule {}
