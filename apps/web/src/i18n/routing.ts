import { defineRouting } from 'next-intl/routing';
import { DEFAULT_LOCALE, LOCALES } from '@yaseen/shared';

/**
 * Locale routing for the storefront: /en/... and /ur/....
 *
 * `localePrefix: 'always'` keeps both languages on explicit URLs, which matters
 * for a shop — an Urdu product page has to be shareable and indexable in its own
 * right rather than depending on a cookie.
 *
 * The admin back office lives outside this at /admin and is English only.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
});
