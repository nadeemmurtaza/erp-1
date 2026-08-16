import { Module } from '@nestjs/common';
import { CrmAdminController, CrmPublicController } from './crm.controller';
import { CrmService } from './crm.service';
import { CrmOrderSubscriber } from './order.subscriber';

@Module({
  controllers: [CrmPublicController, CrmAdminController],
  providers: [CrmService, CrmOrderSubscriber],
  exports: [CrmService],
})
export class CrmModule {}
