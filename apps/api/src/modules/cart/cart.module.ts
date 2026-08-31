import { Module } from '@nestjs/common';
import { CartLineValidatorRegistry } from './cart-line-validator.registry';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  // Measurements typed straight into the stitching panel are validated against
  // the garment's field rows by the same service the profile screens use.
  imports: [],
  controllers: [CartController],
  providers: [CartService, CartLineValidatorRegistry],
  // Exported for the orders module, which turns a priced cart into an order.
  exports: [CartService, CartLineValidatorRegistry],
})
export class CartModule {}
