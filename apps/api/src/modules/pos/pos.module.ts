import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PosTerminalsService } from './pos-terminals.service';
import { PosTerminalsController } from './pos-terminals.controller';
import { PosShiftsService } from './pos-shifts.service';
import { PosShiftsController } from './pos-shifts.controller';
import { PosSalesService } from './pos-sales.service';
import { PosSalesController } from './pos-sales.controller';
import { PosCatalogService } from './pos-catalog.service';
import { PosCatalogController } from './pos-catalog.controller';
import { PosReceiptsService } from './pos-receipts.service';
import { PosReceiptsController } from './pos-receipts.controller';
import { PosParkedSalesService } from './pos-parked-sales.service';
import { PosParkedSalesController } from './pos-parked-sales.controller';

/**
 * The till (RETAIL-ERP.md R7/R11). Off by default — see modules.registry.ts.
 * `locationId` on PosTerminal is still a bare scalar (no coupling to
 * `organization`), so registering a terminal never requires anything else to
 * be enabled. OrdersModule is the one hard import, for the same reason
 * orders.module.ts imports InventoryModule directly rather than through an
 * event: PosSalesService -> OrdersService.placeFromPos() has to commit the
 * Order, the stock deduction and the cash Payment in one transaction
 * (WO-21.3, `pos -> orders` in KNOWN_MODULE_COUPLINGS). PosCatalogService
 * (WO-21.4) and PosReceiptsService (WO-21.5) both query Prisma directly
 * rather than importing CatalogModule/InventoryModule/OrdersModule for a
 * read — the same precedent `OrdersService.placeFromPos()` itself set, no
 * KNOWN_MODULE_COUPLINGS entry needed. Returns (WO-21.5) reuse
 * OrdersService.changeStatus() and PaymentsService.refund() through their
 * EXISTING admin endpoints from apps/pos directly — no new backend coupling
 * either. pos-hardware/31 (WO-31.3) adds park/retrieve (PosParkedSalesService,
 * a direct Prisma read/write, same self-contained precedent) — a till-side
 * price override remains unbuilt.
 */
@Module({
  imports: [OrdersModule],
  controllers: [
    PosTerminalsController,
    PosShiftsController,
    PosSalesController,
    PosCatalogController,
    PosReceiptsController,
    PosParkedSalesController,
  ],
  providers: [
    PosTerminalsService,
    PosShiftsService,
    PosSalesService,
    PosCatalogService,
    PosReceiptsService,
    PosParkedSalesService,
  ],
  exports: [
    PosTerminalsService,
    PosShiftsService,
    PosSalesService,
    PosCatalogService,
    PosReceiptsService,
    PosParkedSalesService,
  ],
})
export class PosModule {}
