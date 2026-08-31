import { Global, Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { EmailChannel } from './email.channel';
import { ExpoPushChannel } from './expo-push.channel';
import { LogNotificationChannel } from './log.channel';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  controllers: [DevicesController],
  providers: [LogNotificationChannel, ExpoPushChannel, EmailChannel, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
