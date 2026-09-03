import { formatMoney, type Locale } from '../constants';

/**
 * Product/variant/category getters. Structurally typed — see the note in
 * person.ts. Each function takes only the fields it actually reads
 * (matching pricing.ts's convention of narrow, function-specific input
 * types — and order.ts's, for the same reason: a caller with a narrow
 * Prisma `select` should never have to over-select just to satisfy a type
 * the function doesn't need). Money in, money-formatted-string out follows
 * the same paisa discipline as pricing.ts (House Rule 5): every raw amount
 * here is an integer, and formatMoney() is the only place a display string
 * gets built.
 */

export interface TranslationLike {
  locale: string;
  name: string;
  description?: string | null;
}

export interface ProductImageLike {
  url: string;
  alt?: string | null;
  isPrimary?: boolean;
  order?: number;
}

/** Translated name for `locale`, falling back to the default locale, then any translation, then null. */
export function getProductName(product: { translations?: TranslationLike[] }, locale: string = 'en'): string | null {
  const translations = product.translations ?? [];
  return (
    translations.find((t) => t.locale === locale)?.name ??
    translations.find((t) => t.locale === 'en')?.name ??
    translations[0]?.name ??
    null
  );
}

export function getProductDescription(
  product: { translations?: TranslationLike[] },
  locale: string = 'en',
): string | null {
  const translations = product.translations ?? [];
  return (
    translations.find((t) => t.locale === locale)?.description ??
    translations.find((t) => t.locale === 'en')?.description ??
    translations[0]?.description ??
    null
  );
}

/** The image to show in a list or thumbnail: the flagged primary, or the lowest `order`. */
export function getProductPrimaryImage(product: { images?: ProductImageLike[] }): ProductImageLike | null {
  const images = product.images ?? [];
  if (images.length === 0) return null;
  return images.find((image) => image.isPrimary) ?? [...images].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]!;
}

/**
 * "Medium / Ferozi" — the variant's own label if the option-model backfill
 * has run (B2), otherwise built from the legacy size/color columns the
 * exact same way orders.service.ts already does for OrderItem.variantLabel.
 * Safe to call before or after WO-3.2's reader switch.
 */
export function getVariantDisplayLabel(variant: {
  size?: string | null;
  color?: string | null;
  /** Denormalised display string from the option model (B2, WO-3.1). */
  label?: string | null;
}): string | null {
  if (variant.label) return variant.label;
  return [variant.size, variant.color].filter(Boolean).join(' / ') || null;
}

/** The price actually charged for this variant, in paisa: its override, or the product's base price. */
export function getVariantEffectivePrice(
  product: { basePrice: number },
  variant: { priceOverride?: number | null },
): number {
  return variant.priceOverride ?? product.basePrice;
}

/** getVariantEffectivePrice(), formatted — e.g. "Rs 3,499". */
export function getVariantDisplayPrice(
  product: { basePrice: number },
  variant: { priceOverride?: number | null },
  locale: Locale = 'en',
): string {
  return formatMoney(getVariantEffectivePrice(product, variant), locale);
}

/** Percentage off compareAtPrice, rounded down — null when there is nothing to compare against. */
export function getProductDiscountPercent(product: { basePrice: number; compareAtPrice?: number | null }): number | null {
  if (!product.compareAtPrice || product.compareAtPrice <= product.basePrice) return null;
  return Math.floor(((product.compareAtPrice - product.basePrice) / product.compareAtPrice) * 100);
}

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export function getVariantStockStatus(variant: { stock: number; lowStockThreshold: number }): StockStatus {
  if (variant.stock <= 0) return 'OUT_OF_STOCK';
  if (variant.stock <= variant.lowStockThreshold) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export function getVariantIsInStock(variant: { stock: number }): boolean {
  return variant.stock > 0;
}

export function getCategoryName(category: { translations?: TranslationLike[] }, locale: string = 'en'): string | null {
  const translations = category.translations ?? [];
  return (
    translations.find((t) => t.locale === locale)?.name ??
    translations.find((t) => t.locale === 'en')?.name ??
    translations[0]?.name ??
    null
  );
}
