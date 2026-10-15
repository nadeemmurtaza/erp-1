import { TONE_NAMES, type LaunchpadIconKey, type ToneName } from '@newax/shared';

/**
 * Which tone an icon wears (ADR-083, twelfth addendum). A tone is a hue for a glyph and its tile; it
 * says "this is a different kind of thing from that", never "this is good" or "this is bad" (that is
 * `feedback`). Seven exist, in `brand.ts`; this file only chooses between them, so a rebrand that
 * changes a hue moves every screen at once.
 *
 * One map by *kind of thing*, and every surface names its kind. The sidebar's Orders group, the
 * dashboard's Orders row and the launchpad's Sales app are all "selling", so they are the same
 * indigo everywhere, and a person learns "violet is people" once. A surface never picks a tone
 * itself. Keys this file has not heard of fall back to `toneForKey`, a stable hash, so a new group
 * still gets a colour and the same one every time; give it a kind when it earns one.
 */

export type { ToneName };

/** The kinds of thing, and the one tone each wears. Two kinds may share a tone; one kind never has two. */
export const KIND_TONE = {
  /** The shop as a whole: the overview, the organization. */
  shop: 'teal',
  /** Orders and what is sold through them, including auctions. */
  selling: 'indigo',
  /** Making: the workshop, manufacturing, bills of materials. */
  making: 'rose',
  /** Customers, staff and payroll. */
  people: 'violet',
  /** What is sold: the catalogue and products. */
  goods: 'amber',
  /** Money: finance, expenses, revenue. */
  money: 'emerald',
  /** Things in motion: stock, inventory, purchasing, fulfilment, tasks. */
  movement: 'sky',
  /** Configuration. */
  settings: 'indigo',
} as const satisfies Record<string, ToneName>;

export type ToneKind = keyof typeof KIND_TONE;

/** The same input always gives the same tone, on the server and in the browser. */
export function toneForKey(key: string): ToneName {
  let hash = 5381;
  for (let i = 0; i < key.length; i += 1) hash = ((hash << 5) + hash + key.charCodeAt(i)) >>> 0;
  return TONE_NAMES[hash % TONE_NAMES.length]!;
}

/** The admin sidebar's groups (`NAV_GROUPS` in nav-registry.ts). Neighbours are never alike (spec). */
export const NAV_GROUP_KIND: Readonly<Record<string, ToneKind>> = {
  overview: 'shop',
  orders: 'selling',
  workshop: 'making',
  customers: 'people',
  catalogue: 'goods',
  stock: 'movement',
  manufacturing: 'making',
  payroll: 'people',
  organization: 'shop',
  finance: 'money',
  fulfilment: 'movement',
  insights: 'shop',
  settings: 'settings',
};

/** The dashboard's groups (`DASHBOARD_GROUPS`), in the order they are shown; neighbours are never alike (spec). */
export const DASHBOARD_GROUP_KIND: Readonly<Record<string, ToneKind>> = {
  sales: 'money',
  orders: 'selling',
  purchasing: 'movement',
  products: 'goods',
  inventory: 'movement',
  expenses: 'money',
  bom: 'making',
  customers: 'people',
  workshop: 'making',
};

/** The launchpad's apps, by manifest icon key. */
export const LAUNCHPAD_KIND: Readonly<Record<LaunchpadIconKey, ToneKind>> = {
  sales: 'selling',
  inventory: 'movement',
  finance: 'money',
  people: 'people',
  tasks: 'movement',
  customers: 'people',
  insights: 'shop',
  manufacturing: 'making',
  workshop: 'making',
  fulfilment: 'movement',
  auction: 'selling',
  settings: 'settings',
};

const toneOf = (kinds: Readonly<Record<string, ToneKind>>, key: string): ToneName => {
  const kind = kinds[key];
  return kind ? KIND_TONE[kind] : toneForKey(key);
};

/** The nav group's tone, or a stable one of its own for a group this file has not heard of. */
export function navGroupTone(group: string): ToneName {
  return toneOf(NAV_GROUP_KIND, group);
}

/** The dashboard group's tone, or a stable one of its own for a group this file has not heard of. */
export function dashboardGroupTone(group: string): ToneName {
  return toneOf(DASHBOARD_GROUP_KIND, group);
}

/** The launchpad app's tone, or a stable one of its own for a key this file has not heard of. */
export function launchpadTone(iconKey: string): ToneName {
  return toneOf(LAUNCHPAD_KIND, iconKey);
}
