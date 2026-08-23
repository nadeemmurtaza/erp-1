import { Module } from '@nestjs/common';
import { MeasurementsModule } from '../measurements/measurements.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  // Measurements typed straight into the stitching panel are validated against
  // the garment's field rows by the same service the profile screens use.
  imports: [MeasurementsModule],
  controllers: [CartController],
  providers: [CartService],
  // Exported for the orders module, which turns a priced cart into an order.
  exports: [CartService],
})
export class CartModule {}
