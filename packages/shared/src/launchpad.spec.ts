import {
  LAUNCHPAD_APPS,
  launchpadHiddenReason,
  resolveLaunchpad,
  type LaunchpadApp,
  type LaunchpadContext,
} from './launchpad';

const ALL_ON: LaunchpadContext = {
  enabledModules: LAUNCHPAD_APPS.flatMap((app) => app.modules.map((m) => m.key)),
  disabledApps: [],
};

function app(overrides: Partial<LaunchpadApp> = {}): LaunchpadApp {
  return {
    key: 'demo',
    label: 'Demo',
    description: 'A demo app.',
    iconKey: 'sales',
    tier: 'CORE',
    sectors: [],
    audiences: ['INTERNAL'],
    modules: [
      { key: 'alpha', required: true },
      { key: 'beta', required: false },
    ],
    entries: ['alpha-home'],
    stage: 'STABLE',
    sortOrder: 10,
    ...overrides,
  };
}

describe('LAUNCHPAD_APPS (the shipped manifest)', () => {
  it('has unique keys and non-empty entries', () => {
    const keys = LAUNCHPAD_APPS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const a of LAUNCHPAD_APPS) expect(a.entries.length).toBeGreaterThan(0);
  });

  it('keeps tier and sector consistent: core names no sector, industry names at least one', () => {
    for (const a of LAUNCHPAD_APPS) {
      if (a.tier === 'CORE') expect(a.sectors).toEqual([]);
      else expect(a.sectors.length).toBeGreaterThan(0);
    }
  });

  it('carries C2C only on a reserved app (doc 232 §4)', () => {
    for (const a of LAUNCHPAD_APPS) {
      if (a.audiences.includes('C2C')) expect(a.stage).toBe('RESERVED');
    }
  });

  it('always names at least one audience', () => {
    for (const a of LAUNCHPAD_APPS) expect(a.audiences.length).toBeGreaterThan(0);
  });

  it('shows every shipped app when every module is on', () => {
    const shown = resolveLaunchpad(LAUNCHPAD_APPS, ALL_ON);
    expect(shown.map((a) => a.key)).toEqual(
      LAUNCHPAD_APPS.filter((a) => a.stage !== 'RESERVED')
        .slice()
        .sort((x, y) => x.sortOrder - y.sortOrder)
        .map((a) => a.key),
    );
  });
});

describe('launchpadHiddenReason / resolveLaunchpad', () => {
  const ctx = (over: Partial<LaunchpadContext> = {}): LaunchpadContext => ({
    enabledModules: ['alpha', 'beta'],
    disabledApps: [],
    ...over,
  });

  it('shows an app whose modules are all on', () => {
    expect(launchpadHiddenReason(app(), ctx())).toBeNull();
    expect(resolveLaunchpad([app()], ctx())[0].modulesOff).toEqual([]);
  });

  it('hides an app when a required module is off', () => {
    expect(launchpadHiddenReason(app(), ctx({ enabledModules: ['beta'] }))).toBe('required-module-off');
    expect(resolveLaunchpad([app()], ctx({ enabledModules: ['beta'] }))).toEqual([]);
  });

  it('degrades, not hides, when only an optional module is off', () => {
    const shown = resolveLaunchpad([app()], ctx({ enabledModules: ['alpha'] }));
    expect(shown).toHaveLength(1);
    expect(shown[0].modulesOff).toEqual(['beta']);
  });

  it('hides an app that lists modules when none of them is on, even with none required', () => {
    const optionalOnly = app({ modules: [{ key: 'beta', required: false }] });
    expect(launchpadHiddenReason(optionalOnly, ctx({ enabledModules: ['alpha'] }))).toBe('all-modules-off');
  });

  it('shows an app that lists no modules at all', () => {
    expect(launchpadHiddenReason(app({ modules: [] }), ctx({ enabledModules: [] }))).toBeNull();
  });

  it('hides a reserved app whatever is switched on', () => {
    expect(launchpadHiddenReason(app({ stage: 'RESERVED', audiences: ['C2C'] }), ctx())).toBe('reserved');
  });

  it('hides an app the tenant switched off, and restores it when switched back on', () => {
    expect(launchpadHiddenReason(app(), ctx({ disabledApps: ['demo'] }))).toBe('disabled-by-tenant');
    expect(launchpadHiddenReason(app(), ctx({ disabledApps: [] }))).toBeNull();
  });

  it('asks the entitlement hook only when the app names a licence key', () => {
    const isLicensed = jest.fn().mockReturnValue(false);
    expect(launchpadHiddenReason(app(), ctx({ isLicensed }))).toBeNull();
    expect(isLicensed).not.toHaveBeenCalled();
    expect(launchpadHiddenReason(app({ licenseKey: 'apps.demo' }), ctx({ isLicensed }))).toBe('not-licensed');
    expect(isLicensed).toHaveBeenCalledWith('apps.demo');
  });

  it('allows everything while no entitlement service exists', () => {
    expect(launchpadHiddenReason(app({ licenseKey: 'apps.demo' }), ctx())).toBeNull();
  });

  it('orders by sortOrder, then key, and never mutates its input', () => {
    const apps = [
      app({ key: 'c', sortOrder: 20 }),
      app({ key: 'b', sortOrder: 10 }),
      app({ key: 'a', sortOrder: 10 }),
    ];
    const snapshot = JSON.stringify(apps);
    expect(resolveLaunchpad(apps, ctx()).map((a) => a.key)).toEqual(['a', 'b', 'c']);
    expect(JSON.stringify(apps)).toBe(snapshot);
  });
});
