/**
 * SKU generation (WO-3.3, docs/implementation/03-variants-sku-seo.md). A pure
 * function so the admin editor can preview a SKU live, in the browser,
 * without a round trip — the API calls the same function server-side before
 * it ever writes a row.
 *
 * The default template is `{CAT}-{PRODUCT}-{OPT}-{SEQ}`. `{SEQ}` renders as
 * nothing until a collision forces it in — the store's SKUs stay short in
 * the common case, and only grow a numeric tail where they must.
 */
export interface SkuTemplateInput {
  template: string;
  categoryCode?: string | null;
  productCode?: string | null;
  /** Option value keys, in option order, e.g. ["M", "BLU"]. */
  optionValueKeys?: string[];
}

const TOKEN_PATTERN = /\{CAT\}|\{PRODUCT\}|\{OPT\}|\{SEQ\}/g;

function renderTemplate(input: SkuTemplateInput, seq: number): string {
  const parts = input.template.match(TOKEN_PATTERN) ?? [];
  if (parts.length === 0) {
    // A template with no recognised token is used verbatim, {SEQ} aside.
    return input.template;
  }

  const rendered = input.template.replace(TOKEN_PATTERN, (token) => {
    switch (token) {
      case '{CAT}':
        return (input.categoryCode ?? '').trim().toUpperCase();
      case '{PRODUCT}':
        return (input.productCode ?? '').trim().toUpperCase();
      case '{OPT}':
        return (input.optionValueKeys ?? [])
          .map((key) => key.trim().toUpperCase())
          .filter(Boolean)
          .join('-');
      case '{SEQ}':
        return seq > 0 ? String(seq).padStart(2, '0') : '';
      default:
        return '';
    }
  });

  // An empty segment (no category code, no options yet) leaves a run of
  // separators or a leading/trailing one — collapse and trim them so the
  // preview reads "3PC-M-BLU", not "-3PC--M-BLU-".
  return rendered
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Renders a SKU from the template, appending a zero-padded `{SEQ}` only when
 * the un-numbered version collides with one already `taken`. Comparison is
 * case-insensitive, matching the unique constraint on `ProductVariant.sku`.
 */
export function generateSku(input: SkuTemplateInput, taken: Iterable<string> = []): string {
  const used = new Set(Array.from(taken, (sku) => sku.trim().toUpperCase()));

  const base = renderTemplate(input, 0);
  if (!used.has(base)) return base;

  let seq = 2;
  let candidate = renderTemplate(input, seq);
  // If the template has no {SEQ} token at all, appending a number cannot
  // help — fall back to a plain numeric suffix rather than looping forever.
  if (candidate === base) {
    while (used.has(`${base}-${seq}`)) seq += 1;
    return `${base}-${seq}`;
  }

  while (used.has(candidate)) {
    seq += 1;
    candidate = renderTemplate(input, seq);
  }
  return candidate;
}
