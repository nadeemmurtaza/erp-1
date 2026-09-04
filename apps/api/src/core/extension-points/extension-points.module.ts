import { Global, Module } from '@nestjs/common';
import { CartLineValidatorRegistry } from './cart-line-validator.registry';
import { EntityEnrichmentRegistry } from './entity-enrichment.registry';
import { StockIntakeRegistry } from './stock-intake.registry';
import { CheckoutValidatorRegistry } from '../checkout/checkout-validator.registry';

/**
 * The seams a module uses to reach another module without importing it
 * directly — see EntityEnrichmentRegistry, CheckoutValidatorRegistry,
 * CartLineValidatorRegistry and StockIntakeRegistry for what each is for.
 * Most of these decouple core from a sector pack; StockIntakeRegistry
 * decouples two core modules from each other, but the mechanism and the
 * reason are the same. Global, like every other core module, so any module
 * injects any of them directly rather than importing this module.
 */
@Global()
@Module({
  providers: [
    EntityEnrichmentRegistry,
    CheckoutValidatorRegistry,
    CartLineValidatorRegistry,
    StockIntakeRegistry,
  ],
  exports: [
    EntityEnrichmentRegistry,
    CheckoutValidatorRegistry,
    CartLineValidatorRegistry,
    StockIntakeRegistry,
  ],
})
export class ExtensionPointsModule {}
