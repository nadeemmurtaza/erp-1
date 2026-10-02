import { NotFoundException } from '@nestjs/common';
import { LAUNCHPAD_APPS } from '@newax/shared';
import { FEATURE_MODULES } from '../../modules/modules.registry';
import { SettingKey } from '../settings/settings.defaults';
import { LaunchpadService } from './launchpad.service';

jest.mock('../config/enabled-modules', () => ({
  enabledFeatureModules: jest.fn(),
}));
import { enabledFeatureModules } from '../config/enabled-modules';

const ALL_MODULES = [...new Set(LAUNCHPAD_APPS.flatMap((app) => app.modules.map((m) => m.key)))];

function build(opts: { disabled?: unknown; modules?: string[]; settingsThrows?: boolean } = {}) {
  (enabledFeatureModules as jest.Mock).mockReturnValue(opts.modules ?? ALL_MODULES);
  const stored: { value: unknown } = { value: opts.disabled ?? [] };
  const settings = {
    get: jest.fn(async () => {
      if (opts.settingsThrows) throw new Error('db down');
      return stored.value;
    }),
    set: jest.fn(async (_key: string, value: unknown) => {
      stored.value = value;
    }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new LaunchpadService({} as any, settings as any, audit as any);
  return { service, settings, audit };
}

describe('LAUNCHPAD_APPS against the module registry', () => {
  it('names only modules that exist in FEATURE_MODULES', () => {
    const known = new Set(FEATURE_MODULES.map((entry) => entry.name));
    for (const app of LAUNCHPAD_APPS) {
      for (const module of app.modules) {
        expect(known.has(module.key)).toBe(true);
      }
    }
  });
});

describe('LaunchpadService', () => {
  afterEach(() => jest.clearAllMocks());

  it('shows every shipped app when every module is on and nothing is switched off', async () => {
    const { service } = build();
    const keys = (await service.visibleApps()).map((a) => a.key);
    expect(keys).toEqual(expect.arrayContaining(['sales', 'inventory', 'finance', 'people']));
    expect(keys).toHaveLength(LAUNCHPAD_APPS.filter((a) => a.stage !== 'RESERVED').length);
  });

  it('hides an app when its required module is off', async () => {
    const { service } = build({ modules: ALL_MODULES.filter((m) => m !== 'bom') });
    const keys = (await service.visibleApps()).map((a) => a.key);
    expect(keys).not.toContain('manufacturing');
    expect(keys).toContain('sales');
  });

  it('hides an app the organization switched off', async () => {
    const { service } = build({ disabled: ['finance'] });
    expect((await service.visibleApps()).map((a) => a.key)).not.toContain('finance');
  });

  it('treats a malformed setting as "nothing switched off" rather than failing', async () => {
    const { service } = build({ disabled: { not: 'an array' } });
    expect((await service.visibleApps()).length).toBeGreaterThan(0);
  });

  it('fails open when the setting cannot be read: shows every app, throws nothing', async () => {
    const { service } = build({ settingsThrows: true });
    await expect(service.visibleApps()).resolves.toHaveLength(
      LAUNCHPAD_APPS.filter((a) => a.stage !== 'RESERVED').length,
    );
  });

  describe('statuses()', () => {
    it('reports the switch and the reason an app is hidden', async () => {
      const { service } = build({ disabled: ['people'], modules: ALL_MODULES.filter((m) => m !== 'bom') });
      const byKey = Object.fromEntries((await service.statuses()).map((s) => [s.app.key, s]));
      expect(byKey.people).toMatchObject({ enabled: false, hiddenReason: 'disabled-by-tenant' });
      expect(byKey.manufacturing).toMatchObject({ enabled: true, hiddenReason: 'required-module-off' });
      expect(byKey.sales).toMatchObject({ enabled: true, hiddenReason: null });
    });
  });

  describe('setEnabled()', () => {
    it('switches an app off, stores the new list and audits old and new value', async () => {
      const { service, settings, audit } = build({ disabled: ['people'] });
      await service.setEnabled('finance', false, 'user-1');
      expect(settings.set).toHaveBeenCalledWith(SettingKey.LaunchpadDisabledApps, ['people', 'finance']);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'user-1',
          action: 'launchpad.app_enablement_changed',
          entityId: 'finance',
          data: {
            appKey: 'finance',
            before: { disabledApps: ['people'] },
            after: { disabledApps: ['people', 'finance'] },
          },
        }),
      );
    });

    it('switches an app back on without deleting anything else', async () => {
      const { service, settings } = build({ disabled: ['people', 'finance'] });
      await service.setEnabled('finance', true, 'user-1');
      expect(settings.set).toHaveBeenCalledWith(SettingKey.LaunchpadDisabledApps, ['people']);
    });

    it('is idempotent: the state it already has writes nothing and audits nothing', async () => {
      const { service, settings, audit } = build({ disabled: ['finance'] });
      await service.setEnabled('finance', false, 'user-1');
      await service.setEnabled('sales', true, 'user-1');
      expect(settings.set).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects an unknown app key', async () => {
      const { service, settings } = build();
      await expect(service.setEnabled('nope', false, 'user-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(settings.set).not.toHaveBeenCalled();
    });
  });
});
