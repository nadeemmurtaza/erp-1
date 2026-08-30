import { Module } from '@nestjs/common';
import { PurchasingController } from './purchasing.controller';
import { PurchasingService } from './purchasing.service';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [CatalogModule],
  controllers: [PurchasingController],
  providers: [PurchasingService],
  exports: [PurchasingService],
})
export class PurchasingModule {}
