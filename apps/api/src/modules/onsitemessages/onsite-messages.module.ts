import { Module } from '@nestjs/common';
import { OnsiteMessagesAdminController, OnsiteMessagesController } from './onsite-messages.controller';
import { OnsiteMessagesService } from './onsite-messages.service';

@Module({
  controllers: [OnsiteMessagesAdminController, OnsiteMessagesController],
  providers: [OnsiteMessagesService],
  exports: [OnsiteMessagesService],
})
export class OnsiteMessagesModule {}
