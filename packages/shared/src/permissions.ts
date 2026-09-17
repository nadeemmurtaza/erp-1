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

  { key: 'crm.manage', label: 'Manage leads, contacts and CRM', category: 'Customers', sensitivity: 'low' },

  { key: 'orders.manage', label: 'Manage orders and shipments', category: 'Sales', sensitivity: 'medium' },
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
    description: 'What every role holder can do for themselves — granted to every seeded role today.',
    permissions: ['account.change_own_password'],
  },
  {
    key: 'dashboards',
    label: 'Dashboards & reports',
    description: 'Read-only views of how the shop is doing.',
    permissions: ['analytics.view', 'reports.view'],
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
    description: 'Order fulfilment, and approving a bank-transfer payment.',
    permissions: ['orders.manage', 'payments.approve'],
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
    description: 'Stock levels, stock counts, and — separately — cost prices and margins.',
    permissions: ['inventory.manage', 'inventory.count', 'inventory.view_cost'],
  },
  {
    key: 'purchasing',
    label: 'Purchasing & suppliers',
    description: 'Suppliers, and creating or receiving purchase orders.',
    permissions: ['suppliers.manage', 'purchasing.manage'],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    description: 'Automated marketing email.',
    permissions: ['marketing.manage'],
  },
  {
    key: 'tax',
    label: 'Tax',
    description: 'Tax classes, rates and the pricing mode.',
    permissions: ['tax.manage'],
  },
  {
    key: 'system-admin',
    label: 'System administration',
    description: 'Settings, roles, user accounts and the audit log — the most sensitive group.',
    permissions: ['settings.manage', 'roles.manage_permissions', 'users.manage', 'audit.view'],
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
    'stitching.jobs.view_queue',
    'stitching.jobs.change_stage',
    'stitching.jobs.manage_own',
  ],
  STAFF: [
    'account.change_own_password',
    'analytics.view',
    'reports.view',
    'organization.view',
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
    'inventory.count',
    'measurements.manage_blueprints',
    'suppliers.manage',
    'purchasing.manage',
  ],
  ADMIN: [
    'account.change_own_password',
    'analytics.view',
    'reports.view',
    'organization.view',
    'organization.manage',
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
    'measurements.manage_blueprints',
    'suppliers.manage',
    'purchasing.manage',
    'settings.manage',
    'roles.manage_permissions',
    'audit.view',
    'users.manage',
    'tax.manage',
    'marketing.manage',
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
