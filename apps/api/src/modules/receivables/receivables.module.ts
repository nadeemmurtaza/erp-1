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
 * a direct import of another module's service, so this module can be
 * dropped from MODULES with nothing else in the API changing.
 */
@Module({
  controllers: [CreditNotesController, DebitNotesController, CreditTermsController, DunningController, StatementsController],
  providers: [CreditNotesService, DebitNotesService, CreditTermsService, DunningService, DunningCron, StatementsService],
  exports: [CreditTermsService],
})
export class ReceivablesModule {}
