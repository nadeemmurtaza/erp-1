import { Module } from '@nestjs/common';
import { PosTerminalsService } from './pos-terminals.service';
import { PosTerminalsController } from './pos-terminals.controller';
import { PosShiftsService } from './pos-shifts.service';
import { PosShiftsController } from './pos-shifts.controller';

/**
 * The till (RETAIL-ERP.md R7/R11). Off by default — see
 * modules.registry.ts — and imports no other module: `locationId` is a bare
 * scalar (see pos.prisma), so registering a terminal never requires
 * `inventory` to be enabled, and `PosShift`/`CashMovement` (WO-21.2) never
 * leave this module's own schema file either. `PosReceipt` (WO-21.5) and
 * WO-21.3's `pos -> orders` sale hand-off (R11's own
 * `KNOWN_MODULE_COUPLINGS` addition) are later, separate work orders.
 */
@Module({
  controllers: [PosTerminalsController, PosShiftsController],
  providers: [PosTerminalsService, PosShiftsService],
  exports: [PosTerminalsService, PosShiftsService],
})
export class PosModule {}
