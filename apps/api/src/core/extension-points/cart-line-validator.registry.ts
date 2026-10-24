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
/**
 * What a validator is: given a garment's field definitions and the values a
 * customer supplied, either return the values it accepts or throw. `unknown`
 * rather than `any` on both sides — the registry genuinely does not know the
 * shape, and saying so keeps the checking switched on inside each validator
 * instead of switching it off everywhere the type travels.
 */
export type CartLineValidator<Fields = unknown, Values = unknown, Result = unknown> = (
  garmentFields: Fields,
  values: Values,
) => Result | Promise<Result>;

@Injectable()
export class CartLineValidatorRegistry {
  /*
   * Stored with their parameter types erased. `never` is what makes that
   * sound: a validator registered for 'measurements' accepts measurement
   * fields and nothing else, and the map cannot express nine such contracts
   * at once. Registration below stays fully checked, and `validate` is where
   * the caller states what it expects back.
   */
  private validators = new Map<string, CartLineValidator<never, never>>();

  register<Fields, Values, Result>(
    kind: string,
    validator: CartLineValidator<Fields, Values, Result>,
  ) {
    this.validators.set(kind, validator as CartLineValidator<never, never>);
  }

  async validate<Result = unknown>(
    kind: string,
    garmentFields: unknown,
    values: unknown,
  ): Promise<Result> {
    const validator = this.validators.get(kind) as
      | CartLineValidator<unknown, unknown, Result>
      | undefined;
    return validator ? await validator(garmentFields, values) : (values as Result);
  }
}
