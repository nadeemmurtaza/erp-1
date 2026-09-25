import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { PostingRulesSubscriber } from './posting-rules.subscriber';
import { WalletPostingRulesSubscriber } from './wallet-posting-rules.subscriber';
import { GlReportsService } from './gl-reports.service';
import { GlReportsController } from './gl-reports.controller';
import { FiscalPeriodsService } from './fiscal-periods.service';
import { FiscalPeriodsController } from './fiscal-periods.controller';
import { ConsolidationService } from './consolidation.service';
import { ConsolidationController } from './consolidation.controller';

/**
 * The general ledger (RETAIL-ERP.md R15). Off by default — see
 * modules.registry.ts — and imports no other module: `PostingRulesSubscriber`
 * (WO-19.2/19.3) and `WalletPostingRulesSubscriber` (doc 155, WO-155.2,
 * also off by default) reach `orders`/`payments`/`purchasing`/`wallet` only
 * through the events they already publish, so nothing here depends on any
 * of their services and none of them knows this one exists. `GlReportsController`
 * (WO-19.4), `FiscalPeriodsController` (WO-19.5) and `ConsolidationController`
 * (R17, WO-20.6) only ever touch `Account`/`FiscalYear`/`FiscalPeriod`/
 * `JournalEntry`/`JournalLine`, which this module already owns — neither
 * adds new coupling.
 */
@Module({
  controllers: [GlReportsController, FiscalPeriodsController, ConsolidationController],
  providers: [AccountingService, PostingRulesSubscriber, WalletPostingRulesSubscriber, GlReportsService, FiscalPeriodsService, ConsolidationService],
  exports: [AccountingService],
})
export class AccountingModule {}
