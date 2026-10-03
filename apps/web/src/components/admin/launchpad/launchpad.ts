import type {
  LaunchpadApp,
  LaunchpadAudience,
  LaunchpadHiddenReason,
  LaunchpadTier,
  ResolvedLaunchpadApp,
} from '@newax/shared';
import type { AdminNavItem } from '../nav-registry';

/** One door inside an app: a nav-registry entry this person can actually open. */
export interface LaunchpadEntry {
  key: string;
  label: string;
  href: string;
}

export interface LaunchpadTileData {
  app: ResolvedLaunchpadApp;
  /** In the manifest's order; the first is the tile's front door. Never empty. */
  entries: readonly LaunchpadEntry[];
}

/** One row of the admin's list, as `GET /launchpad/apps` returns it. */
export interface LaunchpadAppStatus {
  app: LaunchpadApp;
  enabled: boolean;
  hiddenReason: LaunchpadHiddenReason | null;
}

/**
 * The entries of `app` that appear in `nav`. Pass `navFor(permissions,
 * enabledModules)` so this is exactly what the sidebar would show for the same
 * person — a tile can then never offer a door the sidebar hides, and no second
 * copy of each entry's permissions exists to drift. An entry key may be a
 * top-level item or a child; a key `nav` does not contain is simply absent.
 */
export function reachableEntries(
  app: Pick<LaunchpadApp, 'entries'>,
  nav: readonly AdminNavItem[],
): LaunchpadEntry[] {
  const byKey = new Map<string, AdminNavItem>();
  for (const item of nav) {
    byKey.set(item.key, item);
    for (const child of item.children ?? []) byKey.set(child.key, child);
  }
  const found: LaunchpadEntry[] = [];
  for (const key of app.entries) {
    const item = byKey.get(key);
    if (item) found.push({ key: item.key, label: item.label, href: item.href });
  }
  return found;
}

/**
 * The tiles for this person: each server-approved app with at least one
 * reachable entry. An app with none is dropped, never shown disabled — a tile
 * whose click goes nowhere is a dead end (`ITG-1`).
 */
export function tilesFor(
  apps: readonly ResolvedLaunchpadApp[],
  nav: readonly AdminNavItem[],
): LaunchpadTileData[] {
  const tiles: LaunchpadTileData[] = [];
  for (const app of apps) {
    const entries = reachableEntries(app, nav);
    if (entries.length > 0) tiles.push({ app, entries });
  }
  return tiles;
}

export interface LaunchpadFilter {
  tier: LaunchpadTier | '';
  audience: LaunchpadAudience | '';
}

export function filterTiles(tiles: readonly LaunchpadTileData[], filter: LaunchpadFilter): LaunchpadTileData[] {
  return tiles.filter(
    ({ app }) =>
      (!filter.tier || app.tier === filter.tier) && (!filter.audience || app.audiences.includes(filter.audience)),
  );
}

/** Audiences present among the tiles, in a fixed order, so the filter offers only what exists. */
const AUDIENCE_ORDER: readonly LaunchpadAudience[] = ['B2B', 'B2C', 'C2C', 'INTERNAL'];

export function audiencesPresent(tiles: readonly LaunchpadTileData[]): LaunchpadAudience[] {
  return AUDIENCE_ORDER.filter((audience) => tiles.some(({ app }) => app.audiences.includes(audience)));
}

export function tiersPresent(tiles: readonly LaunchpadTileData[]): LaunchpadTier[] {
  return (['CORE', 'INDUSTRY'] as const).filter((tier) => tiles.some(({ app }) => app.tier === tier));
}

export const AUDIENCE_LABEL: Record<LaunchpadAudience, string> = {
  B2B: 'B2B',
  B2C: 'B2C',
  C2C: 'C2C',
  INTERNAL: 'Internal',
};

export const TIER_LABEL: Record<LaunchpadTier, string> = {
  CORE: 'Core',
  INDUSTRY: 'Industry',
};

/** Why an app is off, in the words the person who can switch it needs. */
export const HIDDEN_REASON_LABEL: Record<LaunchpadHiddenReason, string> = {
  reserved: 'Planned for a later release.',
  'disabled-by-tenant': 'Switched off for your organization.',
  'not-licensed': 'Not included in your plan.',
  'required-module-off': 'Needs a module this deployment has not turned on.',
  'all-modules-off': 'None of its modules is turned on for this deployment.',
};

/** "Orders · Payment approvals · Returns +4" — a hint of what is inside, never a menu. */
export function entryPreview(entries: readonly LaunchpadEntry[], shown = 3): string {
  const head = entries.slice(0, shown).map((entry) => entry.label).join(' · ');
  const more = entries.length - shown;
  return more > 0 ? `${head} +${more}` : head;
}
