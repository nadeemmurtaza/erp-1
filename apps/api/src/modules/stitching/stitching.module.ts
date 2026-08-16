import { Module } from '@nestjs/common';
import { StitchingController } from './stitching.controller';
import { StitchingService } from './stitching.service';

@Module({
  controllers: [StitchingController],
  providers: [StitchingService],
  exports: [StitchingService],
})
export class StitchingModule {}
