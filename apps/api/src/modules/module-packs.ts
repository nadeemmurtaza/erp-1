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

/**
 * The sector packs. A pack exists only where a vertical owns genuine domain data
 * that core cannot express — a drug schedule, a vehicle tree, an ISBN.
 *
 * Grocery and electronics are deliberately ABSENT. Everything they appeared to
 * need turned out to be universal (lots, serials, warranty, agegate,
 * subscriptions, fitment, dimensions) and belongs in core. See the taxonomy in
 * docs/implementation/MULTI-SECTOR.md.
 *
 * Business models — B2B, C2C, B2B2C, C2B, B2G, D2C, O2O — are NOT packs and
 * never appear here. They are capability modules in core, because they cut
 * across every sector: one shop can be B2C and B2B at once.
 */
export type PackName =
  | 'core'
  | 'apparel'
  | 'pharmacy'
  | 'automotive'
  | 'media'
  | 'pets'
  | 'home'
  | 'digital';

export const MODULE_PACKS: Record<string, PackName> = {
  // The universal commerce core — what clothing, grocery, medicine, hardware
  // and electronics all need. None of these may name a sector concept.
  accounting: 'core',
  // 149-b2b-accounts-approvals-sector-packs.md — a B2B/wholesale capability
  // module, not a sector pack, per this file's own "Business models... cut
  // across every sector" rule above (the same reasoning `pricing`'s own
  // entry below states).
  accounts: 'core',
  settlements: 'core',
  addresses: 'core',
  analytics: 'core',
  // 167-bank-facility-management.md — the mirror concern to receivables:
  // what the business itself owes a bank, not what it is owed.
  bankfacilities: 'core',
  bom: 'core',
  cart: 'core',
  catalog: 'core',
  collections: 'core',
  content: 'core',
  crm: 'core',
  'custom-fields': 'core',
  embeds: 'core',
  'entity-attributes': 'core',
  fragments: 'core',
  'metadata-forms': 'core',
  'bpmn-workflows': 'core',
  'identity-verification': 'core',
  inventory: 'core',
  marketing: 'core',
  onsitemessages: 'core',
  orders: 'core',
  organization: 'core',
  parties: 'core',
  payments: 'core',
  // 146-wholesale-tiered-pricing.md — a B2B/wholesale capability module,
  // not a sector pack, per this file's own "Business models... cut across
  // every sector" rule above.
  pricing: 'core',
  pos: 'core',
  production: 'core',
  purchasing: 'core',
  tradingpartners: 'core',
  recommendations: 'core',
  rag: 'core',
  reports: 'core',
  settings: 'core',
  tax: 'core',
  finance: 'core',
  receivables: 'core',
  fulfilment: 'core',
  payroll: 'core',
  hr: 'core',
  orgstructure: 'core',
  attendance: 'core',
  // tasks-notifications-support/23-tasks-allotment-tracking.md — imports no
  // other module (event-intake goes through core/extension-points/
  // task-source.registry.ts) and no other module imports it.
  tasks: 'core',
  notify: 'core',
  promotions: 'core',
  giftcards: 'core',
  search: 'core',
  reviews: 'core',
  wishlist: 'core',
  loyalty: 'core',
  'notification-preferences': 'core',
  tracking: 'core',
  transfers: 'core',
  users: 'core',
  wallet: 'core',
  // doc 14 (commercial-licensing-agency/14-managed-services-module.md) —
  // reads THIS deployment's own hosting/billing status from the agency's
  // Master Platform; core infrastructure for the agency's own hosting
  // arrangement, never a sector concept, and never in a client's default
  // MODULES allowlist (see modules.registry.ts's own `offByDefault`).
  'managed-services': 'core',
  // doc 165 (b2b-wholesale-multientity/165-cross-tenant-marketplace-
  // directory.md) — a thin server-to-server proxy to the shared platform
  // app's own cross-tenant directory; a B2B/B2B2C capability, not a sector
  // concept, and off by a client's default MODULES allowlist until ops
  // issues this tenant a MarketplacePublisherCredential (modules.registry
  // .ts's own `offByDefault`).
  marketplace: 'core',

  // Apparel & boutique — what makes this particular shop what it is.
  measurements: 'apparel',
  stitching: 'apparel',
};
