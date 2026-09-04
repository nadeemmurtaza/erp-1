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
