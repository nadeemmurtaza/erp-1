import { Module } from '@nestjs/common';
import { ResourceQuotasController } from './resource-quotas.controller';
import { ResourceQuotasService } from './resource-quotas.service';
import { ResourceQuotaAlertCron } from './resource-quota-alert.cron';

@Module({
  controllers: [ResourceQuotasController],
  providers: [ResourceQuotasService, ResourceQuotaAlertCron],
  exports: [ResourceQuotasService],
})
export class ResourceQuotasModule {}
