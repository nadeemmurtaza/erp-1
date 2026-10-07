import { LOCALES } from '@newax/shared';

/**
 * WO-3.7's publish gate (03-variants-sku-seo.md) — a pure function so it can
 * be dry-run against every product for the SEO health list, and unit tested,
 * without touching a database. The caller (product-admin.service.ts) decides
 * whether a failure blocks the save (transitioning INTO ACTIVE) or only
 * warns (an already-ACTIVE product being edited — grandfathered, per the
 * doc's own instruction never to deactivate a product retroactively).
 */
export interface PublishGateImage {
  isPrimary: boolean;
  /** Alt text already resolved per locale (translations, falling back to the legacy column). */
  altByLocale: Record<string, string | null>;
}

export interface PublishGateVariant {
  isActive: boolean;
  sku: string;
  price: number;
  costPrice: number;
}

export interface PublishGateTranslation {
  locale: string;
  metaTitle: string | null;
  metaDescription: string | null;
}

export interface PublishGateInput {
  translations: PublishGateTranslation[];
  images: PublishGateImage[];
  variants: PublishGateVariant[];
}

export interface PublishGateResult {
  passed: boolean;
  failures: string[];
}

export function checkPublishGate(input: PublishGateInput): PublishGateResult {
  const failures: string[] = [];

  if (input.images.length === 0) {
    failures.push('No images uploaded.');
  } else {
    const missingAlt = input.images.some((image) =>
      LOCALES.some((locale) => !image.altByLocale[locale]?.trim()),
    );
    if (missingAlt) {
      failures.push(`Every image needs alt text in both ${LOCALES.join(' and ')}.`);
    }
    if (!input.images.some((image) => image.isPrimary)) {
      failures.push('No primary image is set.');
    }
  }

  for (const locale of LOCALES) {
    const translation = input.translations.find((row) => row.locale === locale);
    if (!translation) {
      failures.push(`No ${locale.toUpperCase()} content exists yet.`);
      continue;
    }
    if (!translation.metaTitle?.trim() || !translation.metaDescription?.trim()) {
      failures.push(`Meta title and description are required in ${locale.toUpperCase()}.`);
    }
  }

  const activeVariants = input.variants.filter((variant) => variant.isActive);
  const sellable = activeVariants.find((variant) => variant.sku.trim() && variant.price > 0);
  if (!sellable) {
    failures.push('At least one active variant needs a SKU and a price.');
  }

  const noCost = activeVariants.filter((variant) => variant.costPrice <= 0);
  if (noCost.length > 0) {
    failures.push(
      `${noCost.length} active variant(s) have no cost price — without it, this product's profit reporting will be wrong.`,
    );
  }

  return { passed: failures.length === 0, failures };
}
