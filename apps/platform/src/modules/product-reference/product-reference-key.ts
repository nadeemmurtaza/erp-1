import { createHash, randomBytes } from 'node:crypto';

/**
 * The `MarketplacePublisherCredential.apiKeyHash` credential docs 165/166
 * describe. Identical shape to `agency-key.ts`'s own
 * `generateAgencyApiKey`/`hashAgencyApiKey` (a salted SHA-256, kept local
 * rather than promoted to `@newax/shared` for the same reason that file
 * states: no real correctness subtlety two independent implementations
 * could drift on) — deliberately a DIFFERENT pepper
 * (`PLATFORM_MARKETPLACE_KEY_PEPPER`, not `PLATFORM_AGENCY_KEY_PEPPER`),
 * because this hashes a different credential type with a different blast
 * radius: any tenant opting into the cross-tenant marketplace/product-
 * reference network, not an agency-managed client's own dashboard access.
 */
export function generateMarketplaceApiKey(): string {
  return randomBytes(32).toString('hex');
}

export function hashMarketplaceApiKey(key: string, pepper: string): string {
  return createHash('sha256').update(pepper).update(key).digest('hex');
}
