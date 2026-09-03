import { Injectable } from '@nestjs/common';

/**
 * What a validator needs to decide whether a checkout may proceed. Kept to
 * what every sector's veto reasons actually need — age gating, prescription
 * verification, a credit limit, an approval hold — rather than the full
 * order DTO, so a validator cannot reach past what it is allowed to see.
 */
export interface CheckoutContext {
  userId: string | null;
  contactId: string | null;
  items: ReadonlyArray<{
    productId: string;
    variantId: string;
    quantity: number;
  }>;
  totalAmount: number;
}

export interface CheckoutVeto {
  /** Machine-readable, e.g. "age_verification_required". Stable across locales. */
  code: string;
  /** Customer-facing. English; the caller is responsible for translating known codes. */
  message: string;
}

export interface CheckoutValidator {
  /** Returns `null` to allow the checkout, or one veto to block it. */
  validate(context: CheckoutContext): Promise<CheckoutVeto | null>;
}

/**
 * B3 from MULTI-SECTOR.md: "a way to refuse a basket," built once so age
 * gating, prescription verification, credit limits and approval holds each
 * become a registration rather than an edit to `orders.service.ts`.
 *
 * No pack registers one today — there is nothing in this repository yet
 * that needs to veto a checkout. That is expected: this is the seam, not a
 * rule. `validateAll()` on an empty registry always returns no vetoes, so
 * checkout behaves exactly as it does today until a pack has a real reason
 * to register.
 */
@Injectable()
export class CheckoutValidatorRegistry {
  private readonly validators: CheckoutValidator[] = [];

  /** Called once, from the registering pack's `onModuleInit()`. */
  register(validator: CheckoutValidator): void {
    this.validators.push(validator);
  }

  /** Runs every registered validator; does not short-circuit, so a customer sees every reason at once. */
  async validateAll(context: CheckoutContext): Promise<CheckoutVeto[]> {
    if (this.validators.length === 0) return [];
    const results = await Promise.all(this.validators.map((validator) => validator.validate(context)));
    return results.filter((veto): veto is CheckoutVeto => veto !== null);
  }
}
