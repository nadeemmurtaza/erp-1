import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  LAUNCHPAD_APPS,
  launchpadHiddenReason,
  resolveLaunchpad,
  type LaunchpadApp,
  type LaunchpadContext,
  type LaunchpadHiddenReason,
  type ResolvedLaunchpadApp,
} from '@newax/shared';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.service';
import { enabledFeatureModules } from '../config/enabled-modules';
import { SettingsService } from '../settings/settings.service';
import { SettingKey } from '../settings/settings.defaults';

/** One row of the admin's "which apps are on" list. */
export interface LaunchpadAppStatus {
  app: LaunchpadApp;
  /** The tenant's own switch. `false` means an admin turned it off. */
  enabled: boolean;
  /** Why it is not on the launchpad right now, or `null` when it is. */
  hiddenReason: LaunchpadHiddenReason | null;
}

/**
 * Decides which first-party apps this deployment and tenant may show
 * (launchpad-apps/232). It reads three facts only the server owns — the
 * `MODULES` allowlist, the tenant's `AppEnablement` setting and (later) the
 * licence — and applies the pure rules in `@newax/shared`. Whether a given
 * PERSON can reach an entry is decided in the web app from the same `navFor()`
 * the sidebar uses; permissions stay enforced on every API route either way.
 *
 * Failure mode: the setting read falls back to "nothing switched off". The
 * launchpad is a convenience, never the only way in (the sidebar still lists
 * everything), so a failure here must not hide apps nor block anyone.
 */
@Injectable()
export class LaunchpadService {
  private readonly logger = new Logger(LaunchpadService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** The apps to show, in order. */
  async visibleApps(): Promise<ResolvedLaunchpadApp[]> {
    return resolveLaunchpad(LAUNCHPAD_APPS, await this.context());
  }

  /** Every shipped app with its switch and, when hidden, why — for the admin list. */
  async statuses(): Promise<LaunchpadAppStatus[]> {
    const context = await this.context();
    return [...LAUNCHPAD_APPS]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
      .map((app) => ({
        app,
        enabled: !context.disabledApps.includes(app.key),
        hiddenReason: launchpadHiddenReason(app, context),
      }));
  }

  /**
   * Switch an app on or off for the whole organization. Idempotent: setting the
   * state it already has changes nothing and writes no audit row. Turning an app
   * off hides its tile and entries; it deletes no data and stops no module.
   */
  async setEnabled(appKey: string, enabled: boolean, actorId: string): Promise<LaunchpadAppStatus[]> {
    if (!LAUNCHPAD_APPS.some((app) => app.key === appKey)) {
      throw new NotFoundException(`There is no launchpad app "${appKey}".`);
    }

    const before = await this.readDisabled();
    const after = enabled ? before.filter((key) => key !== appKey) : [...new Set([...before, appKey])];

    if (after.length !== before.length) {
      await this.settings.set(SettingKey.LaunchpadDisabledApps, after);
      // Old and new value, not a list of changed fields (doc 232 §11).
      await this.audit.record({
        actorId,
        action: 'launchpad.app_enablement_changed',
        entity: 'LaunchpadApp',
        entityId: appKey,
        data: { appKey, before: { disabledApps: before }, after: { disabledApps: after } },
      });
    }
    return this.statuses();
  }

  private async context(): Promise<LaunchpadContext> {
    return {
      enabledModules: enabledFeatureModules(this.config),
      disabledApps: await this.readDisabled(),
    };
  }

  private async readDisabled(): Promise<string[]> {
    try {
      const value = await this.settings.get<unknown>(SettingKey.LaunchpadDisabledApps);
      return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
    } catch (error) {
      this.logger.warn(
        `could not read ${SettingKey.LaunchpadDisabledApps}; showing every app: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }
}
