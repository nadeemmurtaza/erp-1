/**
 * Extension point: payment providers.
 *
 * Cash on delivery and bank transfer are live. JazzCash and Easypaisa are
 * written against their hosted-checkout flow and stay dark until the merchant
 * credentials exist — switching one on is an entry in the PAYMENT_PROVIDERS
 * env allowlist, not a code change. Giftkarta (a third-party gift-card
 * network, providers/giftkarta.provider.ts) follows the same allowlist
 * idiom, but with `requiresCode`/`redeemCode` instead of a redirect — see
 * those fields' own doc comments.
 *
 * Adding a provider: implement this interface, add the class to
 * PaymentsService's constructor list, add its key to the allowlist. Nothing
 * else in the codebase changes.
 */
export interface PaymentContext {
  orderId: string;
  orderNumber: string;
  /** Amount to collect, in paisa. */
  amount: number;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  /**
   * Contact.id of the signed-in buyer placing this order, or null for a
   * guest — every other provider ignores this. 149-b2b-accounts-approvals-
   * sector-packs.md's own AccountProvider (providers/account.provider.ts)
   * is the one consumer: it cannot resolve a B2BAccount or check credit
   * availability without knowing which Contact is paying.
   */
  contactId?: string | null;
  /**
   * The buyer's own purchase-order number, required by AccountProvider when
   * B2BAccount.requiresPurchaseOrder is set — every other provider ignores
   * this too.
   */
  purchaseOrderReference?: string | null;
}

export interface PaymentInitiation {
  /** Payment status immediately after initiation. */
  status: 'PENDING' | 'AWAITING_APPROVAL' | 'PAID';
  /** Our reference, shown to the customer and sent to the gateway. */
  reference: string;
  /**
   * Where to send the customer to pay. Null for providers that need no
   * redirect, such as cash on delivery.
   */
  redirectUrl: string | null;
  /** Provider-specific detail the storefront may need — bank account, say. */
  meta?: Record<string, unknown>;
}

export interface PaymentCallbackResult {
  reference: string;
  status: 'PAID' | 'FAILED' | 'CANCELLED';
  providerRef?: string;
  failureReason?: string;
  raw: Record<string, unknown>;
  /**
   * False when the response did not prove it came from the gateway — a bad
   * signature, or none at all. Distinct from `status: 'FAILED'`, which is the
   * gateway genuinely reporting a declined payment.
   *
   * The service refuses these outright and writes nothing, so an unsigned
   * request cannot move a payment's state in EITHER direction: forging a
   * success is the obvious risk, but being able to force someone else's
   * pending payment to FAILED is a nuisance worth denying too.
   */
  verified?: boolean;
}

export interface PaymentProvider {
  /** Stable key, matching the PAYMENT_PROVIDERS allowlist. */
  readonly key: string;
  readonly labelEn: string;
  readonly labelUr: string;
  /** Shown on the checkout page under the option. */
  readonly descriptionEn: string;
  readonly descriptionUr: string;
  /**
   * True for a provider that needs the customer to type something (a
   * third-party gift card's own code) AFTER the order already exists, rather
   * than at the moment they choose the method — the storefront shows a
   * follow-up field and posts it to `POST /payments/:paymentId/redeem-gift-card`
   * instead of expecting `initiate()` to have collected it. Omit (falsy) for
   * every provider that needs nothing more, or that collects proof
   * separately anyway (bank transfer's own receipt-upload screen).
   */
  readonly requiresCode?: boolean;
  /**
   * Extra charge for using this method, in paisa — the COD collection fee.
   * Zero for everything else.
   */
  feeFor(amount: number): Promise<number>;
  initiate(context: PaymentContext): Promise<PaymentInitiation>;
  /** Interprets a gateway callback. Providers with no callback may omit it. */
  handleCallback?(payload: Record<string, unknown>): Promise<PaymentCallbackResult>;
  /**
   * Validates and redeems a customer-submitted code against a
   * `requiresCode` provider's own external system — a third-party gift
   * card network, say. Called from `PaymentsService.redeemGiftCardCode()`
   * strictly AFTER the order (and its PENDING payment row) already exist and
   * are committed, never from inside the order-creation transaction: the
   * external debit is a real, non-reversible side effect with no local
   * rollback, the same reasoning `initiate()` never makes a live gateway
   * call itself (JazzCash/Easypaisa only ever prepare a redirect; the actual
   * settlement arrives later, via `handleCallback`). A provider that sets
   * `requiresCode: true` must implement this.
   */
  redeemCode?(context: PaymentContext, code: string): Promise<PaymentCallbackResult>;
}
