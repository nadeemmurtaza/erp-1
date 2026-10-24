import { Module } from '@nestjs/common';
import {
  MeasurementsAdminController,
  MeasurementsController,
} from './measurements.controller';
import { MeasurementsAdminService } from './measurements-admin.service';
import { MeasurementsService } from './measurements.service';
import { SizeBiasListener } from './size-bias.listener';
import { SizeBiasService } from './size-bias.service';
import { SizeRecommendationService } from './size-recommendation.service';

@Module({
  controllers: [MeasurementsController, MeasurementsAdminController],
  providers: [MeasurementsService, MeasurementsAdminService, SizeBiasService, SizeBiasListener, SizeRecommendationService],
  // Exported so cart/orders can validate a measurement snapshot at checkout.
  exports: [MeasurementsService],
})
export class MeasurementsModule {}
