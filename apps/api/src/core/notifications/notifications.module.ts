import { Global, Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { EmailNotificationChannel } from './email.channel';
import { ExpoPushChannel } from './expo-push.channel';
import { LogNotificationChannel } from './log.channel';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  controllers: [DevicesController],
  providers: [
    LogNotificationChannel,
    ExpoPushChannel,
    EmailNotificationChannel,
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
