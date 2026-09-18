import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PosTerminalsService } from './pos-terminals.service';
import { PosTerminalsController } from './pos-terminals.controller';
import { PosShiftsService } from './pos-shifts.service';
import { PosShiftsController } from './pos-shifts.controller';
import { PosSalesService } from './pos-sales.service';
import { PosSalesController } from './pos-sales.controller';

/**
 * The till (RETAIL-ERP.md R7/R11). Off by default — see modules.registry.ts.
 * `locationId` on PosTerminal is still a bare scalar (no coupling to
 * `organization`), so registering a terminal never requires anything else to
 * be enabled. OrdersModule is the one hard import, for the same reason
 * orders.module.ts imports InventoryModule directly rather than through an
 * event: PosSalesService -> OrdersService.placeFromPos() has to commit the
 * Order, the stock deduction and the cash Payment in one transaction
 * (WO-21.3, `pos -> orders` in KNOWN_MODULE_COUPLINGS). `PosReceipt`, park/
 * retrieve, price override and returns are WO-21.5's.
 */
@Module({
  imports: [OrdersModule],
  controllers: [PosTerminalsController, PosShiftsController, PosSalesController],
  providers: [PosTerminalsService, PosShiftsService, PosSalesService],
  exports: [PosTerminalsService, PosShiftsService, PosSalesService],
})
export class PosModule {}
