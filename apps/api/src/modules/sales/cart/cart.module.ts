import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { ReorderService } from './reorder.service';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  // Measurements typed straight into the stitching panel are validated
  // against the garment's field rows via CartLineValidatorRegistry — a core
  // extension point (apps/api/src/core/extension-points/), global like every
  // other core provider, so it needs no entry here.
  // PricingModule: same hard-import shape orders.module.ts already uses for
  // TaxModule — "off" is a data state (no active PriceList rows), not a
  // Nest-boot-time toggle, per pricing.module.ts's own doc comment.
  imports: [PricingModule],
  controllers: [CartController],
  providers: [CartService, ReorderService],
  // Exported for the orders module, which turns a priced cart into an order.
  exports: [CartService],
})
export class CartModule {}
