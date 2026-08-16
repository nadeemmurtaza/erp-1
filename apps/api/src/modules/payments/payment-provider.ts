/**
 * Extension point: payment providers.
 *
 * Cash on delivery and bank transfer are live. JazzCash and Easypaisa are
 * written against their hosted-checkout flow and stay dark until the merchant
 * credentials exist — switching one on is an entry in the PAYMENT_PROVIDERS
 * env allowlist, not a code change.
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
   * Extra charge for using this method, in paisa — the COD collection fee.
   * Zero for everything else.
   */
  feeFor(amount: number): Promise<number>;
  initiate(context: PaymentContext): Promise<PaymentInitiation>;
  /** Interprets a gateway callback. Providers with no callback may omit it. */
  handleCallback?(payload: Record<string, unknown>): Promise<PaymentCallbackResult>;
}
