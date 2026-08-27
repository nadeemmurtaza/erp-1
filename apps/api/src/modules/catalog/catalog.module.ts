import { Module } from '@nestjs/common';
import { CatalogAdminController } from './catalog-admin.controller';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CategoryAdminService } from './category-admin.service';
import { ProductAdminService } from './product-admin.service';
import { ProductImportService } from './product-import.service';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [CatalogController, CatalogAdminController],
  providers: [
    CatalogService,
    ProductAdminService,
    CategoryAdminService,
    ProductImportService,
  ],
  // Exported for cart/orders, which need to price a variant and check stock.
  exports: [CatalogService],
})
export class CatalogModule {}
