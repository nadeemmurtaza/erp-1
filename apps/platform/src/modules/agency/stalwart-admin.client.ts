import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../core/config/app-config.service';

/**
 * WO-14.2's Stalwart leg. **No client code for Stalwart's admin API existed
 * anywhere in this repository before this file** — `docs/email.md` documents
 * only mail-server SETUP (SMTP/DKIM/mailbox creation through Stalwart's
 * admin UI by hand), never a programmatic integration, and this sandbox's
 * outbound network access has no route to Stalwart's own docs to confirm
 * the exact reporting path against a live instance. This client is
 * therefore deliberately narrow and honestly degrading rather than a
 * confident wrapper: ONE method, ONE GET, and any failure — network,
 * shape, auth — is caught, logged, and returned as `null` rather than
 * thrown, so a Stalwart outage or an endpoint-path mismatch never fails
 * the `databaseBytes` half of a nightly snapshot (see
 * `AgencyUsageSnapshot.emailsSent30d`'s own doc comment). The exact path
 * below (`/api/reports/outgoing-count`) is this integration's own stated
 * assumption about Stalwart's management API shape and MUST be confirmed
 * against the deployed instance's own `/api` surface before this number is
 * relied on operationally — tracked here rather than silently assumed
 * correct.
 */
@Injectable()
export class StalwartAdminClient {
  private readonly logger = new Logger(StalwartAdminClient.name);

  constructor(private readonly config: AppConfigService) {}

  /** 30-day sent-message count for one mail domain, or `null` when
   *  Stalwart is unconfigured, unreachable, or returns something this
   *  client cannot parse — never thrown, per this file's own header. */
  async getSentCount30d(mailDomain: string): Promise<number | null> {
    const baseUrl = this.config.get('PLATFORM_STALWART_API_URL');
    const apiKey = this.config.get('PLATFORM_STALWART_API_KEY');
    if (!baseUrl || !apiKey) return null;

    try {
      const response = await fetch(
        `${baseUrl}/api/reports/outgoing-count?domain=${encodeURIComponent(mailDomain)}&days=30`,
        { headers: { authorization: `Bearer ${apiKey}` } },
      );
      if (!response.ok) {
        this.logger.warn(`Stalwart reporting request for ${mailDomain} returned ${response.status}`);
        return null;
      }
      const body = (await response.json()) as { count?: unknown };
      return typeof body.count === 'number' ? body.count : null;
    } catch (error) {
      this.logger.warn(`Stalwart reporting request for ${mailDomain} failed — ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}
