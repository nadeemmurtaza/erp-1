import { Module } from '@nestjs/common';
import { UsersAdminController } from './users-admin.controller';
import { UsersAdminService } from './users-admin.service';
import { WelcomeNotificationSubscriber } from './notification.subscriber';

@Module({
  controllers: [UsersAdminController],
  providers: [UsersAdminService, WelcomeNotificationSubscriber],
})
export class UsersAdminModule {}
