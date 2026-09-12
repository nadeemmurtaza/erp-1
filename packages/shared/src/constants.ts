/** Locales the storefront ships in. Admin is English-only by design. */
export const LOCALES = ['en', 'ur'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Urdu is right-to-left; everything else is left-to-right. */
export const RTL_LOCALES: readonly Locale[] = ['ur'];

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function directionFor(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}

/**
 * Picks the row for a locale out of a bilingual translations array, falling
 * back to the default locale and then to whatever row exists — used
 * everywhere a record (product, category, garment type…) carries a
 * `translations: { locale }[]` shape and needs flattening to one language.
 */
export function pickTranslation<T extends { locale: string }>(
  translations: T[],
  locale: string,
): T | undefined {
  return (
    translations.find((row) => row.locale === locale) ??
    translations.find((row) => row.locale === DEFAULT_LOCALE) ??
    translations[0]
  );
}

/**
 * Money is stored and transported as integer paisa (1 PKR = 100 paisa) so that
 * no rounding error can ever creep into an order total.
 */
export const CURRENCY = 'PKR';
export const MINOR_UNITS_PER_MAJOR = 100;

export function toMinor(majorAmount: number): number {
  return Math.round(majorAmount * MINOR_UNITS_PER_MAJOR);
}

export function toMajor(minorAmount: number): number {
  return minorAmount / MINOR_UNITS_PER_MAJOR;
}

/**
 * The shop's wall clock.
 *
 * Every date the customer or the shop reads is a date in Karachi: an order
 * placed at 00:30 on the 6th belongs to the 6th, whatever timezone the browser
 * happens to sit in. Formatting without pinning this means a customer abroad
 * reads a different date than the shop does for the same order, and a report
 * row stops matching the order detail page it came from.
 *
 * The API resolves calendar days from the `store.timezone` Setting, which is
 * the authority (House Rule 4). This constant is the display-side default and
 * must stay in step with it; pass `timeZone` explicitly anywhere the Setting
 * has actually been read.
 */
export const SHOP_TIME_ZONE = 'Asia/Karachi';

/** e.g. 2026-09-06T19:23Z -> "7 Sept 2026" in the shop's zone. */
export function formatDate(
  value: Date | string | number,
  locale: Locale = 'en',
  timeZone: string = SHOP_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat(locale === 'ur' ? 'ur-PK' : 'en-PK', {
    dateStyle: 'medium',
    timeZone,
  }).format(new Date(value));
}

/** e.g. 2026-09-06T19:23Z -> "7 Sept 2026, 12:23 am" in the shop's zone. */
export function formatDateTime(
  value: Date | string | number,
  locale: Locale = 'en',
  timeZone: string = SHOP_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat(locale === 'ur' ? 'ur-PK' : 'en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value));
}

/** Formats integer paisa as a display string, e.g. 349900 -> "Rs 3,499". */
export function formatMoney(minorAmount: number, locale: Locale = 'en'): string {
  const formatter = new Intl.NumberFormat(locale === 'ur' ? 'ur-PK' : 'en-PK', {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 0,
    maximumFractionDigits: minorAmount % MINOR_UNITS_PER_MAJOR === 0 ? 0 : 2,
  });
  return formatter.format(toMajor(minorAmount));
}
