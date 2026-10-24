import { FEATURE_MODULES } from '../../modules/modules.registry';
import type { AppConfigService } from './app-config.service';

/**
 * The feature modules this deployment has switched on: every `alwaysOn` entry
 * plus whatever the `MODULES` allowlist names. The one definition `GET /meta`
 * and the launchpad both read, so "is this module on?" cannot be answered two
 * ways.
 */
export function enabledFeatureModules(config: Pick<AppConfigService, 'isModuleEnabled'>): string[] {
  return FEATURE_MODULES.filter((entry) => entry.alwaysOn || config.isModuleEnabled(entry.name)).map(
    (entry) => entry.name,
  );
}
