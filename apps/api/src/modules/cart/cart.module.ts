import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  controllers: [CartController],
  providers: [CartService],
  // Exported for the orders module, which turns a priced cart into an order.
  exports: [CartService],
})
export class CartModule {}
