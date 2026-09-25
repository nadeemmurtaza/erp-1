import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * doc 14's own security note: "Rate-limit the X-Agency-Api-Key endpoints
 * per key — this is the one surface where a whole separate deployment
 * authenticates rather than a person, and it is reachable from the public
 * internet." The global `ThrottlerGuard` (`app.module.ts`) already limits
 * every route by IP; this LOCAL guard, applied only to
 * `AgencyReportingController`, additionally limits by the presented key
 * itself — so one client's deployment sharing an outbound IP with another
 * (a shared hosting box, a NAT) can never exhaust the other's quota, and a
 * key-guessing sweep from many IPs is still bounded per key it happens to
 * hit. Tracks the RAW header value (never the DB-resolved tenant), so
 * throttling happens before, and independent of, the hash lookup
 * `AgencyApiKeyGuard` performs — an invalid key is throttled exactly like
 * a valid one, not exempted.
 */
@Injectable()
export class AgencyKeyThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = req.headers as Record<string, string | string[] | undefined> | undefined;
    const header = headers?.['x-agency-api-key'];
    const key = Array.isArray(header) ? header[0] : header;
    return key ? `agency-key:${key}` : `agency-key:unknown:${(req as { ip?: string }).ip ?? 'unknown'}`;
  }
}
