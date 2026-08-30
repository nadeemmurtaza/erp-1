import { type Locale, formatMoney } from '@yaseen/shared';
import { copyFor } from './copy';
import {
  button,
  detailBlocks,
  divider,
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

export interface StatusEmailData {
  orderNumber: string;
  status: string;
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
    address.country === 'PK' ? 'Pakistan' : (address.country ?? ''),
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
  'order.status_changed': renderOrderStatus as (
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
