import { Global, Module } from '@nestjs/common';
import { MetricRegistryService } from './metric-registry.service';

/**
 * The dashboard card extension point (10-admin-dashboard.md D2, WO-A.3).
 * Global, like every other core module (`extension-points.module.ts`), so
 * any feature module injects `MetricRegistryService` directly and registers
 * its own providers from `onModuleInit()` without importing this module.
 * `SettingsService` is reached the same way — it is global too, wired once
 * in `core.module.ts` — so this module does not import `SettingsModule`.
 */
@Global()
@Module({
  providers: [MetricRegistryService],
  exports: [MetricRegistryService],
})
export class MetricsModule {}
