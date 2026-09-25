/**
 * Extension point: financial institution settlement connectors
 * (finance-accounting/49-financial-institution-settlement-partnerships.md
 * §2). Doc 15/36's own two-layer pattern — a generic contract, one real
 * integration per institution — applied to settlement instead of
 * collection, the same idiom `PaymentProvider` (payments/payment-provider.ts)
 * already establishes for the collection side. Deliberately a SECOND
 * extension point, never shared with `PaymentProvider`: collection and
 * settlement are different trust boundaries with different failure modes.
 *
 * Adding a connector: implement this interface, add the class to
 * `SettlementsService`'s constructor list, register its institution key.
 * Nothing else in the codebase changes. No real connector exists yet — no
 * institution's settlement-report or webhook protocol is known here, so
 * `SettlementsService.connectors` starts empty, the same "stays dark until
 * credentials exist" posture JazzCash/Easypaisa were built under before
 * their merchant accounts existed.
 */
export interface FinancialInstitutionConnector {
  /** Stable key, matching SettlementProvider.key. "HBL", "Easypaisa Merchant", ... */
  readonly institution: string;
  /**
   * Called on the institution's own confirmation — a webhook, or the
   * polling fallback (SettlementsCron). Never invented data: an amount
   * this connector did not itself receive from the institution is never
   * written as settledAmountMinor.
   */
  reconcileBatch(externalBatchRef: string): Promise<{ settledAmountMinor: number; settledAt: Date }>;
}
