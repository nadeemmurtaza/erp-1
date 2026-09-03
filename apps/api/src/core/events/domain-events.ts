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
  GoodsReceived: 'purchasing.goods_received',
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

export interface GoodsReceivedPayload {
  goodsReceiptId: string;
  number: string;
  purchaseOrderId: string;
  supplierId: string;
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
  [DomainEvent.GoodsReceived]: GoodsReceivedPayload;
}
