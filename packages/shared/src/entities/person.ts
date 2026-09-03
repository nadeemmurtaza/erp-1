import { normalizeEmail, normalizePkPhone } from '../phone';

/**
 * The two "person" records in this system: a registered User and a CRM
 * Contact (guest, lead, or walk-in — collapsed onto one record per
 * crm.prisma's own dedup rule). Structurally typed on purpose — pass a
 * Prisma row, an API response DTO, or a partial object from a form; nothing
 * here imports Prisma or does I/O (packages/shared runs in the browser and
 * in React Native, neither of which can open a database connection).
 */
export interface PersonLike {
  /** User shape. */
  firstName?: string | null;
  lastName?: string | null;
  /** Contact shape — one combined name field instead of first/last. */
  name?: string | null;
  email?: string | null;
  /** User.phone is already E.164; Contact.phoneE164 is named to say so. */
  phone?: string | null;
  phoneE164?: string | null;
  /** Free text, never a fixed set — see the schema comment on User.gender. */
  gender?: string | null;
  dateOfBirth?: string | Date | null;
  avatarUrl?: string | null;
}

/** "Ayesha Khan" from firstName/lastName, or Contact's single `name` field. */
export function getPersonFullName(person: PersonLike): string | null {
  const joined = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
  if (joined) return joined;
  const name = person.name?.trim();
  return name || null;
}

/** "AK" from "Ayesha Khan" — the first letter of up to the first two words. */
export function getPersonInitials(person: PersonLike): string | null {
  const fullName = getPersonFullName(person);
  if (!fullName) return null;
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
  return initials || null;
}

/** A name if there is one, otherwise the best identifying contact detail. */
export function getPersonDisplayLabel(person: PersonLike): string {
  const fullName = getPersonFullName(person);
  if (fullName) return fullName;
  const phone = getPersonFormattedPhone(person);
  if (phone) return phone;
  const email = getPersonEmail(person);
  if (email) return email;
  return 'Unnamed';
}

/** Normalised email, or null when absent/malformed. */
export function getPersonEmail(person: PersonLike): string | null {
  return normalizeEmail(person.email);
}

/** Local display form, e.g. "0300 1234567", from whichever phone field is set. */
export function getPersonFormattedPhone(person: PersonLike): string | null {
  return normalizePkPhone(person.phone ?? person.phoneE164).national;
}

/** E.164 form, e.g. "+923001234567", from whichever phone field is set. */
export function getPersonE164Phone(person: PersonLike): string | null {
  return normalizePkPhone(person.phone ?? person.phoneE164).e164;
}

/** Free text, title-cased for display — "male" -> "Male". Never validated or coerced into a fixed set. */
export function getPersonGenderLabel(person: PersonLike): string | null {
  const gender = person.gender?.trim();
  if (!gender) return null;
  return gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();
}

/** Whole years old as of `asOf` (default: now), or null with no date of birth. */
export function getPersonAge(person: PersonLike, asOf: Date = new Date()): number | null {
  if (!person.dateOfBirth) return null;
  const dob = new Date(person.dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  let age = asOf.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    asOf.getMonth() > dob.getMonth() ||
    (asOf.getMonth() === dob.getMonth() && asOf.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

/** The uploaded avatar, or null — callers render initials (getPersonInitials) as the fallback, not a fabricated placeholder image. */
export function getPersonAvatarUrl(person: PersonLike): string | null {
  return person.avatarUrl?.trim() || null;
}
