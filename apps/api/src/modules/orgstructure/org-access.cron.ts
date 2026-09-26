import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GrantService } from './org-unit-grant.service';

/**
 * access-control-identity/21-access-over-the-org-tree.md — "expired rows are
 * swept nightly" (the doc's own "hundred-thousandth row" scope lens). One
 * cron per module, the same idiom every other module's own nightly sweep
 * already uses (purchasing.cron.ts, cod-risk.cron.ts, dunning.cron.ts).
 */
@Injectable()
export class OrgAccessCron {
  private readonly logger = new Logger(OrgAccessCron.name);

  constructor(private readonly grants: GrantService) {}

  @Cron('0 4 * * *')
  async sweep(): Promise<void> {
    const count = await this.grants.sweepExpired();
    if (count > 0) {
      this.logger.log(`Marked ${count} expired org-unit grant(s) as revoked.`);
    }
  }
}
