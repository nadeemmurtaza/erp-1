import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { PostingRulesSubscriber } from './posting-rules.subscriber';

/**
 * The general ledger (RETAIL-ERP.md R15). Off by default — see
 * modules.registry.ts — and imports no other module: `PostingRulesSubscriber`
 * (WO-19.2) reaches `orders`/`payments` only through the events they already
 * publish, so nothing here depends on either module's service and neither
 * knows this one exists. No controller yet — reports (WO-19.4) are next.
 */
@Module({
  providers: [AccountingService, PostingRulesSubscriber],
  exports: [AccountingService],
})
export class AccountingModule {}
