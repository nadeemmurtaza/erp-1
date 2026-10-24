/**
 * The launchpad's first-party app manifest and the pure rules that decide
 * which apps are shown (launchpad-apps/232-launchpad-and-app-manifest.md).
 *
 * An app is a PRESENTATION grouping of modules: a name, an icon, the nav
 * entries it opens, and three tags. It adds no import between modules (they
 * still talk through events and extension points) and it is not a
 * third-party directory app (docs 184–195, which are remote services and
 * never run in-process).
 *
 * Two stages decide whether a tile shows, and they are split on purpose:
 *
 *   1. `resolveLaunchpad()` here — what only the server may decide:
 *      is the stage shippable, are the REQUIRED modules in `MODULES`, has the
 *      tenant switched the app off (`AppEnablement`), does the licence allow it.
 *   2. The web app — whether THIS person can reach at least one entry. That
 *      reuses `navFor()`, the same function the sidebar uses, so a tile can
 *      never offer something the sidebar hides and there is no second copy of
 *      each entry's permissions to drift. Permissions are still enforced on
 *      every API route; showing or hiding a tile never grants or removes access.
 */

/** Core apps ship to everyone; industry apps follow the `MODULES` allowlist. */
export type LaunchpadTier = 'CORE' | 'INDUSTRY';

/**
 * Who the app serves. A set, never a folder: one app can serve several, and
 * business models cut across sectors (MULTI-SECTOR.md). `C2C` is reserved —
 * an app may carry it only at `stage: 'RESERVED'` until escrow, reputation and
 * disputes exist (doc 232 §4).
 */
export type LaunchpadAudience = 'B2B' | 'B2C' | 'C2C' | 'INTERNAL';

/** `RESERVED` is declared for a later release and is never shown. */
export type LaunchpadStage = 'STABLE' | 'BETA' | 'RESERVED';

/** The glyphs a tile can use; the web app maps each to a lucide icon. */
export type LaunchpadIconKey =
  | 'sales'
  | 'inventory'
  | 'finance'
  | 'people'
  | 'tasks'
  | 'customers'
  | 'insights'
  | 'manufacturing'
  | 'workshop'
  | 'fulfilment'
  | 'auction'
  | 'settings';

export interface LaunchpadAppModule {
  /** An API module name, as in `FEATURE_MODULES`. */
  key: string;
  /** Missing required module → the app is hidden. Missing optional → its entries drop out. */
  required: boolean;
}

export interface LaunchpadApp {
  /** Stable, unique, never reused. */
  key: string;
  label: string;
  /** One line. */
  description: string;
  iconKey: LaunchpadIconKey;
  tier: LaunchpadTier;
  /** Empty for core. A sector pack's name for an industry app. */
  sectors: readonly string[];
  audiences: readonly LaunchpadAudience[];
  modules: readonly LaunchpadAppModule[];
  /** Admin nav-registry item keys, top level or child. The first is the app's front door. */
  entries: readonly string[];
  stage: LaunchpadStage;
  /** Entitlement hook (doc 211, doc 232 §8). Unused until an entitlement service exists. */
  licenseKey?: string;
  /** Ascending; ties break on `key`. */
  sortOrder: number;
}

/** What the server needs to know about this deployment and tenant. */
export interface LaunchpadContext {
  /** Module names enabled for this deployment (`GET /meta`'s list). */
  enabledModules: readonly string[];
  /** App keys the tenant switched off (`AppEnablement`). */
  disabledApps: readonly string[];
  /** Answer from the entitlement service; omit while none exists — everything is allowed. */
  isLicensed?: (licenseKey: string) => boolean;
}

/** Why an app is not shown. Used for the admin screen and tests, never shown to a member. */
export type LaunchpadHiddenReason =
  | 'reserved'
  | 'disabled-by-tenant'
  | 'not-licensed'
  | 'required-module-off'
  | 'all-modules-off';

export function launchpadHiddenReason(
  app: LaunchpadApp,
  context: LaunchpadContext,
): LaunchpadHiddenReason | null {
  if (app.stage === 'RESERVED') return 'reserved';
  if (context.disabledApps.includes(app.key)) return 'disabled-by-tenant';
  if (app.licenseKey && context.isLicensed && !context.isLicensed(app.licenseKey)) return 'not-licensed';

  const on = (key: string) => context.enabledModules.includes(key);
  if (app.modules.some((m) => m.required && !on(m.key))) return 'required-module-off';
  // An app that lists modules but has none of them is an empty shell, even
  // when none is marked required.
  if (app.modules.length > 0 && !app.modules.some((m) => on(m.key))) return 'all-modules-off';
  return null;
}

/** Modules an app lists that are off — the web app drops entries owned by these. */
export interface ResolvedLaunchpadApp extends LaunchpadApp {
  /** Optional modules that are off for this deployment. */
  modulesOff: readonly string[];
}

/**
 * The apps this deployment and tenant may show, in order. Pure: no I/O, no
 * clock, no randomness, so it can replay over any configuration with nothing
 * written (doc 232 §11, "dry run").
 */
export function resolveLaunchpad(
  apps: readonly LaunchpadApp[],
  context: LaunchpadContext,
): ResolvedLaunchpadApp[] {
  return apps
    .filter((app) => launchpadHiddenReason(app, context) === null)
    .map((app) => ({
      ...app,
      modulesOff: app.modules.filter((m) => !context.enabledModules.includes(m.key)).map((m) => m.key),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
}

/**
 * The first-party apps that exist today, each a grouping of nav entries the
 * admin sidebar already has. An app whose modules are not built yet (Mail,
 * Vault & Work Credit, Hospitality, Housing Society) is NOT listed:
 * a tile that cannot work is worse than no tile. Add an app here in the same
 * change that ships its module.
 */
export const LAUNCHPAD_APPS: readonly LaunchpadApp[] = [
  {
    key: 'sales',
    label: 'Sales & Catalogue',
    description: 'Orders, payments, returns and everything you sell.',
    iconKey: 'sales',
    tier: 'CORE',
    sectors: [],
    audiences: ['B2B', 'B2C'],
    modules: [
      { key: 'orders', required: true },
      { key: 'catalog', required: false },
      { key: 'payments', required: false },
      { key: 'fulfilment', required: false },
    ],
    entries: ['orders', 'payments', 'returns', 'products', 'categories', 'brands', 'import'],
    stage: 'STABLE',
    sortOrder: 10,
  },
  {
    key: 'customers',
    label: 'Customers & Marketing',
    description: 'Enquiries, customers, campaigns, promotions and loyalty.',
    iconKey: 'customers',
    tier: 'CORE',
    sectors: [],
    audiences: ['B2B', 'B2C'],
    modules: [
      { key: 'crm', required: false },
      { key: 'marketing', required: false },
      { key: 'promotions', required: false },
      { key: 'loyalty', required: false },
    ],
    entries: ['leads', 'contacts', 'inbox', 'marketing'],
    stage: 'STABLE',
    sortOrder: 20,
  },
  {
    key: 'inventory',
    label: 'Inventory & Purchasing',
    description: 'Stock, purchase orders, suppliers and transfers.',
    iconKey: 'inventory',
    tier: 'CORE',
    sectors: [],
    audiences: ['B2B', 'INTERNAL'],
    modules: [
      { key: 'inventory', required: true },
      { key: 'purchasing', required: false },
      { key: 'transfers', required: false },
      { key: 'tradingpartners', required: false },
      { key: 'planning', required: false },
    ],
    entries: [
      'inventory',
      'purchasing',
      'requisitions',
      'suppliers',
      'transfers',
      'trading-partners',
      'invoices',
      'resilience',
    ],
    stage: 'STABLE',
    sortOrder: 30,
  },
  {
    key: 'fulfilment',
    label: 'Shipping & Fulfilment',
    description: 'Shipments, manifests, tracking and returns to origin.',
    iconKey: 'fulfilment',
    tier: 'CORE',
    sectors: [],
    audiences: ['B2B', 'B2C'],
    modules: [{ key: 'fulfilment', required: true }],
    entries: ['shipments', 'manifests', 'tracking', 'rto', 'shipping-settings'],
    stage: 'STABLE',
    sortOrder: 40,
  },
  {
    key: 'auction',
    label: 'Auctions',
    description: 'Timed auctions with live bidding, approved bidders and winner invoices.',
    iconKey: 'auction',
    tier: 'CORE',
    sectors: [],
    // C2C is not carried: it stays reserved until escrow, reputation and
    // disputes exist (doc 232 §4, doc 234 §3).
    audiences: ['B2C', 'B2B'],
    modules: [{ key: 'auction', required: true }],
    entries: ['auctions'],
    // BETA, not STABLE: v1 has no outbid or result emails, My Bids or Watchlist
    // (doc 234 §17). Flip to STABLE when those ship.
    stage: 'BETA',
    sortOrder: 45,
  },
  {
    key: 'finance',
    label: 'Accounting & Finance',
    description: 'Profit and loss, cash flow, receivables, settlements and facilities.',
    iconKey: 'finance',
    tier: 'CORE',
    sectors: [],
    audiences: ['INTERNAL', 'B2B'],
    modules: [
      { key: 'finance', required: false },
      { key: 'receivables', required: false },
      { key: 'settlements', required: false },
      { key: 'bankfacilities', required: false },
      { key: 'wallet', required: false },
      { key: 'accounts', required: false },
    ],
    entries: [
      'finance-pnl',
      'finance-margins',
      'finance-cash-flow',
      'finance-unit-economics',
      'finance-expenses',
      'credit-notes',
      'debit-notes',
      'credit-terms',
      'b2b-accounts',
      'dunning-policy',
      'statements',
      'settlements',
      'bank-facilities',
      'merchant-payables',
    ],
    stage: 'STABLE',
    sortOrder: 50,
  },
  {
    key: 'people',
    label: 'People',
    description: 'Staff, structure, attendance, pay and leave.',
    iconKey: 'people',
    tier: 'CORE',
    sectors: [],
    audiences: ['INTERNAL'],
    modules: [
      { key: 'hr', required: false },
      { key: 'payroll', required: false },
      { key: 'orgstructure', required: false },
      { key: 'attendance', required: false },
      { key: 'notify', required: false },
    ],
    entries: [
      'people',
      'org-structure',
      'attendance',
      'my-attendance',
      'payroll-compensation',
      'payroll-leave',
      'payroll-runs',
      'payroll-me',
      'notify-meetings',
      'notify-escalation-rules',
    ],
    stage: 'STABLE',
    sortOrder: 60,
  },
  {
    key: 'tasks',
    label: 'Tasks & Support',
    description: 'Your tasks, support tickets and company notices.',
    iconKey: 'tasks',
    tier: 'CORE',
    sectors: [],
    audiences: ['INTERNAL', 'B2C'],
    modules: [
      { key: 'tasks', required: false },
      { key: 'support', required: false },
    ],
    entries: ['my-tasks', 'tasks', 'support-tickets', 'support-customer-tickets', 'bulletins'],
    stage: 'STABLE',
    sortOrder: 70,
  },
  {
    key: 'manufacturing',
    label: 'Manufacturing',
    description: 'Recipes, raw materials and production runs.',
    iconKey: 'manufacturing',
    tier: 'CORE',
    sectors: [],
    audiences: ['INTERNAL', 'B2B'],
    modules: [{ key: 'bom', required: true }],
    entries: ['bom-recipes', 'bom-raw-materials', 'bom-production', 'bom-raw-usage'],
    stage: 'STABLE',
    sortOrder: 80,
  },
  {
    key: 'insights',
    label: 'Reports & Analytics',
    description: 'The dashboard, your actions and every report.',
    iconKey: 'insights',
    tier: 'CORE',
    sectors: [],
    audiences: ['INTERNAL'],
    modules: [
      { key: 'analytics', required: false },
      { key: 'reports', required: false },
    ],
    entries: ['dashboard', 'my-actions', 'insights', 'reports'],
    stage: 'STABLE',
    sortOrder: 90,
  },
  {
    key: 'workshop',
    label: 'Stitching Workshop',
    description: 'The tailor queue, bookings, garments and designs.',
    iconKey: 'workshop',
    tier: 'INDUSTRY',
    sectors: ['apparel'],
    audiences: ['B2C', 'B2B'],
    modules: [
      { key: 'stitching', required: true },
      { key: 'measurements', required: false },
    ],
    entries: ['stitching', 'stitching-bookings', 'garments', 'designs'],
    stage: 'STABLE',
    sortOrder: 100,
  },
  {
    key: 'settings',
    label: 'Settings & Access',
    description: 'Team and roles, tax, email and the rest of the setup.',
    iconKey: 'settings',
    tier: 'CORE',
    sectors: [],
    audiences: ['INTERNAL'],
    modules: [],
    entries: ['users', 'settings', 'tax', 'email-templates', 'email-accounts', 'ai'],
    stage: 'STABLE',
    sortOrder: 110,
  },
];
