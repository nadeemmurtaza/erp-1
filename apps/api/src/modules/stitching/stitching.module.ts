import { Module } from '@nestjs/common';
import { StitchingDesignOptionsService } from './design-options.service';
import { StitchingJobsService } from './jobs.service';
import { StitchingOrderSubscriber } from './order.subscriber';
import { StitchingAdminController, StitchingController } from './stitching.controller';
import { StitchingOrdersService } from './stitching-orders.service';
import { StitchingService } from './stitching.service';

@Module({
  controllers: [StitchingController, StitchingAdminController],
  providers: [
    StitchingService,
    StitchingJobsService,
    StitchingOrdersService,
    StitchingDesignOptionsService,
    StitchingOrderSubscriber,
  ],
  exports: [StitchingService, StitchingJobsService],
})
export class StitchingModule {}
