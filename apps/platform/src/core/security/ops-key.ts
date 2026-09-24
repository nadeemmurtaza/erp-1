import { createHash, randomBytes } from 'node:crypto';

/**
 * A bearer credential for internal hosting-ops tooling calling the control
 * plane — same shape as apps/api's `api-token.ts` (high-entropy random
 * token, shown once, verified by recomputing its hash). Kept local to this
 * app rather than moved to `@newax/shared`: unlike AES-GCM secret storage
 * (which genuinely risks drift between two independent implementations),
 * a salted SHA-256 hash has no such risk — both sides only ever need to
 * agree on "sha256(pepper + token)", which is unambiguous, so duplicating
 * six lines here is cheaper than widening a shared package's surface for
 * a rule with no real correctness subtlety to protect.
 */
export function generateOpsKey(): string {
  return `pfops_${randomBytes(32).toString('base64url')}`;
}

export function hashOpsKey(key: string, pepper: string): string {
  return createHash('sha256').update(pepper).update(key).digest('hex');
}
