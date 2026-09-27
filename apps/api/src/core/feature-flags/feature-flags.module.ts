import { Global, Module } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';

/**
 * resilience-scalability/37-scalability-future-upgrades.md (WO-37.2).
 * Global, like `SettingsModule`, so any module injects `FeatureFlagsService`
 * without importing it — the admin CRUD surface lives separately in
 * `apps/api/src/modules/feature-flags/` (the same split `core/settings`
 * vs. `modules/settings` already establishes).
 */
@Global()
@Module({
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
