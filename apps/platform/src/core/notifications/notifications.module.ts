import { Global, Module } from '@nestjs/common';
import { PlatformNotificationsService } from './notifications.service';

@Global()
@Module({
  providers: [PlatformNotificationsService],
  exports: [PlatformNotificationsService],
})
export class PlatformNotificationsModule {}
