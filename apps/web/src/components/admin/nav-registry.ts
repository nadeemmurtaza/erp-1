import type { PermissionKey } from '@yaseen/shared';

export interface AdminNavItem {
  /** Stable key, matching the API module that owns the section. */
  key: string;
  label: string;
  href: string;
  /** Permissions that unlock this entry — any one is enough. Omit for everyone signed in. */
  permissions?: readonly PermissionKey[];
  group: 'overview' | 'catalogue' | 'sales' | 'production' | 'people' | 'settings';
}

/**
 * The admin navigation, as data.
 *
 * ADDING A SECTION IS ONE ENTRY HERE. The shell renders whatever is registered
 * and filters by the signed-in user's permissions, so a new module (orders,
 * CRM, the tailor queue) adds its screens without touching the layout — the
 * same one-line rule the API's module registry follows.
 *
 * What each item requires is a capability, not a role — which roles
 * currently hold that capability is data (RolePermission), editable from
 * /admin/settings, not something this file encodes.
 */
export const ADMIN_NAV: AdminNavItem[] = [
  // Group 1: Overview
  {
    key: 'dashboard',
    label: 'Dashboard',
    href: '/admin',
    permissions: ['analytics.view'],
    group: 'overview',
  },

  // Group 2: Customer Lifecycle (follows conversion funnel: Enquiries/Leads → Customers)
  {
    key: 'leads',
    label: 'Enquiries',
    href: '/admin/leads',
    permissions: ['crm.manage'],
    group: 'people',
  },
  {
    key: 'contacts',
    label: 'Customers',
    href: '/admin/contacts',
    permissions: ['crm.manage'],
    group: 'people',
  },

  // Group 3: Sales Operations (follows order processing sequence)
  {
    key: 'orders',
    label: 'Orders',
    href: '/admin/orders',
    permissions: ['orders.manage'],
    group: 'sales',
  },
  {
    key: 'payments',
    label: 'Payment approvals',
    href: '/admin/payments',
    permissions: ['payments.approve'],
    group: 'sales',
  },
  {
    key: 'reports',
    label: 'Reports',
    href: '/admin/reports',
    permissions: ['reports.view'],
    group: 'sales',
  },

  // Group 4: Production/Workshop (Tailors see ONLY this + Dashboard redirect)
  {
    key: 'stitching',
    label: 'Tailor queue',
    href: '/admin/stitching',
    permissions: ['stitching.jobs.view_queue'],
    group: 'production',
  },
  {
    key: 'stitching-bookings',
    label: 'Stitching bookings',
    href: '/admin/stitching/bookings',
    permissions: ['stitching.bookings.manage'],
    group: 'production',
  },

  // Group 5: Catalogue & Data (elevated Bulk Import for data entry workflow)
  {
    key: 'import',
    label: 'Bulk import',
    href: '/admin/import',
    permissions: ['catalog.manage'],
    group: 'catalogue',
  },
  {
    key: 'products',
    label: 'Products & services',
    href: '/admin/products',
    permissions: ['catalog.manage'],
    group: 'catalogue',
  },
  {
    key: 'inventory',
    label: 'Inventory',
    href: '/admin/inventory',
    permissions: ['inventory.manage'],
    group: 'catalogue',
  },
  {
    key: 'categories',
    label: 'Categories',
    href: '/admin/categories',
    permissions: ['catalog.manage'],
    group: 'catalogue',
  },
  {
    key: 'garments',
    label: 'Garments & measurements',
    href: '/admin/garments',
    permissions: ['measurements.manage_blueprints'],
    group: 'catalogue',
  },
  {
    key: 'designs',
    label: 'Stitching designs',
    href: '/admin/designs',
    permissions: ['stitching.designs.manage'],
    group: 'catalogue',
  },

  // Group 6: Settings
  {
    key: 'settings',
    label: 'Settings',
    href: '/admin/settings',
    permissions: ['settings.manage'],
    group: 'settings',
  },
];

/**
 * Where a signed-in user lands after login. Someone with a dashboard to look
 * at (analytics.view — staff and admins) lands on it; everyone else (the
 * tailor whose permissions are scoped to the workshop) lands on the queue
 * they actually work from.
 */
export function landingFor(permissions: readonly string[]): string {
  return permissions.includes('analytics.view') ? '/admin' : '/admin/stitching';
}

export const NAV_GROUP_LABELS: Record<AdminNavItem['group'], string> = {
  overview: 'Overview',
  people: 'Customer Lifecycle',
  sales: 'Sales Operations',
  production: 'Workshop',
  catalogue: 'Catalogue & Data',
  settings: 'Settings',
};

export function navFor(permissions: readonly string[]): AdminNavItem[] {
  return ADMIN_NAV.filter(
    (item) => !item.permissions || item.permissions.some((key) => permissions.includes(key)),
  );
}
