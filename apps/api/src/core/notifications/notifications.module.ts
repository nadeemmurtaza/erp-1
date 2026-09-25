import { Global, Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { EmailAccountsAdminController } from './email-accounts/email-accounts.admin.controller';
import { EmailAccountsService } from './email-accounts/email-accounts.service';
import { EmailChannel } from './email.channel';
import { EmailTemplatesAdminController } from './email/email-templates.admin.controller';
import { ExpoPushChannel } from './expo-push.channel';
import { LogNotificationChannel } from './log.channel';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationsService } from './notifications.service';
import { SmsChannel } from './sms.channel';
import { UnsubscribeController } from './unsubscribe.controller';
import { WhatsAppChannel } from './whatsapp.channel';

@Global()
@Module({
  controllers: [
    DevicesController,
    EmailTemplatesAdminController,
    EmailAccountsAdminController,
    UnsubscribeController,
  ],
  providers: [
    LogNotificationChannel,
    ExpoPushChannel,
    EmailChannel,
    WhatsAppChannel,
    SmsChannel,
    NotificationsService,
    EmailAccountsService,
    NotificationPreferencesService,
  ],
  exports: [NotificationsService, EmailAccountsService, EmailChannel, WhatsAppChannel, NotificationPreferencesService],
})
export class NotificationsModule {}
