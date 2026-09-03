import { Global, Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { EmailChannel } from './email.channel';
import { EmailTemplatesAdminController } from './email/email-templates.admin.controller';
import { ExpoPushChannel } from './expo-push.channel';
import { LogNotificationChannel } from './log.channel';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  controllers: [DevicesController, EmailTemplatesAdminController],
  providers: [LogNotificationChannel, ExpoPushChannel, EmailChannel, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
