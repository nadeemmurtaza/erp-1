import { Injectable } from '@nestjs/common';

export interface BranchPolicyHandler {
  /**
   * Whether `userId` may create a BRANCH-scope fact (a purchase order today
   * — RETAIL-ERP.md R9/R13) for their own branch. The `organization` module
   * is the only thing that can answer this: it resolves the caller's own
   * `AdminScope` grant to find which brand's `BrandPolicy` governs them.
   */
  allowsBranchLocalPurchasing(userId: string): Promise<boolean>;

  /**
   * The same question asked from the RECEIVING side of replication
   * (WO-23.3c/e, ADR-023) — a `GoodsReceipt` FACT arrived from `originNodeId`
   * claiming `scopeLevel: 'BRANCH'`, and there is no acting user to resolve
   * an `AdminScope` grant from, only the authenticated child node itself.
   * Resolves `Node.retailBrandId` → that brand's `BrandPolicy` — fails
   * closed the same way its sibling does, on a missing `Node`, a `Node`
   * with no `retailBrandId` recorded, or a missing `BrandPolicy` row.
   */
  allowsBranchLocalPurchasingForNode(originNodeId: string): Promise<boolean>;
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

  /**
   * No handler registered fails CLOSED here — deliberately the opposite
   * default from `allowsBranchLocalPurchasing()` above. A bare API call
   * naming no scope claims nothing worth gating; a replicated FACT that
   * explicitly carries `scopeLevel: 'BRANCH'` already claims a branch
   * identity, so an inability to verify it (no `organization` module, no
   * handler) is the same "cannot verify → treat as violated" case ADR-021
   * already applies to a missing `BrandPolicy` row.
   */
  async allowsBranchLocalPurchasingForNode(originNodeId: string): Promise<boolean> {
    if (!this.handler) return false;
    return this.handler.allowsBranchLocalPurchasingForNode(originNodeId);
  }
}
