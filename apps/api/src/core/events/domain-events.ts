/**
 * The catalogue of domain events.
 *
 * A module emits an event; other modules subscribe. Nothing calls another
 * module's service directly for a side effect. That is what makes "award
 * loyalty points on every order" a new file rather than an edit to checkout.
 *
 * Adding an event: add the name here and its payload to DomainEventPayloads.
 * Subscribers that do not know the event simply never fire.
 */
export const DomainEvent = {
  OrderPlaced: 'order.placed',
  OrderStatusChanged: 'order.status_changed',
  OrderCancelled: 'order.cancelled',

  PaymentSucceeded: 'payment.succeeded',
  PaymentFailed: 'payment.failed',
  PaymentAwaitingApproval: 'payment.awaiting_approval',
  PaymentRefunded: 'payment.refunded',

  StitchingJobCreated: 'stitching.job_created',
  StitchingJobStageChanged: 'stitching.job_stage_changed',
  StitchingOrderCreated: 'stitching.order_created',

  ContactUpserted: 'crm.contact_upserted',
  LeadCreated: 'crm.lead_created',

  UserRegistered: 'user.registered',
  PasswordChanged: 'user.password_changed',
  PasswordResetRequested: 'user.password_reset_requested',
  EmailVerificationRequested: 'user.email_verification_requested',

  ProductLowStock: 'catalog.product_low_stock',
  /** Distinct from ProductLowStock: fires against reorderPoint, drives auto-replenishment (PO or WorkOrder). ProductLowStock fires against lowStockThreshold and only ever notifies. */
  ProductReorderPointReached: 'catalog.product_reorder_point_reached',
  /** Fires once, the moment a product's status first becomes ACTIVE — never again on a later re-save. */
  ProductPublished: 'catalog.product_published',
  /** Fires only when basePrice actually changes value, never on an unrelated field edit. */
  ProductPriceChanged: 'catalog.product_price_changed',
  /** Any positive-delta stock movement — the one signal that can unblock a waiting order line, whatever replenished the stock. */
  StockReplenished: 'inventory.stock_replenished',
  /** InventoryService.postUnconditional() drove a location negative (RETAIL-ERP.md R5) — never fired by move(). */
  StockVarianceRecorded: 'inventory.stock_variance_recorded',
  GoodsReceived: 'purchasing.goods_received',
  SupplierBillRaised: 'purchasing.supplier_bill_raised',
  SupplierBillPaid: 'purchasing.supplier_bill_paid',
  /** SupplyChainDigestCron's own nightly per-supplier stock/velocity computation, republished as an event so a connected TradingPartner can receive it structured, not only as the email it already sends. */
  SupplierDigestReady: 'analytics.supplier_digest_ready',

  WorkOrderCreated: 'production.work_order_created',
  WorkOrderReleased: 'production.work_order_released',
  WorkOrderCompleted: 'production.work_order_completed',

  EmailReplyReceived: 'email.reply_received',

  IdentityVerificationApproved: 'identity_verification.approved',
  IdentityVerificationRejected: 'identity_verification.rejected',
  IdentityVerificationExpired: 'identity_verification.expired',
} as const;

export type DomainEventName = (typeof DomainEvent)[keyof typeof DomainEvent];

export interface OrderPlacedPayload {
  orderId: string;
  orderNumber: string;
  userId: string | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  grandTotal: number;
  placedAt: string;
  /** Order item ids that were bought with stitching, for the tailor queue. */
  stitchingItemIds: string[];
}

export interface OrderStatusChangedPayload {
  orderId: string;
  orderNumber: string;
  fromStatus: string | null;
  toStatus: string;
  actorId: string | null;
}

export interface PaymentPayload {
  paymentId: string;
  orderId: string;
  provider: string;
  amount: number;
  status: string;
}

export interface StitchingJobPayload {
  jobId: string;
  jobNumber: string;
  fromStage: string | null;
  toStage: string;
  assignedTailorId: string | null;
  orderId: string | null;
  stitchingOrderId: string | null;
  /**
   * The purchased variant this job is stitching, and how many — set only by
   * StitchingJobCreated (from the order line), left undefined by
   * StitchingJobStageChanged. production's stitching-cascade.listener.ts
   * reads these to open a WorkOrder without production ever importing or
   * querying StitchingJob directly (core must not know the apparel pack
   * exists — MULTI-SECTOR.md).
   */
  variantId?: string | null;
  quantity?: number;
}

export interface ContactUpsertedPayload {
  contactId: string;
  phoneE164: string | null;
  created: boolean;
}

export interface LeadCreatedPayload {
  leadId: string;
  name: string;
  phone: string | null;
  source: string;
}

export interface UserRegisteredPayload {
  userId: string;
  email: string | null;
  phone: string | null;
  name: string;
}

export interface PasswordChangedPayload {
  userId: string;
}

export interface PasswordResetRequestedPayload {
  userId: string;
  /** Raw token — mailed once, never persisted anywhere but its hash. */
  token: string;
}

export interface EmailVerificationRequestedPayload {
  userId: string;
  /** Raw token — mailed once, never persisted anywhere but its hash. */
  token: string;
}

export interface PaymentRefundedPayload {
  paymentId: string;
  orderId: string;
  provider: string;
  amount: number;
}

export interface ProductLowStockPayload {
  productId: string;
  variantId: string;
  sku: string;
  stock: number;
  threshold: number;
}

export interface ProductReorderPointReachedPayload {
  productId: string;
  variantId: string;
  sku: string;
  stock: number;
  reorderPoint: number;
  reorderQuantity: number | null;
  producedInHouse: boolean;
  preferredSupplierId: string | null;
}

export interface StockReplenishedPayload {
  variantId: string;
  locationId: string;
  delta: number;
  resultingStock: number;
}

export interface StockVarianceRecordedPayload {
  stockVarianceId: string;
  variantId: string;
  locationId: string;
  overshootQty: number;
  unitCost: number | null;
}

/** Never a cost price or margin — this leaves the platform to whoever is listening. */
export interface ProductPublishedPayload {
  productId: string;
  slug: string;
  nameEn: string;
  basePriceMinor: number;
}

/** Never a cost price or margin — this leaves the platform to whoever is listening. */
export interface ProductPriceChangedPayload {
  productId: string;
  slug: string;
  nameEn: string;
  oldPriceMinor: number;
  newPriceMinor: number;
}

export interface SupplierDigestReadyPayload {
  supplierId: string;
  items: Array<{ sku: string; stock: number; soldToday: number; soldThisWeek: number; actionNeeded: boolean }>;
}

export interface GoodsReceivedPayload {
  goodsReceiptId: string;
  number: string;
  purchaseOrderId: string;
  supplierId: string;
}

export interface WorkOrderPayload {
  workOrderId: string;
  number: string;
  variantId: string;
  status: string;
  source: string;
}

export interface SupplierBillRaisedPayload {
  billId: string;
  supplierId: string;
  purchaseOrderId: string | null;
  /** In `currency` below — the supplier's own invoiced amount. */
  amountMinor: number;
  currency: string;
  /** rate * 1_000_000 at the moment this bill was raised (R16) — the "booked" rate a later payment's settlement rate is compared against. */
  fxRateScaled: number;
  /** `amountMinor` converted to the base currency, computed once (`convertToBase`, @newax/shared). */
  baseAmountMinor: number;
  issuedAt: string;
}

export interface SupplierBillPaidPayload {
  billId: string;
  supplierId: string;
  /** The portion of the bill settled by this payment, in `currency` below. */
  amountMinor: number;
  currency: string;
  /** The bill's own booked rate (SupplierBillRaisedPayload.fxRateScaled) — what AP was booked at. */
  billFxRateScaled: number;
  /** The rate actually used to convert this payment to the base currency — the difference from `billFxRateScaled` is the realised FX gain/loss (R16). */
  settlementFxRateScaled: number;
  paidAt: string;
}

export interface EmailReplyReceivedPayload {
  inboundEmailId: string;
  emailAccountId: string;
  contactId: string | null;
  fromAddress: string;
}

export interface IdentityVerificationPayload {
  userId: string;
  /** The VerificationMethodProvider key nID resolved the case with, e.g. "otp_sms". */
  method: string | null;
}

export interface DomainEventPayloads {
  [DomainEvent.OrderPlaced]: OrderPlacedPayload;
  [DomainEvent.OrderStatusChanged]: OrderStatusChangedPayload;
  [DomainEvent.OrderCancelled]: OrderStatusChangedPayload;
  [DomainEvent.PaymentSucceeded]: PaymentPayload;
  [DomainEvent.PaymentFailed]: PaymentPayload;
  [DomainEvent.PaymentAwaitingApproval]: PaymentPayload;
  [DomainEvent.PaymentRefunded]: PaymentRefundedPayload;
  [DomainEvent.StitchingJobCreated]: StitchingJobPayload;
  [DomainEvent.StitchingJobStageChanged]: StitchingJobPayload;
  [DomainEvent.StitchingOrderCreated]: { stitchingOrderId: string; number: string };
  [DomainEvent.ContactUpserted]: ContactUpsertedPayload;
  [DomainEvent.LeadCreated]: LeadCreatedPayload;
  [DomainEvent.UserRegistered]: UserRegisteredPayload;
  [DomainEvent.PasswordChanged]: PasswordChangedPayload;
  [DomainEvent.PasswordResetRequested]: PasswordResetRequestedPayload;
  [DomainEvent.EmailVerificationRequested]: EmailVerificationRequestedPayload;
  [DomainEvent.ProductLowStock]: ProductLowStockPayload;
  [DomainEvent.ProductReorderPointReached]: ProductReorderPointReachedPayload;
  [DomainEvent.ProductPublished]: ProductPublishedPayload;
  [DomainEvent.ProductPriceChanged]: ProductPriceChangedPayload;
  [DomainEvent.StockReplenished]: StockReplenishedPayload;
  [DomainEvent.StockVarianceRecorded]: StockVarianceRecordedPayload;
  [DomainEvent.GoodsReceived]: GoodsReceivedPayload;
  [DomainEvent.WorkOrderCreated]: WorkOrderPayload;
  [DomainEvent.WorkOrderReleased]: WorkOrderPayload;
  [DomainEvent.WorkOrderCompleted]: WorkOrderPayload;
  [DomainEvent.SupplierBillRaised]: SupplierBillRaisedPayload;
  [DomainEvent.SupplierBillPaid]: SupplierBillPaidPayload;
  [DomainEvent.SupplierDigestReady]: SupplierDigestReadyPayload;
  [DomainEvent.EmailReplyReceived]: EmailReplyReceivedPayload;
  [DomainEvent.IdentityVerificationApproved]: IdentityVerificationPayload;
  [DomainEvent.IdentityVerificationRejected]: IdentityVerificationPayload;
  [DomainEvent.IdentityVerificationExpired]: IdentityVerificationPayload;
}
