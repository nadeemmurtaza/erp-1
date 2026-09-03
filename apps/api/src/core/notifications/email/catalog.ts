/**
 * Everything the admin "manage templates" screen needs that isn't already in
 * EMAIL_TEMPLATES: a human label, which category it belongs to, whether
 * something in the codebase actually sends it automatically (and what),
 * and sample data so a template with no live order/customer behind it can
 * still be rendered for a preview.
 *
 * This file is deliberately separate from templates.ts: the renderers there
 * are runtime code fed real data by a subscriber, and mixing sample payloads
 * into that file would make it easy to accidentally ship a sample as a
 * default. Every key here must have a matching entry in EMAIL_TEMPLATES —
 * templates.spec.ts checks that in both directions.
 */

export type EmailTemplateCategory = 'Orders' | 'Payments' | 'Account' | 'Stitching' | 'Marketing';

export interface EmailTemplateCatalogEntry {
  key: string;
  label: string;
  category: EmailTemplateCategory;
  /**
   * `automatic`: something in the codebase sends this on its own — the
   * `trigger` string names the subscriber/event.
   * `manual`: the template is real and ready to send, but nothing in this
   * codebase decides when to send it yet — that needs a subsystem (cart
   * tracking, browse tracking, reviews, campaigns…) this store doesn't have.
   * The screen must say so plainly rather than imply a send button here
   * dispatches mail.
   */
  trigger: 'automatic' | 'manual';
  triggerDescription: string;
  /** Fed to renderEmail() for the preview — has no bearing on real sends. */
  sampleData: Record<string, unknown>;
}

const sampleOrderItems = [
  {
    name: 'Embroidered Lawn Kurta',
    variantLabel: 'Medium / Ferozi',
    imageUrl: null,
    quantity: 1,
    lineTotal: 349900,
    stitched: true,
  },
  {
    name: 'Cotton Dupatta',
    variantLabel: null,
    imageUrl: null,
    quantity: 2,
    lineTotal: 129800,
    stitched: false,
  },
];

const sampleAddress = {
  fullName: 'Ayesha Khan',
  phone: '+923001234567',
  line1: 'House 12, Street 4, F-8/3',
  line2: null,
  city: 'Islamabad',
  province: 'Islamabad',
  postalCode: '44000',
  country: 'PK',
};

const sampleProducts = [
  { name: 'Embroidered Lawn Kurta', imageUrl: null, price: 'Rs 3,499', url: null },
  { name: 'Chiffon Dupatta', imageUrl: null, price: 'Rs 1,299', url: null },
  { name: 'Printed Cotton Suit', imageUrl: null, price: 'Rs 4,999', url: null },
];

export const EMAIL_TEMPLATE_CATALOG: EmailTemplateCatalogEntry[] = [
  {
    key: 'order.confirmed',
    label: 'Order Confirmation',
    category: 'Orders',
    trigger: 'automatic',
    triggerDescription: 'Sent when checkout completes (order.placed → OrderNotificationSubscriber).',
    sampleData: {
      orderNumber: 'YSN-2026-0142',
      items: sampleOrderItems,
      itemsSubtotal: 479700,
      stitchingSubtotal: 150000,
      discountTotal: 20000,
      shippingFee: 25000,
      codFee: 5000,
      grandTotal: 639700,
      shippingAddress: sampleAddress,
      billingAddress: sampleAddress,
      paymentProvider: 'cod',
      awaitingBankTransfer: false,
    },
  },
  {
    key: 'order.shipped',
    label: 'Shipping Confirmation',
    category: 'Orders',
    trigger: 'automatic',
    triggerDescription:
      'Sent when an order moves to SHIPPED (order.status_changed → OrderNotificationSubscriber). Also covers "out for delivery" — the schema has no distinct status for that hand-off yet.',
    sampleData: { orderNumber: 'YSN-2026-0142', status: 'SHIPPED' },
  },
  {
    key: 'order.delivered',
    label: 'Delivered Confirmation',
    category: 'Orders',
    trigger: 'automatic',
    triggerDescription: 'Sent when an order moves to DELIVERED (order.status_changed).',
    sampleData: { orderNumber: 'YSN-2026-0142', status: 'DELIVERED' },
  },
  {
    key: 'order.cancelled',
    label: 'Order Cancelled',
    category: 'Orders',
    trigger: 'automatic',
    triggerDescription:
      'Sent when an order is cancelled (order.cancelled). Adds a refund note automatically when the order was already paid.',
    sampleData: { orderNumber: 'YSN-2026-0142', status: 'CANCELLED', awaitingRefund: true },
  },
  {
    key: 'order.status_changed',
    label: 'Order Status Update (generic)',
    category: 'Orders',
    trigger: 'automatic',
    triggerDescription:
      'Fallback for any status not covered by a dedicated template above — currently RETURNED.',
    sampleData: { orderNumber: 'YSN-2026-0142', status: 'RETURNED' },
  },
  {
    key: 'payment.received',
    label: 'Payment Received',
    category: 'Payments',
    trigger: 'automatic',
    triggerDescription: 'Sent when an online payment settles (payment.succeeded), excluding COD.',
    sampleData: { orderNumber: 'YSN-2026-0142', amount: 639700 },
  },
  {
    key: 'payment.failed',
    label: 'Payment Failed',
    category: 'Payments',
    trigger: 'automatic',
    triggerDescription: 'Sent when a gateway declines a payment (payment.failed).',
    sampleData: { orderNumber: 'YSN-2026-0142', amount: 639700 },
  },
  {
    key: 'payment.refunded',
    label: 'Refund Processed',
    category: 'Payments',
    trigger: 'automatic',
    triggerDescription:
      'Sent when staff mark a payment refunded (POST /admin/payments/:id/refund → payment.refunded). Moving the money back is still a manual step outside this system, same as bank-transfer approval.',
    sampleData: { orderNumber: 'YSN-2026-0142', amount: 349900, provider: 'bank_transfer' },
  },
  {
    key: 'user.welcome',
    label: 'Welcome Email',
    category: 'Account',
    trigger: 'automatic',
    triggerDescription: 'Sent when a customer registers (user.registered).',
    sampleData: { name: 'Ayesha Khan' },
  },
  {
    key: 'user.password_reset',
    label: 'Password Reset Request',
    category: 'Account',
    trigger: 'automatic',
    triggerDescription:
      'Sent from POST /auth/forgot-password (user.password_reset_requested). The link expires in one hour.',
    sampleData: { token: 'preview-token' },
  },
  {
    key: 'user.password_changed',
    label: 'Password Changed Confirmation',
    category: 'Account',
    trigger: 'automatic',
    triggerDescription:
      'Sent after POST /auth/change-password or a completed reset (user.password_changed).',
    sampleData: {},
  },
  {
    key: 'user.email_verification',
    label: 'Email Verification',
    category: 'Account',
    trigger: 'automatic',
    triggerDescription:
      'Sent on registration and from POST /auth/resend-verification (user.email_verification_requested). Link expires in 24 hours.',
    sampleData: { token: 'preview-token' },
  },
  {
    key: 'marketing.abandoned_cart_reminder',
    label: 'Abandoned Cart (Email 1 — The Reminder)',
    category: 'Marketing',
    trigger: 'manual',
    triggerDescription:
      'No cart-abandonment detection exists in this codebase yet (no idle-cart job, no send timing). The template is ready; sending it needs that automation built first.',
    sampleData: {
      items: sampleOrderItems,
      cartUrl: 'https://yaseen.pk/en/cart',
    },
  },
  {
    key: 'marketing.abandoned_cart_incentive',
    label: 'Abandoned Cart (Email 2 — The Incentive)',
    category: 'Marketing',
    trigger: 'manual',
    triggerDescription: 'Same gap as Email 1, plus a discount-code system to generate the code.',
    sampleData: {
      items: sampleOrderItems,
      cartUrl: 'https://yaseen.pk/en/cart',
      discountCode: 'COMEBACK10',
      discountLabel: '10% off',
    },
  },
  {
    key: 'marketing.abandoned_browse',
    label: 'Abandoned Browse',
    category: 'Marketing',
    trigger: 'manual',
    triggerDescription:
      'No browse/view tracking exists in this codebase — there is nothing recording which products a visitor looked at.',
    sampleData: { products: sampleProducts },
  },
  {
    key: 'marketing.review_request',
    label: 'Product Review / Feedback Request',
    category: 'Marketing',
    trigger: 'manual',
    triggerDescription: 'No reviews module exists yet — there is nowhere for the link to send them.',
    sampleData: { orderNumber: 'YSN-2026-0142', items: sampleProducts },
  },
  {
    key: 'marketing.cross_sell',
    label: 'Cross-Sell / Product Recommendation',
    category: 'Marketing',
    trigger: 'manual',
    triggerDescription: 'No recommendation engine exists yet to choose the products.',
    sampleData: { basedOn: 'Embroidered Lawn Kurta', products: sampleProducts },
  },
  {
    key: 'marketing.replenishment_reminder',
    label: 'Replenishment Reminder',
    category: 'Marketing',
    trigger: 'manual',
    triggerDescription: 'No purchase-cadence tracking exists yet to know when to send this.',
    sampleData: { product: sampleProducts[0] },
  },
  {
    key: 'marketing.holiday_sale',
    label: 'Major Holiday Sales',
    category: 'Marketing',
    trigger: 'manual',
    triggerDescription:
      'No promotions/campaign system exists — content and schedule for a specific sale come from whoever sends it, same as any one-off campaign mail today.',
    sampleData: {
      headline: 'Eid Sale — up to 40% off',
      message: 'Our biggest sale of the season is live. Shop new arrivals and bestsellers before they sell out.',
      ctaLabel: 'Shop the sale',
      ctaUrl: 'https://yaseen.pk/en',
      expiresAt: null,
    },
  },
  {
    key: 'marketing.new_product_launch',
    label: 'New Product Launch',
    category: 'Marketing',
    trigger: 'manual',
    triggerDescription: 'No launch-campaign trigger exists — same gap as the other campaign sends.',
    sampleData: {
      headline: 'Just dropped: the Winter Collection',
      message: 'New fabrics, new colours. Be the first to shop the new collection.',
      ctaLabel: 'Shop new arrivals',
      ctaUrl: 'https://yaseen.pk/en',
      expiresAt: null,
    },
  },
  {
    key: 'marketing.flash_sale',
    label: 'Flash Sale / Limited Time Offer',
    category: 'Marketing',
    trigger: 'manual',
    triggerDescription: 'No promotions system exists — same gap as the other campaign sends.',
    sampleData: {
      headline: '24 hours only: 25% off everything',
      message: 'One day only. Use the code at checkout before it is gone.',
      ctaLabel: 'Shop now',
      ctaUrl: 'https://yaseen.pk/en',
      expiresAt: 'tonight at midnight',
    },
  },
  {
    key: 'stitching.ready',
    label: 'Stitching Ready',
    category: 'Stitching',
    trigger: 'automatic',
    triggerDescription: 'Sent when a stitching job reaches the READY stage (stitching.job_stage_changed).',
    sampleData: { garment: 'Kurta', stage: 'READY', reference: 'YSN-2026-0142' },
  },
  {
    key: 'stitching.stage_changed',
    label: 'Stitching Stage Update',
    category: 'Stitching',
    trigger: 'automatic',
    triggerDescription: 'Sent on other tracked stitching-stage changes.',
    sampleData: { garment: 'Kurta', stage: 'CUTTING', reference: 'YSN-2026-0142' },
  },
];
