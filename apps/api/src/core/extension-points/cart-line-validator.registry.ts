import { Injectable } from '@nestjs/common';

/**
 * Lets the pack that owns a product kind validate the opaque per-line
 * configuration a cart line carries for it — measurement values against a
 * garment's fields, say — without `cart` (core) ever importing that pack's
 * service. This was previously `cart`'s own `CartLineValidatorRegistry`;
 * moved into core's extension points because that is what it actually is
 * (see EntityEnrichmentRegistry and CheckoutValidatorRegistry alongside it),
 * and because a feature module is not a legal import target for another
 * pack under the module-boundary rules — only `<name>.module` and
 * `<name>.service` are (see scripts/check-module-boundaries.mjs).
 *
 * This is the extension point B7 (MULTI-SECTOR.md)'s `cart -> measurements`
 * entry called for. `measurements` registers 'measurements' from its own
 * `onModuleInit()`; `cart.service.ts` calls `validate('measurements', ...)`
 * and never imports MeasurementsService directly. `stitching` registers
 * 'stitchingOptions' the same way (P1-8) — that one genuinely needs the
 * database (an option's group, its required-ness), so `validate()` is
 * `async` and every caller must `await` it, even a synchronous validator
 * like 'measurements' — awaiting a non-Promise value is a no-op.
 */
@Injectable()
export class CartLineValidatorRegistry {
  private validators = new Map<string, (garmentFields: any, values: any) => any>();

  register(kind: string, validator: (garmentFields: any, values: any) => any) {
    this.validators.set(kind, validator);
  }

  async validate(kind: string, garmentFields: any, values: any) {
    const validator = this.validators.get(kind);
    return validator ? await validator(garmentFields, values) : values;
  }
}
