import type { UserRole } from '@yaseen/shared';

export interface AdminNavItem {
  /** Stable key, matching the API module that owns the section. */
  key: string;
  label: string;
  href: string;
  /** Roles allowed to see the entry. Omit for everyone in the back office. */
  roles?: readonly UserRole[];
  group: 'overview' | 'catalogue' | 'sales' | 'people' | 'settings';
}

/**
 * The admin navigation, as data.
 *
 * ADDING A SECTION IS ONE ENTRY HERE. The shell renders whatever is registered
 * and filters by the signed-in user's role, so a new module (orders, CRM, the
 * tailor queue) adds its screens without touching the layout — the same
 * one-line rule the API's module registry follows.
 */
export const ADMIN_NAV: AdminNavItem[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/admin', group: 'overview' },

  { key: 'orders', label: 'Orders', href: '/admin/orders', group: 'sales' },
  { key: 'payments', label: 'Payment approvals', href: '/admin/payments', group: 'sales' },

  { key: 'products', label: 'Products & services', href: '/admin/products', group: 'catalogue' },
  { key: 'categories', label: 'Categories', href: '/admin/categories', group: 'catalogue' },
  { key: 'garments', label: 'Garments & measurements', href: '/admin/garments', group: 'catalogue' },
  { key: 'import', label: 'Bulk import', href: '/admin/import', group: 'catalogue' },
];

export const NAV_GROUP_LABELS: Record<AdminNavItem['group'], string> = {
  overview: 'Overview',
  catalogue: 'Catalogue',
  sales: 'Sales',
  people: 'People',
  settings: 'Settings',
};

export function navFor(role: UserRole): AdminNavItem[] {
  return ADMIN_NAV.filter((item) => !item.roles || item.roles.includes(role));
}
