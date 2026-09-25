import { BRAND } from './brand';
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
/**
 * The BCP 47 tag Intl should use for a locale.
 *
 * This was written out as `locale === 'ur' ? 'ur-PK' : 'en-PK'` at three call
 * sites — two date formatters and the money one — so a client outside
 * Pakistan meant finding all three. The tags come from BRAND.locale now.
 */
export function intlTag(locale: Locale): string {
  return BRAND.locale.intlTags[locale] ?? BRAND.locale.intlTags[DEFAULT_LOCALE];
}

export const CURRENCY = BRAND.locale.currency;
export const MINOR_UNITS_PER_MAJOR = BRAND.locale.minorUnitsPerMajor;

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
export const SHOP_TIME_ZONE = BRAND.locale.timeZone;

/** e.g. 2026-09-06T19:23Z -> "7 Sept 2026" in the shop's zone. */
export function formatDate(
  value: Date | string | number,
  locale: Locale = 'en',
  timeZone: string = SHOP_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat(intlTag(locale), {
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
  return new Intl.DateTimeFormat(intlTag(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value));
}

/**
 * A chart axis tick — "7 Sept". No year, because an axis has one.
 *
 * `withWeekday` adds it for a tooltip, where the reader is looking at one
 * point rather than scanning a row of them.
 */
export function formatDateShort(
  value: Date | string | number,
  locale: Locale = 'en',
  { withWeekday = false }: { withWeekday?: boolean } = {},
  timeZone: string = SHOP_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat(intlTag(locale), {
    day: 'numeric',
    month: 'short',
    ...(withWeekday ? { weekday: 'short' as const } : {}),
    timeZone,
  }).format(new Date(value));
}

/**
 * A plain count, grouped for the locale — 6017 -> "6,017".
 *
 * Not money and not a date, which is exactly why it kept being written by
 * hand: there was a formatter for the other two, so seven call sites reached
 * for `toLocaleString(intlTag('en'))` instead, each pinning English rather
 * than the reader's locale. Visitor counts, funnel stages and traffic rows
 * all rendered with Latin digits for an Urdu reader because of it.
 */
export function formatNumber(value: number, locale: Locale = 'en'): string {
  return new Intl.NumberFormat(intlTag(locale)).format(value);
}

/** Formats integer paisa as a display string, e.g. 349900 -> "Rs 3,499". */
export function formatMoney(minorAmount: number, locale: Locale = 'en'): string {
  const formatter = new Intl.NumberFormat(intlTag(locale), {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 0,
    maximumFractionDigits: minorAmount % MINOR_UNITS_PER_MAJOR === 0 ? 0 : 2,
  });
  return formatter.format(toMajor(minorAmount));
}

/**
 * The row cap every CSV importer enforces
 * (admin-platform/72-fragmented-tool-consolidation-import.md WO-72.3) —
 * one shared number, never three independently-chosen ones. Matches
 * `ProductImportService`'s own pre-existing cap; `ContactImportService`
 * and `ExpenseImportService` (`crm`/`finance`) import this rather than
 * restating it. A file above the cap is rejected up front, before any row
 * is processed, never silently truncated.
 */
export const IMPORT_ROW_CAP = 5000;
