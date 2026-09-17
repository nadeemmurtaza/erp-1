import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { PostingRulesSubscriber } from './posting-rules.subscriber';
import { GlReportsService } from './gl-reports.service';
import { GlReportsController } from './gl-reports.controller';

/**
 * The general ledger (RETAIL-ERP.md R15). Off by default — see
 * modules.registry.ts — and imports no other module: `PostingRulesSubscriber`
 * (WO-19.2/19.3) reaches `orders`/`payments`/`purchasing` only through the
 * events they already publish, so nothing here depends on any of their
 * services and none of them knows this one exists. `GlReportsController`
 * (WO-19.4) only ever reads `Account`/`JournalEntry`/`JournalLine`, which
 * this module already owns — it adds no new coupling.
 */
@Module({
  controllers: [GlReportsController],
  providers: [AccountingService, PostingRulesSubscriber, GlReportsService],
  exports: [AccountingService],
})
export class AccountingModule {}
