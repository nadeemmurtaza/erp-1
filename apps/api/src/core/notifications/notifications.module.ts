import { Global, Module } from '@nestjs/common';
import { LogNotificationChannel } from './log.channel';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  providers: [LogNotificationChannel, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
