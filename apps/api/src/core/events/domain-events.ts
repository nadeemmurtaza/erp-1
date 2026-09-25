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
  /** WO-8.3 — fires on every create()/update(), unconditionally: search.reindexProduct's own trigger, since a name, description, tag, category or brand edit all change what a product should match on, not just its status or price. */
  ProductChanged: 'catalog.product_changed',
  /** Any positive-delta stock movement — the one signal that can unblock a waiting order line, whatever replenished the stock. */
  StockReplenished: 'inventory.stock_replenished',
  /** InventoryService.postUnconditional() drove a location negative (RETAIL-ERP.md R5) — never fired by move(). */
  StockVarianceRecorded: 'inventory.stock_variance_recorded',
  GoodsReceived: 'purchasing.goods_received',
  RequisitionCreated: 'purchasing.requisition_created',
  RequisitionConverted: 'purchasing.requisition_converted',
  /** A BomProductionRun completed (WO-C.3) — fires after stock consumption, stock credit and the weighted-average cost update all land in the same transaction. */
  BomProductionCompleted: 'bom.production_completed',
  SupplierBillRaised: 'purchasing.supplier_bill_raised',
  SupplierBillPaid: 'purchasing.supplier_bill_paid',
  /** An InterBranchInvoice was raised — TransfersService.receive() on an INVOICED transfer (R12/R17, WO-22.3). Never fired for NONE/INTERNAL_PL. */
  InterBranchTransferInvoiced: 'transfers.inter_branch_invoiced',
  /** SupplyChainDigestCron's own nightly per-supplier stock/velocity computation, republished as an event so a connected TradingPartner can receive it structured, not only as the email it already sends. */
  SupplierDigestReady: 'analytics.supplier_digest_ready',

  WorkOrderCreated: 'production.work_order_created',
  WorkOrderReleased: 'production.work_order_released',
  WorkOrderCompleted: 'production.work_order_completed',

  EmailReplyReceived: 'email.reply_received',

  IdentityVerificationApproved: 'identity_verification.approved',
  IdentityVerificationRejected: 'identity_verification.rejected',
  IdentityVerificationExpired: 'identity_verification.expired',

  /** FinanceService.create() (WO-23.1) — fires whether or not `accounting` is on; posting-rules.subscriber.ts is the only subscriber today. */
  ExpenseRecorded: 'finance.expense_recorded',
  /** OrderEconomicsService's own derived-row write (WO-23.1's WO-B.3) — not a GL posting, just notice that a fresh contribution-per-order figure exists. */
  OrderEconomicsComputed: 'finance.order_economics_computed',

  /** PayRunService.post() (docs/implementation/payroll/19-payroll.md WO-19.4) — the eighth posting rule; fires whether or not `accounting` is on, same idiom as ExpenseRecorded. */
  PayrollRunPosted: 'payroll.run_posted',
  /** PayRunService.postAdjustment() (docs/implementation/payroll/19-payroll.md WO-19.5) — the overpayment/correction reversal path, a distinct postable fact from the original run it corrects. */
  PayrollAdjustmentPosted: 'payroll.adjustment_posted',

  /** FulfilmentService's one writer for a shipment status transition (WO-6.5) — fires whether the change came from a courier poll or a manual status update. orders/shipment-status.listener.ts is the only subscriber, and it is how a shipment change ever reaches Order.status: fulfilment never imports OrdersService. */
  ShipmentStatusChanged: 'fulfilment.shipment_status_changed',
  /** A courier-initiated RETURNED with no matching customer ReturnRequest (WO-6.7) — never fired for a return raised through the RMA flow. finance's rto-expense.listener.ts and crm's rto-contact.listener.ts both subscribe. */
  ShipmentReturnedToOrigin: 'fulfilment.shipment_rto',
  /** ReturnsService's own status-machine writes (WO-6.6) — the customer notification subscriber (fulfilment/return-notification.subscriber.ts) is the only one today. */
  ReturnRequestStatusChanged: 'fulfilment.return_status_changed',
  /** A ReturnRequest resolved REFUND and covers the order's full returnable quantity (WO-6.6) — orders/shipment-status.listener.ts is the only subscriber, calling changeStatus(..., {skipStockRelease: true}) since returns.service.ts already moved the stock itself at inspection. Never fired for a partial return or any other resolution — see ReturnsService.resolve()'s own doc comment for why. */
  ReturnRequestFullyRefunded: 'fulfilment.return_fully_refunded',

  /** OrdersService.place() (WO-5.3) — fires once a discount/promo code was actually applied to a placed order, for analytics. Never fires for a zero-discount order. */
  DiscountRedeemed: 'promotions.discount_redeemed',

  /** ReviewsService.moderate() (WO-7.5) — fires on every moderation decision, PUBLISHED or REJECTED alike, so a subscriber that only cares about the current published set (e.g. measurements/size-bias.listener.ts, WO-9.2) always recomputes against live data rather than trusting the direction of this one transition. */
  ReviewModerated: 'reviews.review_moderated',

  /** 145-receivables-credit-limits-dunning.md (WO-145.2) — CreditNotesService.issue(). posting-rules.subscriber.ts's own handler posts Dr Sales Returns / Cr Accounts Receivable through findPostedEntry(source, creditNoteId), never a second posting mechanism. */
  CreditNoteIssued: 'receivables.credit_note_issued',
  /** CreditNotesService.void() on an already-ISSUED note — reverses the posted entry via AccountingService.reverseEntry(), never a second, opposite-signed posting. */
  CreditNoteVoided: 'receivables.credit_note_voided',
  /** DebitNotesService.issue() — the AP-side mirror of CreditNoteIssued. */
  DebitNoteIssued: 'receivables.debit_note_issued',
  /** DebitNotesService.void() on an already-ISSUED note. */
  DebitNoteVoided: 'receivables.debit_note_voided',
  /** CreditTermsService.setTerm() the moment isOnHold turns true — "Audience is a capability" lens: resolves its recipients from finance.credit-terms.manage, never a hardcoded address. */
  CreditHoldApplied: 'receivables.credit_hold_applied',
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

export interface ShipmentStatusChangedPayload {
  shipmentId: string;
  orderId: string;
  orderNumber: string;
  fromStatus: string;
  toStatus: string;
  rawStatus: string | null;
  isRto: boolean;
}

export interface ShipmentReturnedToOriginPayload {
  shipmentId: string;
  orderId: string;
  orderNumber: string;
  /** Paisa — both legs of the courier charge, 0 when the shipment carries no cost figure. */
  courierChargeMinor: number;
  rtoAt: string;
}

export interface ReturnRequestStatusChangedPayload {
  returnId: string;
  returnNumber: string;
  orderId: string;
  fromStatus: string | null;
  toStatus: string;
  actorId: string | null;
}

export interface ReturnRequestFullyRefundedPayload {
  returnId: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  actorId: string | null;
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

/** WO-8.3 — deliberately just the id: the listener re-reads the current row rather than trusting a payload snapshot that could already be stale by the time it runs. */
export interface ProductChangedPayload {
  productId: string;
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

export interface RequisitionCreatedPayload {
  requisitionId: string;
  requestedById: string;
  locationId: string;
}

export interface RequisitionConvertedPayload {
  requisitionId: string;
  purchaseOrderId: string;
  supplierId: string;
}

export interface GoodsReceivedPayload {
  goodsReceiptId: string;
  number: string;
  purchaseOrderId: string;
  supplierId: string;
  /** WO-23.3c/e — carried so GoodsReceiptReplicationListener can log the FACT without a second read. */
  scopeLevel: 'ORG' | 'BRAND' | 'BRANCH';
  originNodeId: string | null;
  /** ISO. The fact's own original time (R2) — never `new Date()` at log time. */
  receivedAtIso: string;
}

export interface BomProductionCompletedPayload {
  runId: string;
  number: string;
  recipeId: string;
  variantId: string;
  quantityProduced: number;
  producedUnitCost: number;
  operatorId: string | null;
  /** WO-23.3c/e — carried so BomProductionReplicationListener can log the FACT without a second read. */
  scopeLevel: 'ORG' | 'BRAND' | 'BRANCH';
  originNodeId: string | null;
  /** ISO. The fact's own original time (R2) — never `new Date()` at log time. */
  producedAtIso: string;
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

export interface InterBranchTransferInvoicedPayload {
  invoiceId: string;
  invoiceNumber: string;
  transferId: string;
  /** The seller — books Revenue. */
  sourceRetailBrandId: string;
  /** The buyer — books Cost. */
  destinationRetailBrandId: string;
  /** Sum of received qty * dispatch-time unitCost — R12's transfer price (weighted-average cost, no markup). */
  amountMinor: number;
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

export interface ExpenseRecordedPayload {
  expenseId: string;
  categoryKey: string;
  isDirect: boolean;
  /** Paisa. */
  amountMinor: number;
  /** ISO date the cost belongs to — posts here, never at paidAtIso. */
  incurredAt: string;
  /** Null = unpaid at creation, posts to Accounts Payable instead of Cash & Bank. */
  paidAtIso: string | null;
  supplierId: string | null;
  /** WO-23.3c/e — carried so ExpenseReplicationListener can log the FACT without a second read. */
  scopeLevel: 'ORG' | 'BRAND' | 'BRANCH';
  originNodeId: string | null;
}

export interface OrderEconomicsComputedPayload {
  orderId: string;
  /** All paisa. */
  revenue: number;
  cogs: number;
  contribution: number;
}

export interface PayrollRunPostedPayload {
  payRunId: string;
  number: string;
  postedAt: string;
  /** All paisa, summed across every PayRunLine on the run. */
  grossMinor: number;
  netMinor: number;
  deductionsMinor: number;
  scopeLevel: 'ORG' | 'BRAND' | 'BRANCH';
  originNodeId: string | null;
}

export interface PayrollAdjustmentPostedPayload {
  adjustmentId: string;
  payRunId: string;
  payRunNumber: string;
  userId: string;
  reason: 'OVERPAYMENT' | 'UNDERPAYMENT' | 'CORRECTION';
  /** Paisa, always positive — sign is implied by `reason`. */
  amountMinor: number;
  postedAt: string;
}

export interface DiscountRedeemedPayload {
  orderId: string;
  orderNumber: string;
  discountId: string | null;
  promoCodeId: string | null;
  name: string;
  type: string;
  /** Paisa this discount removed from the order. */
  amount: number;
}

export interface EmailReplyReceivedPayload {
  inboundEmailId: string;
  emailAccountId: string;
  contactId: string | null;
  fromAddress: string;
}

export interface ReviewModeratedPayload {
  reviewId: string;
  productId: string;
  status: 'PUBLISHED' | 'REJECTED';
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
  [DomainEvent.ProductChanged]: ProductChangedPayload;
  [DomainEvent.StockReplenished]: StockReplenishedPayload;
  [DomainEvent.StockVarianceRecorded]: StockVarianceRecordedPayload;
  [DomainEvent.GoodsReceived]: GoodsReceivedPayload;
  [DomainEvent.RequisitionCreated]: RequisitionCreatedPayload;
  [DomainEvent.RequisitionConverted]: RequisitionConvertedPayload;
  [DomainEvent.BomProductionCompleted]: BomProductionCompletedPayload;
  [DomainEvent.WorkOrderCreated]: WorkOrderPayload;
  [DomainEvent.WorkOrderReleased]: WorkOrderPayload;
  [DomainEvent.WorkOrderCompleted]: WorkOrderPayload;
  [DomainEvent.SupplierBillRaised]: SupplierBillRaisedPayload;
  [DomainEvent.SupplierBillPaid]: SupplierBillPaidPayload;
  [DomainEvent.InterBranchTransferInvoiced]: InterBranchTransferInvoicedPayload;
  [DomainEvent.SupplierDigestReady]: SupplierDigestReadyPayload;
  [DomainEvent.EmailReplyReceived]: EmailReplyReceivedPayload;
  [DomainEvent.IdentityVerificationApproved]: IdentityVerificationPayload;
  [DomainEvent.IdentityVerificationRejected]: IdentityVerificationPayload;
  [DomainEvent.IdentityVerificationExpired]: IdentityVerificationPayload;
  [DomainEvent.ExpenseRecorded]: ExpenseRecordedPayload;
  [DomainEvent.OrderEconomicsComputed]: OrderEconomicsComputedPayload;
  [DomainEvent.PayrollRunPosted]: PayrollRunPostedPayload;
  [DomainEvent.PayrollAdjustmentPosted]: PayrollAdjustmentPostedPayload;
  [DomainEvent.ShipmentStatusChanged]: ShipmentStatusChangedPayload;
  [DomainEvent.ShipmentReturnedToOrigin]: ShipmentReturnedToOriginPayload;
  [DomainEvent.ReturnRequestStatusChanged]: ReturnRequestStatusChangedPayload;
  [DomainEvent.ReturnRequestFullyRefunded]: ReturnRequestFullyRefundedPayload;
  [DomainEvent.DiscountRedeemed]: DiscountRedeemedPayload;
  [DomainEvent.ReviewModerated]: ReviewModeratedPayload;
  [DomainEvent.CreditNoteIssued]: CreditNoteIssuedPayload;
  [DomainEvent.CreditNoteVoided]: CreditNoteVoidedPayload;
  [DomainEvent.DebitNoteIssued]: DebitNoteIssuedPayload;
  [DomainEvent.DebitNoteVoided]: DebitNoteVoidedPayload;
  [DomainEvent.CreditHoldApplied]: CreditHoldAppliedPayload;
}

export interface CreditNoteIssuedPayload {
  creditNoteId: string;
  customerId: string;
  orderId: string | null;
  amountMinor: number;
  /** ISO — the note's own issuedAt, so a late post still resolves the currently open period (R15), never issuedAt's own period. */
  issuedAt: string;
}

export interface CreditNoteVoidedPayload {
  creditNoteId: string;
}

export interface DebitNoteIssuedPayload {
  debitNoteId: string;
  supplierId: string;
  supplierBillId: string | null;
  amountMinor: number;
  issuedAt: string;
}

export interface DebitNoteVoidedPayload {
  debitNoteId: string;
}

export interface CreditHoldAppliedPayload {
  customerId: string;
  appliedByUserId: string;
}
