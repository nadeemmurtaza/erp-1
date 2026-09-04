import { DEFAULT_LOCALE, LOCALES } from '@yaseen/shared';
import { SITE_URL } from './site';

/**
 * Every locale variant of a storefront path (no locale prefix, e.g. `/shop`
 * or `/product/lawn-suit`), keyed by locale plus `x-default` — the shape
 * both `next`'s `alternates.languages` metadata field and a sitemap entry's
 * `alternates.languages` expect.
 */
export function alternateLanguages(path: string): Record<string, string> {
  const languages = Object.fromEntries(
    LOCALES.map((locale) => [locale, `${SITE_URL}/${locale}${path}`]),
  );
  return { ...languages, 'x-default': `${SITE_URL}/${DEFAULT_LOCALE}${path}` };
}

/** The canonical URL for one locale's rendering of a storefront path. */
export function canonicalUrl(path: string, locale: string): string {
  return `${SITE_URL}/${locale}${path}`;
}

/**
 * Qualifies a possibly root-relative URL against the site's own origin.
 * Product photos can be root-relative (bundled placeholder art under
 * `public/`) or already-absolute (uploaded images served from the API/S3) —
 * JSON-LD readers expect a fully-qualified URL either way.
 */
export function absoluteUrl(url: string): string {
  return url.startsWith('/') ? `${SITE_URL}${url}` : url;
}
