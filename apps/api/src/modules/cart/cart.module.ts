import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  // Measurements typed straight into the stitching panel are validated
  // against the garment's field rows via CartLineValidatorRegistry — a core
  // extension point (apps/api/src/core/extension-points/), global like every
  // other core provider, so it needs no entry here.
  imports: [],
  controllers: [CartController],
  providers: [CartService],
  // Exported for the orders module, which turns a priced cart into an order.
  exports: [CartService],
})
export class CartModule {}
