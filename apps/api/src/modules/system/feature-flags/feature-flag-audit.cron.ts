import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FeatureFlagsAdminService } from './feature-flags-admin.service';

/**
 * resilience-scalability/37-scalability-future-upgrades.md (WO-37.3) — the
 * flag lifecycle audit. Every flag older than 90 days with no stated
 * `removalCriteria` is a de-risking tool nobody has committed to removing —
 * "exactly the kind of speculative complexity CLAUDE.md already warns
 * against, just wearing a flag's clothes" (doc 37's own words).
 *
 * This never invents its own audience-resolution mechanism (doc 37's own
 * scope-lens text marks "Audience is a capability, not an address" n/a for
 * this document) — it logs a structured warning, the same observability
 * discipline `services.md` already requires ("a log should answer: what
 * happened, when... what was the result"), and the real surface a
 * `platform.flags.manage` holder reads is the live `GET
 * /admin/feature-flags/audit` screen (`FeatureFlagsAdminController`),
 * queried fresh on every page load rather than off this cron's own output
 * — so the two can never drift out of sync with each other.
 */
@Injectable()
export class FeatureFlagAuditCron {
  private readonly logger = new Logger(FeatureFlagAuditCron.name);

  constructor(private readonly featureFlagsAdmin: FeatureFlagsAdminService) {}

  @Cron('0 3 * * *')
  async auditStaleFlags(): Promise<void> {
    try {
      const stale = await this.featureFlagsAdmin.listStale();
      if (stale.length === 0) return;

      this.logger.warn(
        `${stale.length} feature flag(s) older than 90 days have no stated removal criteria: ${stale
          .map((flag) => flag.key)
          .join(', ')}. Review at /admin/feature-flags (platform.flags.manage).`,
      );
    } catch (error) {
      this.logger.error('auditStaleFlags failed', error instanceof Error ? error.stack : String(error));
    }
  }
}
