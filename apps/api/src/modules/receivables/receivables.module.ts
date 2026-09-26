import { Module } from '@nestjs/common';
import {
  CreditNotesController,
  DebitNotesController,
  CreditTermsController,
  DunningController,
  StatementsController,
} from './receivables.controller';
import { CreditNotesService } from './credit-notes.service';
import { DebitNotesService } from './debit-notes.service';
import { CreditTermsService } from './credit-terms.service';
import { DunningService } from './dunning.service';
import { DunningCron } from './dunning.cron';
import { StatementsService } from './statements.service';

/**
 * 145-receivables-credit-limits-dunning.md. Every provider here reaches
 * `accounting`/`orders`/`crm`/`purchasing` only through PrismaService reads
 * of their own tables (the same cross-module read `reports.service.ts`
 * already does) or through a published domain event
 * (CreditNoteIssued/DebitNoteIssued -> posting-rules.subscriber.ts) — never
 * a direct import of another module's service.
 *
 * `payments` is the one exception (149-b2b-accounts-approvals-sector-
 * packs.md, `payments -> receivables` in KNOWN_MODULE_COUPLINGS):
 * AccountProvider.initiate() needs CreditTermsService.checkCreditAvailable()
 * before an on-account checkout can commit — hard-imported the same way
 * `orders` hard-imports `tax`/`pricing`/`fulfilment`, so this module's own
 * MODULES allowlist entry only gates its admin nav/UI, never whether
 * checkout can resolve the service.
 */
@Module({
  controllers: [CreditNotesController, DebitNotesController, CreditTermsController, DunningController, StatementsController],
  providers: [CreditNotesService, DebitNotesService, CreditTermsService, DunningService, DunningCron, StatementsService],
  exports: [CreditTermsService],
})
export class ReceivablesModule {}
