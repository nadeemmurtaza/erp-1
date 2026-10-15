import { describe, expect, it } from 'vitest';
import { TONE_NAMES } from '@newax/shared';
import { LAUNCHPAD_ICONS } from '@/components/admin/launchpad/app-icons';
import { DASHBOARD_GROUPS } from '@/components/admin/dashboard/card-registry';
import { DASHBOARD_GROUP_KIND, KIND_TONE, LAUNCHPAD_KIND, NAV_GROUP_KIND, dashboardGroupTone, launchpadTone, navGroupTone, toneForKey } from './tone';
import { NAV_GROUPS } from '@/components/admin/nav-registry';

describe('tone', () => {
  it('gives the same key the same tone every time', () => {
    expect(toneForKey('stock')).toBe(toneForKey('stock'));
    expect(toneForKey('')).toBe(toneForKey(''));
  });

  it('only ever returns a tone the brand file defines', () => {
    for (const key of ['a', 'orders', 'a very long key with spaces', '日本語', 'ٹیسٹ']) {
      expect(TONE_NAMES).toContain(toneForKey(key));
    }
  });

  it('spreads keys across the tones instead of piling onto one', () => {
    const used = new Set(Array.from({ length: 200 }, (_, i) => toneForKey(`group-${i}`)));
    expect(used.size).toBe(TONE_NAMES.length);
  });

  it('names a tone for every nav group, from the brand tones', () => {
    for (const group of NAV_GROUPS) {
      expect(NAV_GROUP_KIND[group.key], `nav group ${group.key}`).toBeDefined();
      expect(TONE_NAMES).toContain(navGroupTone(group.key));
    }
  });

  it('names a tone for every launchpad icon key, from the brand tones', () => {
    for (const key of Object.keys(LAUNCHPAD_ICONS)) {
      expect((LAUNCHPAD_KIND as Record<string, unknown>)[key], `launchpad key ${key}`).toBeDefined();
      expect(TONE_NAMES).toContain(launchpadTone(key));
    }
  });

  it('never gives two neighbouring nav groups the same tone', () => {
    const keys = NAV_GROUPS.map((group) => group.key);
    for (let i = 1; i < keys.length; i += 1) {
      expect(navGroupTone(keys[i]!), `${keys[i - 1]} and ${keys[i]}`).not.toBe(navGroupTone(keys[i - 1]!));
    }
  });

  it('names a tone for every dashboard group, and never repeats one between neighbours', () => {
    const keys = DASHBOARD_GROUPS.map((group) => group.key);
    for (const key of keys) expect(DASHBOARD_GROUP_KIND[key], `dashboard group ${key}`).toBeDefined();
    for (let i = 1; i < keys.length; i += 1) {
      expect(dashboardGroupTone(keys[i]!), `${keys[i - 1]} and ${keys[i]}`).not.toBe(dashboardGroupTone(keys[i - 1]!));
    }
  });

  it('gives one kind of thing the same tone on every surface', () => {
    // The Orders group is "selling" in the sidebar, on the dashboard and as the Sales app.
    expect(navGroupTone('orders')).toBe(dashboardGroupTone('orders'));
    expect(navGroupTone('orders')).toBe(launchpadTone('sales'));
    expect(navGroupTone('customers')).toBe(dashboardGroupTone('customers'));
    expect(navGroupTone('customers')).toBe(launchpadTone('customers'));
    expect(navGroupTone('workshop')).toBe(dashboardGroupTone('workshop'));
    expect(navGroupTone('workshop')).toBe(launchpadTone('workshop'));
    expect(navGroupTone('finance')).toBe(launchpadTone('finance'));
    expect(navGroupTone('finance')).toBe(dashboardGroupTone('expenses'));
  });

  it('only maps kinds to tones the brand defines, and uses every tone', () => {
    const tones = Object.values(KIND_TONE);
    for (const tone of tones) expect(TONE_NAMES).toContain(tone);
    expect(new Set(tones).size).toBe(TONE_NAMES.length);
  });

  it('falls back to a stable tone for a key it was not told about', () => {
    expect(navGroupTone('brand-new-group')).toBe(toneForKey('brand-new-group'));
    expect(dashboardGroupTone('brand-new-group')).toBe(toneForKey('brand-new-group'));
    expect(launchpadTone('brand-new-app')).toBe(toneForKey('brand-new-app'));
  });
});
