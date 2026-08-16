/**
 * Pakistani phone-number normalisation.
 *
 * The CRM keys contacts on the normalised number, which is how a guest COD
 * order, a registered account and a walk-in lead collapse into one customer
 * record. Getting this wrong duplicates customers, so it is unit-tested.
 *
 * Canonical form is E.164: +92 followed by 10 digits, e.g. +923001234567.
 */

const PK_COUNTRY_CODE = '92';
/** Mobile network codes are 3xx; landline area codes are 21, 42, 51, … */
const PK_NATIONAL_LENGTH = 10;

export interface NormalizedPhone {
  /** E.164, e.g. "+923001234567". Null when the input is not a valid PK number. */
  e164: string | null;
  /** Local display form, e.g. "0300 1234567". */
  national: string | null;
  isMobile: boolean;
}

export function normalizePkPhone(input: string | null | undefined): NormalizedPhone {
  const invalid: NormalizedPhone = { e164: null, national: null, isMobile: false };
  if (!input) return invalid;

  // Strip everything that is not a digit; a leading + is handled by the
  // country-code checks below.
  let digits = input.replace(/\D/g, '');
  if (!digits) return invalid;

  // 0092… international prefix
  if (digits.startsWith('00' + PK_COUNTRY_CODE)) {
    digits = digits.slice(4);
  } else if (digits.startsWith(PK_COUNTRY_CODE) && digits.length > PK_NATIONAL_LENGTH) {
    // 92300…
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    // 0300…
    digits = digits.slice(1);
  }

  if (digits.length !== PK_NATIONAL_LENGTH) return invalid;
  // A national number never starts with 0 once the trunk prefix is removed.
  if (digits.startsWith('0')) return invalid;

  return {
    e164: `+${PK_COUNTRY_CODE}${digits}`,
    national: `0${digits.slice(0, 3)} ${digits.slice(3)}`,
    isMobile: digits.startsWith('3'),
  };
}

export function isValidPkPhone(input: string | null | undefined): boolean {
  return normalizePkPhone(input).e164 !== null;
}

/** Normalises an email for use as a dedup key: trimmed and lower-cased. */
export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  return trimmed.length > 0 && trimmed.includes('@') ? trimmed : null;
}
