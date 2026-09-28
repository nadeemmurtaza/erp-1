import { createHash } from 'node:crypto';
import { normalizeEmail, normalizePhone } from '@newax/shared';

/**
 * A sign-in identifier as the rate limiter and the audit trail see it: the
 * normalised form, hashed (206-rate-limiting-caching-compression-hardening.md
 * §1.2 — `sha256(normalizeIdentifier(dto.identifier))`). The plaintext never
 * becomes a Redis key or an audit row.
 *
 * Normalisation is AuthService.login()'s own: an email is trimmed and
 * lower-cased, a phone number becomes E.164, so "Ayesha@Example.com " and
 * "ayesha@example.com", or "0300 1234567" and "+923001234567", share one
 * bucket. Anything that is neither is trimmed and lower-cased as-is — it can
 * never sign in, but it is still counted, so garbage cannot skip the limit.
 *
 * Deliberately keyed by the identifier typed, not by the account it resolves
 * to. An account with both an email and a phone therefore has two buckets
 * (at worst 2 × 5 guesses up front and 2 × 12 an hour after), and that is the
 * price of not answering a question: were both identifiers to share the
 * account's bucket, draining it through the email and then trying a phone
 * number would reveal whether that number belongs to the same account.
 */
export function normalizeLoginIdentifier(identifier: string): string {
  return normalizeEmail(identifier) ?? normalizePhone(identifier).e164 ?? identifier.trim().toLowerCase();
}

/** Hex SHA-256 of an already-normalised identifier. */
export function hashLoginIdentifier(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex');
}

/** normalizeLoginIdentifier then hashLoginIdentifier; null for anything that is not a string (an unvalidated body). */
export function loginIdentifierHash(identifier: unknown): string | null {
  return typeof identifier === 'string' && identifier.trim().length > 0
    ? hashLoginIdentifier(normalizeLoginIdentifier(identifier))
    : null;
}
