import { Injectable } from '@nestjs/common';

export interface UnreturnedAsset {
  assetTag: string;
  category: string;
}

export interface EmployeeOffboardingHandler {
  /** Every asset issued to `userId` with no recorded return. */
  unreturnedAssetsFor(userId: string): Promise<UnreturnedAsset[]>;
}

/**
 * Lets `users` (core, always-on) ask "does this person still hold company
 * equipment?" before deactivating their account, without importing `hr` —
 * the core-internal counterpart to BranchPolicyRegistry/StockIntakeRegistry,
 * same file, same reasoning (`users -> hr` would otherwise be an
 * unsanctioned cross-module coupling, `scripts/check-module-boundaries.mjs`).
 *
 * A deployment that excludes `hr` from MODULES gets no handler registered —
 * `unreturnedAssetsFor()` then answers `[]`, the "absent collaborator" shape
 * hr-people-org/79-employee-asset-management.md itself names: "with `hr`
 * off, no assets exist to track," so there is nothing to block on.
 */
@Injectable()
export class EmployeeOffboardingRegistry {
  private handler: EmployeeOffboardingHandler | null = null;

  /** Called once, from hr's own `onModuleInit()`. */
  register(handler: EmployeeOffboardingHandler): void {
    this.handler = handler;
  }

  async unreturnedAssetsFor(userId: string): Promise<UnreturnedAsset[]> {
    if (!this.handler) return [];
    return this.handler.unreturnedAssetsFor(userId);
  }
}
