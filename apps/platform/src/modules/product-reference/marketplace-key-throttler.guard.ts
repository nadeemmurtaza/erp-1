import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Same rationale as `AgencyKeyThrottlerGuard`: the global `ThrottlerGuard`
 * (`app.module.ts`) already limits every route by IP; this local guard
 * additionally limits by the presented key itself, so one tenant sharing
 * an outbound IP with another can never exhaust the other's quota, and a
 * key-guessing sweep from many IPs is still bounded per key it happens to
 * hit. Tracks the RAW header value, never the DB-resolved tenant, so
 * throttling happens before, and independent of, the hash lookup
 * `MarketplaceCredentialGuard` performs.
 */
@Injectable()
export class MarketplaceKeyThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = req.headers as Record<string, string | string[] | undefined> | undefined;
    const header = headers?.['x-marketplace-api-key'];
    const key = Array.isArray(header) ? header[0] : header;
    return key ? `marketplace-key:${key}` : `marketplace-key:unknown:${(req as { ip?: string }).ip ?? 'unknown'}`;
  }
}
