import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { CustomerSupportController, CustomerSupportStaffController } from './customer-support.controller';
import { CustomerSupportService } from './customer-support.service';
import { SupportHandlersService } from './support-handlers.service';
import { SupportTicketActionSource } from './support-ticket-action.source';
import { SupportTicketsController } from './support-tickets.controller';
import { SupportTicketsService } from './support-tickets.service';

/**
 * tasks-notifications-support/64-help-desk-support-ticketing.md
 * (DECISIONS.md ADR-064) and
 * tasks-notifications-support/148-external-customer-support-portal.md
 * (DECISIONS.md ADR-065). Imports `CrmModule` for exactly one reason —
 * `CustomerSupportService.raise()` finds-or-creates the caller's own
 * `Contact` (`CrmService.upsertContact()`) inside the same transaction as
 * the ticket write (`support -> crm` in `KNOWN_MODULE_COUPLINGS`, the
 * identical same-transaction reasoning `purchasing -> parties` already
 * establishes). Delivery is `NotificationsService` (core, global)
 * unchanged; state changes go through `AuditService` (core, global)
 * unchanged — no second delivery mechanism, no second audit trail.
 *
 * `SupportHandlersService` is shared between the internal (doc 64) and
 * external (doc 148) ticket services — one "who holds
 * support.tickets.handle" resolution, not two.
 *
 * `SupportTicketActionSource` has no other injector in this module — like
 * `EscalationCron`/`BulletinNotificationListener` elsewhere in this
 * codebase, it is a self-registering provider Nest still constructs (and
 * runs its own `onModuleInit()`) as long as it is listed here.
 */
@Module({
  imports: [CrmModule],
  controllers: [SupportTicketsController, CustomerSupportController, CustomerSupportStaffController],
  providers: [SupportTicketsService, SupportHandlersService, SupportTicketActionSource, CustomerSupportService],
})
export class SupportModule {}
