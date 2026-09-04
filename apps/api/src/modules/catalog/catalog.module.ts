import { Module } from '@nestjs/common';
import { CatalogAdminController } from './catalog-admin.controller';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CategoryAdminService } from './category-admin.service';
import { ProductAdminService } from './product-admin.service';
import { ProductImportService } from './product-import.service';
import { InventoryModule } from '../inventory/inventory.module';

// InventoryModule stays imported for ProductAdminService, which writes stock
// inside the SAME Prisma transaction as creating/updating a product's
// variants (product-admin.service.ts's create() and syncVariants()) — that
// correctness guarantee is the same reason orders and purchasing keep a
// direct import too (see catalog -> inventory in KNOWN_MODULE_COUPLINGS,
// scripts/check-module-boundaries.mjs). ProductImportService's CSV-driven
// stock writes are NOT transactional, so it goes through StockIntakeRegistry
// instead (core/extension-points/stock-intake.registry.ts).
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
