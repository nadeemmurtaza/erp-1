/**
 * Which pack owns each feature module.
 *
 * A pack is a sector's worth of modules. `core` is the universal commerce
 * platform every shop needs — catalogue, cart, orders, stock, money, people.
 * Everything else belongs to a sector pack that a given deployment either
 * enables or does not, through the MODULES allowlist in env.
 *
 * This map is the source of truth for the direction rule that keeps the
 * platform extensible:
 *
 *   - a `core` module may never import a pack module
 *   - a pack module may never import another pack's module
 *   - packs reach core through domain events, never the reverse
 *
 * `scripts/check-module-boundaries.mjs` reads this file and fails `pnpm lint`
 * on a violation. A module that is missing from this map also fails, on
 * purpose: an unclassified module is one where nobody has answered "would a
 * grocery shop need this?", and that question does not get to be skipped.
 *
 * Adding a module means adding its line here as well as to
 * `modules.registry.ts`.
 *
 * See docs/implementation/MULTI-SECTOR.md.
 */

export type PackName = 'core' | 'apparel' | 'grocery' | 'pharmacy' | 'electronics';

export const MODULE_PACKS: Record<string, PackName> = {
  // The universal commerce core — what clothing, grocery, medicine, hardware
  // and electronics all need. None of these may name a sector concept.
  addresses: 'core',
  analytics: 'core',
  cart: 'core',
  catalog: 'core',
  crm: 'core',
  inventory: 'core',
  orders: 'core',
  payments: 'core',
  purchasing: 'core',
  reports: 'core',
  settings: 'core',
  tracking: 'core',
  users: 'core',

  // Apparel & boutique — what makes this particular shop what it is.
  measurements: 'apparel',
  stitching: 'apparel',
};
