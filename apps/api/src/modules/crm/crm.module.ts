import { Module } from '@nestjs/common';
import { ContactImportService } from './contact-import.service';
import { CrmAdminController, CrmPublicController } from './crm.controller';
import { CrmService } from './crm.service';
import { CrmOrderSubscriber } from './order.subscriber';
import { EmailInboxAdminController } from './email-inbox/email-inbox.admin.controller';
import { EmailInboxService } from './email-inbox/email-inbox.service';
import { MailboxPollerCron } from './email-inbox/mailbox-poller.cron';
import { RfmScoringCron } from './rfm-scoring.cron';
import { RtoContactListener } from './rto-contact.listener';
import { SegmentsAdminController } from './segments.controller';
import { SegmentsService } from './segments.service';
import { WhatsAppAssistantAdminController, WhatsAppWebhookController } from './whatsapp-assistant/whatsapp-assistant.controller';
import { WhatsAppAssistantService } from './whatsapp-assistant/whatsapp-assistant.service';

@Module({
  controllers: [
    CrmPublicController,
    CrmAdminController,
    EmailInboxAdminController,
    SegmentsAdminController,
    WhatsAppWebhookController,
    WhatsAppAssistantAdminController,
  ],
  providers: [
    CrmService,
    ContactImportService,
    CrmOrderSubscriber,
    EmailInboxService,
    MailboxPollerCron,
    RtoContactListener,
    SegmentsService,
    RfmScoringCron,
    WhatsAppAssistantService,
  ],
  exports: [CrmService, SegmentsService],
})
export class CrmModule {}
