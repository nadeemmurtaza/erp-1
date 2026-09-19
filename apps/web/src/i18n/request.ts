import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';
import { BRAND } from '@newax/shared';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Without this next-intl throws ENVIRONMENT_FALLBACK in production: with no
    // timeZone it falls back to the server's, which is not necessarily the
    // shop's, and any date rendered on the server would then disagree with the
    // same date rendered in the browser — a hydration mismatch that only shows
    // up once deployed. Matches the API's `store.timezone` default, so an order
    // placed at 11pm reads as the same day on both sides.
    timeZone: BRAND.locale.timeZone,
  };
});
