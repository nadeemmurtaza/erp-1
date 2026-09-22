import { Injectable } from '@nestjs/common';

export interface BranchPolicyHandler {
  /**
   * Whether `userId` may create a BRANCH-scope fact (a purchase order today
   * — RETAIL-ERP.md R9/R13) for their own branch. The `organization` module
   * is the only thing that can answer this: it resolves the caller's own
   * `AdminScope` grant to find which brand's `BrandPolicy` governs them.
   */
  allowsBranchLocalPurchasing(userId: string): Promise<boolean>;
}

/**
 * Lets `purchasing` (always-on) ask "is this user's branch allowed to
 * purchase locally?" without importing `organization` (off by default) —
 * the core-internal counterpart to StockIntakeRegistry, same file, same
 * reasoning (`purchasing -> organization` would otherwise be an
 * unsanctioned cross-module coupling, `scripts/check-module-boundaries.mjs`).
 *
 * A deployment that excludes `organization` from MODULES gets no handler
 * registered — `allowsBranchLocalPurchasing()` then answers `true`
 * (nothing about that deployment's purchasing has ever claimed a branch
 * identity worth gating; Solo/STANDALONE never sees "branch" as a concept
 * at all). Once `organization` IS enabled and the caller genuinely holds
 * only a BRANCH-level grant, the registered handler decides — and *that*
 * decision fails closed on a missing `BrandPolicy` row (ADR-021): "a fact
 * arriving in violation is... never silently honoured" (R9).
 */
@Injectable()
export class BranchPolicyRegistry {
  private handler: BranchPolicyHandler | null = null;

  /** Called once, from organization's own `onModuleInit()`. */
  register(handler: BranchPolicyHandler): void {
    this.handler = handler;
  }

  async allowsBranchLocalPurchasing(userId: string): Promise<boolean> {
    if (!this.handler) return true;
    return this.handler.allowsBranchLocalPurchasing(userId);
  }
}
