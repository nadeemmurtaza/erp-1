import { Global, Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { EmailAccountsAdminController } from './email-accounts/email-accounts.admin.controller';
import { EmailAccountsService } from './email-accounts/email-accounts.service';
import { EmailChannel } from './email.channel';
import { EmailTemplatesAdminController } from './email/email-templates.admin.controller';
import { ExpoPushChannel } from './expo-push.channel';
import { LogNotificationChannel } from './log.channel';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  controllers: [DevicesController, EmailTemplatesAdminController, EmailAccountsAdminController],
  providers: [
    LogNotificationChannel,
    ExpoPushChannel,
    EmailChannel,
    NotificationsService,
    EmailAccountsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
