import { createHash, randomBytes } from 'node:crypto';

/**
 * The `AGENCY_API_KEY` credential doc 14 describes — generated once by
 * `scripts/sync-client.mjs` (the Extractor, doc 12) for an agency-managed
 * client's own `.env`, never regenerated here. This file only hashes what
 * the Extractor already produced (`crypto.randomBytes(32).toString('hex')`,
 * see that script's own key-generation line) and, for `rotate()`, generates
 * a replacement in the identical shape so a rotated key looks exactly like
 * an originally-issued one to the client's `managed-services` module.
 *
 * Same shape as `ops-key.ts`'s `hashOpsKey` (a salted SHA-256, kept local
 * rather than promoted to `@newax/shared` for the identical reason that
 * file states: no real correctness subtlety two independent
 * implementations could drift on) — deliberately a DIFFERENT pepper
 * (`PLATFORM_AGENCY_KEY_PEPPER`, not `PLATFORM_OPS_KEY_PEPPER`), because
 * this hashes a different credential type with a different blast radius:
 * a whole separate client deployment authenticating, not internal ops
 * tooling.
 */
export function generateAgencyApiKey(): string {
  return randomBytes(32).toString('hex');
}

export function hashAgencyApiKey(key: string, pepper: string): string {
  return createHash('sha256').update(pepper).update(key).digest('hex');
}
