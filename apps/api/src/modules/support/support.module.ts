import { Module } from '@nestjs/common';
import { SupportTicketActionSource } from './support-ticket-action.source';
import { SupportTicketsController } from './support-tickets.controller';
import { SupportTicketsService } from './support-tickets.service';

/**
 * tasks-notifications-support/64-help-desk-support-ticketing.md
 * (DECISIONS.md ADR-064). A fully standalone module (the doc's own "The
 * absent collaborator" lens): imports no other feature module, and no
 * other module imports this one. Delivery is `NotificationsService`
 * (core, global) unchanged; state changes go through `AuditService` (core,
 * global) unchanged — no second delivery mechanism, no second audit trail.
 *
 * `SupportTicketActionSource` has no other injector in this module — like
 * `EscalationCron`/`BulletinNotificationListener` elsewhere in this
 * codebase, it is a self-registering provider Nest still constructs (and
 * runs its own `onModuleInit()`) as long as it is listed here.
 */
@Module({
  controllers: [SupportTicketsController],
  providers: [SupportTicketsService, SupportTicketActionSource],
})
export class SupportModule {}
