import { Module } from '@nestjs/common';
import { PosTerminalsService } from './pos-terminals.service';
import { PosTerminalsController } from './pos-terminals.controller';

/**
 * The till (RETAIL-ERP.md R7/R11). Off by default — see
 * modules.registry.ts — and imports no other module: `locationId` is a bare
 * scalar (see pos.prisma), so registering a terminal never requires
 * `inventory` to be enabled. WO-21.2's shift/cash/receipt models and
 * WO-21.3's `pos -> orders` sale hand-off (R11's own
 * `KNOWN_MODULE_COUPLINGS` addition) are later, separate work orders.
 */
@Module({
  controllers: [PosTerminalsController],
  providers: [PosTerminalsService],
  exports: [PosTerminalsService],
})
export class PosModule {}
