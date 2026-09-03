import { Global, Module } from '@nestjs/common';
import { CartLineValidatorRegistry } from './cart-line-validator.registry';
import { EntityEnrichmentRegistry } from './entity-enrichment.registry';
import { CheckoutValidatorRegistry } from '../checkout/checkout-validator.registry';

/**
 * The seams packs use to extend core without core ever importing them — see
 * EntityEnrichmentRegistry, CheckoutValidatorRegistry and
 * CartLineValidatorRegistry for what each is for. Global, like every other
 * core module, so a pack injects any of them directly rather than importing
 * this module.
 */
@Global()
@Module({
  providers: [EntityEnrichmentRegistry, CheckoutValidatorRegistry, CartLineValidatorRegistry],
  exports: [EntityEnrichmentRegistry, CheckoutValidatorRegistry, CartLineValidatorRegistry],
})
export class ExtensionPointsModule {}
