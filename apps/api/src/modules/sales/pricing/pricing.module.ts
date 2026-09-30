import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';

/**
 * 146-wholesale-tiered-pricing.md — the `pricing` module MULTI-SECTOR.md
 * already named as not built. Hard-imported by `CartModule`/`OrdersModule`
 * directly (the identical precedent `TaxModule` already sets for a
 * togglable module checkout always needs to at least query) — "off" is a
 * DATA state (no active `PriceList`/`PriceListAssignment` rows), never a
 * Nest-boot-time module toggle, the same shape `promotions`/`giftcards`
 * already establish in `modules.registry.ts`'s own comments. Still
 * registered in `FEATURE_MODULES` for admin-nav gating, exactly as `tax`
 * is despite the same hard-import.
 */
@Module({
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
