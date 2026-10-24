import { Module } from '@nestjs/common';
import { UsersAdminController } from './users-admin.controller';
import { UsersAdminService } from './users-admin.service';
import { WelcomeNotificationSubscriber } from './notification.subscriber';
import { SecurityNotificationSubscriber } from './security-notification.subscriber';

@Module({
  controllers: [UsersAdminController],
  providers: [UsersAdminService, WelcomeNotificationSubscriber, SecurityNotificationSubscriber],
})
export class UsersAdminModule {}
