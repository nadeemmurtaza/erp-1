import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';

/**
 * The general ledger (RETAIL-ERP.md R15, WO-19.1). Off by default — see
 * modules.registry.ts — and imports no other module: `accounting` is meant
 * to subscribe to domain events (WO-19.2) rather than be called directly,
 * so nothing here depends on `orders`, `payments`, or any other module
 * knowing it exists. No controller yet — nothing posts to the ledger until
 * WO-19.2's event subscribers exist to call `postEntry()`.
 */
@Module({
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
