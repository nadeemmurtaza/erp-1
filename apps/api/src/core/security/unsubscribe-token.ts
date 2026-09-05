import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A deterministic, unforgeable per-user unsubscribe token: HMAC-SHA256 over
 * the user id, keyed on APP_ENCRYPTION_KEY.
 *
 * Deliberately not random and not stored anywhere: the same user always
 * gets the same token, so a marketing email sent months ago still carries a
 * working unsubscribe link, and there is no token table to store, expire or
 * clean up. Forging one without the key is infeasible; recomputing it is the
 * only way to check one, which is what isValidUnsubscribeToken does.
 */
export function unsubscribeToken(userId: string, key: string): string {
  return createHmac('sha256', key).update(userId).digest('base64url');
}

export function isValidUnsubscribeToken(userId: string, token: string, key: string): boolean {
  const expected = Buffer.from(unsubscribeToken(userId, key));
  const actual = Buffer.from(token);
  // Constant-time compare — a timing difference on a wrong-length token
  // would otherwise leak how many leading bytes happened to match.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
