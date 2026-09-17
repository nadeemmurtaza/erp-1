import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { PostingRulesSubscriber } from './posting-rules.subscriber';
import { GlReportsService } from './gl-reports.service';
import { GlReportsController } from './gl-reports.controller';
import { FiscalPeriodsService } from './fiscal-periods.service';
import { FiscalPeriodsController } from './fiscal-periods.controller';

/**
 * The general ledger (RETAIL-ERP.md R15). Off by default — see
 * modules.registry.ts — and imports no other module: `PostingRulesSubscriber`
 * (WO-19.2/19.3) reaches `orders`/`payments`/`purchasing` only through the
 * events they already publish, so nothing here depends on any of their
 * services and none of them knows this one exists. `GlReportsController`
 * (WO-19.4) and `FiscalPeriodsController` (WO-19.5) only ever touch
 * `Account`/`FiscalYear`/`FiscalPeriod`/`JournalEntry`/`JournalLine`, which
 * this module already owns — neither adds new coupling.
 */
@Module({
  controllers: [GlReportsController, FiscalPeriodsController],
  providers: [AccountingService, PostingRulesSubscriber, GlReportsService, FiscalPeriodsService],
  exports: [AccountingService],
})
export class AccountingModule {}
