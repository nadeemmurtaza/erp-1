import { BRAND, formatMoney, type Locale } from '@newax/shared';
import { copyFor } from './copy';
import {
  button,
  detailBlocks,
  divider,
  footerLink,
  heading,
  itemsTable,
  layout,
  panel,
  paragraph,
  sectionTitle,
  totals,
  htmlToText,
  ltr,
  type LineItem,
  type TotalRow,
} from './html';

/** Everything a template needs that comes from configuration, not the event. */
export interface EmailContext {
  storeName: string;
  storefrontUrl: string;
  contactEmail: string;
  supportWhatsapp?: string;
  bankTransferDetails?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** A snapshot of an order line, as the subscriber reads it from the database. */
export interface OrderEmailItem {
  name: string;
  variantLabel?: string | null;
  imageUrl?: string | null;
  quantity: number;
  lineTotal: number;
  stitched?: boolean;
}

export interface OrderEmailAddress {
  fullName?: string | null;
  phone?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export interface OrderEmailData {
  orderNumber: string;
  items: OrderEmailItem[];
  itemsSubtotal: number;
  stitchingSubtotal: number;
  discountTotal: number;
  shippingFee: number;
  codFee: number;
  grandTotal: number;
  shippingAddress?: OrderEmailAddress | null;
  billingAddress?: OrderEmailAddress | null;
  /** Raw Payment.provider — the template owns how it is worded, in each language. */
  paymentProvider?: string | null;
  /** True for an unpaid bank transfer, which turns on the instructions panel. */
  awaitingBankTransfer?: boolean;
}

export interface PaymentEmailData {
  orderNumber: string;
  amount: number;
}

export interface WelcomeEmailData {
  name: string;
}

export interface StatusEmailData {
  orderNumber: string;
  status: string;
  /** CANCELLED only: a paid order that still owes the customer a refund. */
  awaitingRefund?: boolean;
}

export interface RefundEmailData {
  orderNumber: string;
  /** Paisa. */
  amount: number;
  provider?: string | null;
}

export interface PasswordResetEmailData {
  /** Raw token — never logged or persisted, only ever put in the reset link. */
  token: string;
}

export interface EmailVerificationEmailData {
  /** Raw token — never logged or persisted, only ever put in the verify link. */
  token: string;
}

/** A product line for a marketing email — lighter than OrderEmailItem, since these are drawn from the catalogue, not an order snapshot. */
export interface MarketingProduct {
  name: string;
  imageUrl?: string | null;
  /** Preformatted money string, e.g. "Rs 3,499". */
  price?: string | null;
  url?: string | null;
}

export interface AbandonedCartEmailData {
  items: OrderEmailItem[];
  cartUrl: string;
  /** Email 2 only — the incentive that email 1 doesn't offer. */
  discountCode?: string | null;
  discountLabel?: string | null;
  /** Per-recipient — built by the sender, not resolved here. Automated marketing mail always carries one. */
  unsubscribeUrl: string;
}

export interface AbandonedBrowseEmailData {
  products: MarketingProduct[];
}

export interface ReviewRequestEmailData {
  orderNumber: string;
  items: MarketingProduct[];
  unsubscribeUrl: string;
}

export interface CrossSellEmailData {
  /** The product that anchors the recommendation, e.g. "because you bought…". */
  basedOn?: string | null;
  products: MarketingProduct[];
}

export interface ReplenishmentEmailData {
  product: MarketingProduct;
  unsubscribeUrl: string;
}

/**
 * A one-off campaign send — holiday sale, product launch, flash sale.
 * Unlike the transactional templates above, the content itself (not just the
 * data plugged into fixed copy) comes from whoever sends the campaign, since
 * there is no automation that knows what this quarter's sale is.
 */
export interface CampaignEmailData {
  headline: string;
  message: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  imageUrl?: string | null;
  /** Rendered as a countdown line for a flash sale; omitted otherwise. */
  expiresAt?: string | null;
}

export interface StitchingEmailData {
  garment?: string | null;
  stage: string;
  reference?: string | null;
}

function addressLines(address: OrderEmailAddress | null | undefined): string[] {
  if (!address) return [];
  return [
    address.fullName ?? '',
    address.line1 ?? '',
    address.line2 ?? '',
    [address.city, address.province].filter(Boolean).join(', '),
    address.postalCode ?? '',
    address.country === BRAND.locale.countryCode
      ? BRAND.contact.country
      : (address.country ?? ''),
    // Pinned: a phone number is two digit runs around a space, which is
    // exactly what RTL reordering flips.
    address.phone ? ltr(address.phone) : '',
  ].filter((line) => line.trim().length > 0);
}

function orderUrl(ctx: EmailContext, locale: Locale, orderNumber: string): string {
  // Storefront routes are locale-prefixed (/en, /ur) — see the [locale] segment
  // in apps/web. Dropping the prefix lands on a redirect at best.
  return `${ctx.storefrontUrl.replace(/\/+$/, '')}/${locale}/orders/${encodeURIComponent(
    orderNumber,
  )}`;
}

function passwordResetUrl(ctx: EmailContext, locale: Locale, token: string): string {
  return `${ctx.storefrontUrl.replace(/\/+$/, '')}/${locale}/reset-password?token=${encodeURIComponent(
    token,
  )}`;
}

function emailVerificationUrl(ctx: EmailContext, locale: Locale, token: string): string {
  return `${ctx.storefrontUrl.replace(/\/+$/, '')}/${locale}/verify-email?token=${encodeURIComponent(
    token,
  )}`;
}

function renderOrderConfirmed(
  data: OrderEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  // Pinned left-to-right: money sits in RTL cells, and a signed amount is two
  // runs, which reorders to "Rs 500 -" without this.
  const money = (amount: number) => ltr(formatMoney(amount, locale));

  const items: LineItem[] = data.items.map((item) => ({
    name: item.name,
    variantLabel: item.variantLabel,
    imageUrl: item.imageUrl,
    quantity: item.quantity,
    amount: money(item.lineTotal),
    note: item.stitched ? t.orderConfirmed.stitchingNote : null,
  }));

  // Only rows that carry a number: a zero discount line reads as an error.
  const totalRows: TotalRow[] = [
    { label: t.totals.subtotal, value: money(data.itemsSubtotal) },
    ...(data.stitchingSubtotal > 0
      ? [{ label: t.totals.stitching, value: money(data.stitchingSubtotal) }]
      : []),
    ...(data.discountTotal > 0
      ? [{ label: t.totals.discount, value: ltr(`- ${formatMoney(data.discountTotal, locale)}`) }]
      : []),
    ...(data.shippingFee > 0
      ? [{ label: t.totals.shipping, value: money(data.shippingFee) }]
      : []),
    ...(data.codFee > 0 ? [{ label: t.totals.codFee, value: money(data.codFee) }] : []),
    { label: t.totals.total, value: money(data.grandTotal), strong: true },
  ];

  const bankPanel = data.awaitingBankTransfer
    ? panel(
        t.awaitingPayment.title,
        [
          t.awaitingPayment.intro(money(data.grandTotal)),
          // Account numbers and IBANs are pinned for the same reason as the
          // phone above — an IBAN that reorders is an IBAN that loses money.
          ...(ctx.bankTransferDetails
            ? ctx.bankTransferDetails.split('\n').map((line) => ltr(line))
            : []),
          ...(ctx.supportWhatsapp
            ? [t.awaitingPayment.sendScreenshot(ltr(ctx.supportWhatsapp))]
            : []),
          t.awaitingPayment.afterVerification,
        ],
        locale,
      )
    : '';

  const body = [
    heading(t.orderConfirmed.heading, locale),
    paragraph(t.orderConfirmed.intro, locale),
    button(t.orderConfirmed.cta, orderUrl(ctx, locale, data.orderNumber), locale),
    bankPanel,
    sectionTitle(t.orderConfirmed.summary, locale),
    itemsTable(items, locale),
    totals(totalRows, locale),
    divider(),
    sectionTitle(t.details.customerInformation, locale),
    detailBlocks(
      [
        { label: t.details.shippingAddress, lines: addressLines(data.shippingAddress) },
        { label: t.details.billingAddress, lines: addressLines(data.billingAddress) },
        {
          label: t.details.payment,
          lines: [
            data.paymentProvider
              ? (t.paymentMethods[data.paymentProvider] ?? data.paymentProvider)
              : '',
          ],
        },
        { label: t.details.shippingMethod, lines: [t.shippingFeeLabel] },
      ],
      locale,
    ),
  ]
    .filter(Boolean)
    .join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    eyebrow: `${t.details.orderNumber} ${data.orderNumber}`,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return {
    subject: t.orderConfirmed.subject(data.orderNumber),
    html,
    text: htmlToText(html),
  };
}

function renderPaymentReceived(
  data: PaymentEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const body = [
    heading(t.paymentReceived.heading, locale),
    paragraph(t.paymentReceived.intro(formatMoney(data.amount, locale)), locale),
    button(t.viewOrder, orderUrl(ctx, locale, data.orderNumber), locale),
  ].join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    eyebrow: `${t.details.orderNumber} ${data.orderNumber}`,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return {
    subject: t.paymentReceived.subject(data.orderNumber),
    html,
    text: htmlToText(html),
  };
}

function renderPaymentFailed(
  data: PaymentEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const body = [
    heading(t.paymentFailed.heading, locale),
    paragraph(t.paymentFailed.intro(data.orderNumber), locale),
    button(t.paymentFailed.cta, orderUrl(ctx, locale, data.orderNumber), locale),
  ].join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    eyebrow: `${t.details.orderNumber} ${data.orderNumber}`,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return {
    subject: t.paymentFailed.subject(data.orderNumber),
    html,
    text: htmlToText(html),
  };
}

function renderWelcome(data: WelcomeEmailData, locale: Locale, ctx: EmailContext): RenderedEmail {
  const t = copyFor(locale);
  const body = [
    heading(t.welcome.heading, locale),
    paragraph(t.welcome.intro(data.name), locale),
    button(t.welcome.cta, ctx.storefrontUrl, locale),
  ].join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return {
    subject: t.welcome.subject,
    html,
    text: htmlToText(html),
  };
}

function renderOrderStatus(
  data: StatusEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const word = t.status.words[data.status] ?? data.status.toLowerCase();

  const body = [
    heading(t.status.heading(word), locale),
    paragraph(t.status.intro(data.orderNumber, word), locale),
    button(t.viewOrder, orderUrl(ctx, locale, data.orderNumber), locale),
  ].join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    eyebrow: `${t.details.orderNumber} ${data.orderNumber}`,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return {
    subject: t.status.subject(data.orderNumber, word),
    html,
    text: htmlToText(html),
  };
}

function renderOrderShipped(
  data: StatusEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const body = [
    heading(t.orderShipped.heading, locale),
    paragraph(t.orderShipped.intro(data.orderNumber), locale),
    button(t.viewOrder, orderUrl(ctx, locale, data.orderNumber), locale),
  ].join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    eyebrow: `${t.details.orderNumber} ${data.orderNumber}`,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return { subject: t.orderShipped.subject(data.orderNumber), html, text: htmlToText(html) };
}

function renderOrderDelivered(
  data: StatusEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const body = [
    heading(t.orderDelivered.heading, locale),
    paragraph(t.orderDelivered.intro(data.orderNumber), locale),
    paragraph(t.orderDelivered.note, locale),
    button(t.viewOrder, orderUrl(ctx, locale, data.orderNumber), locale),
  ].join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    eyebrow: `${t.details.orderNumber} ${data.orderNumber}`,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return { subject: t.orderDelivered.subject(data.orderNumber), html, text: htmlToText(html) };
}

function renderOrderCancelled(
  data: StatusEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const body = [
    heading(t.orderCancelled.heading, locale),
    paragraph(t.orderCancelled.intro(data.orderNumber), locale),
    data.awaitingRefund ? paragraph(t.orderCancelled.refundNote, locale) : '',
    button(t.viewOrder, orderUrl(ctx, locale, data.orderNumber), locale),
  ]
    .filter(Boolean)
    .join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    eyebrow: `${t.details.orderNumber} ${data.orderNumber}`,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return { subject: t.orderCancelled.subject(data.orderNumber), html, text: htmlToText(html) };
}

function renderPaymentRefunded(
  data: RefundEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const money = ltr(formatMoney(data.amount, locale));
  const body = [
    heading(t.paymentRefunded.heading, locale),
    paragraph(t.paymentRefunded.intro(data.orderNumber, money), locale),
    button(t.viewOrder, orderUrl(ctx, locale, data.orderNumber), locale),
  ].join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    eyebrow: `${t.details.orderNumber} ${data.orderNumber}`,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return { subject: t.paymentRefunded.subject(data.orderNumber), html, text: htmlToText(html) };
}

function renderPasswordChanged(
  _data: Record<string, never>,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const body = [
    heading(t.passwordChanged.heading, locale),
    paragraph(t.passwordChanged.intro, locale),
  ].join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return { subject: t.passwordChanged.subject, html, text: htmlToText(html) };
}

function renderPasswordReset(
  data: PasswordResetEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const body = [
    heading(t.passwordReset.heading, locale),
    paragraph(t.passwordReset.intro, locale),
    button(t.passwordReset.cta, passwordResetUrl(ctx, locale, data.token), locale),
    paragraph(t.passwordReset.expiry, locale),
  ].join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return { subject: t.passwordReset.subject, html, text: htmlToText(html) };
}

function renderEmailVerification(
  data: EmailVerificationEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const body = [
    heading(t.emailVerification.heading, locale),
    paragraph(t.emailVerification.intro, locale),
    button(t.emailVerification.cta, emailVerificationUrl(ctx, locale, data.token), locale),
  ].join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return { subject: t.emailVerification.subject, html, text: htmlToText(html) };
}

/** Shared body builder for the product-grid marketing mails (browse/review/cross-sell/replenishment). */
function productGrid(products: MarketingProduct[]): LineItem[] {
  return products.map((product) => ({
    name: product.name,
    imageUrl: product.imageUrl,
    quantity: 1,
    amount: product.price ?? '',
  }));
}

/** WO-8.5's own first stage of the doc's 1h/24h/72h sequence — a soft nudge, no incentive. */
function renderAbandonedCartFirstTouch(
  data: AbandonedCartEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const body = [
    heading(t.marketing.abandonedCartFirstTouch.heading, locale),
    paragraph(t.marketing.abandonedCartFirstTouch.intro, locale),
    button(t.marketing.abandonedCartFirstTouch.cta, data.cartUrl, locale),
    itemsTable(productGrid(data.items), locale),
    footerLink(t.marketing.unsubscribeLine, t.marketing.unsubscribeCta, data.unsubscribeUrl, locale),
  ].join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return {
    subject: t.marketing.abandonedCartFirstTouch.subject,
    html,
    text: htmlToText(html),
  };
}

function renderAbandonedCartReminder(
  data: AbandonedCartEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const body = [
    heading(t.marketing.abandonedCartReminder.heading, locale),
    paragraph(t.marketing.abandonedCartReminder.intro, locale),
    button(t.marketing.abandonedCartReminder.cta, data.cartUrl, locale),
    itemsTable(productGrid(data.items), locale),
    footerLink(t.marketing.unsubscribeLine, t.marketing.unsubscribeCta, data.unsubscribeUrl, locale),
  ].join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return {
    subject: t.marketing.abandonedCartReminder.subject,
    html,
    text: htmlToText(html),
  };
}

function renderAbandonedCartIncentive(
  data: AbandonedCartEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const discountPanel = data.discountCode
    ? panel(
        t.marketing.abandonedCartIncentive.discountTitle,
        [
          t.marketing.abandonedCartIncentive.discountBody(
            data.discountLabel ?? data.discountCode,
          ),
          ltr(data.discountCode),
        ],
        locale,
      )
    : '';

  const body = [
    heading(t.marketing.abandonedCartIncentive.heading, locale),
    paragraph(t.marketing.abandonedCartIncentive.intro, locale),
    discountPanel,
    button(t.marketing.abandonedCartIncentive.cta, data.cartUrl, locale),
    itemsTable(productGrid(data.items), locale),
    footerLink(t.marketing.unsubscribeLine, t.marketing.unsubscribeCta, data.unsubscribeUrl, locale),
  ]
    .filter(Boolean)
    .join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return {
    subject: t.marketing.abandonedCartIncentive.subject,
    html,
    text: htmlToText(html),
  };
}

function renderAbandonedBrowse(
  data: AbandonedBrowseEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const body = [
    heading(t.marketing.abandonedBrowse.heading, locale),
    paragraph(t.marketing.abandonedBrowse.intro, locale),
    button(t.marketing.abandonedBrowse.cta, ctx.storefrontUrl, locale),
    itemsTable(productGrid(data.products), locale),
  ].join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return { subject: t.marketing.abandonedBrowse.subject, html, text: htmlToText(html) };
}

function renderReviewRequest(
  data: ReviewRequestEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const body = [
    heading(t.marketing.reviewRequest.heading, locale),
    paragraph(t.marketing.reviewRequest.intro(data.orderNumber), locale),
    button(t.marketing.reviewRequest.cta, orderUrl(ctx, locale, data.orderNumber), locale),
    itemsTable(productGrid(data.items), locale),
    footerLink(t.marketing.unsubscribeLine, t.marketing.unsubscribeCta, data.unsubscribeUrl, locale),
  ].join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    eyebrow: `${t.details.orderNumber} ${data.orderNumber}`,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return { subject: t.marketing.reviewRequest.subject, html, text: htmlToText(html) };
}

function renderCrossSell(
  data: CrossSellEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const body = [
    heading(t.marketing.crossSell.heading, locale),
    paragraph(
      data.basedOn
        ? t.marketing.crossSell.introBasedOn(data.basedOn)
        : t.marketing.crossSell.intro,
      locale,
    ),
    button(t.marketing.crossSell.cta, ctx.storefrontUrl, locale),
    itemsTable(productGrid(data.products), locale),
  ].join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return { subject: t.marketing.crossSell.subject, html, text: htmlToText(html) };
}

function renderReplenishmentReminder(
  data: ReplenishmentEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const body = [
    heading(t.marketing.replenishment.heading, locale),
    paragraph(t.marketing.replenishment.intro(data.product.name), locale),
    button(
      t.marketing.replenishment.cta,
      data.product.url ?? ctx.storefrontUrl,
      locale,
    ),
    itemsTable(productGrid([data.product]), locale),
    footerLink(t.marketing.unsubscribeLine, t.marketing.unsubscribeCta, data.unsubscribeUrl, locale),
  ].join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return {
    subject: t.marketing.replenishment.subject(data.product.name),
    html,
    text: htmlToText(html),
  };
}

/** Shared shape for the three one-off campaign sends — see CampaignEmailData. */
function renderCampaign(
  badge: string,
  defaultCta: string,
  data: CampaignEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const body = [
    sectionTitle(badge, locale),
    heading(data.headline, locale),
    paragraph(data.message, locale),
    data.expiresAt ? paragraph(t.marketing.campaign.expiresNote(data.expiresAt), locale) : '',
    button(data.ctaLabel ?? defaultCta, data.ctaUrl ?? ctx.storefrontUrl, locale),
  ]
    .filter(Boolean)
    .join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return { subject: data.headline, html, text: htmlToText(html) };
}

function renderHolidaySale(
  data: CampaignEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  return renderCampaign(t.marketing.campaign.holidayBadge, t.shopNow, data, locale, ctx);
}

function renderNewProductLaunch(
  data: CampaignEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  return renderCampaign(t.marketing.campaign.launchBadge, t.shopNow, data, locale, ctx);
}

function renderFlashSale(
  data: CampaignEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  return renderCampaign(t.marketing.campaign.flashSaleBadge, t.shopNow, data, locale, ctx);
}

function renderStitching(
  data: StitchingEmailData,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail {
  const t = copyFor(locale);
  const garment = data.garment ?? '';
  const stageWord = t.stitching.stages[data.stage] ?? data.stage.toLowerCase();
  const ready = data.stage === 'READY';

  const body = [
    heading(t.stitching.heading, locale),
    paragraph(
      ready
        ? t.stitching.readySubject(garment)
        : t.stitching.stageSubject(garment, stageWord),
      locale,
    ),
    data.reference
      ? button(t.viewOrder, orderUrl(ctx, locale, data.reference), locale)
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const html = layout({
    locale,
    storeName: ctx.storeName,
    eyebrow: data.reference ?? undefined,
    footer: t.footer(ctx.storeName, ctx.contactEmail),
    body,
  });

  return {
    subject: ready
      ? t.stitching.readySubject(garment)
      : t.stitching.stageSubject(garment, stageWord),
    html,
    text: htmlToText(html),
  };
}

/**
 * Template key -> renderer.
 *
 * A template with no entry here is not an error: the channel falls back to the
 * message's own subject and body, so a new notification still reaches the
 * customer as plain mail before anyone designs a layout for it.
 *
 * The `unknown` in the signature is the seam between the notification
 * interface, whose data is an open record, and these typed payloads. Each
 * renderer is fed by exactly one subscriber, which builds the matching
 * interface above, so the cast is checked where it is written rather than here.
 */
export const EMAIL_TEMPLATES: Record<
  string,
  (data: never, locale: Locale, ctx: EmailContext) => RenderedEmail
> = {
  'order.confirmed': renderOrderConfirmed as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'payment.received': renderPaymentReceived as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'payment.failed': renderPaymentFailed as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'user.welcome': renderWelcome as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'order.status_changed': renderOrderStatus as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'order.shipped': renderOrderShipped as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'order.delivered': renderOrderDelivered as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'order.cancelled': renderOrderCancelled as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'payment.refunded': renderPaymentRefunded as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'user.password_changed': renderPasswordChanged as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'user.password_reset': renderPasswordReset as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'user.email_verification': renderEmailVerification as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'marketing.abandoned_cart_first_touch': renderAbandonedCartFirstTouch as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'marketing.abandoned_cart_reminder': renderAbandonedCartReminder as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'marketing.abandoned_cart_incentive': renderAbandonedCartIncentive as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'marketing.abandoned_browse': renderAbandonedBrowse as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'marketing.review_request': renderReviewRequest as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'marketing.cross_sell': renderCrossSell as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'marketing.replenishment_reminder': renderReplenishmentReminder as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'marketing.holiday_sale': renderHolidaySale as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'marketing.new_product_launch': renderNewProductLaunch as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'marketing.flash_sale': renderFlashSale as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'stitching.ready': renderStitching as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
  'stitching.stage_changed': renderStitching as (
    data: never,
    locale: Locale,
    ctx: EmailContext,
  ) => RenderedEmail,
};

/** Renders a template, or null when none is registered for that key. */
export function renderEmail(
  template: string,
  data: Record<string, unknown> | undefined,
  locale: Locale,
  ctx: EmailContext,
): RenderedEmail | null {
  const renderer = EMAIL_TEMPLATES[template];
  if (!renderer) return null;
  return renderer((data ?? {}) as never, locale, ctx);
}
