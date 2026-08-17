import { Global, Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { ExpoPushChannel } from './expo-push.channel';
import { LogNotificationChannel } from './log.channel';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  controllers: [DevicesController],
  providers: [LogNotificationChannel, ExpoPushChannel, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
