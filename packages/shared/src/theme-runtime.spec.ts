import { isThemePreference, resolveTheme, themeInitScript, THEME_ATTRIBUTE } from './theme-runtime';

describe('resolveTheme', () => {
  it('lets an explicit choice beat the device', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the device for `system`', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('isThemePreference', () => {
  it('accepts exactly the three preferences', () => {
    for (const v of ['light', 'dark', 'system']) expect(isThemePreference(v)).toBe(true);
    for (const v of ['', 'Dark', 'auto', null, undefined, 1, {}]) expect(isThemePreference(v)).toBe(false);
  });
});

describe('themeInitScript', () => {
  const KEY = 'test.theme';

  /** Runs the real script against a fake window/document, the way a browser would. */
  function run(opts: { stored?: string | null; systemDark?: boolean; storageThrows?: boolean; noMatchMedia?: boolean }) {
    const attrs: Record<string, string> = {};
    const fakeWindow = {
      localStorage: {
        getItem: (k: string) => {
          if (opts.storageThrows) throw new Error('SecurityError');
          return k === KEY ? (opts.stored ?? null) : null;
        },
      },
      matchMedia: opts.noMatchMedia ? undefined : () => ({ matches: Boolean(opts.systemDark) }),
    };
    const fakeDocument = { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } };
    new Function('window', 'document', themeInitScript(KEY))(fakeWindow, fakeDocument);
    return attrs[THEME_ATTRIBUTE];
  }

  it('applies a stored explicit choice regardless of the device', () => {
    expect(run({ stored: 'dark', systemDark: false })).toBe('dark');
    expect(run({ stored: 'light', systemDark: true })).toBe('light');
  });

  it('follows the device when nothing, `system` or garbage is stored', () => {
    expect(run({ stored: null, systemDark: true })).toBe('dark');
    expect(run({ stored: 'system', systemDark: false })).toBe('light');
    expect(run({ stored: 'banana', systemDark: true })).toBe('dark');
  });

  it('survives storage that throws (a private window), falling back to the device', () => {
    expect(run({ storageThrows: true, systemDark: true })).toBe('dark');
    expect(run({ storageThrows: true, systemDark: false })).toBe('light');
  });

  it('survives a browser with no matchMedia, as light', () => {
    expect(run({ stored: null, noMatchMedia: true })).toBe('light');
  });

  it('agrees with resolveTheme for every combination', () => {
    for (const stored of ['light', 'dark', 'system', null] as const) {
      for (const systemDark of [true, false]) {
        const pref = stored === null ? 'system' : stored;
        expect(run({ stored, systemDark })).toBe(resolveTheme(pref, systemDark));
      }
    }
  });

  it('embeds the storage key as a JSON string, so a quote in it cannot break out of the script', () => {
    const script = themeInitScript('a"b');
    expect(script).toContain('"a\\"b"');
  });
});
