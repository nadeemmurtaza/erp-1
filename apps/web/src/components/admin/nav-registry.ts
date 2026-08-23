import type { UserRole } from '@yaseen/shared';

export interface AdminNavItem {
  /** Stable key, matching the API module that owns the section. */
  key: string;
  label: string;
  href: string;
  /** Roles allowed to see the entry. Omit for everyone in the back office. */
  roles?: readonly UserRole[];
  group: 'overview' | 'catalogue' | 'sales' | 'production' | 'people' | 'settings';
}

/**
 * The admin navigation, as data.
 *
 * ADDING A SECTION IS ONE ENTRY HERE. The shell renders whatever is registered
 * and filters by the signed-in user's role, so a new module (orders, CRM, the
 * tailor queue) adds its screens without touching the layout — the same
 * one-line rule the API's module registry follows.
 */
const OFFICE = ['ADMIN', 'STAFF'] as const;

export const ADMIN_NAV: AdminNavItem[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/admin', roles: OFFICE, group: 'overview' },

  { key: 'orders', label: 'Orders', href: '/admin/orders', roles: OFFICE, group: 'sales' },
  {
    key: 'payments',
    label: 'Payment approvals',
    href: '/admin/payments',
    roles: OFFICE,
    group: 'sales',
  },
  { key: 'reports', label: 'Reports', href: '/admin/reports', roles: OFFICE, group: 'sales' },

  {
    key: 'stitching',
    label: 'Tailor queue',
    href: '/admin/stitching',
    // Tailors sign into the back office for this section and nothing else.
    roles: ['ADMIN', 'STAFF', 'TAILOR'],
    group: 'production',
  },
  {
    key: 'stitching-bookings',
    label: 'Stitching bookings',
    href: '/admin/stitching/bookings',
    roles: OFFICE,
    group: 'production',
  },

  { key: 'contacts', label: 'Customers', href: '/admin/contacts', roles: OFFICE, group: 'people' },
  { key: 'leads', label: 'Enquiries', href: '/admin/leads', roles: OFFICE, group: 'people' },

  {
    key: 'products',
    label: 'Products & services',
    href: '/admin/products',
    roles: OFFICE,
    group: 'catalogue',
  },
  {
    key: 'inventory',
    label: 'Inventory',
    href: '/admin/inventory',
    roles: OFFICE,
    group: 'catalogue',
  },
  {
    key: 'categories',
    label: 'Categories',
    href: '/admin/categories',
    roles: OFFICE,
    group: 'catalogue',
  },
  {
    key: 'garments',
    label: 'Garments & measurements',
    href: '/admin/garments',
    roles: OFFICE,
    group: 'catalogue',
  },
  {
    key: 'designs',
    label: 'Stitching designs',
    href: '/admin/designs',
    roles: OFFICE,
    group: 'catalogue',
  },
  { key: 'import', label: 'Bulk import', href: '/admin/import', roles: OFFICE, group: 'catalogue' },
];

/** Where a role lands after signing in — a tailor's home is the workshop. */
export function landingFor(role: UserRole): string {
  return role === 'TAILOR' ? '/admin/stitching' : '/admin';
}

export const NAV_GROUP_LABELS: Record<AdminNavItem['group'], string> = {
  overview: 'Overview',
  catalogue: 'Catalogue',
  sales: 'Sales',
  production: 'Workshop',
  people: 'People',
  settings: 'Settings',
};

export function navFor(role: UserRole): AdminNavItem[] {
  return ADMIN_NAV.filter((item) => !item.roles || item.roles.includes(role));
}
