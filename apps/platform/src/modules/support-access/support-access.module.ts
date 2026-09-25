import { Module } from '@nestjs/common';
import { SupportAccessController } from './support-access.controller';
import { SupportAccessService } from './support-access.service';
import { SupportAccessExpiryCron } from './support-access-expiry.cron';

@Module({
  controllers: [SupportAccessController],
  providers: [SupportAccessService, SupportAccessExpiryCron],
  exports: [SupportAccessService],
})
export class SupportAccessModule {}
