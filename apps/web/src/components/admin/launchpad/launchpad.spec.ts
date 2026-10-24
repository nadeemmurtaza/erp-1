import { describe, expect, it } from 'vitest';
import { LAUNCHPAD_APPS, resolveLaunchpad, type ResolvedLaunchpadApp } from '@newax/shared';
import { ADMIN_NAV, navFor } from '../nav-registry';
import {
  audiencesPresent,
  entryPreview,
  filterTiles,
  reachableEntries,
  tiersPresent,
  tilesFor,
} from './launchpad';
import { LAUNCHPAD_ICONS } from './app-icons';

const ALL_NAV_KEYS = new Set<string>();
for (const item of ADMIN_NAV) {
  ALL_NAV_KEYS.add(item.key);
  for (const child of item.children ?? []) ALL_NAV_KEYS.add(child.key);
}

function resolved(overrides: Partial<ResolvedLaunchpadApp> = {}): ResolvedLaunchpadApp {
  return {
    key: 'demo',
    label: 'Demo',
    description: 'd',
    iconKey: 'sales',
    tier: 'CORE',
    sectors: [],
    audiences: ['INTERNAL'],
    modules: [],
    entries: ['orders', 'products'],
    stage: 'STABLE',
    sortOrder: 1,
    modulesOff: [],
    ...overrides,
  };
}

describe('the shipped manifest against the admin nav registry', () => {
  it('names only entries that exist in ADMIN_NAV', () => {
    for (const app of LAUNCHPAD_APPS) {
      for (const key of app.entries) {
        expect(ALL_NAV_KEYS.has(key), `${app.key} names unknown nav entry "${key}"`).toBe(true);
      }
    }
  });

  it('lists no entry twice within an app', () => {
    for (const app of LAUNCHPAD_APPS) expect(new Set(app.entries).size).toBe(app.entries.length);
  });

  it('has a glyph for every icon key it uses', () => {
    for (const app of LAUNCHPAD_APPS) expect(LAUNCHPAD_ICONS[app.iconKey]).toBeDefined();
  });

  it('resolves every entry for a person who holds every permission', () => {
    const everything = [...new Set(ADMIN_NAV.flatMap((i) => [...(i.permissions ?? []), ...(i.children ?? []).flatMap((c) => c.permissions ?? [])]))];
    const nav = navFor(everything, null);
    for (const app of LAUNCHPAD_APPS) {
      expect(reachableEntries(app, nav).map((e) => e.key)).toEqual(app.entries);
    }
  });
});

describe('reachableEntries', () => {
  const permissionsFor = (...keys: string[]) => keys;

  it('keeps only the entries this person can open, in the manifest order', () => {
    const nav = navFor(permissionsFor('orders.manage'), null);
    const entries = reachableEntries({ entries: ['payments', 'orders', 'products'] }, nav);
    expect(entries.map((e) => e.key)).toEqual(['orders']);
  });

  it('finds an entry that is a child of a nav group', () => {
    const parent = ADMIN_NAV.find((item) => item.children?.length);
    expect(parent).toBeDefined();
    const child = parent!.children![0]!;
    const nav = navFor([...(parent!.permissions ?? []), ...(child.permissions ?? [])], null);
    const found = reachableEntries({ entries: [child.key] }, nav);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ key: child.key, href: child.href });
  });

  it('drops an entry whose module is off, exactly as the sidebar does', () => {
    const on = reachableEntries({ entries: ['orders'] }, navFor(['orders.manage'], ['orders']));
    const off = reachableEntries({ entries: ['orders'] }, navFor(['orders.manage'], ['catalog']));
    expect(on).toHaveLength(1);
    expect(off).toHaveLength(0);
  });

  it('ignores a key the nav does not contain', () => {
    expect(reachableEntries({ entries: ['no-such-entry'] }, navFor(['orders.manage'], null))).toEqual([]);
  });
});

describe('tilesFor', () => {
  it('drops an app with no reachable entry instead of showing a dead tile', () => {
    const nav = navFor(['orders.manage'], null);
    const tiles = tilesFor([resolved({ key: 'a', entries: ['orders'] }), resolved({ key: 'b', entries: ['payments'] })], nav);
    expect(tiles.map((t) => t.app.key)).toEqual(['a']);
  });

  it('a person with no permissions sees only apps whose entries need none', () => {
    const nav = navFor([], null);
    const tiles = tilesFor(resolveLaunchpad(LAUNCHPAD_APPS, { enabledModules: ['orders', 'inventory'], disabledApps: [] }), nav);
    // The launchpad entry itself needs nothing, but no shipped app lists it.
    expect(tiles).toEqual([]);
  });

  it('gives each tile a front door: its first reachable entry', () => {
    const nav = navFor(['orders.manage', 'catalog.manage'], null);
    const [tile] = tilesFor([resolved({ entries: ['payments', 'orders', 'products'] })], nav);
    expect(tile!.entries[0]!.key).toBe('orders');
  });
});

describe('filters', () => {
  const nav = navFor(['orders.manage', 'stitching.jobs.view_queue'], null);
  const tiles = tilesFor(
    [
      resolved({ key: 'core-b2b', audiences: ['B2B'], entries: ['orders'] }),
      resolved({ key: 'ind-b2c', tier: 'INDUSTRY', sectors: ['apparel'], audiences: ['B2C'], entries: ['stitching'] }),
    ],
    nav,
  );

  it('offers only the tiers and audiences that are present', () => {
    expect(tiersPresent(tiles)).toEqual(['CORE', 'INDUSTRY']);
    expect(audiencesPresent(tiles)).toEqual(['B2B', 'B2C']);
    expect(audiencesPresent(tiles.slice(0, 1))).toEqual(['B2B']);
  });

  it('filters by tier and by audience, and both together', () => {
    expect(filterTiles(tiles, { tier: 'INDUSTRY', audience: '' }).map((t) => t.app.key)).toEqual(['ind-b2c']);
    expect(filterTiles(tiles, { tier: '', audience: 'B2B' }).map((t) => t.app.key)).toEqual(['core-b2b']);
    expect(filterTiles(tiles, { tier: 'INDUSTRY', audience: 'B2B' })).toEqual([]);
    expect(filterTiles(tiles, { tier: '', audience: '' })).toHaveLength(2);
  });
});

describe('entryPreview', () => {
  const e = (label: string) => ({ key: label, label, href: '/' });
  it('lists up to three labels and counts the rest', () => {
    expect(entryPreview([e('A'), e('B')])).toBe('A · B');
    expect(entryPreview([e('A'), e('B'), e('C'), e('D'), e('E')])).toBe('A · B · C +2');
  });
});
