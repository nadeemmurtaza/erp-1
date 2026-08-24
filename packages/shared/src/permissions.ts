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

export interface PermissionDefinition {
  key: string;
  label: string;
  category: string;
}

export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  { key: 'analytics.view', label: 'View dashboard analytics', category: 'Dashboard' },
  { key: 'reports.view', label: 'Export CSV reports', category: 'Dashboard' },

  { key: 'crm.manage', label: 'Manage leads, contacts and CRM', category: 'Customers' },

  { key: 'orders.manage', label: 'Manage orders and shipments', category: 'Sales' },
  { key: 'payments.approve', label: 'Approve bank-transfer payments', category: 'Sales' },

  {
    key: 'stitching.jobs.view_queue',
    label: 'View the tailor job queue',
    category: 'Production',
  },
  {
    key: 'stitching.jobs.change_stage',
    label: 'Move a job to its next stage',
    category: 'Production',
  },
  {
    key: 'stitching.jobs.manage_own',
    label: 'Change stage on own assigned jobs only',
    category: 'Production',
  },
  {
    key: 'stitching.jobs.manage_all',
    label: 'Change stage on any job, regardless of assignment',
    category: 'Production',
  },
  { key: 'stitching.jobs.assign', label: 'Assign jobs to a tailor', category: 'Production' },
  {
    key: 'stitching.bookings.manage',
    label: "Manage customer's-own-fabric stitching bookings",
    category: 'Production',
  },
  {
    key: 'stitching.designs.manage',
    label: 'Manage the stitching style/design catalogue',
    category: 'Production',
  },

  { key: 'catalog.manage', label: 'Manage products, categories and import', category: 'Catalogue' },
  { key: 'inventory.manage', label: 'Adjust and view stock levels', category: 'Catalogue' },
  {
    key: 'measurements.manage_blueprints',
    label: 'Manage garment types, measurement fields and size charts',
    category: 'Catalogue',
  },

  { key: 'settings.manage', label: 'Access the Settings screen', category: 'Administration' },
  {
    key: 'roles.manage_permissions',
    label: "Edit each role's granted permissions",
    category: 'Administration',
  },
  { key: 'audit.view', label: 'View the audit log', category: 'Administration' },
  {
    key: 'users.manage',
    label: 'Create and manage back-office user accounts',
    category: 'Administration',
  },
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]['key'];

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSION_CATALOG.map((p) => p.key);

/**
 * Today's exact access, expressed as permission grants — this is what the
 * database seed reproduces so the PBAC migration is behavior-preserving on
 * day one. ADMIN and STAFF are identical in the pre-PBAC role model, so they
 * share every entry except the two ADMIN-only administration permissions.
 */
export const ROLE_PERMISSION_SEED: Readonly<Record<UserRole, readonly PermissionKey[]>> = {
  CUSTOMER: [],
  TAILOR: [
    'stitching.jobs.view_queue',
    'stitching.jobs.change_stage',
    'stitching.jobs.manage_own',
  ],
  STAFF: [
    'analytics.view',
    'reports.view',
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
    'measurements.manage_blueprints',
  ],
  ADMIN: [
    'analytics.view',
    'reports.view',
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
    'measurements.manage_blueprints',
    'settings.manage',
    'roles.manage_permissions',
    'audit.view',
    'users.manage',
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
