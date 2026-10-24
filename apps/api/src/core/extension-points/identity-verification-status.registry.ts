import { Injectable } from '@nestjs/common';

export interface IdentityVerificationStatusProvider {
  /** Whether this user's identity verification is currently APPROVED. */
  isApproved(userId: string): Promise<boolean>;
}

/**
 * Lets a module ask "is this user verified?" without importing
 * `identity-verification` — a module switched off in `MODULES` for most
 * deployments (docs/implementation/access-control-identity/18-identity-verification.md,
 * `offByDefault: true` in modules.registry.ts). The same register()-from-
 * `onModuleInit()` idiom `CameraPeopleCountRegistry`/`EntityEnrichmentRegistry`
 * already use.
 *
 * No provider registered → `isApproved()` resolves `false`. That is the
 * conservative default doc 155's own `MerchantPayableService
 * .schedulePayoutRun()` (WO-155.3) relies on: with `identity-verification`
 * off, every merchant is treated as unverified and its payables wait for
 * the customer's own receipt confirmation — never fast-tracked because the
 * module that would have said "yes" was never asked.
 */
@Injectable()
export class IdentityVerificationStatusRegistry {
  private provider: IdentityVerificationStatusProvider | null = null;

  register(provider: IdentityVerificationStatusProvider): void {
    this.provider = provider;
  }

  async isApproved(userId: string): Promise<boolean> {
    if (!this.provider) return false;
    return this.provider.isApproved(userId);
  }
}
