import { type Locale, directionFor } from '@yaseen/shared';

/**
 * Email HTML primitives.
 *
 * Everything here is tables and inline styles, which looks like 2005 and is
 * not negotiable: Outlook renders with Word's engine, and Gmail strips <style>
 * blocks on forwarded mail. Flexbox, grid and external stylesheets do not
 * survive the trip, so the layout is nested tables with explicit widths.
 */

/**
 * Escapes text for interpolation into HTML.
 *
 * Every value that reaches a template comes from a customer — their name, the
 * address they typed, a note on the order. Without this, a name containing a
 * tag would break the markup, and a mail client that follows it would render
 * whatever the customer wrote. Escaping is applied at the point of
 * interpolation rather than on the way into the database, so it holds whatever
 * else changes.
 */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes a URL for an href or src.
 *
 * Rejects anything that is not http(s), so a stored `javascript:` or `data:`
 * URL cannot become a live link in a customer's inbox.
 */
export function escUrl(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return '';
  return esc(trimmed);
}

/**
 * Pins a Latin-script value so Urdu's right-to-left flow cannot reorder it.
 *
 * Without this, a value made of more than one run renders scrambled inside an
 * RTL paragraph: "0318 6003165" comes out as "6003165 0318", and a discount of
 * "- Rs 500" as "Rs 500 -". Both are wrong in a way a customer would act on.
 *
 * Uses LEFT-TO-RIGHT MARK rather than a `dir="ltr"` span because the same
 * string is reused in the plain-text part, where there is no markup to carry
 * the direction.
 */
export function ltr(value: string): string {
  return `‎${value}‎`;
}

export const palette = {
  ink: '#121111',
  body: '#514E4E',
  muted: '#787676',
  border: '#E2E1DF',
  ground: '#F4F3F1',
  panel: '#FFFFFF',
} as const;

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const URDU_FONT = `'Noto Nastaliq Urdu', ${FONT}`;

export interface LayoutOptions {
  locale: Locale;
  storeName: string;
  /** Small line beside the wordmark, e.g. the order number. */
  eyebrow?: string;
  /** Plain-text footer note — contact details, reply-to guidance. */
  footer: string;
  body: string;
}

/**
 * Wraps rendered blocks in the outer shell.
 *
 * The wordmark is set as styled text rather than an image on purpose: a
 * hosted logo is blocked by default in Gmail and Outlook until the reader
 * clicks "show images", so a text wordmark is the version most people actually
 * see. Swap in a hosted PNG here once one exists — never an SVG, which most
 * mail clients refuse outright.
 */
export function layout({
  locale,
  storeName,
  eyebrow,
  footer,
  body,
}: LayoutOptions): string {
  const dir = directionFor(locale);
  const font = locale === 'ur' ? URDU_FONT : FONT;
  const align = dir === 'rtl' ? 'right' : 'left';
  // Nastaliq descenders collide at normal leading, the same reason
  // globals.css sets 2.1 for [lang='ur'] on the storefront.
  const leading = locale === 'ur' ? '2.0' : '1.55';

  return `<!doctype html>
<html lang="${esc(locale)}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(storeName)}</title>
</head>
<body style="margin:0;padding:0;background:${palette.ground};">
<!-- Preheader text is what the inbox list shows after the subject. Hidden in
     the body itself, so it must be zero-height rather than display:none, which
     some clients ignore. -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${palette.ground};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:${palette.panel};border:1px solid ${palette.border};">
    <tr>
      <td dir="${dir}" align="${align}" style="padding:28px 28px 20px 28px;border-bottom:1px solid ${palette.border};">
        <span style="font-family:${font};font-size:26px;font-weight:600;letter-spacing:-0.01em;color:${palette.ink};">${esc(
          storeName,
        )}</span>${
          eyebrow
            ? // The leading space is load-bearing: padding separates these
              // visually, but the plain-text part is extracted from this
              // markup and would otherwise read "YaseenOrder number …".
              ` <span style="font-family:${FONT};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${palette.muted};padding:0 10px;">${esc(
                eyebrow,
              )}</span>`
            : ''
        }
      </td>
    </tr>
    <tr>
      <td dir="${dir}" align="${align}" style="padding:28px;font-family:${font};font-size:15px;line-height:${leading};color:${palette.body};">
${body}
      </td>
    </tr>
    <tr>
      <td dir="${dir}" align="${align}" style="padding:20px 28px 26px 28px;border-top:1px solid ${palette.border};font-family:${font};font-size:12px;line-height:1.7;color:${palette.muted};">
        ${esc(footer)}
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

export function heading(text: string, locale: Locale): string {
  const font = locale === 'ur' ? URDU_FONT : FONT;
  return `<h1 style="margin:0 0 12px 0;font-family:${font};font-size:21px;font-weight:600;color:${palette.ink};">${esc(
    text,
  )}</h1>`;
}

export function paragraph(text: string, locale: Locale): string {
  const font = locale === 'ur' ? URDU_FONT : FONT;
  const leading = locale === 'ur' ? '2.0' : '1.6';
  return `<p style="margin:0 0 14px 0;font-family:${font};font-size:15px;line-height:${leading};color:${palette.body};">${esc(
    text,
  )}</p>`;
}

/**
 * A call-to-action button.
 *
 * Built as a bordered table cell rather than a styled <a>, because Outlook
 * drops padding on inline anchors and the button collapses to bare text.
 */
export function button(label: string, url: string, locale: Locale): string {
  const href = escUrl(url);
  if (!href) return '';
  const font = locale === 'ur' ? URDU_FONT : FONT;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px 0;">
  <tr><td style="background:${palette.ink};" align="center">
    <a href="${href}" style="display:inline-block;padding:13px 26px;font-family:${font};font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;">${esc(
      label,
    )}</a>
  </td></tr>
</table>`;
}

export function divider(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${palette.border};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>`;
}

/**
 * The unsubscribe line every automated marketing send carries.
 *
 * Not built with paragraph(), which escapes its whole argument through
 * esc() — a raw `<a>` passed to it would render as visible `&lt;a&gt;`
 * markup instead of a link. Here the label and href are escaped
 * individually (escUrl on the href, esc() on the visible text) and the
 * anchor itself is real markup.
 */
export function footerLink(text: string, linkLabel: string, url: string, locale: Locale): string {
  const dir = directionFor(locale);
  const font = locale === 'ur' ? URDU_FONT : FONT;
  const href = escUrl(url);
  const link = href
    ? ` <a href="${href}" style="color:${palette.muted};text-decoration:underline;">${esc(
        linkLabel,
      )}</a>`
    : '';
  return `<p dir="${dir}" style="margin:16px 0 0 0;font-family:${font};font-size:12px;line-height:1.6;color:${palette.muted};">${esc(
    text,
  )}${link}</p>`;
}

export function sectionTitle(text: string, locale: Locale): string {
  const font = locale === 'ur' ? URDU_FONT : FONT;
  return `<p style="margin:24px 0 12px 0;font-family:${font};font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${palette.muted};">${esc(
    text,
  )}</p>`;
}

export interface LineItem {
  name: string;
  variantLabel?: string | null;
  imageUrl?: string | null;
  quantity: number;
  /** Preformatted money string. */
  amount: string;
  /** Optional second line, e.g. the stitching add-on. */
  note?: string | null;
}

/** The order summary table: thumbnail, name, quantity, line total. */
export function itemsTable(items: LineItem[], locale: Locale): string {
  const dir = directionFor(locale);
  const font = locale === 'ur' ? URDU_FONT : FONT;
  const start = dir === 'rtl' ? 'right' : 'left';
  const end = dir === 'rtl' ? 'left' : 'right';

  const rows = items
    .map((item) => {
      const image = escUrl(item.imageUrl);
      return `<tr>
  <td width="64" valign="top" style="padding:12px 0;">${
    image
      ? `<img src="${image}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;object-fit:cover;border:1px solid ${palette.border};">`
      : `<div style="width:56px;height:56px;background:${palette.ground};border:1px solid ${palette.border};"></div>`
  }</td>
  <td valign="top" align="${start}" style="padding:12px;font-family:${font};font-size:14px;line-height:1.5;color:${palette.ink};">
    ${esc(item.name)}${
      item.quantity > 1
        ? `<span style="color:${palette.muted};"> &times; ${esc(item.quantity)}</span>`
        : ''
    }
    ${
      item.variantLabel
        ? `<div style="font-size:13px;color:${palette.muted};padding-top:2px;">${esc(
            item.variantLabel,
          )}</div>`
        : ''
    }
    ${
      item.note
        ? `<div style="font-size:13px;color:${palette.muted};padding-top:2px;">${esc(
            item.note,
          )}</div>`
        : ''
    }
  </td>
  <td valign="top" align="${end}" style="padding:12px 0;font-family:${font};font-size:14px;white-space:nowrap;color:${palette.ink};">${esc(
    item.amount,
  )}</td>
</tr>
<tr><td colspan="3" style="border-top:1px solid ${palette.border};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>`;
    })
    .join('\n');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${dir}">
${rows}
</table>`;
}

export interface TotalRow {
  label: string;
  value: string;
  strong?: boolean;
}

export function totals(rows: TotalRow[], locale: Locale): string {
  const dir = directionFor(locale);
  const font = locale === 'ur' ? URDU_FONT : FONT;
  const start = dir === 'rtl' ? 'right' : 'left';
  const end = dir === 'rtl' ? 'left' : 'right';

  const body = rows
    .map(
      (row) => `<tr>
  <td align="${start}" style="padding:${row.strong ? '12px 0 4px 0' : '4px 0'};font-family:${font};font-size:${
    row.strong ? '16px' : '14px'
  };font-weight:${row.strong ? '600' : '400'};color:${
    row.strong ? palette.ink : palette.body
  };">${esc(row.label)}</td>
  <td align="${end}" style="padding:${row.strong ? '12px 0 4px 0' : '4px 0'};font-family:${font};font-size:${
    row.strong ? '16px' : '14px'
  };font-weight:${row.strong ? '600' : '400'};white-space:nowrap;color:${
    row.strong ? palette.ink : palette.body
  };">${esc(row.value)}</td>
</tr>`,
    )
    .join('\n');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${dir}" style="margin-top:14px;">
${body}
</table>`;
}

/** A bordered callout — bank transfer instructions, a pending-payment notice. */
export function panel(title: string, lines: string[], locale: Locale): string {
  const dir = directionFor(locale);
  const font = locale === 'ur' ? URDU_FONT : FONT;
  const align = dir === 'rtl' ? 'right' : 'left';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
<tr><td dir="${dir}" align="${align}" style="padding:16px 18px;background:${palette.ground};border:1px solid ${palette.border};font-family:${font};font-size:14px;line-height:1.7;color:${palette.body};">
  <strong style="color:${palette.ink};">${esc(title)}</strong><br>
  ${lines.map((line) => esc(line)).join('<br>')}
</td></tr>
</table>`;
}

/** Two stacked label/value blocks, for addresses and payment method. */
export function detailBlocks(
  blocks: Array<{ label: string; lines: string[] }>,
  locale: Locale,
): string {
  const dir = directionFor(locale);
  const font = locale === 'ur' ? URDU_FONT : FONT;
  const align = dir === 'rtl' ? 'right' : 'left';

  return blocks
    .filter((block) => block.lines.some((line) => line.trim().length > 0))
    .map(
      (block) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
<tr><td dir="${dir}" align="${align}" style="font-family:${font};font-size:13px;line-height:1.7;color:${palette.body};">
  <strong style="display:block;color:${palette.ink};font-size:13px;padding-bottom:3px;">${esc(
    block.label,
  )}</strong>
  ${block.lines
    .filter((line) => line.trim().length > 0)
    .map((line) => esc(line))
    .join('<br>')}
</td></tr>
</table>`,
    )
    .join('\n');
}

/**
 * Strips a rendered HTML document down to a plain-text alternative.
 *
 * Every message goes out as multipart/alternative. A text part is not
 * politeness: spam filters score HTML-only mail worse, and a self-hosted
 * server starting from no reputation cannot spare the points.
 */
export function htmlToText(html: string): string {
  return (
    html
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      // A cell break is a space, not a newline: the item name and its price
      // live in sibling cells and belong on one line.
      .replace(/<\/t[dh]>/gi, ' ')
      .replace(/<\/(p|tr|h1|h2|div|table)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&times;/g, 'x')
      .replace(/[ \t]+/g, ' ')
      .split('\n')
      .map((line) => line.trim())
      // Trim first, then collapse: the blank "lines" left by table markup are
      // full of whitespace, so collapsing before the trim leaves them behind.
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
