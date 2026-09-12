import { BRAND } from './brand';

/**
 * Phone-number normalisation, for whichever country the brand is in.
 *
 * The CRM keys contacts on the normalised number, which is how a guest COD
 * order, a registered account and a walk-in lead collapse into one customer
 * record. Getting this wrong duplicates customers, so it is unit-tested.
 *
 * Canonical form is E.164: the dial code followed by the national number,
 * e.g. +923001234567.
 *
 * This used to hardcode `92` and a 10-digit national length, which made the
 * CRM's dedup key Pakistan-only — the one piece of the product that would
 * have silently mangled every contact for a client in Dubai or London rather
 * than failing loudly. The shape comes from BRAND.locale now.
 */

const { dialCode, nationalNumberLength, mobilePrefix } = BRAND.locale;

export interface NormalizedPhone {
  /** E.164, e.g. "+923001234567". Null when the input is not a valid number. */
  e164: string | null;
  /** Local display form, e.g. "0300 1234567". */
  national: string | null;
  isMobile: boolean;
}

export function normalizePhone(input: string | null | undefined): NormalizedPhone {
  const invalid: NormalizedPhone = { e164: null, national: null, isMobile: false };
  if (!input) return invalid;

  // Strip everything that is not a digit; a leading + is handled by the
  // dial-code checks below.
  let digits = input.replace(/\D/g, '');
  if (!digits) return invalid;

  if (digits.startsWith('00' + dialCode)) {
    // 0092… international prefix
    digits = digits.slice(2 + dialCode.length);
  } else if (digits.startsWith(dialCode) && digits.length > nationalNumberLength) {
    // 92300…
    digits = digits.slice(dialCode.length);
  } else if (digits.startsWith('0')) {
    // 0300… trunk prefix
    digits = digits.slice(1);
  }

  if (digits.length !== nationalNumberLength) return invalid;
  // A national number never starts with 0 once the trunk prefix is removed.
  if (digits.startsWith('0')) return invalid;

  return {
    e164: `+${dialCode}${digits}`,
    // Trunk prefix, then a break after the network/area code. Three digits is
    // right for PK (0300 1234567) and a sane default elsewhere; a country that
    // groups differently is a formatting concern, not a correctness one — the
    // e164 above is what anything stores or compares.
    national: `0${digits.slice(0, 3)} ${digits.slice(3)}`,
    isMobile: digits.startsWith(mobilePrefix),
  };
}

export function isValidPhone(input: string | null | undefined): boolean {
  return normalizePhone(input).e164 !== null;
}

/**
 * Previous names, kept so the 34 existing call sites are not churned in the
 * same change that made this country-agnostic. The `Pk` in them is now
 * inaccurate — prefer `normalizePhone` / `isValidPhone` in new code.
 */
export const normalizePkPhone = normalizePhone;
export const isValidPkPhone = isValidPhone;

/** Normalises an email for use as a dedup key: trimmed and lower-cased. */
export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  return trimmed.length > 0 && trimmed.includes('@') ? trimmed : null;
}
