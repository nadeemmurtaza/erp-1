import { Module } from '@nestjs/common';
import { CrmAdminController, CrmPublicController } from './crm.controller';
import { CrmService } from './crm.service';
import { CrmOrderSubscriber } from './order.subscriber';
import { EmailInboxAdminController } from './email-inbox/email-inbox.admin.controller';
import { EmailInboxService } from './email-inbox/email-inbox.service';
import { MailboxPollerCron } from './email-inbox/mailbox-poller.cron';

@Module({
  controllers: [CrmPublicController, CrmAdminController, EmailInboxAdminController],
  providers: [CrmService, CrmOrderSubscriber, EmailInboxService, MailboxPollerCron],
  exports: [CrmService],
})
export class CrmModule {}
