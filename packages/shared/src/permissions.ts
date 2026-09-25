/**
 * The permission catalog for PBAC (Permission-Based Access Control).
 *
 * Roles (@see enums.ts UserRole) stay as the job-title field on User, but no
 * longer gate anything directly — every guard and nav check tests against a
 * PermissionKey instead. What each role grants is DATA (the RolePermission
 * table, seeded from ROLE_PERMISSION_SEED below), editable from
 * /admin/settings without a code change.
 *
 * A user's effective permissions are their role's grants with their own
 * UserPermission overrides applied on top: a GRANT adds a permission their
 * role doesn't have, a REVOKE takes away one it does — @see
 * PermissionsResolverService.resolveForUser in the API.
 *
 * Any change here must be mirrored in apps/api/prisma/seed.ts's permission
 * seed, which is what actually populates the Permission/RolePermission
 * tables — this file is the compile-time catalog @RequirePermission(...)
 * call sites are checked against, not the source of truth for what's in the
 * database on a given deployment (an admin may have edited it since).
 */

import type { UserRole } from './enums';

/**
 * How much is at stake if this permission is granted to the wrong person —
 * shown as a warning in the role-creation wizard (below), never enforced by
 * itself: `critical` is exactly `ADMIN_LOCKED_PERMISSIONS`, restated here so
 * a role editor can warn *before* the save that already refuses to orphan
 * one, not only after.
 *
 *   low      — a day-to-day action, wrong only in the "oops, wrong button" sense
 *   medium   — touches money, cost, or another person's data
 *   high     — grants power over other accounts or brands/branches
 *   critical — can lock every admin out of the screen that would undo it
 */
export type PermissionSensitivity = 'low' | 'medium' | 'high' | 'critical';

export interface PermissionDefinition {
  key: string;
  label: string;
  category: string;
  sensitivity: PermissionSensitivity;
}

export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  { key: 'analytics.view', label: 'View dashboard analytics', category: 'Dashboard', sensitivity: 'low' },
  { key: 'reports.view', label: 'Export CSV reports', category: 'Dashboard', sensitivity: 'low' },
  {
    key: 'organization.view',
    label: 'View the organization/brand/branch dashboard',
    category: 'Dashboard',
    sensitivity: 'low',
  },
  {
    key: 'organization.manage',
    label: 'Grant and revoke who is a brand or branch admin',
    category: 'Dashboard',
    sensitivity: 'high',
  },
  {
    key: 'accounting.view',
    label: 'View the general ledger and its reports (trial balance, P&L, balance sheet, cash flow, aged AR/AP)',
    category: 'Dashboard',
    sensitivity: 'medium',
  },

  { key: 'crm.manage', label: 'Manage leads, contacts and CRM', category: 'Customers', sensitivity: 'low' },

  { key: 'orders.manage', label: 'Manage orders and shipments', category: 'Sales', sensitivity: 'medium' },
  {
    key: 'pos.manage',
    label: 'Register till terminals and issue their device credentials',
    category: 'Sales',
    sensitivity: 'high',
  },
  {
    key: 'pos.operate',
    label: 'Open and close till shifts, and record cash movements',
    category: 'Sales',
    sensitivity: 'medium',
  },
  {
    key: 'payments.approve',
    label: 'Approve bank-transfer payments',
    category: 'Sales',
    sensitivity: 'high',
  },

  {
    key: 'stitching.jobs.view_queue',
    label: 'View the tailor job queue',
    category: 'Production',
    sensitivity: 'low',
  },
  {
    key: 'stitching.jobs.change_stage',
    label: 'Move a job to its next stage',
    category: 'Production',
    sensitivity: 'low',
  },
  {
    key: 'stitching.jobs.manage_own',
    label: 'Change stage on own assigned jobs only',
    category: 'Production',
    sensitivity: 'low',
  },
  {
    key: 'stitching.jobs.manage_all',
    label: 'Change stage on any job, regardless of assignment',
    category: 'Production',
    sensitivity: 'medium',
  },
  {
    key: 'stitching.jobs.assign',
    label: 'Assign jobs to a tailor',
    category: 'Production',
    sensitivity: 'low',
  },
  {
    key: 'stitching.bookings.manage',
    label: "Manage customer's-own-fabric stitching bookings",
    category: 'Production',
    sensitivity: 'low',
  },
  {
    key: 'stitching.designs.manage',
    label: 'Manage the stitching style/design catalogue',
    category: 'Production',
    sensitivity: 'low',
  },
  {
    key: 'production.manage',
    label: 'Manage bills of materials and work orders',
    category: 'Production',
    sensitivity: 'medium',
  },
  {
    key: 'production.view_chain',
    label: "View a SKU's full supply-chain status (stock, POs, work orders, pending orders)",
    category: 'Production',
    sensitivity: 'low',
  },

  {
    key: 'catalog.manage',
    label: 'Manage products, categories and import',
    category: 'Catalogue',
    sensitivity: 'medium',
  },
  {
    key: 'inventory.manage',
    label: 'Adjust and view stock levels',
    category: 'Catalogue',
    sensitivity: 'medium',
  },
  {
    key: 'inventory.view_cost',
    label: 'See cost prices and margins',
    category: 'Catalogue',
    sensitivity: 'medium',
  },
  { key: 'inventory.count', label: 'Run stock counts', category: 'Catalogue', sensitivity: 'low' },
  {
    key: 'transfers.manage',
    label: 'Dispatch, receive and cancel inter-branch stock transfers',
    category: 'Catalogue',
    sensitivity: 'medium',
  },
  {
    key: 'measurements.manage_blueprints',
    label: 'Manage garment types, measurement fields and size charts',
    category: 'Catalogue',
    sensitivity: 'low',
  },

  { key: 'suppliers.manage', label: 'Manage suppliers', category: 'Purchasing', sensitivity: 'medium' },
  {
    key: 'purchasing.manage',
    label: 'Create and receive purchase orders',
    category: 'Purchasing',
    sensitivity: 'medium',
  },
  {
    key: 'purchasing.requisitions.create',
    label: 'Request a purchase (not necessarily raise the PO)',
    category: 'Purchasing',
    sensitivity: 'low',
  },
  {
    key: 'purchasing.requisitions.approve',
    label: 'Approve or reject purchase requisitions',
    category: 'Purchasing',
    sensitivity: 'medium',
  },
  {
    key: 'inventory.spot_checks.manage',
    label: 'Configure unpredictable spot-check policies',
    category: 'Catalogue',
    sensitivity: 'medium',
  },
  {
    key: 'parties.manage',
    label: 'Manage the shared counterparty (supplier/retailer/distributor/manufacturer) profile directory',
    category: 'Purchasing',
    sensitivity: 'medium',
  },

  {
    key: 'account.change_own_password',
    label: 'Change their own password',
    category: 'Account',
    sensitivity: 'low',
  },

  {
    key: 'settings.manage',
    label: 'Access the Settings screen',
    category: 'Administration',
    sensitivity: 'critical',
  },
  {
    key: 'tax.manage',
    label: 'Manage tax classes, rates and the pricing mode',
    category: 'Administration',
    sensitivity: 'medium',
  },
  {
    key: 'finance.view',
    label: 'View expenses and finance reports',
    category: 'Finance',
    sensitivity: 'medium',
  },
  {
    key: 'finance.manage',
    label: 'Record and edit expenses',
    category: 'Finance',
    sensitivity: 'medium',
  },
  {
    key: 'finance.credit-notes.create',
    label: 'Issue a credit note, and apply it to an invoice',
    category: 'Finance',
    sensitivity: 'medium',
  },
  {
    key: 'finance.credit-notes.approve',
    label: 'Approve a credit note above the approval threshold, and void one',
    category: 'Finance',
    sensitivity: 'high',
  },
  {
    key: 'finance.debit-notes.manage',
    label: 'Issue and void debit notes against a supplier',
    category: 'Finance',
    sensitivity: 'medium',
  },
  {
    key: 'finance.credit-terms.manage',
    label: "Set a customer's credit limit and payment terms, apply a credit hold, and edit the dunning policy",
    category: 'Finance',
    sensitivity: 'high',
  },
  {
    key: 'fulfilment.view',
    label: 'View shipments, manifests, RTO and returns',
    category: 'Fulfilment',
    sensitivity: 'low',
  },
  {
    key: 'fulfilment.manage',
    label: 'Book, track and manifest shipments; decide returns',
    category: 'Fulfilment',
    sensitivity: 'medium',
  },
  {
    key: 'bom.view',
    label: 'View bills of materials and raw stock',
    category: 'Manufacturing',
    sensitivity: 'low',
  },
  {
    key: 'bom.manage',
    label: 'Create and edit raw materials and recipes',
    category: 'Manufacturing',
    sensitivity: 'medium',
  },
  {
    key: 'bom.produce',
    label: 'Record a production run',
    category: 'Manufacturing',
    sensitivity: 'low',
  },
  {
    key: 'payroll.view_own',
    label: 'View their own compensation, leave balance and payslips',
    category: 'Payroll',
    sensitivity: 'low',
  },
  {
    key: 'payroll.view',
    label: "View every employee's compensation, leave and pay-run data",
    category: 'Payroll',
    sensitivity: 'medium',
  },
  {
    key: 'payroll.manage',
    label: 'Set compensation rates, decide leave requests, and build, approve and post pay runs',
    category: 'Payroll',
    sensitivity: 'medium',
  },
  {
    key: 'marketing.manage',
    label: 'Turn on automated marketing email and set its timing',
    category: 'Administration',
    sensitivity: 'low',
  },
  {
    key: 'roles.manage_permissions',
    label: "Edit each role's granted permissions",
    category: 'Administration',
    sensitivity: 'critical',
  },
  { key: 'audit.view', label: 'View the audit log', category: 'Administration', sensitivity: 'medium' },
  {
    key: 'users.manage',
    label: 'Create and manage back-office user accounts',
    category: 'Administration',
    sensitivity: 'high',
  },
  {
    key: 'accounting.manage_periods',
    label: 'Open, close and lock fiscal periods — locking is irreversible',
    category: 'Administration',
    sensitivity: 'medium',
  },
  {
    key: 'promotions.view',
    label: 'View discounts, promo codes and their usage',
    category: 'Marketing',
    sensitivity: 'low',
  },
  {
    key: 'promotions.manage',
    label: 'Create and edit discounts and promo codes',
    category: 'Marketing',
    sensitivity: 'medium',
  },
  {
    key: 'giftcards.view',
    label: 'View gift cards, their ledgers and store credit balances',
    category: 'Marketing',
    sensitivity: 'medium',
  },
  {
    key: 'giftcards.manage',
    label: 'Issue, cancel and adjust gift cards and store credit — real money',
    category: 'Marketing',
    sensitivity: 'high',
  },
  {
    key: 'content.view',
    label: 'View pages, blog posts, banners and menus',
    category: 'Marketing',
    sensitivity: 'low',
  },
  {
    key: 'content.manage',
    label: 'Publish pages and posts, and edit banners and menus',
    category: 'Marketing',
    sensitivity: 'medium',
  },
  {
    key: 'collections.view',
    label: 'View collections and their membership',
    category: 'Marketing',
    sensitivity: 'low',
  },
  {
    key: 'collections.manage',
    label: 'Create and curate collections',
    category: 'Marketing',
    sensitivity: 'medium',
  },
  {
    key: 'search.view',
    label: 'View the zero-result search report',
    category: 'Marketing',
    sensitivity: 'low',
  },
  {
    key: 'search.manage',
    label: 'Edit search synonyms',
    category: 'Marketing',
    sensitivity: 'low',
  },
  {
    key: 'campaigns.view',
    label: 'View campaigns and their send/open/click stats',
    category: 'Marketing',
    sensitivity: 'low',
  },
  {
    key: 'campaigns.manage',
    label: 'Create, schedule and send campaigns to a customer segment',
    category: 'Marketing',
    sensitivity: 'high',
  },
  {
    key: 'onsitemessages.view',
    label: 'View on-site announcement bars, popups and newsletter capture',
    category: 'Marketing',
    sensitivity: 'low',
  },
  {
    key: 'onsitemessages.manage',
    label: 'Create and schedule on-site announcement bars, popups and newsletter capture',
    category: 'Marketing',
    sensitivity: 'low',
  },
  {
    key: 'reviews.moderate',
    label: 'Approve, reject and reply to customer product reviews',
    category: 'Marketing',
    sensitivity: 'medium',
  },
  {
    key: 'loyalty.view',
    label: 'View loyalty point balances, tiers and referrals',
    category: 'Marketing',
    sensitivity: 'low',
  },
  {
    key: 'loyalty.manage',
    label: 'Adjust a customer\'s loyalty points and configure tiers — real money once redeemed',
    category: 'Marketing',
    sensitivity: 'high',
  },
  {
    key: 'ai.view',
    label: 'View AI usage, cost and the review queue for AI-generated drafts',
    category: 'Administration',
    sensitivity: 'low',
  },
  {
    key: 'ai.manage',
    label: 'Configure AI providers and the monthly budget, and approve or reject AI-generated drafts',
    category: 'Administration',
    sensitivity: 'medium',
  },
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]['key'];

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSION_CATALOG.map((p) => p.key);

/**
 * The role-creation wizard's own grouping (owner's request) — smaller and
 * more numerous than `category` above, which exists for a flat reference
 * table (Settings ▸ old audit view, the per-user permission table) rather
 * than a "pick a manageable slice at a time" flow. One step = one group;
 * every `PERMISSION_CATALOG` key appears in exactly one group here, checked
 * by `permissions.spec.ts`.
 */
export interface PermissionGroup {
  key: string;
  label: string;
  description: string;
  permissions: readonly PermissionKey[];
}

export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    key: 'account',
    label: 'Personal account',
    description: 'What a role holder can do for themselves — account.change_own_password is granted to every seeded role; payroll.view_own only to a role that is actually paid.',
    permissions: ['account.change_own_password', 'payroll.view_own'],
  },
  {
    key: 'dashboards',
    label: 'Dashboards & reports',
    description: 'Read-only views of how the shop is doing.',
    permissions: ['analytics.view', 'reports.view', 'accounting.view', 'finance.view'],
  },
  {
    key: 'chain-admin',
    label: 'Organization / brand / branch admin',
    description: "Reach the drill-down dashboard, or decide who else is a brand or branch admin.",
    permissions: ['organization.view', 'organization.manage'],
  },
  {
    key: 'customers',
    label: 'Customers & CRM',
    description: 'Leads, contacts, interactions and the support inbox.',
    permissions: ['crm.manage'],
  },
  {
    key: 'sales',
    label: 'Sales & payments',
    description: 'Order fulfilment, approving a bank-transfer payment, running a till shift, and registering terminals.',
    permissions: ['orders.manage', 'payments.approve', 'pos.manage', 'pos.operate'],
  },
  {
    key: 'fulfilment',
    label: 'Shipping & returns',
    description: 'Shipping zones and rates, booking and tracking shipments, manifests, RTO, and deciding a customer return.',
    permissions: ['fulfilment.view', 'fulfilment.manage'],
  },
  {
    key: 'tailor-queue',
    label: 'Tailor queue',
    description: 'The stitching workshop floor — view, assign and move jobs along.',
    permissions: [
      'stitching.jobs.view_queue',
      'stitching.jobs.change_stage',
      'stitching.jobs.manage_own',
      'stitching.jobs.manage_all',
      'stitching.jobs.assign',
    ],
  },
  {
    key: 'stitching-catalogue',
    label: 'Stitching bookings & designs',
    description: "Customer's-own-fabric bookings, and the stitching style/design catalogue.",
    permissions: ['stitching.bookings.manage', 'stitching.designs.manage'],
  },
  {
    key: 'catalogue',
    label: 'Catalogue & garments',
    description: 'Products, categories, bulk import, garment types and size charts.',
    permissions: ['catalog.manage', 'measurements.manage_blueprints'],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    description: 'Stock levels, stock counts, inter-branch transfers, spot checks, and — separately — cost prices and margins.',
    permissions: ['inventory.manage', 'inventory.count', 'transfers.manage', 'inventory.view_cost', 'inventory.spot_checks.manage'],
  },
  {
    key: 'purchasing',
    label: 'Purchasing & suppliers',
    description: 'Suppliers, the shared counterparty directory, purchase requisitions, and creating or receiving purchase orders.',
    permissions: [
      'suppliers.manage',
      'purchasing.manage',
      'purchasing.requisitions.create',
      'purchasing.requisitions.approve',
      'parties.manage',
    ],
  },
  {
    key: 'production',
    label: 'Production',
    description: 'Bills of materials, work orders, and a SKU\'s full supply-chain status.',
    permissions: ['production.manage', 'production.view_chain'],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    description:
      'Automated marketing email, discounts, promo codes, gift cards, store credit, content, collections, search tuning, campaigns, on-site messaging, reviews and loyalty.',
    permissions: [
      'marketing.manage',
      'promotions.view',
      'promotions.manage',
      'giftcards.view',
      'giftcards.manage',
      'content.view',
      'content.manage',
      'collections.view',
      'collections.manage',
      'search.view',
      'search.manage',
      'campaigns.view',
      'campaigns.manage',
      'onsitemessages.view',
      'onsitemessages.manage',
      'reviews.moderate',
      'loyalty.view',
      'loyalty.manage',
    ],
  },
  {
    key: 'tax',
    label: 'Tax',
    description: 'Tax classes, rates and the pricing mode.',
    permissions: ['tax.manage'],
  },
  {
    key: 'finance',
    label: 'Finance',
    description: 'Record and edit operational expenses; issue credit/debit notes; set customer credit limits and the dunning policy.',
    permissions: [
      'finance.manage',
      'finance.credit-notes.create',
      'finance.credit-notes.approve',
      'finance.debit-notes.manage',
      'finance.credit-terms.manage',
    ],
  },
  {
    key: 'bom',
    label: 'Manufacturing',
    description: 'Raw materials, recipes and production runs.',
    permissions: ['bom.view', 'bom.manage', 'bom.produce'],
  },
  {
    key: 'payroll',
    label: 'Payroll',
    description: "Compensation rates, leave requests, and pay runs — everyone's own view is separate, granted alongside every seeded role.",
    permissions: ['payroll.view', 'payroll.manage'],
  },
  {
    key: 'system-admin',
    label: 'System administration',
    description: 'Settings, roles, user accounts and the audit log — the most sensitive group.',
    permissions: [
      'settings.manage',
      'roles.manage_permissions',
      'users.manage',
      'audit.view',
      'accounting.manage_periods',
    ],
  },
  {
    key: 'ai',
    label: 'AI layer',
    description: 'Which AI providers are on, the monthly budget, and the review queue every AI-generated draft passes through before it reaches a customer or a supplier.',
    permissions: ['ai.view', 'ai.manage'],
  },
] as const;

/**
 * Today's exact access, expressed as permission grants — this is what the
 * database seed reproduces so the PBAC migration is behavior-preserving on
 * day one. ADMIN and STAFF are identical in the pre-PBAC role model, so they
 * share every entry except the two ADMIN-only administration permissions.
 */
export const ROLE_PERMISSION_SEED: Readonly<Record<UserRole, readonly PermissionKey[]>> = {
  CUSTOMER: ['account.change_own_password'],
  TAILOR: [
    'account.change_own_password',
    'payroll.view_own',
    'stitching.jobs.view_queue',
    'stitching.jobs.change_stage',
    'stitching.jobs.manage_own',
  ],
  STAFF: [
    'account.change_own_password',
    'payroll.view_own',
    'analytics.view',
    'reports.view',
    'organization.view',
    'crm.manage',
    'orders.manage',
    'payments.approve',
    'pos.operate',
    'stitching.jobs.view_queue',
    'stitching.jobs.change_stage',
    'stitching.jobs.manage_all',
    'stitching.jobs.assign',
    'stitching.bookings.manage',
    'stitching.designs.manage',
    'catalog.manage',
    'inventory.manage',
    'inventory.count',
    'transfers.manage',
    'measurements.manage_blueprints',
    'suppliers.manage',
    'purchasing.manage',
    'purchasing.requisitions.create',
    'production.manage',
    'production.view_chain',
    'parties.manage',
    'finance.view',
    'finance.credit-notes.create',
    'finance.debit-notes.manage',
    'fulfilment.view',
    'fulfilment.manage',
    'bom.view',
    'bom.produce',
    'promotions.view',
    'promotions.manage',
    'giftcards.view',
    'content.view',
    'content.manage',
    'collections.view',
    'collections.manage',
    'search.view',
    'search.manage',
    'campaigns.view',
    'onsitemessages.view',
    'onsitemessages.manage',
    'reviews.moderate',
    'loyalty.view',
    'ai.view',
    'ai.manage',
  ],
  ADMIN: [
    'account.change_own_password',
    'payroll.view_own',
    'payroll.view',
    'payroll.manage',
    'analytics.view',
    'reports.view',
    'organization.view',
    'organization.manage',
    'accounting.view',
    'crm.manage',
    'orders.manage',
    'payments.approve',
    'stitching.jobs.view_queue',
    'stitching.jobs.change_stage',
    'stitching.jobs.manage_all',
    'stitching.jobs.assign',
    'stitching.bookings.manage',
    'stitching.designs.manage',
    'catalog.manage',
    'inventory.manage',
    'inventory.view_cost',
    'inventory.count',
    'transfers.manage',
    'measurements.manage_blueprints',
    'suppliers.manage',
    'purchasing.manage',
    'purchasing.requisitions.create',
    'purchasing.requisitions.approve',
    'inventory.spot_checks.manage',
    'production.manage',
    'production.view_chain',
    'parties.manage',
    'finance.view',
    'finance.manage',
    'finance.credit-notes.create',
    'finance.credit-notes.approve',
    'finance.debit-notes.manage',
    'finance.credit-terms.manage',
    'fulfilment.view',
    'fulfilment.manage',
    'bom.view',
    'bom.manage',
    'bom.produce',
    'settings.manage',
    'roles.manage_permissions',
    'audit.view',
    'users.manage',
    'tax.manage',
    'marketing.manage',
    'accounting.manage_periods',
    'pos.manage',
    'pos.operate',
    'promotions.view',
    'promotions.manage',
    'giftcards.view',
    'giftcards.manage',
    'content.view',
    'content.manage',
    'collections.view',
    'collections.manage',
    'search.view',
    'search.manage',
    'campaigns.view',
    'campaigns.manage',
    'onsitemessages.view',
    'onsitemessages.manage',
    'reviews.moderate',
    'loyalty.view',
    'loyalty.manage',
    'ai.view',
    'ai.manage',
  ],
};

/**
 * Permissions the update-role-permissions endpoint refuses to remove from
 * ADMIN, so an admin can never edit themselves out of the Settings screen.
 * The same list gates per-user REVOKE overrides on an ADMIN-role user.
 */
export const ADMIN_LOCKED_PERMISSIONS: readonly PermissionKey[] = [
  'settings.manage',
  'roles.manage_permissions',
];

export const PERMISSION_EFFECTS = ['GRANT', 'REVOKE'] as const;
export type PermissionEffect = (typeof PERMISSION_EFFECTS)[number];

/** One entry in a user's permission-override set (@see UserPermission). */
export interface PermissionOverride {
  key: PermissionKey;
  effect: PermissionEffect;
}
