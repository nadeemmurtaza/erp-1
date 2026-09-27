import { Module } from '@nestjs/common';
import { FeatureFlagAuditCron } from './feature-flag-audit.cron';
import { FeatureFlagsAdminController } from './feature-flags-admin.controller';
import { FeatureFlagsAdminService } from './feature-flags-admin.service';

/**
 * resilience-scalability/37-scalability-future-upgrades.md. The admin CRUD
 * surface over `FeatureFlag` — `FeatureFlagsService.isEnabled()` itself
 * lives in `core/feature-flags` (global, injectable everywhere), the same
 * split `core/settings` vs. `modules/settings` already establishes.
 */
@Module({
  controllers: [FeatureFlagsAdminController],
  providers: [FeatureFlagsAdminService, FeatureFlagAuditCron],
})
export class FeatureFlagsAdminModule {}
