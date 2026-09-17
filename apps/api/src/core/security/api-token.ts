import { createHash, randomBytes } from 'node:crypto';

/**
 * A bearer credential for machine-to-machine calls (the trading-partner
 * inbound API, 18-trading-partner-network.md WO-18.2): a high-entropy random
 * token, shown to the operator exactly once at issue/rotate time, verified
 * by recomputing its SHA-256 and looking it up — the raw token itself is
 * never persisted, only its hash, the same shape as PasswordResetToken.
 */
export function generateApiKey(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
