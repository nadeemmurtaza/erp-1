import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { TransfersService } from './transfers.service';
import { TransfersController } from './transfers.controller';

/**
 * Inter-branch stock transfers (RETAIL-ERP.md R4). Off by default — see
 * modules.registry.ts. InventoryModule is the one hard import, the same
 * reason orders.module.ts imports it directly rather than through an event:
 * TransfersService's dispatch/receive/cancel each have to commit their
 * stock movements in the same transaction as the StockTransfer status
 * write (`transfers -> inventory` in KNOWN_MODULE_COUPLINGS, anticipated
 * by R11's own text).
 */
@Module({
  imports: [InventoryModule],
  controllers: [TransfersController],
  providers: [TransfersService],
  exports: [TransfersService],
})
export class TransfersModule {}
